// Fix entries where common names are used as scientific names
// Only fix entries where the name is clearly a common name (English descriptive names)

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Manual mapping for known common names to scientific names
const commonNameToScientific = {
    "Aquatical moss": "Taxiphyllum sp.",
    "Australian pitcherplant": "Cephalotus follicularis",
    "Autumn fern": "Dryopteris erythrosora",
    "Fern Moss": "Thuidium delicatulum"
};

// Patterns that indicate a common name (English descriptive)
const commonNamePatterns = [
    /^[A-Z][a-z]+\s+fern$/i,  // "Autumn fern", "Boston fern"
    /^[A-Z][a-z]+\s+moss$/i,  // "Aquatical moss", "Fern moss"
    /^[A-Z][a-z]+\s+plant$/i, // "pitcher plant", "nerve plant"
    /pitcherplant/i
];

function isCommonName(text) {
    if (!text) return false;
    // Check if it matches common name patterns
    return commonNamePatterns.some(pattern => pattern.test(text));
}

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

async function fixCommonNames() {
    console.log('🔍 Fixing common name issues...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let fixedCount = 0;
    let revertedCount = 0;
    const fixes = [];
    const reverts = [];
    
    // First, revert the bad changes from the previous script
    const badScientificNames = [
        "The species",
        "Genlisea violaceae", // Wrong - should be "violacea"
        "Macrocentrum droseroides flower",
        "Begonia bipinnatifida",
        "Rockwool cubes",
        "Nut husk",
        "Bifrenaria aureo fulva",
        "Pterostylis ophioglossa",
        "Argostemma bicolor",
        "Masdevallia nifidica yellow"
    ];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            let modified = false;
            
            // Revert bad scientific names
            if (badScientificNames.includes(plant.scientificName)) {
                // Extract the scientific name from the filename
                const filename = path.basename(filePath, '.json');
                const parts = filename.split('-');
                if (parts.length >= 2) {
                    const genus = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
                    const species = parts[1];
                    const newScientific = `${genus} ${species}`;
                    
                    reverts.push({
                        file: path.basename(filePath),
                        oldScientific: plant.scientificName,
                        newScientific: newScientific
                    });
                    
                    plant.scientificName = newScientific;
                    modified = true;
                    revertedCount++;
                }
            }
            
            // Fix common names that are used as scientific names
            if (plant.name === plant.scientificName && isCommonName(plant.name)) {
                if (commonNameToScientific[plant.name]) {
                    fixes.push({
                        file: path.basename(filePath),
                        name: plant.name,
                        oldScientific: plant.scientificName,
                        newScientific: commonNameToScientific[plant.name]
                    });
                    
                    plant.scientificName = commonNameToScientific[plant.name];
                    modified = true;
                    fixedCount++;
                } else {
                    console.log(`⚠️  Unknown common name needs manual fix: ${path.basename(filePath)}`);
                    console.log(`    name: "${plant.name}"`);
                    console.log(`    scientificName: "${plant.scientificName}"\n`);
                }
            }
            
            if (modified) {
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`   Total files scanned: ${plantFiles.length}`);
    console.log(`   Bad names reverted: ${revertedCount}`);
    console.log(`   Common names fixed: ${fixedCount}`);
    
    if (reverts.length > 0) {
        console.log('\n🔄 REVERTED BAD CHANGES:');
        reverts.forEach(revert => {
            console.log(`   ${revert.file}: "${revert.oldScientific}" → "${revert.newScientific}"`);
        });
    }
    
    if (fixes.length > 0) {
        console.log('\n✅ FIXED COMMON NAMES:');
        fixes.forEach(fix => {
            console.log(`   ${fix.file}: "${fix.oldScientific}" → "${fix.newScientific}"`);
        });
    }
    
    console.log('\n✅ Fix complete!');
}

fixCommonNames().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

