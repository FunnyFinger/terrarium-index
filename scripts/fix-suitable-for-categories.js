// Script to fix "Suitable For" categories by ensuring type field includes all appropriate categories
// based on terrariumType and plant characteristics

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
 * Determine which types should be added based on terrariumType
 */
function determineTypes(plant) {
    const currentTypes = new Set(plant.type || []);
    const terrariumTypes = plant.terrariumType || [];
    
    // If plant has Paludarium, it should also have terrarium (since paludariums are a type of terrarium)
    if (terrariumTypes.includes('Paludarium') && !currentTypes.has('terrarium')) {
        currentTypes.add('terrarium');
    }
    
    // If plant has Open/Closed Terrarium, it should have terrarium
    if ((terrariumTypes.includes('Open Terrarium') || terrariumTypes.includes('Closed Terrarium')) 
        && !currentTypes.has('terrarium')) {
        currentTypes.add('terrarium');
    }
    
    // If plant has Desertarium and is in succulents category, ensure terrarium
    if (terrariumTypes.includes('Desertarium') && !currentTypes.has('terrarium')) {
        currentTypes.add('terrarium');
    }
    
    // If plant has Aerarium and is an air plant, ensure terrarium
    if (terrariumTypes.includes('Aerarium') && !currentTypes.has('terrarium')) {
        currentTypes.add('terrarium');
    }
    
    // Plants that can grow emersed (in terrarium/paludarium) should have terrarium
    // if they already have aquarium and terrariumType includes Paludarium
    if (currentTypes.has('aquarium') && terrariumTypes.includes('Paludarium') 
        && !currentTypes.has('terrarium')) {
        currentTypes.add('terrarium');
    }
    
    // Plants in additional folder with terrarium/vivarium types should also check terrariumType
    const relativePath = path.relative(PLANTS_DIR, path.dirname(plant.file || ''));
    if (relativePath === 'additional' || relativePath.includes('tropical')) {
        if (terrariumTypes.length > 0 && !currentTypes.has('terrarium')) {
            currentTypes.add('terrarium');
        }
    }
    
    return Array.from(currentTypes).sort();
}

/**
 * Update plant with correct types
 */
async function fixPlantTypes(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        plant.file = filePath;
        
        const originalTypes = [...(plant.type || [])].sort();
        const newTypes = determineTypes(plant);
        
        // Check if types changed
        if (JSON.stringify(originalTypes) !== JSON.stringify(newTypes)) {
            plant.type = newTypes;
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
            const relativePath = path.relative(PLANTS_DIR, filePath);
            console.log(`✅ ${plant.name} (${relativePath}):`);
            console.log(`   ${originalTypes.join(', ') || 'none'} → ${newTypes.join(', ')}`);
            return { updated: true, plant: relativePath, old: originalTypes, new: newTypes };
        }
        
        return { updated: false };
    } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error.message);
        return { updated: false, error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🔍 Fixing "Suitable For" categories...\n');
    
    const plantFiles = await findPlantFiles(PLANTS_DIR);
    console.log(`Found ${plantFiles.length} plant files\n`);
    
    const updates = [];
    
    for (const filePath of plantFiles) {
        const result = await fixPlantTypes(filePath);
        if (result.updated) {
            updates.push(result);
        }
    }
    
    console.log(`\n✅ Updated ${updates.length} plants`);
    
    if (updates.length > 0) {
        console.log('\n📋 Summary:');
        updates.forEach(u => {
            console.log(`   ${u.plant}: ${u.old.join(', ') || 'none'} → ${u.new.join(', ')}`);
        });
    }
}

// Run
main().catch(console.error);

