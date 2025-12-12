// Helper script to discover Araflora category URLs
// This helps you find the correct URLs for categories

const axios = require('axios');
const cheerio = require('cheerio');

const CONFIG = {
    baseUrl: 'https://www.araflora.com',
    delay: 2000
};

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url) {
    try {
        await delay(CONFIG.delay);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        return cheerio.load(response.data);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        return null;
    }
}

/**
 * Discover category URLs from Araflora homepage
 */
async function discoverCategories() {
    console.log('🔍 Discovering Araflora category URLs...\n');
    
    const $ = await fetchPage(CONFIG.baseUrl);
    if (!$) {
        console.log('❌ Could not fetch homepage');
        return;
    }

    console.log('📋 Found potential category links:\n');
    
    const categories = new Map();
    
    // Look for navigation menu links
    $('a').each((i, link) => {
        const href = $(link).attr('href');
        const text = $(link).text().trim();
        
        if (href && text) {
            // Look for category-like links
            const lowerText = text.toLowerCase();
            const lowerHref = href.toLowerCase();
            
            if ((lowerText.includes('terrarium') || 
                 lowerText.includes('vivarium') ||
                 lowerText.includes('carnivorous') ||
                 lowerText.includes('orchid') ||
                 lowerText.includes('aquarium') ||
                 lowerText.includes('plant')) &&
                (lowerHref.includes('category') || lowerHref.includes('/c') || lowerHref.includes('/p'))) {
                
                const fullUrl = href.startsWith('http') ? href : 
                               href.startsWith('/') ? `${CONFIG.baseUrl}${href}` :
                               `${CONFIG.baseUrl}/${href}`;
                
                if (!categories.has(text)) {
                    categories.set(text, fullUrl);
                }
            }
        }
    });

    // Display found categories
    if (categories.size > 0) {
        console.log('Found categories:');
        categories.forEach((url, name) => {
            console.log(`\n  "${name}"`);
            console.log(`  URL: ${url}`);
        });
        
        console.log('\n\n📝 To use these in fetch-araflora-data.js:');
        console.log('Copy the URLs above and update the categories array like this:\n');
        console.log('const categories = [');
        categories.forEach((url, name) => {
            console.log(`    { name: '${name}', url: '${url}' },`);
        });
        console.log('];');
    } else {
        console.log('⚠️  No categories found automatically.');
        console.log('\n📝 Manual method:');
        console.log('   1. Visit https://www.araflora.com');
        console.log('   2. Browse to each category you want');
        console.log('   3. Copy the URL from your browser');
        console.log('   4. Add to categories array in fetch-araflora-data.js');
    }
}

/**
 * Test a specific URL
 */
async function testCategoryUrl(url) {
    console.log(`\n🧪 Testing category URL: ${url}`);
    const $ = await fetchPage(url);
    if (!$) {
        console.log('❌ Could not fetch');
        return;
    }

    // Count potential product links
    const productLinks = $('a[href*="/p"]').length;
    console.log(`✅ Page loaded successfully`);
    console.log(`   Found ${productLinks} potential product links`);
    
    if (productLinks > 0) {
        console.log('\n   Sample product links:');
        $('a[href*="/p"]').slice(0, 3).each((i, link) => {
            const href = $(link).attr('href');
            const text = $(link).text().trim();
            const fullUrl = href.startsWith('http') ? href : `${CONFIG.baseUrl}${href}`;
            console.log(`   - ${text.substring(0, 50)}...`);
            console.log(`     ${fullUrl}`);
        });
    }
}

// Main
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length > 0 && args[0].startsWith('http')) {
        // Test specific URL
        await testCategoryUrl(args[0]);
    } else {
        // Discover categories
        await discoverCategories();
        
        console.log('\n\n💡 Tip: To test a specific URL, run:');
        console.log('   node scripts/discover-araflora-categories.js <URL>');
    }
}

main().catch(console.error);

