// Enhance plants with poor descriptions by fetching from web
// Focus on plants with minimal or placeholder descriptions

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');
const DELAY = 2000; // 2 seconds between requests

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch plant info from Wikipedia
 */
async function fetchWikipediaInfo(scientificName, commonName) {
    const searchTerm = scientificName || commonName;
    if (!searchTerm) return null;
    
    try {
        await delay(DELAY);
        
        // Clean search term
        let wikiName = searchTerm
            .replace(/\s+/g, '_')
            .replace(/['"]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\s+/g, '_')
            .trim();
        
        // Try exact match first
        let url = `https://en.wikipedia.org/wiki/${wikiName}`;
        let response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000
        });
        
        const $ = cheerio.load(response.data);
        
        // Get description
        let description = '';
        $('p').each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 150 && 
                !text.includes('may refer to') &&
                !text.includes('disambiguation') &&
                !text.includes('redirect') &&
                !description) {
                description = text.substring(0, 500).replace(/\n/g, ' ').trim();
            }
        });
        
        if (description) {
            return {
                description: description,
                source: 'Wikipedia'
            };
        }
        
        // If exact match failed and we have scientific name, try genus only
        if (scientificName && scientificName.includes(' ')) {
            const genus = scientificName.split(' ')[0];
            if (genus !== wikiName.split('_')[0]) {
                await delay(DELAY);
                url = `https://en.wikipedia.org/wiki/${genus}`;
                
                try {
                    response = await axios.get(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 8000
                    });
                    
                    const $2 = cheerio.load(response.data);
                    $2('p').each((i, el) => {
                        const text = $2(el).text().trim();
                        if (text.length > 150 && 
                            !text.includes('may refer to') &&
                            !text.includes('disambiguation') &&
                            !description) {
                            // Create a generic description mentioning the species
                            description = `${scientificName} is a ${genus} species. ${text.substring(0, 400)}`.replace(/\n/g, ' ').trim();
                        }
                    });
                    
                    if (description) {
                        return {
                            description: description,
                            source: 'Wikipedia (genus)'
                        };
                    }
                } catch (e) {
                    // Failed
                }
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Check if description needs enhancement
 */
function needsEnhancement(description) {
    if (!description) return true;
    
    if (description.length < 100) return true;
    
    const poorIndicators = [
        'no information',
        'will become available',
        'Sorry, no',
        'beautiful plant suitable',
        'Additional information',
        'is a beautiful plant',
        'suitable for terrariums and vivariums'
    ];
    
    return poorIndicators.some(ind => description.toLowerCase().includes(ind.toLowerCase()));
}

/**
 * Enhance a plant
 */
async function enhancePlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        if (!needsEnhancement(plant.description)) {
            return { enhanced: false, reason: 'Already has good description' };
        }
        
        if (!plant.scientificName || plant.scientificName.length < 3) {
            return { enhanced: false, reason: 'No scientific name' };
        }
        
        console.log(`  🔍 ${plant.name}`);
        const enhanced = await fetchWikipediaInfo(plant.scientificName, plant.name);
        
        if (enhanced && enhanced.description) {
            plant.description = enhanced.description;
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            console.log(`    ✅ Enhanced from ${enhanced.source}`);
            return { enhanced: true, plant: plant.name };
        } else {
            console.log(`    ⚠️  No enhancement found`);
            return { enhanced: false, reason: 'No data found' };
        }
    } catch (error) {
        return { enhanced: false, error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🌐 Enhancing Plants with Poor Descriptions...\n');
    console.log('This will fetch descriptions from Wikipedia for plants needing better info.\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents'];
    
    const plantsToEnhance = [];
    
    // First, collect all plants that need enhancement
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const plant = JSON.parse(content);
                
                if (needsEnhancement(plant.description) && plant.scientificName && plant.scientificName.length > 3) {
                    plantsToEnhance.push({ filePath, name: plant.name });
                }
            }
        } catch (error) {
            // Skip
        }
    }
    
    console.log(`Found ${plantsToEnhance.length} plants needing enhancement\n`);
    console.log(`Processing first 50 plants (to limit web requests)...\n`);
    
    let totalEnhanced = 0;
    
    for (let i = 0; i < Math.min(50, plantsToEnhance.length); i++) {
        const { filePath, name } = plantsToEnhance[i];
        const result = await enhancePlant(filePath);
        
        if (result.enhanced) {
            totalEnhanced++;
        }
    }
    
    console.log(`\n\n✅ Enhancement complete!`);
    console.log(`   Enhanced: ${totalEnhanced} out of ${Math.min(50, plantsToEnhance.length)} processed`);
    console.log(`   Remaining: ${Math.max(0, plantsToEnhance.length - 50)} plants still need enhancement`);
    console.log(`\n💡 Run this script again to process more plants`);
}

main().catch(console.error);

