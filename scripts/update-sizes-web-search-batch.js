const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants-merged');

// Get all plant files
function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

// Check if plant is a flowering plant
function isFloweringPlant(plant) {
    const plantType = (plant.plantType || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    const floweringPeriod = (plant.floweringPeriod || '').toLowerCase();
    
    if (plantType === 'flowering plant') return true;
    if (category.includes('flowering')) return true;
    if (floweringPeriod && !floweringPeriod.includes('does not flower') && !floweringPeriod.includes('non-flowering')) return true;
    
    return false;
}

// Parse size string
function parseSize(sizeStr) {
    if (!sizeStr) return null;
    
    const size = sizeStr.toLowerCase();
    let minSize = null;
    let maxSize = null;
    
    if (size.includes('cm')) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            minSize = parseFloat(numbers[0]);
            maxSize = numbers.length > 1 ? parseFloat(numbers[1]) : minSize;
        }
    }
    
    if (size.includes('m') && !size.includes('cm')) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            const minM = parseFloat(numbers[0]);
            const maxM = numbers.length > 1 ? parseFloat(numbers[1]) : minM;
            minSize = minM * 100;
            maxSize = maxM * 100;
        }
    }
    
    return { min: minSize, max: maxSize };
}

// Update plant with new size
function updatePlantSize(filePath, minSize, maxSize) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const oldSize = plant.size;
        const newSize = `${minSize}-${maxSize} cm`;
        plant.size = newSize;
        
        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        
        return {
            success: true,
            file: path.basename(filePath),
            name: plant.name,
            scientificName: plant.scientificName,
            old: oldSize,
            new: newSize,
            isFlowering: isFloweringPlant(plant)
        };
    } catch (error) {
        return {
            success: false,
            file: path.basename(filePath),
            error: error.message
        };
    }
}

// Process updates from a results file
// Format: JSON array with { file, minSize, maxSize }
function processBatchUpdates(resultsFile) {
    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    const updates = [];
    
    for (const result of results) {
        const filePath = path.join(plantsDir, result.file);
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${result.file}`);
            continue;
        }
        
        const update = updatePlantSize(filePath, result.minSize, result.maxSize);
        updates.push(update);
    }
    
    return updates;
}

// Example usage with a few plants we've researched
const exampleUpdates = [
    { file: 'hoya-waymaniae.json', minSize: 5, maxSize: 180 },
    // Add more as we search
];

console.log('Example batch update structure:');
console.log(JSON.stringify(exampleUpdates, null, 2));

// Export for use
module.exports = {
    getAllPlantFiles,
    isFloweringPlant,
    parseSize,
    updatePlantSize,
    processBatchUpdates,
    plantsDir
};

