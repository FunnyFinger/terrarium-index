// Enhance plant descriptions by fetching from web sources
// Only enhances plants with missing or minimal descriptions

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

const DELAY = 1000; // 1 second between requests

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Search for plant information online
 */
async function searchPlantInfo(plantName, scientificName) {
    const searchTerms = scientificName || plantName;
    
    // Try multiple sources
    const sources = [
        async () => {
            // Wikipedia
            try {
                const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(searchTerms.replace(/\s+/g, '_'))}`;
                const response = await axios.get(wikiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 5000
                });
                const $ = cheerio.load(response.data);
                
                // Get first substantial paragraph
                const paragraphs = $('p').filter((i, el) => {
                    const text = $(el).text().trim();
                    return text.length > 100 && 
                           !text.includes('may refer to') &&
                           !text.includes('disambiguation');
                });
                
                if (paragraphs.length > 0) {
                    let desc = paragraphs.first().text().trim();
                    if (desc.length > 500) {
                        desc = desc.substring(0, 500) + '...';
                    }
                    return desc;
                }
            } catch (e) {
                return null;
            }
        },
        async () => {
            // Try simplified scientific name
            if (scientificName && scientificName.includes(' ')) {
                const parts = scientificName.split(' ');
                if (parts.length >= 2) {
                    return await searchPlantInfo(null, `${parts[0]} ${parts[1]}`);
                }
            }
            return null;
        }
    ];
    
    for (const source of sources) {
        await delay(DELAY);
        const result = await source();
        if (result) return result;
    }
    
    return null;
}

/**
 * Extract size from description
 */
function extractSize(description) {
    if (!description) return null;
    
    const patterns = [
        /(\d+\s*[-–]\s*\d+\s*cm)/i,
        /(up to \d+\s*cm)/i,
        /(maximum \d+\s*cm)/i,
        /(\d+\s*cm (tall|high|wide))/i,
        /(reaches \d+\s*cm)/i,
        /(grows to \d+\s*cm)/i
    ];
    
    for (const pattern of patterns) {
        const match = description.match(pattern);
        if (match) {
            return match[1];
        }
    }
    
    return null;
}

/**
 * Enhance a plant
 */
async function enhancePlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        let updated = false;
        
        // Check if description needs enhancement
        const needsEnhancement = !plant.description || 
                                 plant.description.length < 100 ||
                                 plant.description.includes('no information') ||
                                 plant.description.includes('will become available') ||
                                 plant.description.includes('Sorry, no') ||
                                 plant.description.includes('beautiful plant suitable');
        
        if (needsEnhancement) {
            console.log(`  🔍 Enhancing: ${plant.name}`);
            const enhancedDesc = await searchPlantInfo(plant.name, plant.scientificName);
            
            if (enhancedDesc) {
                plant.description = enhancedDesc;
                
                // Also extract size if missing
                if (plant.size === 'Varies' || !plant.size) {
                    const extractedSize = extractSize(enhancedDesc);
                    if (extractedSize) {
                        plant.size = extractedSize;
                    }
                }
                
                updated = true;
                console.log(`    ✅ Enhanced description (${enhancedDesc.length} chars)`);
            } else {
                console.log(`    ⚠️  Could not find enhancement`);
            }
        }
        
        if (updated) {
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            return { enhanced: true, plant: plant.name };
        }
        
        return { enhanced: false };
    } catch (error) {
        return { enhanced: false, error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🌐 Enhancing Plant Descriptions from Web...\n');
    console.log('This will search Wikipedia and other sources for better descriptions.\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                   'air-plants', 'aquarium', 'mosses', 'succulents'];
    
    let totalEnhanced = 0;
    let totalProcessed = 0;
    
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            console.log(`\n📂 ${category} (${plantFiles.length} plants)`);
            
            // Limit to 20 per category to avoid too many requests
            for (const file of plantFiles.slice(0, 20)) {
                const filePath = path.join(categoryDir, file);
                const result = await enhancePlant(filePath);
                totalProcessed++;
                
                if (result.enhanced) {
                    totalEnhanced++;
                }
            }
        } catch (error) {
            // Skip
        }
    }
    
    console.log(`\n\n✅ Enhancement complete!`);
    console.log(`   Enhanced: ${totalEnhanced} out of ${totalProcessed} plants`);
    console.log(`\n💡 Note: Enhanced descriptions from Wikipedia`);
}

main().catch(console.error);

