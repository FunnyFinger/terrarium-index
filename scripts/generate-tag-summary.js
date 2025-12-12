// Generate summary of tag distribution and verify all tags are correct

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');
const VALID_TAGS = ['terrarium', 'paludarium', 'aquarium', 'desertarium', 'aerarium', 'house-plant'];

async function main() {
    console.log('📊 Plant Tag Summary Report\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents'];
    
    const tagStats = {};
    const invalidTags = {};
    let totalPlants = 0;
    let plantsWithInvalidTags = 0;
    
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const plant = JSON.parse(content);
                
                totalPlants++;
                const tags = plant.type || [];
                
                // Count valid tags
                tags.forEach(tag => {
                    if (VALID_TAGS.includes(tag)) {
                        tagStats[tag] = (tagStats[tag] || 0) + 1;
                    } else {
                        if (!invalidTags[tag]) {
                            invalidTags[tag] = [];
                        }
                        invalidTags[tag].push(`${category}/${file}`);
                        plantsWithInvalidTags++;
                    }
                });
            }
        } catch (error) {
            // Skip
        }
    }
    
    console.log(`Total Plants: ${totalPlants}\n`);
    console.log('Tag Distribution:');
    Object.entries(tagStats).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
        const percentage = ((count / totalPlants) * 100).toFixed(1);
        console.log(`  ${tag.padEnd(15)} ${count.toString().padStart(4)} (${percentage}%)`);
    });
    
    if (Object.keys(invalidTags).length > 0) {
        console.log(`\n⚠️  INVALID TAGS FOUND (${plantsWithInvalidTags} plants):`);
        Object.entries(invalidTags).forEach(([tag, files]) => {
            console.log(`\n  "${tag}" found in:`);
            files.slice(0, 10).forEach(file => console.log(`    - ${file}`));
            if (files.length > 10) {
                console.log(`    ... and ${files.length - 10} more`);
            }
        });
    } else {
        console.log(`\n✅ All tags are valid vivarium types!`);
    }
    
    // Check description quality
    console.log('\n\n📝 Description Quality:');
    let plantsWithGoodDesc = 0;
    let plantsWithPoorDesc = 0;
    let plantsWithNoDesc = 0;
    
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const plant = JSON.parse(content);
                
                const desc = plant.description || '';
                if (!desc) {
                    plantsWithNoDesc++;
                } else if (desc.length < 100 || 
                          desc.includes('no information') ||
                          desc.includes('will become available') ||
                          desc.includes('beautiful plant suitable')) {
                    plantsWithPoorDesc++;
                } else {
                    plantsWithGoodDesc++;
                }
            }
        } catch (error) {
            // Skip
        }
    }
    
    console.log(`  Good descriptions (≥100 chars): ${plantsWithGoodDesc} (${((plantsWithGoodDesc/totalPlants)*100).toFixed(1)}%)`);
    console.log(`  Poor descriptions (<100 chars): ${plantsWithPoorDesc} (${((plantsWithPoorDesc/totalPlants)*100).toFixed(1)}%)`);
    console.log(`  No description: ${plantsWithNoDesc} (${((plantsWithNoDesc/totalPlants)*100).toFixed(1)}%)`);
}

main().catch(console.error);

