// Script to add growthRateRange to all plant files

const fs = require('fs');
const path = require('path');

// Growth rate scale mapping (0-100%)
const GROWTH_RATE_SCALE = {
    'Very Slow': { min: 0, max: 20, ideal: 10 },
    'Slow': { min: 20, max: 40, ideal: 30 },
    'Moderate': { min: 40, max: 60, ideal: 50 },
    'Fast': { min: 60, max: 80, ideal: 70 },
    'Very Fast': { min: 80, max: 100, ideal: 90 }
};

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

// Calculate growth rate range from plant data
function calculateGrowthRateRange(plant) {
    const growthRate = (plant.growthRate || '').trim();
    
    if (!growthRate) {
        // Default to moderate if not specified
        return GROWTH_RATE_SCALE['Moderate'];
    }
    
    const growthRateLower = growthRate.toLowerCase();
    
    // Map text values to numeric ranges
    if (growthRateLower.includes('very fast') || growthRateLower.includes('extremely fast')) {
        return GROWTH_RATE_SCALE['Very Fast'];
    } else if (growthRateLower.includes('fast to moderate') || growthRateLower === 'fast-moderate') {
        return { min: 50, max: 80, ideal: 65 }; // Between Fast and Moderate
    } else if (growthRateLower.includes('fast')) {
        return GROWTH_RATE_SCALE['Fast'];
    } else if (growthRateLower.includes('moderate to fast') || growthRateLower === 'moderate-fast') {
        return { min: 50, max: 80, ideal: 65 }; // Between Moderate and Fast
    } else if (growthRateLower.includes('moderate to slow') || growthRateLower === 'moderate-slow') {
        return { min: 30, max: 50, ideal: 40 }; // Between Moderate and Slow
    } else if (growthRateLower.includes('moderate')) {
        return GROWTH_RATE_SCALE['Moderate'];
    } else if (growthRateLower.includes('slow to moderate') || growthRateLower === 'slow-moderate') {
        return { min: 30, max: 50, ideal: 40 }; // Between Slow and Moderate
    } else if (growthRateLower.includes('slow')) {
        return GROWTH_RATE_SCALE['Slow'];
    } else if (growthRateLower.includes('very slow')) {
        return GROWTH_RATE_SCALE['Very Slow'];
    }
    
    // Default to moderate if no match
    return GROWTH_RATE_SCALE['Moderate'];
}

// Update a single plant file
function updatePlantFile(filePath) {
    try {
        const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Skip if growthRateRange already exists
        if (plant.growthRateRange) {
            return { 
                success: true, 
                plant: plant.name, 
                skipped: true 
            };
        }
        
        // Calculate growth rate range
        const growthRateRange = calculateGrowthRateRange(plant);
        
        // Add growthRateRange to plant object
        const updatedPlant = { ...plant };
        updatedPlant.growthRateRange = growthRateRange;
        
        // Write back to file with proper formatting
        fs.writeFileSync(filePath, JSON.stringify(updatedPlant, null, 2) + '\n', 'utf8');
        
        return { 
            success: true, 
            plant: plant.name, 
            added: true 
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
    let addedCount = 0;
    let skippedCount = 0;
    const errors = [];
    
    console.log('Adding growthRateRange to plant files...\n');
    
    for (let i = 0; i < plantFiles.length; i++) {
        const filePath = plantFiles[i];
        const result = updatePlantFile(filePath);
        
        if (result.success) {
            successCount++;
            if (result.added) {
                addedCount++;
            } else if (result.skipped) {
                skippedCount++;
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
    console.log(`growthRateRange added to: ${addedCount} files`);
    console.log(`Already had growthRateRange: ${skippedCount} files`);
    console.log(`Errors: ${errorCount} files`);
    
    if (errors.length > 0) {
        console.log('\nErrors:');
        errors.forEach(err => {
            console.log(`  ${path.basename(err.file)}: ${err.error}`);
        });
    }
}

main().catch(console.error);

