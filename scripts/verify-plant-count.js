// Verify total plant count across all categories

const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

function countPlantsInCategory(category) {
    const categoryDir = path.join(PLANTS_DIR, category);
    if (!fs.existsSync(categoryDir)) return 0;
    
    const files = fs.readdirSync(categoryDir);
    return files.filter(f => f.endsWith('.json') && f !== 'index.json').length;
}

function main() {
    console.log('🔍 Verifying plant counts...\n');
    
    const categories = ['additional', 'air-plants', 'aquarium', 'carnivorous', 
                       'ferns', 'mosses', 'orchids', 'other', 'succulents', 'tropical'];
    
    let total = 0;
    const counts = {};
    
    for (const category of categories) {
        const count = countPlantsInCategory(category);
        counts[category] = count;
        total += count;
        console.log(`${category}: ${count} plants`);
    }
    
    console.log(`\n📊 Total: ${total} plants`);
    
    // Check index.json
    const indexFile = path.join(PLANTS_DIR, 'index.json');
    if (fs.existsSync(indexFile)) {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        console.log(`\n📋 Index.json reports: ${index.totalPlants} plants`);
        
        if (index.totalPlants !== total) {
            console.log(`\n⚠️  MISMATCH! Files: ${total}, Index: ${index.totalPlants}`);
            console.log('\nCategory breakdown in index:');
            Object.entries(index.categoryCounts || {}).forEach(([cat, count]) => {
                const actualCount = counts[cat] || 0;
                if (count !== actualCount) {
                    console.log(`  ${cat}: Index says ${count}, but found ${actualCount} files`);
                } else {
                    console.log(`  ${cat}: ${count} ✓`);
                }
            });
        } else {
            console.log('✅ Counts match!');
        }
    }
}

main();

