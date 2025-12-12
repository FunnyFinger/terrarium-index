// Script to rename terrariumType to vivariumType across all plant files

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Recursively find all JSON plant files
 */
async function findPlantFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const subFiles = await findPlantFiles(fullPath);
            files.push(...subFiles);
        } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
            files.push(fullPath);
        }
    }
    
    return files;
}

/**
 * Rename terrariumType to vivariumType in a plant file
 */
async function renameField(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        if (plant.terrariumType !== undefined) {
            plant.vivariumType = plant.terrariumType;
            delete plant.terrariumType;
            
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
            const relativePath = path.relative(PLANTS_DIR, filePath);
            console.log(`✅ Updated ${relativePath}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error.message);
        return false;
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🔍 Renaming terrariumType to vivariumType...\n');
    
    const plantFiles = await findPlantFiles(PLANTS_DIR);
    console.log(`Found ${plantFiles.length} plant files\n`);
    
    let updatedCount = 0;
    
    for (const filePath of plantFiles) {
        if (await renameField(filePath)) {
            updatedCount++;
        }
    }
    
    console.log(`\n✅ Updated ${updatedCount} plant files`);
}

// Run
main().catch(console.error);

