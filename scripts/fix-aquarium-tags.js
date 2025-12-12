// Fix aquarium tags for submerged/aquatic plants
// Remove terrarium tag from purely aquatic plants, add aquarium tag where missing

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Check if plant is aquatic/submerged
 */
function isAquaticPlant(plant) {
    const name = (plant.name || '').toLowerCase();
    const description = (plant.description || '').toLowerCase();
    const careTips = (plant.careTips || []).join(' ').toLowerCase();
    const substrate = (plant.substrate || '').toLowerCase();
    
    // Aquatic indicators in name
    const aquaticNamePatterns = [
        /aquatic/i,
        /submerged/i,
        /water/i,
        /aquarium/i,
        /hydrophyt/i,
        /floating/i
    ];
    
    // Aquatic indicators in description/care
    const aquaticContentPatterns = [
        /\b(submerged|aquatic|aquarium|underwater|fully submerged|grows underwater)/i,
        /\b(floating|emersed|submerged growth)/i,
        /\b(water column|planted tank|fish tank)/i,
        /\b(grows in water|lives in water|fully aquatic)/i,
        /\b(CO2|co2|carbon dioxide)\s+injection/i,
        /\b(liquid fertilizer|water column fertilizer)/i
    ];
    
    // Substrate indicators
    const aquaticSubstratePatterns = [
        /aquarium\s+(gravel|sand|substrate)/i,
        /planted\s+in\s+(gravel|sand|substrate)/i,
        /rooted\s+in\s+(gravel|sand|substrate)/i
    ];
    
    // Check name
    if (aquaticNamePatterns.some(pattern => pattern.test(name))) {
        return true;
    }
    
    // Check description and care tips
    const fullText = description + ' ' + careTips;
    if (aquaticContentPatterns.some(pattern => pattern.test(fullText))) {
        return true;
    }
    
    // Check substrate
    if (aquaticSubstratePatterns.some(pattern => pattern.test(substrate))) {
        return true;
    }
    
    // Known aquatic plants (from aquarium category or common aquatic species)
    const knownAquatic = [
        'anubias', 'java fern', 'java moss', 'christmas moss', 'flame moss',
        'weeping moss', 'cryptocoryne', 'vallisneria', 'dwarf sagittaria',
        'sagittaria', 'hornwort', 'anacharis', 'bacopa', 'ludwigia',
        'rotala', 'monte carlo', 'dwarf hairgrass', 'water sprite',
        'water wisteria', 'red root floater', 'frogbit', 'dwarf water lettuce',
        'marimo', 'moss ball', 'riccardia', 'mini pellia', 'chaetomorpha',
        'graci', 'halimeda', 'dragons tongue'
    ];
    
    for (const aquatic of knownAquatic) {
        if (name.includes(aquatic) || description.includes(aquatic)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Check if plant is emersed (can grow both in and out of water)
 */
function isEmersedCapable(plant) {
    const description = (plant.description || '').toLowerCase();
    const careTips = (plant.careTips || []).join(' ').toLowerCase();
    
    const emersedPatterns = [
        /\b(can grow|grows|suitable for|works well)\s+(both|in|as)\s+(emersed|submerged|aquatic|aquarium|terrarium|paludarium)/i,
        /\b(emersed|terrestrial)\s+and\s+(submerged|aquatic)/i,
        /\b(terrarium|paludarium)\s+and\s+(aquarium)/i,
        /\b(can be grown|can grow)\s+(both|in|as)/i
    ];
    
    const fullText = description + ' ' + careTips;
    return emersedPatterns.some(pattern => pattern.test(fullText));
}

/**
 * Check if plant should NOT have terrarium tag (purely aquatic)
 */
function isPurelyAquatic(plant) {
    const description = (plant.description || '').toLowerCase();
    const careTips = (plant.careTips || []).join(' ').toLowerCase();
    
    const purelyAquaticPatterns = [
        /\b(fully submerged|completely aquatic|purely aquatic|only underwater)/i,
        /\b(cannot grow|does not grow|not suitable)\s+(emersed|terrestrial|terrarium)/i,
        /\b(requires|needs)\s+(to be|fully)\s+(submerged|underwater|aquatic)/i
    ];
    
    const fullText = description + ' ' + careTips;
    return purelyAquaticPatterns.some(pattern => pattern.test(fullText));
}

async function main() {
    console.log('🌊 Fixing Aquarium Tags for Aquatic Plants...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    const allPlants = [];
    
    // Load all plants
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const plant = JSON.parse(content);
                plant.filePath = filePath;
                plant.category = category;
                allPlants.push(plant);
            }
        } catch (error) {
            // Skip
        }
    }
    
    console.log(`📊 Total plants: ${allPlants.length}\n`);
    
    const toUpdate = [];
    
    for (const plant of allPlants) {
        const isAquatic = isAquaticPlant(plant);
        const canEmersed = isEmersedCapable(plant);
        const purelyAquatic = isPurelyAquatic(plant);
        
        const currentTypes = plant.type || [];
        const hasAquarium = currentTypes.includes('aquarium');
        const hasTerrarium = currentTypes.includes('terrarium');
        
        let updated = false;
        let newTypes = [...currentTypes];
        
        // If plant is aquatic but missing aquarium tag
        if (isAquatic && !hasAquarium) {
            if (!newTypes.includes('aquarium')) {
                newTypes.push('aquarium');
                updated = true;
            }
        }
        
        // If plant is purely aquatic, remove terrarium tag
        if (purelyAquatic && hasTerrarium) {
            newTypes = newTypes.filter(t => t !== 'terrarium');
            updated = true;
        }
        
        // If plant is aquatic but can also be emersed, keep both tags
        if (isAquatic && canEmersed) {
            // Keep both aquarium and terrarium
            if (!newTypes.includes('aquarium')) {
                newTypes.push('aquarium');
                updated = true;
            }
            if (!newTypes.includes('terrarium')) {
                newTypes.push('terrarium');
                updated = true;
            }
        }
        
        // If plant is purely aquatic and has terrarium, remove it
        if (isAquatic && !canEmersed && hasTerrarium && purelyAquatic) {
            newTypes = newTypes.filter(t => t !== 'terrarium');
            updated = true;
        }
        
        if (updated) {
            plant.type = newTypes;
            toUpdate.push({
                plant,
                changes: {
                    wasAquatic: isAquatic,
                    wasTerrarium: hasTerrarium,
                    nowAquarium: newTypes.includes('aquarium'),
                    nowTerrarium: newTypes.includes('terrarium'),
                    reason: purelyAquatic ? 'purely aquatic' : canEmersed ? 'emersed capable' : 'aquatic'
                }
            });
        }
    }
    
    console.log(`🔧 Plants needing tag updates: ${toUpdate.length}\n`);
    
    // Show changes
    for (const { plant, changes } of toUpdate) {
        const changesList = [];
        if (changes.wasAquarium !== changes.nowAquarium) {
            changesList.push(changes.nowAquarium ? '+aquarium' : '-aquarium');
        }
        if (changes.wasTerrarium !== changes.nowTerrarium) {
            changesList.push(changes.nowTerrarium ? '+terrarium' : '-terrarium');
        }
        
        console.log(`   ${plant.name}:`);
        console.log(`      ${changesList.join(', ')} (${changes.reason})`);
        console.log(`      Types: [${plant.type.join(', ')}]`);
        console.log();
    }
    
    // Update plants
    console.log(`💾 Updating ${toUpdate.length} plants...`);
    for (const { plant } of toUpdate) {
        try {
            const filePath = plant.filePath;
            delete plant.filePath;
            delete plant.category;
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
        } catch (error) {
            console.log(`   ⚠️  Error updating ${plant.name}: ${error.message}`);
        }
    }
    
    console.log(`\n✅ Complete!`);
    console.log(`   Updated: ${toUpdate.length} plants`);
}

main().catch(console.error);

