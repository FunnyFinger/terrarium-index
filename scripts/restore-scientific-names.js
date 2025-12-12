// Restore corrupted scientificName fields
// Fix entries where entire object was written instead of string

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.json') && item !== 'index.json') {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

async function restoreCorruptedEntries() {
    console.log('🔧 Restoring corrupted scientific name fields...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let restoredCount = 0;
    const restored = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            // Check if scientificName is an object (corrupted)
            if (typeof plant.scientificName === 'object' && plant.scientificName !== null) {
                // Extract the actual scientific name from the object
                const actualName = plant.scientificName.scientificName || 
                                  plant.scientificName.name ||
                                  null;
                
                if (actualName) {
                    restored.push({
                        file: filename,
                        from: 'Object (corrupted)',
                        to: actualName
                    });
                    
                    plant.scientificName = actualName;
                    fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                    restoredCount++;
                }
            }
            
        } catch (err) {
            console.error(`Error processing ${path.basename(filePath)}:`, err.message);
        }
    }
    
    console.log('📊 RESTORATION SUMMARY:');
    console.log(`   Files restored: ${restoredCount}\n`);
    
    if (restored.length > 0) {
        console.log('✅ RESTORED ENTRIES:\n');
        restored.forEach((item, idx) => {
            console.log(`${idx + 1}. ${item.file}: "${item.to}"`);
        });
    }
    
    console.log('\n✅ Restoration complete!\n');
}

restoreCorruptedEntries().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

