// Update all index.json files with correct plant counts

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

async function updateIndexCounts() {
    console.log('🔢 Updating all index.json files with correct counts...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    let totalCount = 0;
    const categoryCounts = {};
    
    // Count plants in each category
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            const count = plantFiles.length;
            categoryCounts[category] = count;
            totalCount += count;
            
            // Update category index.json
            const categoryIndexPath = path.join(categoryDir, 'index.json');
            try {
                const categoryIndex = JSON.parse(await fs.readFile(categoryIndexPath, 'utf8'));
                categoryIndex.count = count;
                categoryIndex.lastUpdated = new Date().toISOString();
                await fs.writeFile(categoryIndexPath, JSON.stringify(categoryIndex, null, 2));
                console.log(`✅ ${category}: ${count} plants`);
            } catch (e) {
                // Create index if it doesn't exist
                const newIndex = {
                    category: category,
                    count: count,
                    lastUpdated: new Date().toISOString()
                };
                await fs.writeFile(categoryIndexPath, JSON.stringify(newIndex, null, 2));
                console.log(`✅ ${category}: ${count} plants (created index)`);
            }
        } catch (error) {
            console.log(`⚠️  ${category}: ${error.message}`);
        }
    }
    
    // Update main index.json
    const mainIndexPath = path.join(PLANTS_DIR, 'index.json');
    const mainIndex = JSON.parse(await fs.readFile(mainIndexPath, 'utf8'));
    mainIndex.totalPlants = totalCount;
    mainIndex.categoryCounts = categoryCounts;
    mainIndex.lastUpdated = new Date().toISOString();
    await fs.writeFile(mainIndexPath, JSON.stringify(mainIndex, null, 2));
    
    console.log(`\n✅ Main index updated: ${totalCount} total plants`);
    console.log('\n📊 Category breakdown:');
    Object.entries(categoryCounts).forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count}`);
    });
}

updateIndexCounts().catch(console.error);

