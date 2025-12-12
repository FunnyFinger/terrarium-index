// Update additional/index.json with all plant files

const fs = require('fs').promises;
const path = require('path');

const ADDITIONAL_DIR = path.join(__dirname, '..', 'data', 'plants', 'additional');

async function updateAdditionalIndex() {
    console.log('🔧 Updating additional/index.json...\n');
    
    // Get all JSON files except index.json
    const files = await fs.readdir(ADDITIONAL_DIR);
    const plantFiles = files
        .filter(f => f.endsWith('.json') && f !== 'index.json')
        .sort();
    
    console.log(`Found ${plantFiles.length} plant files\n`);
    
    // Read existing index or create new one
    const indexPath = path.join(ADDITIONAL_DIR, 'index.json');
    let index;
    
    try {
        const content = await fs.readFile(indexPath, 'utf8');
        index = JSON.parse(content);
    } catch (e) {
        index = {
            category: 'additional',
            count: 0,
            plants: []
        };
    }
    
    // Update index
    index.plants = plantFiles;
    index.count = plantFiles.length;
    index.lastUpdated = new Date().toISOString();
    
    // Write back
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    
    console.log(`✅ Updated additional/index.json`);
    console.log(`   Count: ${index.count} plants`);
    console.log(`   Files: ${plantFiles.length}`);
}

updateAdditionalIndex().catch(console.error);

