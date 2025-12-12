const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');

// Get all plant files
function getAllPlantFiles() {
    const files = [];
    function traverse(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath);
            } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
                files.push(fullPath);
            }
        }
    }
    traverse(plantsDir);
    return files;
}

// Check if plant is carnivorous
function isCarnivorousPlant(plant) {
    const plantType = (plant.plantType || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    
    if (plantType === 'carnivorous plant' || plantType.includes('carnivorous')) return true;
    if (category.includes('carnivorous')) return true;
    
    return false;
}

// Parse size string to get min and max
function parseSize(sizeStr) {
    if (!sizeStr) return null;
    
    const match = sizeStr.match(/([\d.]+)\s*-\s*([\d.]+)\s*(cm|m)/i);
    if (match) {
        let min = parseFloat(match[1]);
        let max = parseFloat(match[2]);
        const unit = match[3].toLowerCase();
        
        if (unit === 'm') {
            min *= 100;
            max *= 100;
        }
        
        return { min, max, unit: 'cm' };
    }
    
    return null;
}

// Calculate flowering size based on mature size
// For carnivorous plants, flowering typically occurs at 70-85% of mature size
// We'll use 75% as a conservative estimate
function calculateFloweringSize(matureSize) {
    return Math.round(matureSize * 0.75);
}

// Main function
function main() {
    const files = getAllPlantFiles();
    const updates = [];
    
    console.log('🔍 Updating carnivorous plant sizes to flowering-to-mature ranges...\n');
    
    files.forEach(filePath => {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            if (isCarnivorousPlant(plant)) {
                const currentSize = parseSize(plant.size);
                
                if (currentSize) {
                    const currentMin = currentSize.min;
                    const currentMax = currentSize.max;
                    
                    // Calculate flowering size (75% of mature)
                    const floweringSize = calculateFloweringSize(currentMax);
                    
                    // Only update if the current min is significantly lower than flowering size
                    // (indicating it's currently juvenile-to-mature rather than flowering-to-mature)
                    if (currentMin < floweringSize * 0.9) {
                        const newSize = `${floweringSize}-${currentMax} cm`;
                        
                        updates.push({
                            file: path.basename(filePath),
                            name: plant.name,
                            scientificName: plant.scientificName,
                            oldSize: plant.size,
                            newSize: newSize,
                            oldMin: currentMin,
                            oldMax: currentMax,
                            floweringSize: floweringSize
                        });
                        
                        // Update the file
                        plant.size = newSize;
                        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n');
                        
                        console.log(`✅ ${plant.name} (${plant.scientificName})`);
                        console.log(`   ${plant.size} → ${newSize}`);
                    } else {
                        console.log(`⏭️  ${plant.name} (${plant.scientificName}) - already at flowering size`);
                        console.log(`   Current: ${plant.size}`);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error processing ${filePath}:`, error.message);
        }
    });
    
    console.log(`\n✅ Updated ${updates.length} carnivorous plants`);
    
    if (updates.length > 0) {
        console.log('\n📊 Summary of updates:');
        updates.forEach(update => {
            console.log(`   ${update.name}: ${update.oldSize} → ${update.newSize} (flowering at ~${update.floweringSize} cm)`);
        });
    }
}

main();

