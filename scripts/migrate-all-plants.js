// Migration Script: Extract all plants from data.js and create individual JSON files
const fs = require('fs');
const path = require('path');

// Read data.js file
const dataJsPath = path.join(__dirname, '..', 'data.js');
const dataJsContent = fs.readFileSync(dataJsPath, 'utf8');

// Extract the plantsDatabase array content
// We'll use eval in a safe way, or better yet, parse it manually
let plantsDatabase = [];

// Since data.js uses const plantsDatabase = [...], we need to extract it
// We'll create a temporary context and execute just the array definition
try {
    // Extract the array part
    const arrayMatch = dataJsContent.match(/const plantsDatabase = (\[[\s\S]*?\]);/);
    if (arrayMatch) {
        // Safely evaluate just the array (in a controlled way)
        const arrayString = arrayMatch[1];
        
        // Create a safe eval context
        const safeEval = new Function('return ' + arrayString);
        plantsDatabase = safeEval();
    } else {
        console.error('Could not find plantsDatabase array');
        process.exit(1);
    }
} catch (error) {
    console.error('Error parsing data.js:', error);
    process.exit(1);
}

console.log(`Found ${plantsDatabase.length} plants to migrate`);

// Category mapping based on classification
const categoryMap = {
    'Tropical': 'tropical',
    'Fern': 'ferns',
    'Succulent': 'succulents',
    'Carnivorous': 'carnivorous',
    'Air Plant': 'air-plants',
    'Orchid': 'orchids',
    'Moss': 'mosses'
};

// Organize plants by category
const plantsByCategory = {};

plantsDatabase.forEach(plant => {
    // Determine category from classification array
    let category = 'additional'; // default
    
    if (plant.classification && Array.isArray(plant.classification)) {
        // Check if it's an aquarium plant first
        if (plant.type && plant.type.includes('aquarium')) {
            category = 'aquarium';
        } else if (plant.terrariumType && Array.isArray(plant.terrariumType)) {
            // Check terrarium type for aquarium
            if (plant.terrariumType.includes('Aquarium')) {
                category = 'aquarium';
            } else {
                // Use first classification
                const firstClass = plant.classification[0];
                category = categoryMap[firstClass] || 'additional';
            }
        } else {
            const firstClass = plant.classification[0];
            category = categoryMap[firstClass] || 'additional';
        }
    } else if (plant.type && plant.type.includes('aquarium')) {
        category = 'aquarium';
    }
    
    // Handle special cases
    if (plant.name && (
        plant.name.toLowerCase().includes('macroalgae') ||
        plant.name.toLowerCase().includes('liverwort') ||
        plant.name.toLowerCase().includes('lichen') ||
        plant.name.toLowerCase().includes('duckweed') ||
        plant.name.toLowerCase().includes('salvinia') ||
        plant.name.toLowerCase().includes('azolla')
    )) {
        category = 'other';
    }
    
    if (!plantsByCategory[category]) {
        plantsByCategory[category] = [];
    }
    plantsByCategory[category].push(plant);
});

// Create JSON files for each plant
const basePath = path.join(__dirname, '..', 'data', 'plants');

// Function to create safe filename from plant name
function createFilename(plantName) {
    return plantName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim() + '.json';
}

// Migrate each category
Object.keys(plantsByCategory).forEach(category => {
    const categoryPath = path.join(basePath, category);
    
    // Ensure category directory exists
    if (!fs.existsSync(categoryPath)) {
        fs.mkdirSync(categoryPath, { recursive: true });
    }
    
    const plantFiles = [];
    
    plantsByCategory[category].forEach(plant => {
        const filename = createFilename(plant.name);
        const filePath = path.join(categoryPath, filename);
        
        // Write plant JSON file
        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf8');
        plantFiles.push(filename);
        
        console.log(`Created: ${category}/${filename}`);
    });
    
    // Create/update category index.json
    const indexPath = path.join(categoryPath, 'index.json');
    const indexData = {
        category: category,
        plants: plantFiles.sort(),
        count: plantFiles.length
    };
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
    console.log(`Updated: ${category}/index.json (${plantFiles.length} plants)`);
});

// Update main index.json
const mainIndexPath = path.join(basePath, 'index.json');
const mainIndex = {
    version: "1.0",
    totalPlants: plantsDatabase.length,
    lastUpdated: new Date().toISOString(),
    categories: Object.keys(plantsByCategory).sort(),
    categoryCounts: {}
};

Object.keys(plantsByCategory).forEach(category => {
    mainIndex.categoryCounts[category] = plantsByCategory[category].length;
});

fs.writeFileSync(mainIndexPath, JSON.stringify(mainIndex, null, 2), 'utf8');

console.log('\n✅ Migration complete!');
console.log(`Total plants migrated: ${plantsDatabase.length}`);
console.log(`Categories: ${Object.keys(plantsByCategory).join(', ')}`);
