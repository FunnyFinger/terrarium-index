// Discover all product URLs from GrowTropicals
// Test the discovery logic

const axios = require('axios');
const cheerio = require('cheerio');

async function discoverProducts(categoryUrl) {
    try {
        console.log(`Testing: ${categoryUrl}\n`);
        
        const response = await axios.get(categoryUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        console.log('Looking for product links...\n');
        
        // Method 1: Direct product links
        const productUrls1 = new Set();
        $('a[href*="/products/"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href) {
                if (href.startsWith('/')) {
                    href = 'https://growtropicals.com' + href;
                }
                href = href.split('?')[0].split('#')[0];
                if (href.includes('/products/')) {
                    productUrls1.add(href);
                }
            }
        });
        
        console.log(`Method 1 (a[href*="/products/"]): ${productUrls1.size} links`);
        if (productUrls1.size > 0) {
            Array.from(productUrls1).slice(0, 5).forEach(url => {
                console.log(`  - ${url}`);
            });
        }
        
        // Method 2: Product cards
        const productUrls2 = new Set();
        $('[class*="product"], [data-product]').each((i, el) => {
            const href = $(el).find('a').attr('href') || $(el).attr('href');
            if (href && href.includes('/products/')) {
                let url = href;
                if (url.startsWith('/')) {
                    url = 'https://growtropicals.com' + url;
                }
                url = url.split('?')[0].split('#')[0];
                productUrls2.add(url);
            }
        });
        
        console.log(`\nMethod 2 ([class*="product"]): ${productUrls2.size} links`);
        
        // Method 3: JSON-LD product data
        const productUrls3 = new Set();
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const items = Array.isArray(json) ? json : [json];
                
                items.forEach(item => {
                    if (item['@type'] === 'Product' && item.url) {
                        let url = item.url;
                        if (url.startsWith('/')) {
                            url = 'https://growtropicals.com' + url;
                        }
                        productUrls3.add(url);
                    }
                });
            } catch (e) {
                // Continue
            }
        });
        
        console.log(`\nMethod 3 (JSON-LD): ${productUrls3.size} links`);
        
        // Method 4: Grid items
        const productUrls4 = new Set();
        $('.grid__item, .product-grid-item, [class*="grid-item"]').each((i, el) => {
            const href = $(el).find('a').first().attr('href');
            if (href && href.includes('/products/')) {
                let url = href;
                if (url.startsWith('/')) {
                    url = 'https://growtropicals.com' + url;
                }
                url = url.split('?')[0].split('#')[0];
                productUrls4.add(url);
            }
        });
        
        console.log(`\nMethod 4 (Grid items): ${productUrls4.size} links`);
        
        // Combine all methods
        const allUrls = new Set([...productUrls1, ...productUrls2, ...productUrls3, ...productUrls4]);
        
        console.log(`\n✅ Total unique products found: ${allUrls.size}`);
        
        if (allUrls.size > 0) {
            console.log('\nSample URLs:');
            Array.from(allUrls).slice(0, 10).forEach(url => {
                console.log(`  - ${url}`);
            });
        }
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}

// Test with a known collection
discoverProducts('https://growtropicals.com/collections/alocasia');

