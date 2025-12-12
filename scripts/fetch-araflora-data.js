// Script to extract plant data from Araflora.com
// Use responsibly: respect robots.txt, rate limit requests, and check terms of service
// Consider reaching out to Araflora for API access or permission

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    baseUrl: 'https://www.araflora.com',
    outputDir: path.join(__dirname, '..', 'data', 'araflora'),
    delayBetweenRequests: 2000, // 2 seconds between requests (be respectful)
    maxPlantsPerCategory: 50, // Limit to avoid overloading
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

/**
 * Rate-limited request helper
 */
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch HTML from URL with rate limiting
 */
async function fetchPage(url) {
    try {
        await delay(CONFIG.delayBetweenRequests);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': CONFIG.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
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
 * Check if URL is for an actual plant (not accessories, info pages, etc.)
 */
function isPlantUrl(url) {
    const urlLower = url.toLowerCase();
    const excludePatterns = [
        '/i',           // Info pages
        '/c',           // Category pages  
        'accessory', 'supply', 'starter_package', 'starter-package',
        'packing', 'shipping', 'payment', 'privacy', 'plantfinder',
        'plant_accessories', 'cadeaubonnen', 'gift'
    ];
    
    return !excludePatterns.some(pattern => urlLower.includes(pattern));
}

/**
 * Extract plant information from Araflora product page
 */
function extractPlantInfo($, productUrl) {
    // Skip if not a plant URL
    if (!isPlantUrl(productUrl)) {
        return null;
    }
    
    const plant = {
        source: 'Araflora',
        sourceUrl: productUrl,
        name: '',
        scientificName: '',
        price: '',
        inStock: false,
        description: '',
        careInfo: {},
        images: [],
        category: ''
    };

    // Extract name - try multiple selectors
    plant.name = $('h1').first().text().trim() || 
                 $('h2.product-title, h2').first().text().trim() ||
                 $('.product-title').text().trim() ||
                 $('[itemprop="name"]').text().trim() ||
                 $('title').text().replace(' - Araflora', '').trim();
    
    // Clean up name (remove extra text)
    if (plant.name) {
        plant.name = plant.name.replace(/\s+/g, ' ').trim();
    }
    
    // Skip if name suggests it's not a plant
    const nameLower = plant.name.toLowerCase();
    if (nameLower.includes('accessory') || 
        nameLower.includes('supply') || 
        nameLower.includes('starter package') ||
        nameLower.includes('packing') ||
        nameLower.includes('payment') ||
        nameLower.includes('privacy') ||
        nameLower.includes('plantfinder')) {
        return null;
    }
    
    // Extract scientific name from various locations
    // Check in title, description, or separate field
    const fullText = $.text();
    const titleText = $('h1, h2, .product-title').text();
    const descText = $('.product-description, .description, [class*="description"]').text();
    
    // Look for scientific name pattern (Genus species or Genus species 'Cultivar')
    const scientificPatterns = [
        /([A-Z][a-z]+(?:\s+[a-z]+)+(?:\s+['"][\w\s-]+['"])?)/,  // Genus species 'Cultivar'
        /([A-Z][a-z]+\s+[a-z]+(?:\s+var\.\s+[a-z]+)?)/,  // Genus species var. variety
        /([A-Z][a-z]+\s+x\s+[a-z]+)/  // Hybrid: Genus x species
    ];
    
    for (const pattern of scientificPatterns) {
        const match = (titleText + ' ' + descText).match(pattern);
        if (match && match[1] && match[1].length > 5) {
            plant.scientificName = match[1].trim();
            break;
        }
    }

    // Extract price - try multiple selectors
    plant.price = $('.price').first().text().trim() || 
                  $('[itemprop="price"]').text().trim() ||
                  $('[class*="price"]').first().text().trim() || 
                  $('span:contains("€")').first().text().trim() || '';

    // Check stock status
    const stockText = $.text().toLowerCase();
    plant.inStock = !stockText.includes('out of stock') && 
                    !stockText.includes('outofstock') &&
                    !$('.out-of-stock, [class*="outofstock"], [class*="out-of-stock"]').length &&
                    !$('text').filter((i, el) => $(el).text().toLowerCase().includes('out of stock')).length;

    // Extract description
    plant.description = descText || 
                       $('.product-info, [class*="product-info"]').text().trim() || 
                       $('p').first().text().trim() || '';

    // Extract images - look for product images
    // Focus on actual plant product images, filter out UI elements
    $('img').each((i, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src');
        if (src) {
            const srcLower = src.toLowerCase();
            
            // Skip UI elements, symbols, flags, buttons
            const skipPatterns = [
                'placeholder', 'logo', 'icon', 'banner', 'button', 
                'flag', 'symbol', 'arrow', 'cart', 'theme', 
                'newsletter', 'zoom.jpg', 's31', 's5', 's77' // Common symbol patterns
            ];
            
            const shouldSkip = skipPatterns.some(pattern => srcLower.includes(pattern));
            
            // Look for actual product images (usually in /cache/data/ or contain plant names)
            const isProductImage = srcLower.includes('cache/data') || 
                                  srcLower.includes('/data/') ||
                                  srcLower.match(/[a-z]+-[a-z]+-\d+\.jpg/i); // Pattern: plant-name-1.jpg
            
            if (!shouldSkip && isProductImage) {
                const fullUrl = src.startsWith('http') ? src : 
                               src.startsWith('/') ? `${CONFIG.baseUrl}${src}` :
                               `${CONFIG.baseUrl}/${src}`;
                if (!plant.images.includes(fullUrl)) {
                    plant.images.push(fullUrl);
                }
            }
        }
    });

    return plant;
}

/**
 * Get plant list from category page
 */
async function getPlantsFromCategory(categoryUrl) {
    console.log(`\n📂 Fetching category: ${categoryUrl}`);
    const $ = await fetchPage(categoryUrl);
    if (!$) {
        console.log('   ⚠️  Could not fetch category page');
        return [];
    }

    const plantLinks = new Set(); // Use Set to avoid duplicates
    
    // Multiple strategies to find product links
    // Strategy 1: Links with /p pattern (Araflora product URLs)
    // Filter to only actual product pages (not info pages, accessories, etc.)
    $('a[href*="/p"]').each((i, link) => {
        const href = $(link).attr('href');
        if (href && href.match(/\/p\d+/)) { // Must have /p followed by digits
            // Exclude non-plant items
            const hrefLower = href.toLowerCase();
            const excludePatterns = ['accessory', 'supply', 'starter_package', 'starter-package', '/i', '/c'];
            
            if (!excludePatterns.some(pattern => hrefLower.includes(pattern))) {
                const fullUrl = href.startsWith('http') ? href : 
                               href.startsWith('/') ? `${CONFIG.baseUrl}${href}` :
                               `${CONFIG.baseUrl}/${href}`;
                plantLinks.add(fullUrl);
            }
        }
    });

    // Strategy 2: Product cards/items
    $('.product-link, .product-item a, [class*="product"] a, [class*="item"] a').each((i, link) => {
        const href = $(link).attr('href');
        if (href && href.match(/\/p\d+/)) { // Must have /p followed by digits
            const hrefLower = href.toLowerCase();
            const excludePatterns = ['accessory', 'supply', 'starter_package', '/i', '/c'];
            
            if (!excludePatterns.some(pattern => hrefLower.includes(pattern))) {
                const fullUrl = href.startsWith('http') ? href : 
                               href.startsWith('/') ? `${CONFIG.baseUrl}${href}` :
                               `${CONFIG.baseUrl}/${href}`;
                plantLinks.add(fullUrl);
            }
        }
    });

    // Strategy 3: Any link containing product ID pattern (with filtering)
    $('a').each((i, link) => {
        const href = $(link).attr('href');
        if (href && href.match(/\/p\d+/i)) { // Must be /p followed by digits
            const hrefLower = href.toLowerCase();
            const excludePatterns = ['accessory', 'supply', 'starter_package', '/i', '/c'];
            
            if (!excludePatterns.some(pattern => hrefLower.includes(pattern))) {
                const fullUrl = href.startsWith('http') ? href : 
                               href.startsWith('/') ? `${CONFIG.baseUrl}${href}` :
                               `${CONFIG.baseUrl}/${href}`;
                if (fullUrl.includes(CONFIG.baseUrl)) {
                    plantLinks.add(fullUrl);
                }
            }
        }
    });

    const linksArray = Array.from(plantLinks).slice(0, CONFIG.maxPlantsPerCategory);
    console.log(`   Found ${linksArray.length} plant links`);
    return linksArray;
}

/**
 * Fetch detailed plant data
 */
async function fetchPlantDetails(plantUrl) {
    // Skip non-plant URLs early
    if (!isPlantUrl(plantUrl)) {
        return null;
    }
    
    console.log(`  🌱 Fetching: ${plantUrl}`);
    const $ = await fetchPage(plantUrl);
    if (!$) return null;

    const plant = extractPlantInfo($, plantUrl);
    
    // Additional validation: must have a valid name
    if (plant && plant.name && plant.name.length > 2) {
        return plant;
    }
    
    return null;
}

/**
 * Convert Araflora plant to our plant format
 */
function convertToOurFormat(arafloraPlant, category) {
    return {
        // Extract ID from URL or generate
        id: null, // Will need to assign
        name: arafloraPlant.name.split('(')[0].trim(), // Remove parentheses content
        scientificName: arafloraPlant.scientificName || arafloraPlant.name,
        type: category === 'Terrarium plants' ? ['terrarium', 'vivarium'] : 
              category === 'Aquarium' ? ['aquarium'] :
              category === 'Carnivorous plants' ? ['terrarium', 'vivarium'] : ['vivarium'],
        imageUrl: arafloraPlant.images[0] || '',
        images: arafloraPlant.images,
        source: 'Araflora',
        sourceUrl: arafloraPlant.sourceUrl,
        // Additional metadata
        arafloraData: {
            price: arafloraPlant.price,
            inStock: arafloraPlant.inStock,
            description: arafloraPlant.description
        }
    };
}

/**
 * Main function - fetch plants from Araflora categories
 */
async function main() {
    console.log('🌿 Araflora Data Fetcher');
    console.log('⚠️  IMPORTANT DISCLAIMERS:');
    console.log('   1. Check Araflora\'s Terms of Service before using');
    console.log('   2. Respect robots.txt: https://www.araflora.com/robots.txt');
    console.log('   3. Use rate limiting (2+ seconds between requests)');
    console.log('   4. Provide proper attribution if using their data');
    console.log('   5. Consider requesting API access from Araflora\n');
    console.log('   Best practice: Use as reference for manual data entry\n');

    // Create output directory
    await fs.mkdir(CONFIG.outputDir, { recursive: true });

    // Araflora categories to fetch
    // Found using discover-araflora-categories.js
    const categories = [
        { 
            name: 'Terrarium plants', 
            url: 'https://www.araflora.com/c134/special-terrarium-plants'
        },
        { 
            name: 'Carnivorous plants', 
            url: 'https://www.araflora.com/c146/carnivorous-plants'
        },
        // Add more categories as needed:
        // { name: 'Orchids', url: 'https://www.araflora.com/cXX/orchids' },
        // { name: 'Houseplants', url: 'https://www.araflora.com/c55/houseplants' },
    ];
    
    // Categories are configured, proceed with extraction

    const allPlants = [];

    for (const category of categories) {
        console.log(`\n📦 Processing category: ${category.name}`);
        
        // Get plant links from category page
        const plantLinks = await getPlantsFromCategory(category.url);
        console.log(`   Found ${plantLinks.length} plants`);

        // Fetch details for each plant
        for (const link of plantLinks.slice(0, 10)) { // Limit to 10 for testing
            const plantData = await fetchPlantDetails(link);
            if (plantData) {
                const converted = convertToOurFormat(plantData, category.name);
                converted.category = category.name;
                allPlants.push(converted);
            }
        }
    }

    // Save results
    const outputFile = path.join(CONFIG.outputDir, 'araflora-plants.json');
    await fs.writeFile(outputFile, JSON.stringify(allPlants, null, 2));
    console.log(`\n✅ Saved ${allPlants.length} plants to ${outputFile}`);

    // Also save individual files for easy review
    console.log('\n📁 Creating individual plant files...');
    for (const plant of allPlants) {
        const filename = plant.name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') + '.json';
        const filePath = path.join(CONFIG.outputDir, filename);
        await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
    }

    console.log(`\n✅ Done! Fetched ${allPlants.length} plants from Araflora`);
    console.log(`\n⚠️  Note: Please review and manually integrate this data into your plant database.`);
    console.log(`   Ensure you have permission to use this data and provide proper attribution.`);
}

// Run
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { fetchPage, extractPlantInfo, convertToOurFormat };

