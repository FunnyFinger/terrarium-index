// Script to add Paludarium and Desertarium categories to relevant plants
const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Plants suitable for Paludarium (semi-aquatic, can grow emersed)
const paludariumPlants = [
    'java-fern', 'anubias', 'bacopa', 'cryptocoryne', 'dwarf-sagittaria',
    'sagittaria', 'water-sprite', 'java-moss', 'christmas-moss', 'flame-moss',
    'phoenix-moss', 'mini-pellia', 'riccardia-mini-pellia', 'crystalwort',
    'monte-carlo', 'sphagnum-moss', 'selaginella', 'utricularia-bladderwort'
];

// Plants suitable for Desertarium (dry, low humidity)
const desertariumPlants = [
    'aloe-mini', 'crassula-mini', 'echeveria-mini', 'haworthia', 'lithops-living-stones',
    'rhipsalis-mini', 'sedum-mini', 'string-of-pearls'
];

async function updatePlants() {
    console.log('🌿 Adding Paludarium and Desertarium categories\n');
    
    const categories = (await fs.readdir(PLANTS_DIR, { withFileTypes: true }))
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    let updatedCount = 0;
    
    for (const category of categories) {
        const categoryPath = path.join(PLANTS_DIR, category);
        const indexPath = path.join(categoryPath, 'index.json');
        
        try {
            const indexContent = await fs.readFile(indexPath, 'utf8');
            const index = JSON.parse(indexContent);
            
            for (const plantFile of index.plants || []) {
                const plantPath = path.join(categoryPath, plantFile);
                const plantName = plantFile.replace('.json', '');
                
                try {
                    const plantContent = await fs.readFile(plantPath, 'utf8');
                    const plant = JSON.parse(plantContent);
                    
                    let updated = false;
                    
                    // Check if this plant should have Paludarium category
                    if (paludariumPlants.includes(plantName)) {
                        if (!plant.terrariumType) {
                            plant.terrariumType = [];
                        }
                        if (!plant.terrariumType.includes('Paludarium')) {
                            plant.terrariumType.push('Paludarium');
                            updated = true;
                        }
                    }
                    
                    // Check if this plant should have Desertarium category
                    if (desertariumPlants.includes(plantName)) {
                        if (!plant.terrariumType) {
                            plant.terrariumType = [];
                        }
                        if (!plant.terrariumType.includes('Desertarium')) {
                            plant.terrariumType.push('Desertarium');
                            updated = true;
                        }
                    }
                    
                    if (updated) {
                        await fs.writeFile(plantPath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
                        console.log(`  ✅ Updated ${plant.name}: ${plant.terrariumType.join(', ')}`);
                        updatedCount++;
                    }
                } catch (err) {
                    console.error(`  ❌ Error processing ${plantFile}: ${err.message}`);
                }
            }
        } catch (err) {
            console.error(`  ❌ Error reading category ${category}: ${err.message}`);
        }
    }
    
    console.log(`\n✅ Complete! Updated ${updatedCount} plants`);
}

// Run the script
if (require.main === module) {
    updatePlants().catch(console.error);
}

module.exports = { updatePlants };

