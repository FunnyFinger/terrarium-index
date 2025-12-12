// Script to remove hardcoded vivariumType field from all plant files
// This field should be calculated dynamically, not stored

const fs = require('fs');
const path = require('path');

// Find all plant files
function findPlantFiles(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findPlantFiles(fullPath));
        } else if (entry.name.endsWith('.json')) {
            files.push(fullPath);
        }
    }
    
    return files;
}

// Update a single plant file
function updatePlantFile(filePath) {
    try {
        const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Create updated plant object
        const updatedPlant = { ...plant };
        
        // Remove vivariumType field if it exists
        let removed = false;
        if (updatedPlant.vivariumType !== undefined) {
            delete updatedPlant.vivariumType;
            removed = true;
        }
        
        // Write back to file with proper formatting
        fs.writeFileSync(filePath, JSON.stringify(updatedPlant, null, 2) + '\n', 'utf8');
        
        return { 
            success: true, 
            plant: plant.name, 
            removed: removed 
        };
    } catch (error) {
        return { success: false, error: error.message, file: filePath };
    }
}

// Main function
async function main() {
    const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
    
    if (!fs.existsSync(plantsDir)) {
        console.error(`Directory not found: ${plantsDir}`);
        process.exit(1);
    }
    
    console.log('Finding plant files...');
    const plantFiles = findPlantFiles(plantsDir);
    console.log(`Found ${plantFiles.length} plant files\n`);
    
    let successCount = 0;
    let errorCount = 0;
    let removedCount = 0;
    const errors = [];
    
    console.log('Removing vivariumType field from plant files...\n');
    
    for (let i = 0; i < plantFiles.length; i++) {
        const filePath = plantFiles[i];
        const result = updatePlantFile(filePath);
        
        if (result.success) {
            successCount++;
            if (result.removed) {
                removedCount++;
            }
            if ((i + 1) % 50 === 0) {
                process.stdout.write(`\rProcessed: ${i + 1}/${plantFiles.length} files...`);
            }
        } else {
            errorCount++;
            errors.push(result);
            console.error(`\nError processing ${path.basename(filePath)}: ${result.error}`);
        }
    }
    
    console.log(`\n\nCompleted!`);
    console.log(`Successfully updated: ${successCount} files`);
    console.log(`vivariumType field removed from: ${removedCount} files`);
    console.log(`Errors: ${errorCount} files`);
    
    if (errors.length > 0) {
        console.log('\nErrors:');
        errors.forEach(err => {
            console.log(`  ${path.basename(err.file)}: ${err.error}`);
        });
    }
}

main().catch(console.error);

