const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

/**
 * Check if a plant is carnivorous
 */
function isCarnivorous(plant) {
    const category = (plant.category || []).map(c => c.toLowerCase());
    const plantType = (plant.plantType || '').toLowerCase();
    const genus = plant.taxonomy && plant.taxonomy.genus ? plant.taxonomy.genus.toLowerCase() : '';
    
    // Known carnivorous plant genera
    const carnivorousGenera = [
        'nepenthes', 'drosera', 'dionaea', 'sarracenia', 'utricularia', 'pinguicula',
        'cephalotus', 'byblis', 'genlisea', 'aldrovanda', 'roridula', 'heliamphora',
        'drosophyllum', 'macrocentrum', 'darlingtonia'
    ];
    
    return category.includes('carnivorous') ||
           plantType.includes('carnivorous') ||
           carnivorousGenera.includes(genus);
}

/**
 * Update plantType to include "carnivorous" if it's a carnivorous plant
 */
function updatePlantType(plant) {
    if (!isCarnivorous(plant)) {
        return null; // Not carnivorous, no change needed
    }
    
    const currentPlantType = plant.plantType || '';
    const lowerPlantType = currentPlantType.toLowerCase();
    
    // If already includes "carnivorous", no change needed
    if (lowerPlantType.includes('carnivorous')) {
        return null;
    }
    
    // Update plantType to include "carnivorous"
    if (lowerPlantType === 'flowering plant') {
        return 'carnivorous plant';
    } else if (lowerPlantType.includes('flowering')) {
        return 'carnivorous flowering plant';
    } else if (currentPlantType) {
        return `carnivorous ${currentPlantType}`;
    } else {
        return 'carnivorous plant';
    }
}

/**
 * Main function to fix carnivorous plant types
 */
async function main() {
    console.log('🔍 Scanning for carnivorous plants to update plantType...\n');
    
    const files = await fs.readdir(PLANTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
    
    let updated = 0;
    let skipped = 0;
    
    for (const file of jsonFiles) {
        try {
            const filePath = path.join(PLANTS_DIR, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const plant = JSON.parse(content);
            
            const newPlantType = updatePlantType(plant);
            
            if (newPlantType) {
                plant.plantType = newPlantType;
                await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf-8');
                console.log(`✅ ${file}: "${plant.plantType}" → "${newPlantType}"`);
                updated++;
            } else {
                skipped++;
            }
        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
        }
    }
    
    console.log(`\n✅ Done! Updated ${updated} plants, skipped ${skipped} plants.`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { isCarnivorous, updatePlantType };

