// Comprehensive extraction of ALL plants from Araflora
// Discovers all categories, handles pagination, extracts everything

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    baseUrl: 'https://www.araflora.com',
    delay: 2000, // 2 seconds between requests
    outputDir: path.join(__dirname, '..', 'data', 'araflora-all'),
    maxPlantsPerRun: 500, // Limit to avoid overwhelming
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

/**
 * Rate limiting
 */
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch page with retry
 */
async function fetchPage(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await delay(CONFIG.delay);
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': CONFIG.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: 30000
            });
            return cheerio.load(response.data);
        } catch (error) {
            if (i === retries - 1) {
                console.error(`Error fetching ${url}:`, error.message);
                return null;
            }
            await delay(1000 * (i + 1)); // Exponential backoff
        }
    }
    return null;
}

/**
 * Discover ALL category URLs from homepage and navigation
 */
async function discoverAllCategories() {
    console.log('🔍 Discovering all categories from Araflora...\n');
    
    const categories = new Map();
    
    // Start from homepage
    const $home = await fetchPage(CONFIG.baseUrl);
    if (!$home) return [];
    
    // Method 1: Look for navigation menu links
    $home('a').each((i, link) => {
        const href = $home(link).attr('href');
        const text = $home(link).text().trim();
        
        if (href && text) {
            const hrefLower = href.toLowerCase();
            const textLower = text.toLowerCase();
            
            // Look for category links (usually /c followed by number)
            if ((hrefLower.includes('/c') && hrefLower.match(/\/c\d+/)) ||
                (textLower.includes('plant') && !textLower.includes('accessory'))) {
                
                const fullUrl = href.startsWith('http') ? href : 
                               href.startsWith('/') ? `${CONFIG.baseUrl}${href}` :
                               `${CONFIG.baseUrl}/${href}`;
                
                if (fullUrl.includes(CONFIG.baseUrl) && !fullUrl.includes('/i') && !fullUrl.includes('/account')) {
                    const key = text || fullUrl;
                    if (!categories.has(key)) {
                        categories.set(key, { name: text, url: fullUrl });
                    }
                }
            }
        }
    });
    
    // Method 2: Look for specific known category patterns
    const knownCategories = [
        'Terrarium plants',
        'Carnivorous plants',
        'Orchids',
        'Houseplants',
        'Aquarium plants',
        'Bromeliads',
        'Ferns',
        'Begonias'
    ];
    
    // Try to find category pages directly
    const categoryPatterns = [
        '/c134/special-terrarium-plants',
        '/c146/carnivorous-plants',
        '/c55/houseplants'
    ];
    
    for (const pattern of categoryPatterns) {
        const url = `${CONFIG.baseUrl}${pattern}`;
        const $cat = await fetchPage(url);
        if ($cat) {
            // Extract category name from page
            const title = $cat('h1, .page-title, title').first().text().trim() || 
                         pattern.split('/').pop().replace(/-/g, ' ');
            categories.set(title, { name: title, url });
        }
    }
    
    return Array.from(categories.values());
}

/**
 * Get ALL plant links from a category (handles pagination)
 */
async function getAllPlantLinksFromCategory(categoryUrl) {
    const plantLinks = new Set();
    let currentPage = 1;
    let hasMore = true;
    
    console.log(`   📂 Fetching from: ${categoryUrl}`);
    
    while (hasMore && plantLinks.size < 200) { // Limit per category
        let pageUrl = categoryUrl;
        
        // Add pagination if not first page
        if (currentPage > 1) {
            // Try different pagination patterns
            if (categoryUrl.includes('?')) {
                pageUrl = `${categoryUrl}&page=${currentPage}`;
            } else {
                pageUrl = `${categoryUrl}?page=${currentPage}`;
            }
        }
        
        const $ = await fetchPage(pageUrl);
        if (!$) {
            hasMore = false;
            break;
        }
        
        let foundOnPage = 0;
        
        // Extract plant links
        $('a[href*="/p"]').each((i, link) => {
            const href = $(link).attr('href');
            if (href && href.match(/\/p\d+/)) {
                const hrefLower = href.toLowerCase();
                
                // Filter out non-plant items
                if (!hrefLower.includes('accessory') && 
                    !hrefLower.includes('supply') &&
                    !hrefLower.includes('starter_package') &&
                    !hrefLower.includes('starter-package') &&
                    !hrefLower.includes('/i') &&
                    !hrefLower.includes('/c') &&
                    !hrefLower.includes('package')) {
                    
                    const fullUrl = href.startsWith('http') ? href : 
                                   href.startsWith('/') ? `${CONFIG.baseUrl}${href}` :
                                   `${CONFIG.baseUrl}/${href}`;
                    plantLinks.add(fullUrl);
                    foundOnPage++;
                }
            }
        });
        
        // Check for pagination links
        const nextPageLink = $('a:contains("Next"), a:contains(">"), .pagination a[href*="page"]')
            .filter((i, el) => {
                const text = $(el).text().toLowerCase();
                return text.includes('next') || text.includes('>') || $(el).attr('href')?.includes('page');
            }).first();
        
        if (foundOnPage === 0 || (!nextPageLink.length && currentPage > 1)) {
            hasMore = false;
        } else {
            currentPage++;
            // Safety limit
            if (currentPage > 50) hasMore = false;
        }
    }
    
    console.log(`      Found ${plantLinks.size} plant links`);
    return Array.from(plantLinks);
}

/**
 * Extract full plant data
 */
async function extractPlantData(productUrl) {
    const $ = await fetchPage(productUrl);
    if (!$) return null;
    
    const plant = {
        sourceUrl: productUrl,
        name: '',
        scientificName: '',
        price: '',
        description: '',
        images: [],
        inStock: false
    };
    
    // Extract name
    plant.name = $('h1').first().text().trim() || 
                 $('.product-title').text().trim() ||
                 $('title').text().replace(' - Araflora', '').trim();
    
    // Extract scientific name
    const text = $.text();
    const patterns = [
        /([A-Z][a-z]+\s+[a-z]+(?:\s+['"][\w\s-]+['"])?)/,
        /([A-Z][a-z]+\s+[a-z]+(?:\s+var\.\s+[a-z]+)?)/,
        /([A-Z][a-z]+\s+x\s+[a-z]+)/
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 5) {
            plant.scientificName = match[1].trim();
            break;
        }
    }
    
    if (!plant.scientificName && plant.name) {
        const nameMatch = plant.name.match(/([A-Z][a-z]+\s+[a-z]+)/);
        if (nameMatch) {
            plant.scientificName = nameMatch[1];
        }
    }
    
    // Extract price
    plant.price = $('.price').first().text().trim() || '';
    
    // Extract description
    plant.description = $('.product-description, .description').text().trim() || 
                       $('p').slice(1, 3).text().trim() || '';
    
    // Extract images
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
    
    // Check stock
    const stockText = text.toLowerCase();
    plant.inStock = !stockText.includes('out of stock');
    
    return plant;
}

/**
 * Convert to your format
 */
function convertToYourFormat(arafloraPlant, category, plantId) {
    const name = arafloraPlant.name.replace(/'/g, "'").split("'")[0].trim();
    
    // Determine types
    const types = [];
    const nameLower = name.toLowerCase();
    const scientificLower = (arafloraPlant.scientificName || '').toLowerCase();
    
    if (nameLower.includes('pitcher') || nameLower.includes('sundew') || 
        nameLower.includes('flytrap') || scientificLower.includes('drosera') ||
        scientificLower.includes('nepenthes') || scientificLower.includes('sarracenia')) {
        types.push('carnivorous', 'vivarium');
    } else if (nameLower.includes('orchid') || scientificLower.includes('orchid')) {
        types.push('orchids', 'vivarium');
    } else if (nameLower.includes('fern') || scientificLower.match(/\b(adiantum|asplenium|pteris)\b/)) {
        types.push('ferns', 'vivarium');
    } else if (nameLower.includes('tillandsia')) {
        types.push('air-plants', 'vivarium');
    } else {
        types.push('additional', 'vivarium');
    }
    
    return {
        id: plantId,
        name: name,
        scientificName: arafloraPlant.scientificName || name,
        type: types,
        imageUrl: arafloraPlant.images[0] || '',
        images: arafloraPlant.images.slice(0, 5),
        difficulty: "Moderate",
        lightRequirements: "Bright Indirect to Medium Light",
        humidity: "High (60-80%)",
        temperature: "18-24°C",
        watering: "Keep soil moist, not soggy",
        substrate: "Well-draining mix",
        size: "Varies",
        growthRate: "Moderate",
        description: arafloraPlant.description || 
                    `${name} is a beautiful plant suitable for terrariums and vivariums.`,
        careTips: [
            "Provide adequate humidity",
            "Ensure good air circulation",
            "Monitor watering needs"
        ],
        compatibility: "Suitable for terrarium environments",
        taxonomy: {
            kingdom: "Plantae"
        },
        vivariumType: ['Closed Terrarium'],
        sourceUrl: arafloraPlant.sourceUrl
    };
}

/**
 * Main extraction function
 */
async function main() {
    console.log('🌿 Comprehensive Araflora Plant Extraction');
    console.log('⚠️  This will extract ALL available plants\n');
    
    await fs.mkdir(CONFIG.outputDir, { recursive: true });
    
    // Discover all categories
    const categories = await discoverAllCategories();
    console.log(`\n📦 Found ${categories.length} categories:\n`);
    categories.forEach(cat => console.log(`   - ${cat.name}: ${cat.url}`));
    
    // Also add known important categories
    const importantCategories = [
        { name: 'Terrarium plants', url: 'https://www.araflora.com/c134/special-terrarium-plants' },
        { name: 'Carnivorous plants', url: 'https://www.araflora.com/c146/carnivorous-plants' },
        { name: 'Houseplants', url: 'https://www.araflora.com/c55/houseplants' }
    ];
    
    // Merge and deduplicate
    const allCategories = [...importantCategories];
    for (const cat of categories) {
        if (!allCategories.find(c => c.url === cat.url)) {
            allCategories.push(cat);
        }
    }
    
    console.log(`\n📊 Processing ${allCategories.length} categories...\n`);
    
    const allPlants = [];
    let currentId = 136; // Start after existing plants
    
    for (const category of allCategories) {
        console.log(`\n📂 Category: ${category.name}`);
        
        try {
            const plantLinks = await getAllPlantLinksFromCategory(category.url);
            
            console.log(`   Processing ${plantLinks.length} plants...`);
            
            for (let i = 0; i < plantLinks.length && allPlants.length < CONFIG.maxPlantsPerRun; i++) {
                const link = plantLinks[i];
                console.log(`   [${i+1}/${plantLinks.length}] ${link.substring(50)}...`);
                
                const arafloraData = await extractPlantData(link);
                
                if (arafloraData && arafloraData.name && 
                    !arafloraData.name.toLowerCase().includes('accessory') &&
                    !arafloraData.name.toLowerCase().includes('package')) {
                    
                    const yourFormat = convertToYourFormat(arafloraData, category.name, currentId++);
                    
                    // Save individual file
                    const filename = yourFormat.name
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '') + '.json';
                    
                    const filePath = path.join(CONFIG.outputDir, filename);
                    await fs.writeFile(filePath, JSON.stringify(yourFormat, null, 2));
                    
                    allPlants.push(yourFormat);
                }
                
                // Progress update every 10 plants
                if ((i + 1) % 10 === 0) {
                    console.log(`      ✅ Extracted ${i + 1} plants so far...`);
                }
            }
        } catch (error) {
            console.error(`   ❌ Error processing category:`, error.message);
        }
    }
    
    // Save summary
    await fs.writeFile(
        path.join(CONFIG.outputDir, 'extraction-summary.json'),
        JSON.stringify({
            total: allPlants.length,
            timestamp: new Date().toISOString(),
            categories: allCategories.map(c => c.name),
            plants: allPlants.map(p => ({ id: p.id, name: p.name, scientificName: p.scientificName }))
        }, null, 2)
    );
    
    console.log(`\n\n✅ Extraction complete!`);
    console.log(`   Extracted: ${allPlants.length} plants`);
    console.log(`   Saved to: ${CONFIG.outputDir}`);
    console.log(`\n💡 Next: Run finalize-araflora-integration.js to integrate these into your database`);
}

main().catch(console.error);

