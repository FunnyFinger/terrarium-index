// Automatic integration of Araflora plants into your database
// Extracts, transforms, and adds plants automatically

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const CONFIG = {
    baseUrl: 'https://www.araflora.com',
    delay: 2000,
    plantsDir: path.join(__dirname, '..', 'data', 'plants'),
    arafloraDir: path.join(__dirname, '..', 'data', 'araflora'),
    outputDir: path.join(__dirname, '..', 'data', 'plants', 'araflora-import')
};

// Categories mapping from Araflora to your categories
const CATEGORY_MAPPING = {
    'Terrarium plants': 'additional',
    'Carnivorous plants': 'carnivorous',
    'Orchids': 'orchids',
    'Houseplants': 'additional',
    'Aquarium': 'aquarium'
};

/**
 * Rate limiting
 */
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch page
 */
async function fetchPage(url) {
    try {
        await delay(CONFIG.delay);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 30000
        });
        return cheerio.load(response.data);
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        return null;
    }
}

/**
 * Find next available plant ID
 */
async function getNextPlantId() {
    const indexFile = path.join(CONFIG.plantsDir, 'index.json');
    try {
        const content = await fs.readFile(indexFile, 'utf8');
        const index = JSON.parse(content);
        return (index.totalPlants || 113) + 1;
    } catch {
        // Start from 114 if index doesn't exist
        return 114;
    }
}

/**
 * Extract comprehensive plant data from Araflora
 */
async function extractFullPlantData(productUrl) {
    const $ = await fetchPage(productUrl);
    if (!$) return null;

    const plant = {
        sourceUrl: productUrl,
        name: '',
        scientificName: '',
        price: '',
        description: '',
        images: [],
        careInfo: {}
    };

    // Extract name
    plant.name = $('h1').first().text().trim() || 
                 $('.product-title').text().trim() ||
                 $('title').text().replace(' - Araflora', '').trim();

    // Extract scientific name (improved pattern matching)
    const text = $.text();
    const scientificPatterns = [
        /([A-Z][a-z]+\s+[a-z]+(?:\s+var\.\s+[a-z]+)?(?:\s+['"][\w\s-]+['"])?)/,  // Genus species var. 'Cultivar'
        /([A-Z][a-z]+\s+[a-z]+(?:\s+x\s+[a-z]+)?)/,  // Genus species or hybrid
        /([A-Z][a-z]+\s+['"][\w\s-]+['"])/  // Genus 'Cultivar'
    ];

    for (const pattern of scientificPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 5) {
            plant.scientificName = match[1].trim();
            break;
        }
    }

    // If no scientific name found, try to extract from name
    if (!plant.scientificName && plant.name) {
        const nameMatch = plant.name.match(/([A-Z][a-z]+\s+[a-z]+)/);
        if (nameMatch) {
            plant.scientificName = nameMatch[1];
        } else {
            plant.scientificName = plant.name.split("'")[0].trim();
        }
    }

    // Extract price
    plant.price = $('.price').first().text().trim() || '';

    // Extract description
    plant.description = $('.product-description, .description').text().trim() || 
                       $('p').slice(1, 3).text().trim() || '';

    // Extract all product images (filtered)
    $('img').each((i, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src');
        if (src) {
            const srcLower = src.toLowerCase();
            if (srcLower.includes('cache/data') && 
                !srcLower.includes('symbol') &&
                !srcLower.includes('flag') &&
                !srcLower.includes('icon')) {
                const fullUrl = src.startsWith('http') ? src : 
                              src.startsWith('/') ? `${CONFIG.baseUrl}${src}` :
                              `${CONFIG.baseUrl}/${src}`;
                if (!plant.images.includes(fullUrl)) {
                    plant.images.push(fullUrl);
                }
            }
        }
    });

    // Extract care symbols/info if available
    // (Araflora uses symbols for light, water, etc.)

    return plant;
}

/**
 * Determine vivarium types from plant characteristics
 */
function determineVivariumTypes(plant) {
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    const desc = (plant.description || '').toLowerCase();

    const types = new Set();
    const vivariumTypes = [];

    // Carnivorous
    if (name.includes('pitcher') || name.includes('sundew') || 
        name.includes('flytrap') || name.includes('drosera') ||
        name.includes('nepenthes') || name.includes('sarracenia')) {
        types.add('carnivorous');
        vivariumTypes.push('Closed Terrarium');
    }

    // Orchids
    if (name.includes('orchid') || scientific.includes('orchid') ||
        scientific.match(/\b(phalaenopsis|dendrobium|masdevallia|pleurothallis|bulbophyllum)\b/)) {
        types.add('orchids');
        vivariumTypes.push('Closed Terrarium', 'Aerarium');
    }

    // Ferns
    if (name.includes('fern') || scientific.match(/\b(adiantum|asplenium|pteris|nephrolepis)\b/)) {
        types.add('ferns');
        vivariumTypes.push('Closed Terrarium');
    }

    // Air plants
    if (name.includes('tillandsia') || name.includes('air plant')) {
        types.add('air-plants');
        vivariumTypes.push('Open Terrarium', 'Aerarium');
    }

    // Aquarium
    if (desc.includes('aquatic') || desc.includes('submerged') || 
        name.includes('aquarium')) {
        types.add('aquarium');
        vivariumTypes.push('Paludarium');
    }

    // Default for terrarium plants
    if (types.size === 0) {
        types.add('additional');
        types.add('vivarium');
        vivariumTypes.push('Closed Terrarium');
    } else {
        types.add('vivarium');
    }

    return {
        types: Array.from(types),
        vivariumTypes: Array.from(new Set(vivariumTypes))
    };
}

/**
 * Convert Araflora plant to your format
 */
async function convertToYourFormat(arafloraPlant, category, plantId) {
    const { types, vivariumTypes } = determineVivariumTypes(arafloraPlant);

    const yourPlant = {
        id: plantId,
        name: arafloraPlant.name.replace(/'/g, "'").split("'")[0].trim(),
        scientificName: arafloraPlant.scientificName || arafloraPlant.name,
        type: types,
        imageUrl: arafloraPlant.images[0] || '',
        images: arafloraPlant.images.slice(0, 5),
        difficulty: "Moderate", // Default, should be researched
        lightRequirements: "Bright Indirect to Medium Light", // Default
        humidity: "High (60-80%)", // Default for terrarium plants
        temperature: "18-24°C", // Default
        watering: "Keep soil moist, not soggy", // Default
        substrate: "Well-draining mix", // Default
        size: "Varies", // Should be researched
        growthRate: "Moderate", // Default
        description: arafloraPlant.description || 
                    `${arafloraPlant.name} is a beautiful plant suitable for terrariums and vivariums.`,
        careTips: [
            "Provide adequate humidity",
            "Ensure good air circulation",
            "Monitor watering needs"
        ],
        compatibility: "Suitable for closed terrarium environments",
        source: "Araflora",
        sourceUrl: arafloraPlant.sourceUrl,
        taxonomy: {
            kingdom: "Plantae"
        },
        vivariumType: vivariumTypes.length > 0 ? vivariumTypes : ['Closed Terrarium']
    };

    // Add attribution
    if (arafloraPlant.description) {
        yourPlant.attribution = "Plant information sourced from Araflora.com";
    }

    return yourPlant;
}

/**
 * Discover all categories and fetch plants
 */
async function discoverAndFetchAll() {
    console.log('🔍 Discovering all Araflora categories...\n');

    const $ = await fetchPage(CONFIG.baseUrl);
    if (!$) {
        console.log('❌ Could not fetch homepage');
        return [];
    }

    const categories = [];
    $('a').each((i, link) => {
        const href = $(link).attr('href');
        const text = $(link).text().trim();

        if (href && text && (
            text.includes('Terrarium') || 
            text.includes('Carnivorous') ||
            text.includes('Orchid') ||
            text.includes('Aquarium') ||
            (text.includes('plant') && !text.includes('accessory'))
        )) {
            const fullUrl = href.startsWith('http') ? href : 
                           href.startsWith('/') ? `${CONFIG.baseUrl}${href}` :
                           `${CONFIG.baseUrl}/${href}`;
            
            if (fullUrl.includes('/c') || fullUrl.includes('category')) {
                const existing = categories.find(c => c.url === fullUrl);
                if (!existing && fullUrl !== CONFIG.baseUrl) {
                    categories.push({ name: text, url: fullUrl });
                }
            }
        }
    });

    return categories;
}

/**
 * Get all plant links from category
 */
async function getPlantLinksFromCategory(categoryUrl) {
    const $ = await fetchPage(categoryUrl);
    if (!$) return [];

    const links = new Set();
    $('a[href*="/p"]').each((i, link) => {
        const href = $(link).attr('href');
        if (href && href.match(/\/p\d+/)) {
            const hrefLower = href.toLowerCase();
            if (!hrefLower.includes('accessory') && 
                !hrefLower.includes('starter') &&
                !hrefLower.includes('/i') &&
                !hrefLower.includes('/c')) {
                const fullUrl = href.startsWith('http') ? href : 
                               href.startsWith('/') ? `${CONFIG.baseUrl}${href}` :
                               `${CONFIG.baseUrl}/${href}`;
                links.add(fullUrl);
            }
        }
    });

    return Array.from(links);
}

/**
 * Main integration function
 */
async function main() {
    console.log('🌿 Automatic Araflora Integration');
    console.log('⚠️  This will extract and add plants to your database\n');

    // Create output directory
    await fs.mkdir(CONFIG.outputDir, { recursive: true });

    // Discover categories
    const categories = await discoverAndFetchAll();
    console.log(`📦 Found ${categories.length} categories:\n`);
    categories.forEach(cat => console.log(`   - ${cat.name}: ${cat.url}`));

    // Start with known categories for reliability
    const knownCategories = [
        { name: 'Terrarium plants', url: 'https://www.araflora.com/c134/special-terrarium-plants' },
        { name: 'Carnivorous plants', url: 'https://www.araflora.com/c146/carnivorous-plants' }
    ];

    const allPlants = [];
    let currentId = await getNextPlantId();

    for (const category of knownCategories) {
        console.log(`\n📂 Processing: ${category.name}`);
        const plantLinks = await getPlantLinksFromCategory(category.url);
        console.log(`   Found ${plantLinks.length} plants`);

        for (const link of plantLinks.slice(0, 50)) { // Limit to 50 per category
            console.log(`   🌱 Fetching: ${link.substring(50)}...`);
            const arafloraData = await extractFullPlantData(link);
            
            if (arafloraData && arafloraData.name) {
                const yourFormat = await convertToYourFormat(arafloraData, category.name, currentId++);
                
                // Save individual file
                const filename = yourFormat.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '') + '.json';
                
                const filePath = path.join(CONFIG.outputDir, filename);
                await fs.writeFile(filePath, JSON.stringify(yourFormat, null, 2));
                
                allPlants.push(yourFormat);
                console.log(`      ✅ Added: ${yourFormat.name} (ID: ${yourFormat.id})`);
            }
        }
    }

    // Save summary
    await fs.writeFile(
        path.join(CONFIG.outputDir, 'import-summary.json'),
        JSON.stringify({
            total: allPlants.length,
            plants: allPlants.map(p => ({ id: p.id, name: p.name, scientificName: p.scientificName }))
        }, null, 2)
    );

    console.log(`\n✅ Integration complete!`);
    console.log(`   Added ${allPlants.length} plants`);
    console.log(`   Saved to: ${CONFIG.outputDir}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Review plants in ${CONFIG.outputDir}`);
    console.log(`   2. Manually move plants to appropriate category folders`);
    console.log(`   3. Update index.json files`);
    console.log(`   4. Add more detailed care information`);
    console.log(`   5. Verify scientific names`);
}

main().catch(console.error);

