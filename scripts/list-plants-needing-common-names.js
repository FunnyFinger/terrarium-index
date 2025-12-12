// List plants that need common names enhancement
const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function needsEnhancement(plant) {
    if (!plant.commonNames || !Array.isArray(plant.commonNames) || plant.commonNames.length === 0) {
        return true;
    }
    if (plant.commonNames.length === 1 && plant.commonNames[0] === plant.name) {
        return true;
    }
    return false;
}

async function main() {
    const files = await fs.readdir(PLANTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
    
    const plantsNeedingEnhancement = [];
    
    for (const file of jsonFiles) {
        // Skip index.json as it's not a plant file
        if (file === 'index.json') continue;
        
        const filePath = path.join(PLANTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        if (needsEnhancement(plant)) {
            plantsNeedingEnhancement.push({
                file,
                name: plant.name,
                scientificName: plant.scientificName,
                currentCommonNames: plant.commonNames || []
            });
        }
    }
    
    console.log(`Found ${plantsNeedingEnhancement.length} plants needing enhancement\n`);
    
    // Group into batches of 50
    const batchSize = 50;
    for (let i = 0; i < plantsNeedingEnhancement.length; i += batchSize) {
        const batch = plantsNeedingEnhancement.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        console.log(`\n=== Batch ${batchNumber} (${batch.length} plants) ===`);
        batch.forEach((p, idx) => {
            console.log(`${i + idx + 1}. ${p.name} (${p.scientificName || 'N/A'})`);
        });
    }
}

main().catch(console.error);

