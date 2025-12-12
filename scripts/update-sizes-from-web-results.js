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
    
    // Check if it's a flowering plant
    if (plantType === 'flowering plant') return true;
    if (category.includes('flowering')) return true;
    if (floweringPeriod && !floweringPeriod.includes('does not flower') && !floweringPeriod.includes('non-flowering')) return true;
    
    return false;
}

// Update plant size based on web search results
// For flowering plants: flowering size to mature size
// For non-flowering: juvenile size to mature size
function updatePlantSize(plant, minSize, maxSize) {
    const newSize = `${minSize}-${maxSize} cm`;
    
    return {
        old: plant.size,
        new: newSize,
        isFlowering: isFloweringPlant(plant)
    };
}

// Process a single plant file with web search results
function processPlantFile(filePath, minSize, maxSize) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const update = updatePlantSize(plant, minSize, maxSize);
        plant.size = update.new;
        
        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        
        return {
            success: true,
            file: path.basename(filePath),
            name: plant.name,
            ...update
        };
    } catch (error) {
        return {
            success: false,
            file: path.basename(filePath),
            error: error.message
        };
    }
}

// Example: Update Hoya waymaniae based on web search
// Juvenile: 5-10 cm, Mature: 90-180 cm
const hoyaWaymaniaePath = path.join(plantsDir, 'hoya-waymaniae.json');
const hoyaResult = processPlantFile(hoyaWaymaniaePath, 5, 180);

console.log('Updated Hoya waymaniae:');
console.log(JSON.stringify(hoyaResult, null, 2));

// Export functions for use in interactive mode
module.exports = {
    getAllPlantFiles,
    isFloweringPlant,
    updatePlantSize,
    processPlantFile,
    plantsDir
};

