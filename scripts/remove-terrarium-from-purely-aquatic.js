// Remove terrarium tag from plants that require fully submerged (underwater) environment
// These plants cannot survive in terrariums (no water body)

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Check if plant requires fully submerged environment
 */
function requiresSubmerged(plant) {
    const name = (plant.name || '').toLowerCase();
    const description = (plant.description || '').toLowerCase();
    const careTips = (plant.careTips || []).join(' ').toLowerCase();
    const substrate = (plant.substrate || '').toLowerCase();
    
    // Strong indicators of submerged requirement
    const submergedPatterns = [
        /\b(fully submerged|completely submerged|fully aquatic|purely aquatic)/i,
        /\b(underwater|submerged)\s+(only|exclusively|plant|growth)/i,
        /\b(cannot|does not|not suitable|unable to)\s+(grow|live|survive)\s+(emersed|terrestrial|terrarium)/i,
        /\b(requires|needs|must be)\s+(fully|completely)\s+(submerged|underwater|aquatic)/i,
        /\b(only|exclusively)\s+(submerged|underwater|aquatic)/i,
        /\b(grows|lives|survives)\s+(only|exclusively)\s+(underwater|submerged)/i
    ];
    
    // Plants that are definitely fully submerged
    const fullySubmergedPlants = [
        'anacharis', 'elodea', 'hornwort', 'cambomba',
        'vallisneria', 'sagittaria', 'dwarf sagittaria',
        'water sprite', 'water wisteria', 'cabomba',
        'red root floater', 'frogbit', 'dwarf water lettuce',
        'marimo', 'moss ball', 'chaetomorpha', 'gracilaria',
        'halimeda', 'utricularia', 'bladderwort', 'aldrovanda',
        'anubias', 'java fern', 'java moss', 'christmas moss',
        'weeping moss', 'cryptocoryne', 'rotala', 'dwarf hairgrass',
        'monte carlo', 'riccardia', 'mini pellia', 'crystalwort',
        'bacopa', 'ludwigia', 'anubias'
    ];
    
    // Check name
    for (const aquatic of fullySubmergedPlants) {
        if (name.includes(aquatic)) {
            // But check if description says it can grow emersed
            const fullText = description + ' ' + careTips;
            if (!fullText.match(/\b(can grow|suitable|works)\s+(emersed|terrestrial|terrarium)/i)) {
                return true;
            }
        }
    }
    
    // Check patterns
    const fullText = description + ' ' + careTips + ' ' + substrate;
    if (submergedPatterns.some(pattern => pattern.test(fullText))) {
        return true;
    }
    
    // Category check - plants in aquarium category are likely submerged
    if (plant.category === 'aquarium') {
        // But double-check description for emersed capability
        const fullText = description + ' ' + careTips;
        if (!fullText.match(/\b(can grow|suitable|works)\s+(both|emersed|terrestrial|terrarium)/i)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Check if plant can grow emersed (both submerged and terrestrial)
 */
function canGrowEmersed(plant) {
    const description = (plant.description || '').toLowerCase();
    const careTips = (plant.careTips || []).join(' ').toLowerCase();
    
    const emersedPatterns = [
        /\b(can grow|suitable|works)\s+(both|in|as)\s+(emersed|submerged|aquatic|terrarium|paludarium)/i,
        /\b(emersed|terrestrial)\s+(and|or)\s+(submerged|aquatic)/i,
        /\b(both|also)\s+(emersed|terrarium|terrestrial)\s+and\s+(submerged|aquatic)/i,
        /\b(grows|works)\s+(both|in)\s+(emersed|terrestrial|terrarium)\s+and\s+(submerged|aquatic|aquarium)/i,
        /\b(terrarium|paludarium)\s+(and|or)\s+(aquarium)/i,
        /\b(can be grown|can grow)\s+(both|emersed|terrestrial|terrarium)\s+and\s+(submerged|aquatic)/i
    ];
    
    const fullText = description + ' ' + careTips;
    return emersedPatterns.some(pattern => pattern.test(fullText));
}

async function main() {
    console.log('🌊 Removing Terrarium Tag from Purely Submerged Plants...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    const allPlants = [];
    
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
        const currentTypes = plant.type || [];
        const hasAquarium = currentTypes.includes('aquarium');
        const hasTerrarium = currentTypes.includes('terrarium');
        
        // Skip if no aquarium tag or no terrarium tag
        if (!hasAquarium || !hasTerrarium) {
            continue;
        }
        
        const isSubmerged = requiresSubmerged(plant);
        const canEmersed = canGrowEmersed(plant);
        
        // If plant requires submerged AND cannot grow emersed, remove terrarium tag
        if (isSubmerged && !canEmersed && hasTerrarium) {
            const newTypes = currentTypes.filter(t => t !== 'terrarium');
            plant.type = newTypes;
            toUpdate.push({
                plant,
                reason: 'requires fully submerged environment'
            });
        }
    }
    
    console.log(`🔧 Plants requiring fix: ${toUpdate.length}\n`);
    
    for (const { plant, reason } of toUpdate) {
        console.log(`   ${plant.name}:`);
        console.log(`      Removed: terrarium (${reason})`);
        console.log(`      New types: [${plant.type.join(', ')}]`);
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
    console.log(`   These plants now only have 'aquarium' tag (not 'terrarium')`);
}

main().catch(console.error);

