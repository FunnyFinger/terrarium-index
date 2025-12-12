// Comprehensive fix: Final cleanup and enhancement
// 1. Verify tags are ONLY vivarium types
// 2. Fix incorrect "house-plant" assignments (mini plants shouldn't be house-plant)
// 3. Enhance descriptions from web
// 4. Fix any remaining issues

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');
const VALID_TAGS = ['terrarium', 'paludarium', 'aquarium', 'desertarium', 'aerarium', 'house-plant'];
const DELAY = 2000; // 2 seconds between web requests

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
        const wikiName = searchTerm
            .replace(/\s+/g, '_')
            .replace(/['"]/g, '')
            .replace(/\(.*?\)/g, '')
            .trim();
        
        const url = `https://en.wikipedia.org/wiki/${wikiName}`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 8000
        });
        
        const $ = cheerio.load(response.data);
        
        // Get description from first substantial paragraph
        let description = '';
        $('p').each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 150 && 
                !text.includes('may refer to') &&
                !text.includes('disambiguation') &&
                !text.includes('redirect') &&
                !description) {
                description = text.substring(0, 400);
            }
        });
        
        // Extract size if mentioned
        let size = null;
        const sizePatterns = [
            /(\d+\s*[-–]\s*\d+\s*cm)/i,
            /(up to \d+\s*cm)/i,
            /(\d+\s*cm (tall|high|wide|long))/i,
            /(reaches \d+\s*cm)/i,
            /(grows to \d+\s*cm)/i,
            /(maximum \d+\s*cm)/i
        ];
        
        const fullText = $.text();
        for (const pattern of sizePatterns) {
            const match = fullText.match(pattern);
            if (match) {
                size = match[1];
                break;
            }
        }
        
        // Extract care information if available
        const careInfo = {
            light: null,
            humidity: null,
            temperature: null,
            watering: null
        };
        
        // Look for care information in infobox or paragraphs
        const infoBox = $('.infobox');
        if (infoBox.length > 0) {
            const infoText = infoBox.text().toLowerCase();
            
            // Extract temperature if mentioned
            const tempMatch = infoText.match(/(\d+\s*[-–]\s*\d+\s*°[CF])/i);
            if (tempMatch) {
                careInfo.temperature = tempMatch[1];
            }
        }
        
        return {
            description: description || null,
            size: size,
            careInfo: careInfo,
            source: 'Wikipedia'
        };
    } catch (error) {
        return null;
    }
}

/**
 * Determine correct tags
 */
function determineTags(plant) {
    const tags = new Set();
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    const desc = (plant.description || '').toLowerCase();
    const size = (plant.size || '').toLowerCase();
    const humidity = (plant.humidity || '').toLowerCase();
    
    // Check if it's a mini/small plant - should NOT be house-plant
    const isMini = name.includes('mini') || name.includes('dwarf') || 
                   name.includes('small') || size.includes('5-') && parseInt(size) < 30 ||
                   size.includes('10-') && parseInt(size) < 30;
    
    // Large plant indicators
    const largeIndicators = [
        'large', 'xl', 'xxl', 'giant', 'meter', 'metre', 'tall', 'tree',
        'reaches', 'grows up to', 'maximum', 'can reach', 'two meters', 
        '1 meter', 'over 1m', 'over 1 m', '60 cm', '70 cm', '80 cm', '90 cm', '100 cm'
    ];
    
    const isLargePlant = !isMini && (largeIndicators.some(ind => 
        size.includes(ind) || desc.includes(ind) || name.includes(ind)
    ));
    
    // Aquarium/Paludarium
    if (name.includes('aquarium') || desc.includes('aquatic') || 
        desc.includes('submerged') || desc.includes('fully aquatic') ||
        scientific.includes('vallisneria') || scientific.includes('anacharis') ||
        scientific.includes('cryptocoryne') || scientific.includes('anubias') ||
        scientific.includes('micranthemum') || scientific.includes('rotala') ||
        name.includes('monte carlo')) {
        tags.add('aquarium');
        if (desc.includes('emersed') || desc.includes('semi-aquatic') || name.includes('monte carlo') || name.includes('rotala')) {
            tags.add('paludarium');
        }
    }
    
    // Paludarium (semi-aquatic)
    if (desc.includes('paludarium') || desc.includes('semi-aquatic') ||
        desc.includes('emersed') && desc.includes('submerged')) {
        tags.add('paludarium');
        tags.add('terrarium');
    }
    
    // Desertarium
    if (humidity.includes('low') || humidity.includes('20%') || humidity.includes('30%') ||
        name.includes('cactus') || name.includes('succulent') ||
        scientific.includes('mammillaria') || scientific.includes('echinocactus') ||
        scientific.includes('crassula') || scientific.includes('echeveria') ||
        scientific.includes('sedum') || scientific.includes('aloe') ||
        scientific.includes('haworthia') || scientific.includes('lithops') ||
        scientific.includes('adenium') || scientific.includes('agave') ||
        scientific.includes('euphorbia') || scientific.includes('adromischus') ||
        scientific.includes('aeonium') || scientific.includes('pleiospilos') ||
        scientific.includes('opuntia') || scientific.includes('rhipsalis') ||
        scientific.includes('alluaudia')) {
        tags.add('desertarium');
    }
    
    // Aerarium (air plants)
    if (name.includes('tillandsia') || name.includes('air plant') || 
        scientific.includes('tillandsia') || scientific.includes('spanish moss')) {
        tags.add('aerarium');
        tags.add('terrarium');
    }
    
    // Terrarium (default for most plants, unless too large)
    if (!isLargePlant && !tags.has('aquarium') && !tags.has('desertarium')) {
        tags.add('terrarium');
    }
    
    // House Plant (too large for enclosed, but not mini)
    if (isLargePlant && !isMini) {
        tags.add('house-plant');
        // Remove terrarium for very large plants
        if (desc.includes('meter') || desc.includes('metre') || desc.includes('two meters')) {
            tags.delete('terrarium');
        }
    }
    
    // Ensure at least one tag
    if (tags.size === 0) {
        tags.add('terrarium');
    }
    
    return Array.from(tags).sort();
}

/**
 * Fix and enhance a plant
 */
async function fixAndEnhancePlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        let updated = false;
        
        // 1. Verify and fix tags
        const currentTags = plant.type || [];
        const invalidTags = currentTags.filter(t => !VALID_TAGS.includes(t));
        const hasInvalidTags = invalidTags.length > 0;
        
        // Remove mini plants from house-plant
        const isMini = (plant.name || '').toLowerCase().includes('mini') || 
                      (plant.name || '').toLowerCase().includes('dwarf');
        const hasHousePlant = currentTags.includes('house-plant');
        const shouldRemoveHousePlant = isMini && hasHousePlant;
        
        if (hasInvalidTags || shouldRemoveHousePlant) {
            const correctTags = determineTags(plant);
            plant.type = correctTags;
            updated = true;
        }
        
        // 2. Update vivariumType to match
        if (plant.type) {
            const vivariumTypes = [];
            if (plant.type.includes('terrarium')) vivariumTypes.push('Closed Terrarium');
            if (plant.type.includes('paludarium')) vivariumTypes.push('Paludarium');
            if (plant.type.includes('aquarium')) vivariumTypes.push('Aquarium');
            if (plant.type.includes('desertarium')) vivariumTypes.push('Desertarium');
            if (plant.type.includes('aerarium')) vivariumTypes.push('Aerarium');
            
            if (plant.type.includes('house-plant')) {
                plant.vivariumType = [];
            } else if (vivariumTypes.length > 0) {
                plant.vivariumType = vivariumTypes;
            }
            updated = true;
        }
        
        // 3. Enhance description if needed
        const needsEnhancement = !plant.description || 
                                 plant.description.length < 100 ||
                                 plant.description.includes('no information') ||
                                 plant.description.includes('will become available') ||
                                 plant.description.includes('Sorry, no') ||
                                 plant.description.includes('beautiful plant suitable');
        
        if (needsEnhancement && plant.scientificName && plant.scientificName.length > 5) {
            console.log(`  🔍 Enhancing: ${plant.name}`);
            const wikiInfo = await fetchWikipediaInfo(plant.scientificName, plant.name);
            
            if (wikiInfo && wikiInfo.description) {
                plant.description = wikiInfo.description;
                
                // Update size if found
                if ((plant.size === 'Varies' || !plant.size) && wikiInfo.size) {
                    plant.size = wikiInfo.size;
                }
                
                // Update temperature if found
                if (wikiInfo.careInfo.temperature && plant.temperature === '18-24°C') {
                    plant.temperature = wikiInfo.careInfo.temperature;
                }
                
                updated = true;
                console.log(`    ✅ Enhanced from ${wikiInfo.source}`);
            }
        }
        
        if (updated) {
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            return { fixed: true, plant: plant.name };
        }
        
        return { fixed: false };
    } catch (error) {
        return { fixed: false, error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🔧 Comprehensive Fix and Enhancement...\n');
    console.log('Fixing:');
    console.log('  1. Verify tags are ONLY: terrarium, paludarium, aquarium, desertarium, aerarium, house-plant');
    console.log('  2. Remove house-plant from mini plants');
    console.log('  3. Enhance descriptions from Wikipedia');
    console.log('  4. Update vivariumType arrays\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents'];
    
    let totalFixed = 0;
    let totalProcessed = 0;
    const tagStats = {};
    
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            console.log(`\n📂 ${category} (${plantFiles.length} plants)`);
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const result = await fixAndEnhancePlant(filePath);
                totalProcessed++;
                
                if (result.fixed) {
                    totalFixed++;
                }
                
                // Progress every 20 plants
                if (totalProcessed % 20 === 0) {
                    console.log(`  Progress: ${totalProcessed} processed, ${totalFixed} fixed...`);
                }
            }
        } catch (error) {
            console.log(`  ⚠️  Category ${category}: ${error.message}`);
        }
    }
    
    // Final tag count
    console.log('\n\n📊 Scanning final tag distribution...');
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const plant = JSON.parse(content);
                
                (plant.type || []).forEach(tag => {
                    tagStats[tag] = (tagStats[tag] || 0) + 1;
                });
            }
        } catch {}
    }
    
    console.log('\n✅ Fix complete!');
    console.log(`   Processed: ${totalProcessed} plants`);
    console.log(`   Fixed: ${totalFixed} plants\n`);
    console.log('Final tag distribution:');
    Object.entries(tagStats).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
        console.log(`   ${tag}: ${count}`);
    });
    
    console.log('\n💡 All tags are now ONLY vivarium types!');
}

main().catch(console.error);

