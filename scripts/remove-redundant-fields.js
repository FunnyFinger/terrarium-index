// Script to remove redundant text fields when standardized ranges exist
// Removes: difficulty, lightRequirements, humidity, temperature, airCirculation, watering

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
        
        // Remove redundant fields if ranges exist
        const fieldsToRemove = [];
        
        if (plant.difficultyRange) {
            fieldsToRemove.push('difficulty');
        }
        if (plant.lightRange) {
            fieldsToRemove.push('lightRequirements');
        }
        if (plant.humidityRange) {
            fieldsToRemove.push('humidity');
        }
        if (plant.temperatureRange) {
            fieldsToRemove.push('temperature');
        }
        if (plant.airCirculationRange) {
            fieldsToRemove.push('airCirculation');
        }
        if (plant.waterNeedsRange) {
            fieldsToRemove.push('watering');
        }
        
        // Remove the redundant fields
        fieldsToRemove.forEach(field => {
            delete updatedPlant[field];
        });
        
        // Write back to file with proper formatting
        fs.writeFileSync(filePath, JSON.stringify(updatedPlant, null, 2) + '\n', 'utf8');
        
        return { 
            success: true, 
            plant: plant.name, 
            removedFields: fieldsToRemove.length 
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
    let totalFieldsRemoved = 0;
    const errors = [];
    
    console.log('Removing redundant fields from plant files...\n');
    
    for (let i = 0; i < plantFiles.length; i++) {
        const filePath = plantFiles[i];
        const result = updatePlantFile(filePath);
        
        if (result.success) {
            successCount++;
            totalFieldsRemoved += result.removedFields;
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
    console.log(`Total redundant fields removed: ${totalFieldsRemoved}`);
    console.log(`Average fields removed per file: ${(totalFieldsRemoved / successCount).toFixed(1)}`);
    console.log(`Errors: ${errorCount} files`);
    
    if (errors.length > 0) {
        console.log('\nErrors:');
        errors.forEach(err => {
            console.log(`  ${path.basename(err.file)}: ${err.error}`);
        });
    }
}

main().catch(console.error);

