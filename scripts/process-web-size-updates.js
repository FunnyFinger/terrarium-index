const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants-merged');

// Process size updates from web search results
// This script takes a JSON file with search results and updates plant files

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
            name: plant.name,
            scientificName: plant.scientificName,
            old: oldSize,
            new: newSize
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Process updates from results
// Format: { file: 'filename.json', minSize: number, maxSize: number }
function processUpdates(updates) {
    const results = [];
    
    for (const update of updates) {
        const filePath = path.join(plantsDir, update.file);
        if (!fs.existsSync(filePath)) {
            results.push({ success: false, file: update.file, error: 'File not found' });
            continue;
        }
        
        const result = updatePlantSize(filePath, update.minSize, update.maxSize);
        results.push({ ...result, file: update.file });
    }
    
    return results;
}

// Example: Process a few plants we've researched
const updates = [
    { file: 'hoya-waymaniae.json', minSize: 5, maxSize: 180 }, // Already updated
    // Add more as we search
];

if (updates.length > 1) { // Only process if we have updates
    const results = processUpdates(updates);
    console.log('Update results:');
    results.forEach(r => {
        if (r.success) {
            console.log(`✅ ${r.name}: ${r.old} → ${r.new}`);
        } else {
            console.log(`❌ ${r.file}: ${r.error}`);
        }
    });
} else {
    console.log('No updates to process. Add updates to the updates array.');
    console.log('Format: { file: "filename.json", minSize: number, maxSize: number }');
}

module.exports = { updatePlantSize, processUpdates };

