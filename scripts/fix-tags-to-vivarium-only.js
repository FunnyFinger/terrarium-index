// Fix tags to ONLY be vivarium types: terrarium, paludarium, aquarium, desertarium, aerarium, house-plant
// Remove plant type tags (tropical, ferns, carnivorous, etc.)

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Valid vivarium type tags only
const VALID_TAGS = ['terrarium', 'paludarium', 'aquarium', 'desertarium', 'aerarium', 'house-plant'];

/**
 * Determine correct vivarium tags based on plant characteristics
 */
function determineVivariumTags(plant) {
    const tags = new Set();
    
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    const desc = (plant.description || '').toLowerCase();
    const size = (plant.size || '').toLowerCase();
    const humidity = (plant.humidity || '').toLowerCase();
    
    // Size indicators for house plants
    const largeIndicators = [
        'large', 'xl', 'xxl', 'giant', 'meter', 'metre', 'tall', 'tree',
        'reaches', 'grows up to', 'maximum', 'can reach', 'two meters', 
        '1 meter', 'over 1m', 'over 1 m'
    ];
    
    const isLargePlant = largeIndicators.some(ind => 
        size.includes(ind) || desc.includes(ind) || name.includes(ind)
    );
    
    // Aquarium/Paludarium
    if (name.includes('aquarium') || desc.includes('aquatic') || 
        desc.includes('submerged') || desc.includes('fully aquatic') ||
        scientific.includes('vallisneria') || scientific.includes('anacharis') ||
        scientific.includes('cryptocoryne') || scientific.includes('anubias')) {
        tags.add('aquarium');
        tags.add('paludarium');
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
        scientific.includes('opuntia') || scientific.includes('rhipsalis')) {
        tags.add('desertarium');
    }
    
    // Aerarium (air plants)
    if (name.includes('tillandsia') || name.includes('air plant') || 
        scientific.includes('tillandsia') || scientific.includes('spanish moss')) {
        tags.add('aerarium');
        tags.add('terrarium'); // Can also work in open terrariums
    }
    
    // Terrarium (humid, closed environments)
    if (tags.size === 0 || (!isLargePlant && !tags.has('aquarium') && !tags.has('desertarium'))) {
        // Default for most plants: terrarium (unless they're too large)
        if (!isLargePlant) {
            tags.add('terrarium');
        }
    }
    
    // Paludarium (semi-aquatic)
    if (desc.includes('semi-aquatic') || desc.includes('emersed') ||
        desc.includes('paludarium') || name.includes('monte carlo') ||
        name.includes('rotala') || scientific.includes('micranthemum')) {
        tags.add('paludarium');
        tags.add('terrarium'); // Can grow emersed
    }
    
    // House Plant (too large for enclosed)
    if (isLargePlant || (desc.includes('two meters') || desc.includes('2 meters') || 
        desc.includes('1 meter') || desc.includes('reaches') && desc.includes('meter'))) {
        tags.add('house-plant');
        // Remove terrarium for very large plants
        if (tags.has('terrarium') && (desc.includes('meter') || desc.includes('metre'))) {
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
 * Fetch enhanced plant information from web
 */
async function fetchPlantInfo(plantName, scientificName) {
    try {
        // Use Wikipedia or plant databases
        const searchTerms = scientificName || plantName;
        const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(searchTerms.replace(/\s+/g, '_'))}`;
        
        try {
            const response = await axios.get(wikiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 5000
            });
            
            const $ = cheerio.load(response.data);
            
            // Extract description from infobox or first paragraph
            let description = '';
            
            // Try infobox
            const infobox = $('.infobox p').first().text().trim();
            if (infobox && infobox.length > 50) {
                description = infobox;
            } else {
                // Try first paragraph
                const firstPara = $('p').filter((i, el) => {
                    const text = $(el).text().trim();
                    return text.length > 100 && !text.includes('may refer to');
                }).first().text().trim();
                
                if (firstPara && firstPara.length > 50) {
                    description = firstPara.substring(0, 500); // Limit length
                }
            }
            
            if (description) {
                // Extract size, care info
                const sizeMatch = description.match(/(\d+\s*[-–]\s*\d+\s*cm|\d+\s*cm (tall|high|wide)|up to \d+\s*cm)/i);
                const size = sizeMatch ? sizeMatch[1] : null;
                
                return {
                    description: description.substring(0, 300),
                    size: size,
                    enhanced: true
                };
            }
        } catch (error) {
            // Wikipedia failed, continue
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Fix a single plant
 */
async function fixPlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        let updated = false;
        
        // 1. Fix tags - remove type tags, keep only vivarium types
        const currentTags = plant.type || [];
        const typeTags = ['tropical', 'ferns', 'carnivorous', 'orchids', 'air-plants', 
                          'aquarium', 'mosses', 'succulents', 'additional', 'other', 'vivarium'];
        
        // Remove all type-based tags
        const hasTypeTags = typeTags.some(tag => currentTags.includes(tag));
        
        if (hasTypeTags) {
            // Determine correct vivarium tags
            const vivariumTags = determineVivariumTags(plant);
            plant.type = vivariumTags;
            updated = true;
        }
        
        // 2. Enhance missing descriptions
        if (!plant.description || plant.description.length < 50 || 
            plant.description.includes('no information') ||
            plant.description.includes('will become available') ||
            plant.description.includes('Sorry, no')) {
            
            const enhanced = await fetchPlantInfo(plant.name, plant.scientificName);
            if (enhanced && enhanced.description) {
                plant.description = enhanced.description;
                if (enhanced.size && plant.size === 'Varies') {
                    plant.size = enhanced.size;
                }
                updated = true;
            }
        }
        
        // 3. Ensure vivariumType array matches type array
        if (plant.type) {
            const vivariumTypes = [];
            if (plant.type.includes('terrarium')) vivariumTypes.push('Closed Terrarium');
            if (plant.type.includes('paludarium')) vivariumTypes.push('Paludarium');
            if (plant.type.includes('aquarium')) vivariumTypes.push('Aquarium');
            if (plant.type.includes('desertarium')) vivariumTypes.push('Desertarium');
            if (plant.type.includes('aerarium')) vivariumTypes.push('Aerarium');
            if (plant.type.includes('house-plant')) {
                // House plants don't have vivarium types
                plant.vivariumType = [];
            } else if (vivariumTypes.length > 0) {
                plant.vivariumType = vivariumTypes;
            }
            updated = true;
        }
        
        if (updated) {
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            return { fixed: true, plant: plant.name, tags: plant.type };
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
    console.log('🔧 Fixing Tags to Vivarium Types Only...\n');
    console.log('Valid tags: terrarium, paludarium, aquarium, desertarium, aerarium, house-plant\n');
    
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
            
            console.log(`📂 ${category} (${plantFiles.length} plants)`);
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const result = await fixPlant(filePath);
                totalProcessed++;
                
                if (result.fixed) {
                    totalFixed++;
                    // Count tags
                    result.tags.forEach(tag => {
                        tagStats[tag] = (tagStats[tag] || 0) + 1;
                    });
                }
                
                // Progress every 10 plants
                if (totalProcessed % 10 === 0) {
                    console.log(`  Progress: ${totalProcessed} processed...`);
                }
            }
        } catch (error) {
            console.log(`  ⚠️  Category ${category}: ${error.message}`);
        }
    }
    
    console.log(`\n\n✅ Fix complete!`);
    console.log(`   Processed: ${totalProcessed} plants`);
    console.log(`   Fixed: ${totalFixed} plants\n`);
    console.log('Tag distribution:');
    Object.entries(tagStats).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
        console.log(`   ${tag}: ${count}`);
    });
}

main().catch(console.error);

