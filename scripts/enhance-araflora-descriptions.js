// Enhance plant descriptions for araflora-all plants by fetching from web sources
// Uses web search to find better descriptions for plants missing information

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

const ARAFLORA_DIR = path.join(__dirname, '..', 'data', 'araflora-all');
const DELAY = 2000; // 2 seconds between requests to be respectful

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Search Wikipedia API for plant information
 */
async function searchWikipedia(scientificName) {
    try {
        const searchTerm = encodeURIComponent(scientificName);
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${searchTerm}`;
        
        return new Promise((resolve, reject) => {
            https.get(url, {
                headers: { 'User-Agent': 'Terrarium Plant Index Bot/1.0' }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.extract && !result.type.includes('disambiguation')) {
                            // Clean up the description
                            let desc = result.extract;
                            // Remove Wikipedia-specific phrases
                            desc = desc.replace(/\s*\([^)]*\)/g, '');
                            // Limit length
                            if (desc.length > 600) {
                                desc = desc.substring(0, 600).trim();
                                // Try to end at a sentence
                                const lastPeriod = desc.lastIndexOf('.');
                                if (lastPeriod > 400) {
                                    desc = desc.substring(0, lastPeriod + 1);
                                } else {
                                    desc += '...';
                                }
                            }
                            resolve(desc);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        resolve(null);
                    }
                });
            }).on('error', reject);
        });
    } catch (e) {
        return null;
    }
}

/**
 * Try multiple search strategies to find plant information
 */
async function searchPlantInfo(plantName, scientificName) {
    // Strategy 1: Use scientific name if available
    if (scientificName && scientificName.trim() && scientificName !== plantName) {
        // Clean scientific name
        let cleanSciName = scientificName.trim();
        // Remove common suffixes and parenthetical text
        cleanSciName = cleanSciName.replace(/\s*\(.*?\)/g, '');
        cleanSciName = cleanSciName.replace(/\s*".*?"/g, '');
        cleanSciName = cleanSciName.replace(/\s*'.*?'/g, '');
        
        // Try full scientific name
        await delay(DELAY);
        let result = await searchWikipedia(cleanSciName);
        if (result) return result;
        
        // Try just genus and species (first two words)
        const parts = cleanSciName.split(/\s+/);
        if (parts.length >= 2) {
            await delay(DELAY);
            result = await searchWikipedia(`${parts[0]}_${parts[1]}`);
            if (result) return result;
            
            // Strategy 1b: Try just genus if species not found
            if (parts[0] && parts[0].length > 2) {
                await delay(DELAY);
                const genusResult = await searchWikipedia(parts[0]);
                if (genusResult) {
                    // Use genus info but note it's genus-level
                    return `${parts[0]} is a genus of plants. ${genusResult}`;
                }
            }
        } else if (parts.length === 1 && parts[0].length > 2) {
            // Only genus name available
            await delay(DELAY);
            result = await searchWikipedia(parts[0]);
            if (result) return result;
        }
    }
    
    // Strategy 2: Use plant name (cleaned)
    let cleanName = plantName.trim();
    // Remove common suffixes like "bromeliad", "fern", etc.
    cleanName = cleanName.replace(/\s+(bromeliad|fern|orchid|plant|species|variety|var|hybrid)$/i, '');
    // Remove quotes and special characters
    cleanName = cleanName.replace(/["']/g, '');
    
    if (cleanName && cleanName !== scientificName) {
        await delay(DELAY);
        const result = await searchWikipedia(cleanName.replace(/\s+/g, '_'));
        if (result) return result;
    }
    
    return null;
}

/**
 * Check if description needs enhancement
 */
function needsEnhancement(description) {
    if (!description || description.trim().length === 0) return true;
    
    const lowQualityIndicators = [
        'Sorry, no',
        'no information',
        'will become available',
        'beautiful plant suitable',
        'additional information about this plant',
        'The symbols below will give you',
        'We are working hard on adding',
        'No plantcare information'
    ];
    
    const descLower = description.toLowerCase();
    return lowQualityIndicators.some(indicator => descLower.includes(indicator.toLowerCase())) ||
           description.length < 150;
}

/**
 * Enhance a single plant file
 */
async function enhancePlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        if (!needsEnhancement(plant.description)) {
            return { enhanced: false, reason: 'Already has good description' };
        }
        
        console.log(`  🔍 Enhancing: ${plant.name}`);
        console.log(`     Scientific: ${plant.scientificName || 'N/A'}`);
        
        const enhancedDesc = await searchPlantInfo(plant.name, plant.scientificName);
        
        if (enhancedDesc) {
            plant.description = enhancedDesc;
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2), 'utf8');
            console.log(`     ✅ Enhanced (${enhancedDesc.length} chars)`);
            return { enhanced: true, plant: plant.name };
        } else {
            console.log(`     ⚠️  No information found`);
            return { enhanced: false, reason: 'No information found' };
        }
    } catch (error) {
        console.error(`     ❌ Error: ${error.message}`);
        return { enhanced: false, error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🌐 Enhancing Araflora Plant Descriptions from Web...\n');
    console.log('This will search Wikipedia for better descriptions.\n');
    
    try {
        const files = await fs.readdir(ARAFLORA_DIR);
        const plantFiles = files.filter(f => f.endsWith('.json') && 
                                             f !== 'extraction-summary.json' && 
                                             f !== 'plants-needing-descriptions.json');
        
        console.log(`Found ${plantFiles.length} plant files to check\n`);
        
        let totalEnhanced = 0;
        let totalChecked = 0;
        let totalSkipped = 0;
        
        // Process files in batches with progress
        for (let i = 0; i < plantFiles.length; i++) {
            const file = plantFiles[i];
            const filePath = path.join(ARAFLORA_DIR, file);
            
            console.log(`[${i + 1}/${plantFiles.length}] Processing: ${file}`);
            
            const result = await enhancePlant(filePath);
            totalChecked++;
            
            if (result.enhanced) {
                totalEnhanced++;
            } else if (result.reason === 'Already has good description') {
                totalSkipped++;
            }
            
            console.log(''); // Blank line for readability
        }
        
        console.log('\n✅ Enhancement complete!');
        console.log(`   Checked: ${totalChecked}`);
        console.log(`   Enhanced: ${totalEnhanced}`);
        console.log(`   Already good: ${totalSkipped}`);
        console.log(`   Not found: ${totalChecked - totalEnhanced - totalSkipped}`);
        console.log('\n💡 Enhanced descriptions from Wikipedia API');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { enhancePlant, searchPlantInfo };

