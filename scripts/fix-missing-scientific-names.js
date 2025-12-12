// Fix entries where scientificName is same as name (common name)
// Extract scientific names from descriptions, image URLs, and filenames

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Manual mapping for known common names to scientific names
const manualMappings = {
    "Aquatical moss": "Taxiphyllum sp.",
    "Australian pitcherplant": "Cephalotus follicularis",
    "Autumn fern": "Dryopteris erythrosora"
};

function extractScientificNameFromDescription(description) {
    if (!description) return null;
    
    // Look for patterns like "Scientific name: Genus species"
    const patterns = [
        /scientifically known as ([A-Z][a-z]+ [a-z]+)/i,
        /\(([A-Z][a-z]+ [a-z]+)\)/,
        /'([A-Z][a-z]+ [a-z]+)'/,
        /([A-Z][a-z]+\s+[a-z]+)\s+is a/
    ];
    
    for (const pattern of patterns) {
        const match = description.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    
    return null;
}

function extractScientificNameFromImageUrl(imageUrl) {
    if (!imageUrl) return null;
    
    // Extract from filename pattern like "Genus-species-variant.jpg"
    const match = imageUrl.match(/([A-Z][a-z]+-[a-z]+(?:-[a-z]+)?)/);
    if (match && match[1]) {
        // Convert hyphens to spaces
        return match[1].replace(/-/g, ' ').trim();
    }
    
    return null;
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

async function fixMissingScientificNames() {
    console.log('🔍 Fixing entries with missing scientific names...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let fixedCount = 0;
    const fixes = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            
            // Check if scientificName is same as name (both are common names)
            if (plant.name === plant.scientificName) {
                let newScientificName = null;
                let source = '';
                
                // Try manual mapping first
                if (manualMappings[plant.name]) {
                    newScientificName = manualMappings[plant.name];
                    source = 'manual mapping';
                }
                // Try to extract from description
                else if (plant.description) {
                    newScientificName = extractScientificNameFromDescription(plant.description);
                    if (newScientificName) {
                        source = 'description';
                    }
                }
                // Try to extract from image URL
                if (!newScientificName && plant.imageUrl) {
                    newScientificName = extractScientificNameFromImageUrl(plant.imageUrl);
                    if (newScientificName) {
                        source = 'image URL';
                    }
                }
                // Try images array
                if (!newScientificName && plant.images && plant.images.length > 0) {
                    for (const imgUrl of plant.images) {
                        newScientificName = extractScientificNameFromImageUrl(imgUrl);
                        if (newScientificName) {
                            source = 'images array';
                            break;
                        }
                    }
                }
                
                if (newScientificName && newScientificName !== plant.name) {
                    fixes.push({
                        file: path.basename(filePath),
                        name: plant.name,
                        oldScientific: plant.scientificName,
                        newScientific: newScientificName,
                        source: source
                    });
                    
                    plant.scientificName = newScientificName;
                    fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                    fixedCount++;
                } else if (!newScientificName) {
                    // Flag for manual review
                    console.log(`⚠️  Manual review needed: ${path.basename(filePath)}`);
                    console.log(`    name: "${plant.name}"`);
                    console.log(`    scientificName: "${plant.scientificName}" (same as name)\n`);
                }
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`   Total files scanned: ${plantFiles.length}`);
    console.log(`   Scientific names fixed: ${fixedCount}`);
    
    if (fixes.length > 0) {
        console.log('\n✅ FIXED ENTRIES:');
        fixes.forEach(fix => {
            console.log(`\n   ${fix.file}`);
            console.log(`   Name: ${fix.name}`);
            console.log(`   Old Scientific: ${fix.oldScientific}`);
            console.log(`   New Scientific: ${fix.newScientific}`);
            console.log(`   Source: ${fix.source}`);
        });
    }
    
    console.log('\n✅ Fix complete!');
}

fixMissingScientificNames().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

