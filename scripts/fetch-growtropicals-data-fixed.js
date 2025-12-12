// Fixed extraction script for GrowTropicals.com
// Based on actual HTML structure analysis

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'growtropicals-import');
const DELAY = 1500; // 1.5 seconds between requests

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text) {
    if (!text) return '';
    return text
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
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
        
        let name = '';
        let description = '';
        let images = [];
        let imageUrl = null;
        let scientificName = '';
        
        // 1. Extract from JSON-LD structured data (most reliable)
        const jsonLdScripts = $('script[type="application/ld+json"]');
        jsonLdScripts.each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                
                // Handle both single objects and arrays
                const products = Array.isArray(json) 
                    ? json.filter(item => item['@type'] === 'Product')
                    : (json['@type'] === 'Product' ? [json] : []);
                
                products.forEach(product => {
                    if (!name && product.name) {
                        name = decodeHtmlEntities(product.name);
                    }
                    
                    if (!description && product.description) {
                        description = decodeHtmlEntities(product.description);
                        // Clean up description
                        description = description.replace(/\n\n+/g, '\n\n').trim();
                        if (description.length > 1000) {
                            description = description.substring(0, 1000) + '...';
                        }
                    }
                    
                    // Extract images
                    if (product.image) {
                        let imgArray = [];
                        if (typeof product.image === 'string') {
                            imgArray = [product.image];
                        } else if (Array.isArray(product.image)) {
                            imgArray = product.image.map(img => 
                                typeof img === 'string' ? img : (img.url || img.image || img)
                            );
                        } else if (product.image.url || product.image.image) {
                            imgArray = [product.image.url || product.image.image];
                        }
                        
                        imgArray.forEach(img => {
                            if (img) {
                                if (img.startsWith('//')) {
                                    img = 'https:' + img;
                                } else if (img.startsWith('/')) {
                                    img = 'https://growtropicals.com' + img;
                                }
                                // Filter out non-product images
                                if (img.includes('product') || img.includes('cdn/shop') && !img.includes('logo') && !img.includes('icon')) {
                                    if (!images.includes(img)) {
                                        images.push(img);
                                        if (!imageUrl) imageUrl = img;
                                    }
                                }
                            }
                        });
                    }
                });
            } catch (e) {
                // JSON parse failed, continue
            }
        });
        
        // 2. Fallback to HTML selectors
        if (!name) {
            name = $('.product-single__title').text().trim() || 
                   $('h1.product-title').text().trim() || 
                   $('h1').first().text().trim();
            name = decodeHtmlEntities(name);
        }
        
        if (!description) {
            // Try .rte first (main description container)
            description = $('.rte').text().trim();
            
            if (!description || description.length < 100) {
                // Try other selectors
                const descSelectors = [
                    '.product-description',
                    '.product-details',
                    '.product-single__description',
                    '.product__description'
                ];
                
                for (const selector of descSelectors) {
                    const desc = $(selector).text().trim();
                    if (desc && desc.length > 100) {
                        description = desc;
                        break;
                    }
                }
            }
            
            // Clean description
            if (description) {
                // Remove pricing, shipping info, etc.
                description = description
                    .replace(/Tax included.*?checkout\./s, '')
                    .replace(/Shipping calculated.*?checkout\./s, '')
                    .replace(/Regular price.*?Sale price.*?/s, '')
                    .replace(/£[\d.,]+/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (description.length > 1000) {
                    description = description.substring(0, 1000) + '...';
                }
            }
            
            description = decodeHtmlEntities(description);
        }
        
        // 3. Extract images from page if not found in JSON-LD
        if (images.length === 0) {
            $('img').each((i, el) => {
                let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
                if (src) {
                    // Convert relative URLs
                    if (src.startsWith('//')) {
                        src = 'https:' + src;
                    } else if (src.startsWith('/')) {
                        src = 'https://growtropicals.com' + src;
                    }
                    
                    // Filter product images
                    if ((src.includes('cdn/shop') || src.includes('product')) && 
                        !src.includes('logo') && !src.includes('icon') && 
                        !src.includes('gtlogo') && src.includes('jpg')) {
                        if (!images.includes(src)) {
                            images.push(src);
                            if (!imageUrl) imageUrl = src;
                        }
                    }
                }
            });
        }
        
        // 4. Extract scientific name from name or description
        if (name) {
            // Try to extract from name (e.g., "Monstera deliciosa 'Thai Constellation'")
            const sciMatch = name.match(/([A-Z][a-z]+\s+[a-z]+(?:\s+x\s+[a-z]+)?)/);
            if (sciMatch) {
                scientificName = sciMatch[1];
            }
        }
        
        if (!scientificName && description) {
            // Try patterns in description
            const patterns = [
                /([A-Z][a-z]+\s+[a-z]+(?:\s+x\s+[a-z]+)?)/, // Basic genus species
                /Native to.*?([A-Z][a-z]+\s+[a-z]+)/i,
                /([A-Z][a-z]+\s+[a-z]+\s+[a-z]+)/ // Three-word names
            ];
            
            for (const pattern of patterns) {
                const match = description.match(pattern);
                if (match && match[1] && match[1].length > 5 && match[1].length < 50) {
                    scientificName = match[1].trim();
                    break;
                }
            }
        }
        
        // 5. Extract care information
        const careInfo = {};
        const combinedText = (description + ' ' + $.text()).toLowerCase();
        
        // Light
        if (combinedText.includes('bright indirect')) {
            careInfo.lightRequirements = 'Bright Indirect Light';
        } else if (combinedText.includes('bright light')) {
            careInfo.lightRequirements = 'Bright Light';
        } else if (combinedText.includes('medium to bright')) {
            careInfo.lightRequirements = 'Medium to Bright Indirect Light';
        } else if (combinedText.includes('medium light')) {
            careInfo.lightRequirements = 'Medium Light';
        } else if (combinedText.includes('low light')) {
            careInfo.lightRequirements = 'Low Light';
        }
        
        // Humidity
        if (combinedText.includes('high humidity') || combinedText.includes('higher humidity')) {
            careInfo.humidity = 'High (60-80%)';
        } else if (combinedText.includes('moderate humidity')) {
            careInfo.humidity = 'Moderate (40-60%)';
        } else if (combinedText.includes('low humidity')) {
            careInfo.humidity = 'Low (20-40%)';
        }
        
        // Temperature
        const tempMatch = combinedText.match(/(\d+\s*[-–]\s*\d+\s*°[CF])/i);
        if (tempMatch) {
            careInfo.temperature = tempMatch[1];
        }
        
        // Size (from pot sizes mentioned)
        const sizeMatch = combinedText.match(/(\d+\s*[-–]\s*\d+\s*cm)/i);
        if (sizeMatch) {
            careInfo.size = sizeMatch[1];
        }
        
        if (!name) {
            return null; // Can't extract without a name
        }
        
        return {
            name: name,
            scientificName: scientificName,
            description: description,
            images: images,
            imageUrl: imageUrl || images[0] || null,
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
        
        // Find product links - multiple methods
        // Method 1: Direct links
        $('a[href*="/products/"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href) {
                if (href.startsWith('/')) {
                    href = 'https://growtropicals.com' + href;
                }
                // Remove query params and fragments
                href = href.split('?')[0].split('#')[0];
                if (href.includes('/products/')) {
                    productUrls.add(href);
                }
            }
        });
        
        // Method 2: Product cards
        $('[class*="product"], [data-product]').each((i, el) => {
            const href = $(el).find('a').attr('href') || $(el).attr('href');
            if (href && href.includes('/products/')) {
                let url = href;
                if (url.startsWith('/')) {
                    url = 'https://growtropicals.com' + url;
                }
                url = url.split('?')[0].split('#')[0];
                if (url.includes('/products/')) {
                    productUrls.add(url);
                }
            }
        });
        
        return {
            productUrls: Array.from(productUrls),
            hasNextPage: false,
            nextPageUrl: null
        };
    } catch (error) {
        console.log(`    ⚠️  Error discovering products: ${error.message}`);
        return { productUrls: [], hasNextPage: false, nextPageUrl: null };
    }
}

/**
 * Main extraction function
 */
async function main() {
    console.log('🌿 Fetching Plant Data from GrowTropicals.com (Fixed Version)...\n');
    
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Start with plant-specific collections only (skip pots, accessories)
    const plantCollections = [
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
        'https://growtropicals.com/collections/bromeliads',
        'https://growtropicals.com/collections/syngonium',
        'https://growtropicals.com/collections/cacti-and-succulents',
        'https://growtropicals.com/collections/air-plants'
    ];
    
    const allProducts = new Map();
    
    console.log(`📂 Processing ${plantCollections.length} plant collections...\n`);
    
    for (let i = 0; i < plantCollections.length; i++) {
        const categoryUrl = plantCollections[i];
        const categoryName = categoryUrl.split('/').pop() || 'unknown';
        
        console.log(`📁 ${categoryName} (${i + 1}/${plantCollections.length})`);
        
        const result = await discoverProductsFromPage(categoryUrl);
        
        result.productUrls.forEach(url => {
            if (!allProducts.has(url)) {
                allProducts.set(url, { url, category: categoryName });
            }
        });
        
        console.log(`   Found ${result.productUrls.length} products (Total: ${allProducts.size})\n`);
    }
    
    console.log(`📦 Total unique products found: ${allProducts.size}\n`);
    console.log('🔍 Extracting detailed information...\n');
    
    // Filter out non-plant products
    const nonPlantKeywords = [
        'pot', 'planter', 'substrate', 'soil', 'mix', 'fertilizer', 'fertiliser',
        'nutrient', 'tool', 'gift', 'card', 'rescue-box', 'subscription',
        'support', 'pole', 'moss-pole', 'light', 'lamp', 'terrarium', 'accessory',
        'decor', 'book', 'art', 'mushroom', 'giftcard', 'e-gift'
    ];
    
    const plantProducts = Array.from(allProducts.entries()).filter(([url, info]) => {
        const urlLower = url.toLowerCase();
        const nameLower = url.split('/').pop().toLowerCase();
        // Keep if it doesn't contain non-plant keywords
        return !nonPlantKeywords.some(keyword => urlLower.includes(keyword) || nameLower.includes(keyword));
    });
    
    console.log(`📦 Filtered to ${plantProducts.length} plant products (removed ${allProducts.size - plantProducts.length} non-plants)\n`);
    
    // Extract details - no limit
    let processed = 0;
    let successCount = 0;
    
    for (const [url, info] of plantProducts) {
        processed++;
        const productSlug = url.substring(url.lastIndexOf('/') + 1);
        process.stdout.write(`[${processed}/${plantProducts.length}] ${info.category}: ${productSlug}... `);
        
        const plantData = await extractPlantDetails(url);
        
        if (plantData && plantData.name && plantData.description) {
            // Generate filename
            const filename = plantData.name
                .toLowerCase()
                .replace(/['"]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') + '.json';
            
            const filepath = path.join(OUTPUT_DIR, filename);
            
            // Add metadata
            const enhancedData = {
                ...plantData,
                id: processed + 10000,
                category: info.category,
                extractedAt: new Date().toISOString()
            };
            
            await fs.writeFile(filepath, JSON.stringify(enhancedData, null, 2));
            successCount++;
            console.log(`✅ (${plantData.name.substring(0, 40)})`);
        } else {
            console.log(`❌ Failed`);
        }
    }
    
    console.log(`\n\n✅ Extraction complete!`);
    console.log(`   Processed: ${processed} products`);
    console.log(`   Successfully extracted: ${successCount} plants (${((successCount/processed)*100).toFixed(1)}%)`);
    console.log(`   Output directory: ${OUTPUT_DIR}`);
}

main().catch(console.error);

