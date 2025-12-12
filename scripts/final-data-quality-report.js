// Final Data Quality Report
// Identifies remaining issues and generates a comprehensive report

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Non-plant indicators (must be exact filenames to avoid false positives)
const nonPlantFilenames = [
    'import-summary.json',
    'substrate.json',
    'soil.json',
    'decoration.json',
    'equipment.json'
];

function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.json') && item !== 'index.json') {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

async function generateQualityReport() {
    console.log('📊 Generating Data Quality Report...\n');
    console.log('='.repeat(70));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    
    const issues = {
        nonPlants: [],
        sameNameAndScientific: [],
        missingData: [],
        goodEntries: 0
    };
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            // Check for non-plant entries (exact filename match)
            if (nonPlantFilenames.includes(filename)) {
                issues.nonPlants.push({
                    file: filename,
                    name: plant.name,
                    path: filePath
                });
                continue;
            }
            
            // Check if name is undefined or missing
            if (!plant.name || plant.name === 'undefined') {
                issues.missingData.push({
                    file: filename,
                    issue: 'Missing or undefined name',
                    name: plant.name,
                    scientific: plant.scientificName
                });
                continue;
            }
            
            // Check if scientific name is undefined or missing
            if (!plant.scientificName || plant.scientificName === 'undefined') {
                issues.missingData.push({
                    file: filename,
                    issue: 'Missing or undefined scientific name',
                    name: plant.name,
                    scientific: plant.scientificName
                });
                continue;
            }
            
            // Check if name and scientific name are the same (but only for non-botanical names)
            if (plant.name === plant.scientificName) {
                // Check if it's a botanical name (Genus species format)
                const isBotanical = /^[A-Z][a-z]+\s+[a-z]+/.test(plant.name);
                
                if (!isBotanical) {
                    issues.sameNameAndScientific.push({
                        file: filename,
                        name: plant.name
                    });
                }
            }
            
            // If no issues, it's a good entry
            const hasIssues = issues.nonPlants.some(i => i.file === filename) ||
                             issues.missingData.some(i => i.file === filename) ||
                             issues.sameNameAndScientific.some(i => i.file === filename);
            
            if (!hasIssues) {
                issues.goodEntries++;
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('\n📈 STATISTICS:');
    console.log(`   Total entries: ${plantFiles.length}`);
    console.log(`   ✅ Good entries: ${issues.goodEntries}`);
    console.log(`   ⚠️  Issues found: ${plantFiles.length - issues.goodEntries}`);
    console.log('');
    
    if (issues.nonPlants.length > 0) {
        console.log(`\n🚫 NON-PLANT ENTRIES (${issues.nonPlants.length}):`);
        console.log('   These should be removed:');
        issues.nonPlants.forEach(item => {
            console.log(`   - ${item.file} ("${item.name}")`);
        });
    }
    
    if (issues.missingData.length > 0) {
        console.log(`\n❌ MISSING DATA (${issues.missingData.length}):`);
        console.log('   These need names or scientific names:');
        issues.missingData.forEach(item => {
            console.log(`   - ${item.file}: ${item.issue}`);
            console.log(`     Name: "${item.name}"`);
            console.log(`     Scientific: "${item.scientific}"`);
        });
    }
    
    if (issues.sameNameAndScientific.length > 0) {
        console.log(`\n⚠️  SAME NAME & SCIENTIFIC NAME (${issues.sameNameAndScientific.length}):`);
        console.log('   These may need review (common names used as scientific):');
        issues.sameNameAndScientific.slice(0, 10).forEach(item => {
            console.log(`   - ${item.file}: "${item.name}"`);
        });
        if (issues.sameNameAndScientific.length > 10) {
            console.log(`   ... and ${issues.sameNameAndScientific.length - 10} more`);
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('\n💡 RECOMMENDATIONS:');
    
    if (issues.nonPlants.length > 0) {
        console.log(`   1. Remove ${issues.nonPlants.length} non-plant entries`);
    }
    
    if (issues.missingData.length > 0) {
        console.log(`   2. Fix ${issues.missingData.length} entries with missing data`);
    }
    
    if (issues.sameNameAndScientific.length > 0) {
        console.log(`   3. Review ${issues.sameNameAndScientific.length} entries with identical name/scientific`);
        console.log('      Note: Many are correct (e.g., "Monstera deliciosa" is both common and scientific)');
    }
    
    console.log('\n✅ Report complete!');
    
    return issues;
}

generateQualityReport().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

