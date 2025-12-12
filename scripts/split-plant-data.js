// Migration Script: Split data.js into individual plant JSON files
// Run this with Node.js to migrate from monolithic data.js to modular structure

const fs = require('fs');
const path = require('path');

// Read the original data.js file
const dataJsPath = path.join(__dirname, '..', 'data.js');
const dataJsContent = fs.readFileSync(dataJsPath, 'utf8');

// Extract the plantsDatabase array
// This is a simple regex approach - in production you might want to use a proper parser
const arrayMatch = dataJsContent.match(/const plantsDatabase = \[([\s\S]*)\];/);
if (!arrayMatch) {
    console.error('Could not find plantsDatabase array in data.js');
    process.exit(1);
}

// For now, we'll need to manually or programmatically parse the JS objects
// This is a helper script - you can run it, or we can create individual files manually

console.log('Migration script created. This will help split data.js into individual plant files.');
console.log('Note: Due to complexity of parsing JavaScript objects, consider:');
console.log('1. Manually creating JSON files for each plant');
console.log('2. Using this script as a template');
console.log('3. Or keeping data.js as the source and creating JSON exports');

// Create index file that lists all plants
const plantIndex = {
    version: '1.0',
    totalPlants: 112,
    lastUpdated: new Date().toISOString(),
    categories: [
        'tropical',
        'ferns', 
        'aquarium',
        'mosses',
        'orchids',
        'carnivorous',
        'air-plants',
        'succulents',
        'additional',
        'other'
    ]
};

const indexPath = path.join(__dirname, '..', 'data', 'plants', 'index.json');
fs.writeFileSync(indexPath, JSON.stringify(plantIndex, null, 2));
console.log(`Created index file at ${indexPath}`);
