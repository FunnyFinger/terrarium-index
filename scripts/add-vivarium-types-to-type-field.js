// Script to add vivariumType values to the type field so they show in "Suitable For"
// Vivarium is parent category: Terrarium, Paludarium, Desertarium, Aquarium, Aerarium

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Mapping from vivariumType values to type field values
const TYPE_MAPPING = {
    'Open Terrarium': 'terrarium',
    'Closed Terrarium': 'terrarium',
    'Paludarium': 'paludarium',
    'Desertarium': 'desertarium',
    'Aquarium': 'aquarium',
    'Aerarium': 'aerarium'
};

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
 * Add vivarium types to type field
 */
async function updatePlantTypes(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const currentTypes = new Set(plant.type || []);
        const vivariumTypes = plant.vivariumType || [];
        
        let updated = false;
        
        // Map vivariumType values to type field
        for (const vivariumType of vivariumTypes) {
            const mappedType = TYPE_MAPPING[vivariumType];
            if (mappedType && !currentTypes.has(mappedType)) {
                currentTypes.add(mappedType);
                updated = true;
            }
        }
        
        // Special case: if plant has terrarium in vivariumType, ensure terrarium is in type
        if (vivariumTypes.some(vt => vt.includes('Terrarium')) && !currentTypes.has('terrarium')) {
            currentTypes.add('terrarium');
            updated = true;
        }
        
        // Special case: Aquarium plants should always have aquarium in type
        const relativePath = path.relative(PLANTS_DIR, filePath);
        if (relativePath.startsWith('aquarium\\') && !currentTypes.has('aquarium')) {
            currentTypes.add('aquarium');
            updated = true;
        }
        
        if (updated) {
            plant.type = Array.from(currentTypes).sort();
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
            console.log(`✅ ${plant.name}: ${plant.type.join(', ')}`);
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
    console.log('🔍 Adding vivarium types to type field...\n');
    
    const plantFiles = await findPlantFiles(PLANTS_DIR);
    console.log(`Found ${plantFiles.length} plant files\n`);
    
    let updatedCount = 0;
    
    for (const filePath of plantFiles) {
        if (await updatePlantTypes(filePath)) {
            updatedCount++;
        }
    }
    
    console.log(`\n✅ Updated ${updatedCount} plants`);
}

// Run
main().catch(console.error);

