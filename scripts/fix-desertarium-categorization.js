// Script to fix desertarium plant categorization
// Remove "terrarium" from plants that are ONLY suitable for desertarium
// Terrarium = closed, humid environment
// Desertarium = open, dry, low humidity environment
// These are incompatible!

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
 * Fix plant types based on vivariumType
 */
async function fixPlantTypes(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const vivariumTypes = plant.vivariumType || [];
        const currentTypes = new Set(plant.type || []);
        const originalTypes = [...currentTypes];
        let updated = false;
        
        // If plant has "Desertarium", it should NOT have "terrarium"
        // Terrarium = closed, humid environment (incompatible with desertarium)
        // Desertarium = open, dry, low humidity environment
        const hasDesertarium = vivariumTypes.includes('Desertarium');
        
        if (hasDesertarium && currentTypes.has('terrarium')) {
            // Desertarium plants require dry conditions - remove terrarium (which implies humid)
            currentTypes.delete('terrarium');
            updated = true;
        }
        
        if (updated) {
            plant.type = Array.from(currentTypes).sort();
            
            // Clean up any file reference that might have been added
            if (plant.file) {
                delete plant.file;
            }
            
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
            const relativePath = path.relative(PLANTS_DIR, filePath);
            console.log(`✅ ${plant.name} (${relativePath}):`);
            console.log(`   ${originalTypes.join(', ')} → ${plant.type.join(', ')}`);
            return { updated: true, plant: relativePath, old: originalTypes, new: plant.type };
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
    console.log('🔍 Fixing desertarium plant categorization...\n');
    console.log('Removing "terrarium" from plants that are ONLY suitable for desertarium\n');
    
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
            console.log(`   ${u.plant}: removed "terrarium" (${u.old.join(', ')} → ${u.new.join(', ')})`);
        });
    }
}

// Run
main().catch(console.error);

