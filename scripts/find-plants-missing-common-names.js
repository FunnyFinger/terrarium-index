// Script to find plants with missing or minimal common names
const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

async function analyzePlants() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
        
        const needsCommonNames = [];
        const hasCommonNames = [];
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            const commonNames = plant.commonNames || [];
            const name = plant.name || '';
            const scientificName = plant.scientificName || '';
            
            // Check if commonNames is missing, empty, or only contains the name itself
            if (!Array.isArray(commonNames) || 
                commonNames.length === 0 || 
                (commonNames.length === 1 && commonNames[0] === name)) {
                needsCommonNames.push({
                    file: file,
                    name: name,
                    scientificName: scientificName,
                    currentCommonNames: commonNames
                });
            } else {
                hasCommonNames.push({
                    file: file,
                    name: name,
                    scientificName: scientificName,
                    commonNames: commonNames
                });
            }
        }
        
        console.log(`\n=== Analysis Results ===`);
        console.log(`Total plants: ${jsonFiles.length}`);
        console.log(`Needs common names: ${needsCommonNames.length}`);
        console.log(`Has common names: ${hasCommonNames.length}`);
        
        console.log(`\n=== Plants Needing Common Names (first 20) ===`);
        needsCommonNames.slice(0, 20).forEach(p => {
            console.log(`${p.name} (${p.scientificName})`);
        });
        
        // Write to file for processing
        await fs.writeFile(
            path.join(__dirname, 'plants-needing-common-names.json'),
            JSON.stringify(needsCommonNames, null, 2),
            'utf8'
        );
        
        console.log(`\n✓ Full list saved to: scripts/plants-needing-common-names.json`);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

analyzePlants();
