// Refine aquarium tags - be more precise about what is truly aquatic

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Known aquatic plants (definitely need aquarium tag)
 */
const KNOWN_AQUATIC = [
    'anubias', 'java fern', 'java moss', 'christmas moss', 'flame moss',
    'weeping moss', 'cryptocoryne', 'vallisneria', 'sagittaria',
    'dwarf sagittaria', 'hornwort', 'anacharis', 'bacopa', 'ludwigia',
    'rotala', 'monte carlo', 'dwarf hairgrass', 'water sprite',
    'water wisteria', 'red root floater', 'frogbit', 'dwarf water lettuce',
    'marimo', 'moss ball', 'riccardia', 'mini pellia', 'chaetomorpha',
    'gracilaria', 'halimeda', 'dragons tongue', 'crystalwort',
    'utricularia', 'bladderwort', 'aldrovanda'
];

/**
 * Plants that are NOT aquatic (should not have aquarium tag)
 */
const NOT_AQUATIC = [
    'sansevieria', 'snake plant', 'monstera', 'philodendron',
    'alocasia', 'anthurium', 'begonia', 'peperomia', 'hoya',
    'syngonium', 'aglaonema', 'fittonia', 'nerve plant',
    'dischidia', 'oxalis', 'selaginella', 'pellaea', 'pellionia',
    'hypoestes', 'adromischus', 'crassula', 'echeveria',
    'adansonia', 'baobab'
];

/**
 * Check if plant is truly aquatic
 */
function isAquaticPlant(plant) {
    const name = (plant.name || '').toLowerCase();
    const description = (plant.description || '').toLowerCase();
    const careTips = (plant.careTips || []).join(' ').toLowerCase();
    const substrate = (plant.substrate || '').toLowerCase();
    
    // Exclude known non-aquatic plants
    for (const notAquatic of NOT_AQUATIC) {
        if (name.includes(notAquatic)) {
            return false;
        }
    }
    
    // Check known aquatic list
    for (const aquatic of KNOWN_AQUATIC) {
        if (name.includes(aquatic) || description.includes(aquatic)) {
            return true;
        }
    }
    
    // Strong aquatic indicators
    const strongAquaticPatterns = [
        /\b(fully submerged|completely aquatic|purely aquatic|underwater|aquarium plant)/i,
        /\b(submerged growth|grows underwater|lives in water)/i,
        /\b(planted in aquarium|aquarium substrate|aquarium gravel)/i,
        /\b(floating plant|water column|planted tank)/i
    ];
    
    const fullText = description + ' ' + careTips + ' ' + substrate;
    if (strongAquaticPatterns.some(pattern => pattern.test(fullText))) {
        return true;
    }
    
    // Category is aquarium
    if (plant.category === 'aquarium') {
        return true;
    }
    
    return false;
}

/**
 * Check if plant can grow emersed (terrarium + aquarium)
 */
function canGrowEmersed(plant) {
    const description = (plant.description || '').toLowerCase();
    const careTips = (plant.careTips || []).join(' ').toLowerCase();
    
    const emersedPatterns = [
        /\b(can grow|suitable|works)\s+(both|in|as)\s+(emersed|submerged|aquatic|terrarium|paludarium)/i,
        /\b(emersed|terrestrial)\s+(and|or)\s+(submerged|aquatic)/i,
        /\b(both|also)\s+(emersed|terrarium|terrestrial)\s+and\s+(submerged|aquatic)/i,
        /\b(terrarium|paludarium)\s+and\s+(aquarium)/i
    ];
    
    const fullText = description + ' ' + careTips;
    return emersedPatterns.some(pattern => pattern.test(fullText));
}

/**
 * Check if plant is purely aquatic (no terrarium)
 */
function isPurelyAquatic(plant) {
    if (!isAquaticPlant(plant)) return false;
    
    const description = (plant.description || '').toLowerCase();
    const careTips = (plant.careTips || []).join(' ').toLowerCase();
    
    // If it can grow emersed, it's not purely aquatic
    if (canGrowEmersed(plant)) {
        return false;
    }
    
    // Check for purely aquatic indicators
    const purelyAquaticPatterns = [
        /\b(fully|completely|purely)\s+submerged/i,
        /\b(cannot|does not|not suitable)\s+(grow|live)\s+(emersed|terrestrial|terrarium)/i,
        /\b(only|exclusively)\s+(submerged|underwater|aquatic)/i
    ];
    
    const fullText = description + ' ' + careTips;
    return purelyAquaticPatterns.some(pattern => pattern.test(fullText));
}

async function main() {
    console.log('🌊 Refining Aquarium Tags...\n');
    
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
    const incorrectAquarium = [];
    
    for (const plant of allPlants) {
        const isAquatic = isAquaticPlant(plant);
        const canEmersed = canGrowEmersed(plant);
        const purelyAquatic = isPurelyAquatic(plant);
        
        const currentTypes = plant.type || [];
        const hasAquarium = currentTypes.includes('aquarium');
        const hasTerrarium = currentTypes.includes('terrarium');
        
        let updated = false;
        let newTypes = [...currentTypes];
        
        // If plant incorrectly has aquarium tag
        if (hasAquarium && !isAquatic) {
            newTypes = newTypes.filter(t => t !== 'aquarium');
            updated = true;
            incorrectAquarium.push(plant.name);
        }
        
        // If plant is aquatic but missing aquarium tag
        if (isAquatic && !hasAquarium) {
            newTypes.push('aquarium');
            updated = true;
        }
        
        // If plant is purely aquatic, remove terrarium
        if (purelyAquatic && hasTerrarium) {
            newTypes = newTypes.filter(t => t !== 'terrarium');
            updated = true;
        }
        
        // If plant can grow emersed, ensure both tags
        if (isAquatic && canEmersed) {
            if (!newTypes.includes('aquarium')) {
                newTypes.push('aquarium');
                updated = true;
            }
            if (!newTypes.includes('terrarium') && !purelyAquatic) {
                newTypes.push('terrarium');
                updated = true;
            }
        }
        
        if (updated) {
            plant.type = newTypes;
            toUpdate.push(plant);
        }
    }
    
    if (incorrectAquarium.length > 0) {
        console.log(`⚠️  Plants incorrectly tagged as aquarium (${incorrectAquarium.length}):`);
        incorrectAquarium.forEach(name => console.log(`   - ${name}`));
        console.log();
    }
    
    console.log(`🔧 Plants needing updates: ${toUpdate.length}\n`);
    
    // Show key changes
    for (const plant of toUpdate.slice(0, 15)) {
        const wasAquarium = (plant.type || []).includes('aquarium');
        const wasTerrarium = (plant.type || []).includes('terrarium');
        
        // Re-check after update
        const isAquatic = isAquaticPlant(plant);
        const canEmersed = canGrowEmersed(plant);
        const purelyAquatic = isPurelyAquatic(plant);
        
        let newTypes = plant.type || [];
        if (!isAquatic && newTypes.includes('aquarium')) {
            newTypes = newTypes.filter(t => t !== 'aquarium');
        }
        if (isAquatic && !newTypes.includes('aquarium')) {
            newTypes.push('aquarium');
        }
        if (purelyAquatic && newTypes.includes('terrarium')) {
            newTypes = newTypes.filter(t => t !== 'terrarium');
        }
        
        plant.type = newTypes;
        
        const changes = [];
        if (wasAquarium !== newTypes.includes('aquarium')) {
            changes.push(newTypes.includes('aquarium') ? '+aquarium' : '-aquarium');
        }
        if (wasTerrarium !== newTypes.includes('terrarium')) {
            changes.push(newTypes.includes('terrarium') ? '+terrarium' : '-terrarium');
        }
        
        if (changes.length > 0) {
            console.log(`   ${plant.name}: ${changes.join(', ')}`);
            console.log(`      Types: [${newTypes.join(', ')}]`);
        }
    }
    
    if (toUpdate.length > 15) {
        console.log(`   ... and ${toUpdate.length - 15} more`);
    }
    console.log();
    
    // Update plants
    console.log(`💾 Updating ${toUpdate.length} plants...`);
    for (const plant of toUpdate) {
        try {
            const filePath = plant.filePath;
            delete plant.filePath;
            delete plant.category;
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
        }
    }
    
    console.log(`\n✅ Complete! Updated ${toUpdate.length} plants`);
}

main().catch(console.error);

