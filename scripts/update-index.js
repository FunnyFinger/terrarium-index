const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const INDEX_FILE = path.join(PLANTS_DIR, 'index.json');

function updateIndex() {
  console.log('🔄 Updating index.json to match existing plant files...\n');
  
  // Get all actual JSON files (excluding index.json itself)
  const files = fs.readdirSync(PLANTS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .sort();
  
  const index = {
    count: files.length,
    plants: files
  };
  
  // Write updated index
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n', 'utf8');
  
  console.log(`✅ Updated index.json`);
  console.log(`   - Listed ${index.count} plant files`);
  console.log(`   - Previous count was 520, now ${index.count} (after duplicate merge)`);
}

updateIndex();

