const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const indexFile = path.join(plantsDir, 'index.json');

// Get all JSON files (excluding index.json)
const files = fs.readdirSync(plantsDir)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .sort();

// Read existing index
const indexContent = fs.readFileSync(indexFile, 'utf8');
const index = JSON.parse(indexContent);

// Update files array
index.files = files;
index.count = files.length;

// Write updated index
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n', 'utf8');

console.log(`✅ Updated index.json`);
console.log(`   - Listed ${files.length} plant files`);
console.log(`   - Files array updated`);

