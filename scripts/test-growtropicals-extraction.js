// Test extraction from a single GrowTropicals product page
// This will help us understand the actual HTML structure

const axios = require('axios');
const cheerio = require('cheerio');

async function testExtraction() {
    // Test with a known product
    const testUrl = 'https://growtropicals.com/products/monstera-deliciosa-thai-constellation';
    
    try {
        console.log(`Testing extraction from: ${testUrl}\n`);
        
        const response = await axios.get(testUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        console.log('=== HTML STRUCTURE ANALYSIS ===\n');
        
        // Check for JSON-LD structured data
        console.log('1. JSON-LD Structured Data:');
        const jsonLd = $('script[type="application/ld+json"]');
        if (jsonLd.length > 0) {
            jsonLd.each((i, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    console.log(`   Found JSON-LD: ${JSON.stringify(json, null, 2).substring(0, 500)}...`);
                } catch (e) {
                    console.log(`   JSON-LD parse error: ${e.message}`);
                }
            });
        } else {
            console.log('   No JSON-LD found');
        }
        
        // Check for title/name
        console.log('\n2. Title/Name Selectors:');
        const titleSelectors = [
            'h1.product-title',
            '.product-title',
            'h1',
            '.product-single__title',
            '[data-product-title]',
            '.product__title'
        ];
        
        titleSelectors.forEach(selector => {
            const text = $(selector).text().trim();
            if (text) {
                console.log(`   ${selector}: "${text.substring(0, 100)}"`);
            }
        });
        
        // Check for description
        console.log('\n3. Description Selectors:');
        const descSelectors = [
            '.product-description',
            '.product-details',
            '[data-product-description]',
            '.product-content p',
            '.product-single__description',
            '.product__description',
            '.rte',
            '[class*="description"]'
        ];
        
        descSelectors.forEach(selector => {
            const text = $(selector).text().trim();
            if (text && text.length > 50) {
                console.log(`   ${selector}: "${text.substring(0, 200)}..."`);
            }
        });
        
        // Check for images
        console.log('\n4. Image Sources:');
        let imgCount = 0;
        $('img').each((i, el) => {
            if (imgCount < 5) {
                const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
                if (src && (src.includes('product') || src.includes('cdn'))) {
                    console.log(`   Image ${imgCount + 1}: ${src.substring(0, 100)}`);
                    imgCount++;
                }
            }
        });
        
        // Check for JavaScript variables
        console.log('\n5. JavaScript Variables:');
        $('script').not('[src]').each((i, el) => {
            const content = $(el).html();
            if (content && (content.includes('ProductInfo') || content.includes('product') || content.includes('variant'))) {
                console.log(`   Script ${i + 1} contains product data`);
                // Show snippet
                const snippet = content.substring(0, 300).replace(/\s+/g, ' ');
                console.log(`   Snippet: ${snippet}...`);
            }
        });
        
        // Check for meta tags
        console.log('\n6. Meta Tags:');
        const metaTitle = $('meta[property="og:title"]').attr('content') || 
                         $('meta[name="title"]').attr('content');
        const metaDesc = $('meta[property="og:description"]').attr('content') || 
                        $('meta[name="description"]').attr('content');
        if (metaTitle) console.log(`   og:title: ${metaTitle}`);
        if (metaDesc) console.log(`   og:description: ${metaDesc.substring(0, 200)}...`);
        
        // Save raw HTML for inspection
        const fs = require('fs').promises;
        await fs.writeFile('growtropicals-test-page.html', response.data);
        console.log('\n✅ Saved raw HTML to growtropicals-test-page.html for inspection');
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}

testExtraction();

