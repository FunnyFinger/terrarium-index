// Remove redundant "suitability" field from all plant JSON files
// This field is redundant with "vivariumType" which is already used in the UI

const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function removeSuitabilityField() {
    console.log('🗑️  Removing redundant "suitability" field from plant files...\n');
    
    const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
    let removedCount = 0;
    let skippedCount = 0;
    
    for (const file of files) {
        const filePath = path.join(PLANTS_DIR, file);
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            // Check if suitability field exists
            if ('suitability' in plant) {
                delete plant.suitability;
                
                // Write back with proper formatting
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
                removedCount++;
                
                if (removedCount % 50 === 0) {
                    console.log(`  ✅ Processed ${removedCount} files...`);
                }
            } else {
                skippedCount++;
            }
        } catch (error) {
            console.error(`  ❌ Error processing ${file}: ${error.message}`);
        }
    }
    
    console.log(`\n✅ Complete!`);
    console.log(`   - Removed "suitability" from ${removedCount} files`);
    console.log(`   - Skipped ${skippedCount} files (field not present)`);
    console.log(`   - Total processed: ${files.length} files`);
}

// Run the script
removeSuitabilityField();

