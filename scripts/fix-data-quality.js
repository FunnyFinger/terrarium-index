// Fix Data Quality Issues
// - Swap name/scientificName when they're reversed
// - Remove non-plants
// - Fix formatting issues

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Known non-plant entries to remove
const nonPlants = [
    'aquarium-decoration',
    'terrarium-decoration',
    'substrate',
    'fertilizer',
    'tool',
    'equipment'
];

// Patterns that indicate common names (these should be in 'name', not 'scientificName')
const commonNamePatterns = [
    /fern$/i,
    /moss$/i,
    /plant$/i,
    /vine$/i,
    /ivy$/i,
    /tree$/i,
    /palm$/i,
    /cactus$/i,
    /succulent$/i,
    /orchid$/i,
    /bromeliad$/i,
    /begonia$/i
];

// Patterns that indicate scientific names (these should be in 'scientificName', not 'name')
const scientificNamePatterns = [
    /^[A-Z][a-z]+ [a-z]+$/,  // Genus species (e.g., "Fittonia albivenis")
    /^[A-Z][a-z]+$/  // Single genus name
];

function isLikelyCommonName(text) {
    if (!text) return false;
    return commonNamePatterns.some(pattern => pattern.test(text));
}

function isLikelyScientificName(text) {
    if (!text) return false;
    // Scientific names should be capitalized and typically Latin/Greek
    // First word capitalized, rest lowercase
    return scientificNamePatterns.some(pattern => pattern.test(text.trim()));
}

function cleanScientificName(name) {
    if (!name) return name;
    
    // Remove quotes and suffixes like 'M', 'L', 'S'
    let cleaned = name
        .replace(/['"]M['"]/gi, '')
        .replace(/['"]L['"]/gi, '')
        .replace(/['"]S['"]/gi, '')
        .replace(/['"]small form['"]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    return cleaned;
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

async function fixDataQuality() {
    console.log('🔍 Scanning plant data for quality issues...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let fixedCount = 0;
    let swappedCount = 0;
    let cleanedCount = 0;
    const issues = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            let modified = false;
            
            // Check if name and scientificName are swapped
            const nameIsScientific = isLikelyScientificName(plant.name);
            const scientificIsCommon = isLikelyCommonName(plant.scientificName);
            
            if (nameIsScientific && scientificIsCommon) {
                // Swap them
                const temp = plant.name;
                plant.name = plant.scientificName;
                plant.scientificName = temp;
                modified = true;
                swappedCount++;
                issues.push({
                    file: path.basename(filePath),
                    issue: 'SWAPPED',
                    from: `name: "${temp}", scientificName: "${plant.scientificName}"`,
                    to: `name: "${plant.name}", scientificName: "${plant.scientificName}"`
                });
            }
            
            // Clean scientific name from size indicators and quotes
            const originalScientific = plant.scientificName;
            plant.scientificName = cleanScientificName(plant.scientificName);
            
            if (plant.scientificName !== originalScientific) {
                modified = true;
                cleanedCount++;
                issues.push({
                    file: path.basename(filePath),
                    issue: 'CLEANED',
                    from: originalScientific,
                    to: plant.scientificName
                });
            }
            
            // Fix common issues in names
            if (plant.name) {
                // Remove "bromeliad" suffix if it's redundant (already in description or scientificName)
                const originalName = plant.name;
                plant.name = plant.name
                    .replace(/\s+bromeliad$/i, '')
                    .replace(/\s+M$/i, '')  // Remove trailing "M"
                    .replace(/\s+L$/i, '')  // Remove trailing "L"
                    .replace(/\s+S$/i, '')  // Remove trailing "S"
                    .trim();
                
                if (plant.name !== originalName && plant.name) {
                    modified = true;
                    issues.push({
                        file: path.basename(filePath),
                        issue: 'CLEANED_NAME',
                        from: originalName,
                        to: plant.name
                    });
                }
            }
            
            // Save if modified
            if (modified) {
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                fixedCount++;
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`   Total files scanned: ${plantFiles.length}`);
    console.log(`   Files modified: ${fixedCount}`);
    console.log(`   Name/Scientific swapped: ${swappedCount}`);
    console.log(`   Names cleaned: ${cleanedCount}`);
    
    if (issues.length > 0) {
        console.log('\n📝 DETAILED ISSUES FIXED:');
        issues.forEach(issue => {
            console.log(`\n   ${issue.file}`);
            console.log(`   Issue: ${issue.issue}`);
            console.log(`   From: ${issue.from}`);
            console.log(`   To:   ${issue.to}`);
        });
    }
    
    console.log('\n✅ Data quality check complete!');
}

fixDataQuality().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

