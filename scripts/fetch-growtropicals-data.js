// Fetch plant data from GrowTropicals.com
// Extract plant information and merge with existing database

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'growtropicals-import');
const DELAY = 2000; // 2 seconds between requests

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract plant data from a product page
 */
async function extractPlantDetails(productUrl) {
    try {
        await delay(DELAY);
        
        const response = await axios.get(productUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        // Extract basic information
        const name = $('h1.product-title').text().trim() || 
                     $('.product-title').text().trim() ||
                     $('h1').first().text().trim();
        
        // Extract description
        let description = '';
        const descSelectors = [
            '.product-description',
            '.product-details',
            '[data-product-description]',
            '.product-content p'
        ];
        
        for (const selector of descSelectors) {
            const desc = $(selector).text().trim();
            if (desc && desc.length > 100) {
                description = desc;
                break;
            }
        }
        
        // If no description found, get all paragraphs
        if (!description) {
            $('p').each((i, el) => {
                const text = $(el).text().trim();
                if (text.length > 100 && !text.includes('£') && !description) {
                    description = text.substring(0, 500);
                }
            });
        }
        
        // Extract images
        const images = [];
        $('img').each((i, el) => {
            let src = $(el).attr('src') || $(el).attr('data-src');
            if (src && src.includes('product') && !src.includes('icon') && !src.includes('logo')) {
                // Convert relative URLs to absolute
                if (src.startsWith('//')) {
                    src = 'https:' + src;
                } else if (src.startsWith('/')) {
                    src = 'https://growtropicals.com' + src;
                }
                if (src && !images.includes(src)) {
                    images.push(src);
                }
            }
        });
        
        // Extract care information from page
        const careInfo = {};
        const pageText = $.text().toLowerCase();
        
        // Light requirements
        if (pageText.includes('bright indirect')) careInfo.lightRequirements = 'Bright Indirect Light';
        else if (pageText.includes('bright light')) careInfo.lightRequirements = 'Bright Light';
        else if (pageText.includes('medium light')) careInfo.lightRequirements = 'Medium Light';
        else if (pageText.includes('low light')) careInfo.lightRequirements = 'Low Light';
        
        // Humidity
        if (pageText.includes('high humidity')) careInfo.humidity = 'High (60-80%)';
        else if (pageText.includes('moderate humidity')) careInfo.humidity = 'Moderate (40-60%)';
        else if (pageText.includes('low humidity')) careInfo.humidity = 'Low (20-40%)';
        
        // Temperature
        const tempMatch = pageText.match(/(\d+\s*[-–]\s*\d+\s*°[CF])/i);
        if (tempMatch) {
            careInfo.temperature = tempMatch[1];
        }
        
        // Size
        const sizeMatch = pageText.match(/(\d+\s*[-–]\s*\d+\s*cm)/i) || 
                         pageText.match(/(pot size[^:]*:\s*(\d+\s*cm))/i);
        if (sizeMatch) {
            careInfo.size = sizeMatch[1] || sizeMatch[2];
        }
        
        // Extract scientific name if available
        let scientificName = '';
        $('*').each((i, el) => {
            const text = $(el).text();
            // Look for italicized text which might be scientific name
            if ($(el).is('em, i') && text.match(/^[A-Z][a-z]+\s+[a-z]+/)) {
                scientificName = text.trim();
            }
        });
        
        // Try to find scientific name in description
        if (!scientificName && description) {
            const sciMatch = description.match(/([A-Z][a-z]+\s+[a-z]+(?:\s+[a-z]+)?(?:\s+'[^']+')?)/);
            if (sciMatch) {
                scientificName = sciMatch[1];
            }
        }
        
        return {
            name: name,
            scientificName: scientificName,
            description: description,
            images: images,
            imageUrl: images[0] || null,
            ...careInfo,
            source: 'GrowTropicals',
            sourceUrl: productUrl
        };
    } catch (error) {
        console.log(`    ⚠️  Error extracting ${productUrl}: ${error.message}`);
        return null;
    }
}

/**
 * Discover plant product URLs from a category/collection page
 */
async function discoverProductsFromPage(categoryUrl) {
    try {
        await delay(DELAY);
        
        const response = await axios.get(categoryUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const productUrls = new Set();
        
        // Find product links
        $('a[href*="/products/"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href) {
                if (href.startsWith('/')) {
                    href = 'https://growtropicals.com' + href;
                }
                if (href.includes('/products/') && !href.includes('#') && !href.includes('?')) {
                    productUrls.add(href);
                }
            }
        });
        
        // Also check for pagination
        const nextPage = $('a[rel="next"]').attr('href') || 
                        $('.pagination a:contains("Next")').attr('href');
        
        return {
            productUrls: Array.from(productUrls),
            hasNextPage: !!nextPage,
            nextPageUrl: nextPage ? (nextPage.startsWith('/') ? 'https://growtropicals.com' + nextPage : nextPage) : null
        };
    } catch (error) {
        console.log(`    ⚠️  Error discovering products from ${categoryUrl}: ${error.message}`);
        return { productUrls: [], hasNextPage: false, nextPageUrl: null };
    }
}

/**
 * Discover all categories and collections
 */
async function discoverCategories() {
    try {
        const response = await axios.get('https://growtropicals.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const categories = new Set();
        
        // Find category links
        $('a[href*="/collections/"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href) {
                if (href.startsWith('/')) {
                    href = 'https://growtropicals.com' + href;
                }
                categories.add(href);
            }
        });
        
        // Add specific collections mentioned in the site structure
        const knownCollections = [
            'https://growtropicals.com/collections/alocasia',
            'https://growtropicals.com/collections/aglaonema',
            'https://growtropicals.com/collections/anthurium',
            'https://growtropicals.com/collections/begonia',
            'https://growtropicals.com/collections/hoya',
            'https://growtropicals.com/collections/monstera',
            'https://growtropicals.com/collections/philodendron',
            'https://growtropicals.com/collections/ferns',
            'https://growtropicals.com/collections/orchids',
            'https://growtropicals.com/collections/terrarium-plants',
            'https://growtropicals.com/collections/all-houseplants',
            'https://growtropicals.com/collections/baby-plants',
            'https://growtropicals.com/collections/small-plants',
            'https://growtropicals.com/collections/medium-plants',
            'https://growtropicals.com/collections/large-plants'
        ];
        
        knownCollections.forEach(url => categories.add(url));
        
        return Array.from(categories);
    } catch (error) {
        console.log(`⚠️  Error discovering categories: ${error.message}`);
        return [];
    }
}

/**
 * Main extraction function
 */
async function main() {
    console.log('🌿 Fetching Plant Data from GrowTropicals.com...\n');
    
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Discover categories
    console.log('📂 Discovering categories...');
    const categories = await discoverCategories();
    console.log(`   Found ${categories.length} categories\n`);
    
    const allProducts = new Map(); // Use Map to avoid duplicates by URL
    
    // Process each category
    for (let i = 0; i < categories.length; i++) {
        const categoryUrl = categories[i];
        const categoryName = categoryUrl.split('/').pop() || 'unknown';
        
        console.log(`📁 ${categoryName} (${i + 1}/${categories.length})`);
        
        let currentUrl = categoryUrl;
        let pageNum = 1;
        let hasMore = true;
        
        while (hasMore && pageNum <= 5) { // Limit to 5 pages per category
            const result = await discoverProductsFromPage(currentUrl);
            
            result.productUrls.forEach(url => {
                if (!allProducts.has(url)) {
                    allProducts.set(url, { url, category: categoryName });
                }
            });
            
            console.log(`   Page ${pageNum}: Found ${result.productUrls.length} products (Total: ${allProducts.size})`);
            
            hasMore = result.hasNextPage && result.nextPageUrl;
            currentUrl = result.nextPageUrl;
            pageNum++;
        }
    }
    
    console.log(`\n\n📦 Total unique products found: ${allProducts.size}\n`);
    console.log('🔍 Extracting detailed information...\n');
    
    // Extract details for each product
    let processed = 0;
    let successCount = 0;
    
    for (const [url, info] of allProducts.entries()) {
        processed++;
        console.log(`[${processed}/${allProducts.size}] ${info.category}: ${url.substring(url.lastIndexOf('/') + 1)}`);
        
        const plantData = await extractPlantDetails(url);
        
        if (plantData && plantData.name) {
            // Generate filename
            const filename = plantData.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') + '.json';
            
            const filepath = path.join(OUTPUT_DIR, filename);
            
            // Add metadata
            const enhancedData = {
                ...plantData,
                id: processed + 10000, // Use high ID to avoid conflicts
                category: info.category,
                extractedAt: new Date().toISOString()
            };
            
            await fs.writeFile(filepath, JSON.stringify(enhancedData, null, 2));
            successCount++;
        }
        
        // Progress update every 10
        if (processed % 10 === 0) {
            console.log(`   Progress: ${processed}/${allProducts.size} (${successCount} successful)\n`);
        }
    }
    
    console.log(`\n\n✅ Extraction complete!`);
    console.log(`   Processed: ${processed} products`);
    console.log(`   Successfully extracted: ${successCount} plants`);
    console.log(`   Output directory: ${OUTPUT_DIR}`);
    console.log(`\n💡 Next step: Run integration script to merge with existing database`);
}

main().catch(console.error);

