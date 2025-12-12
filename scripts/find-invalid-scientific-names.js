// Find ALL entries with invalid scientific names
// Detect random words, phrases, or clearly non-botanical names

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Valid scientific name patterns
function isValidScientificName(name) {
    if (!name || name.trim() === '') return false;
    
    // Check for clearly invalid patterns
    const invalidPatterns = [
        /^(the|this|that|a|an|excellent|attractive|beautiful|fast|slow|hardy)/i,
        /\b(plant|growing|with|for|from|and|or|but)\b/i,
        /^[a-z]/,  // Starts with lowercase
        /\d{2,}/,  // Contains multiple digits
        /[!@#$%^&*()+=\[\]{};:'"<>?\/\\|`~]/,  // Special characters
    ];
    
    if (invalidPatterns.some(pattern => pattern.test(name))) {
        return false;
    }
    
    // Valid scientific name should be:
    // "Genus species" or "Genus species subspecies" or "Genus species 'Cultivar'"
    // With optional × for hybrids, or sp. for unknown species
    const validPatterns = [
        /^[A-Z][a-z]+\s+[a-z]+(\s+[a-z]+)?$/,  // Genus species [subspecies]
        /^[A-Z][a-z]+\s+sp\.?$/,  // Genus sp.
        /^[A-Z][a-z]+\s+×\s+[a-z]+$/,  // Hybrid
        /^[A-Z][a-z]+\s+[a-z]+\s+'[^']+'$/,  // With cultivar
        /^[A-Z][a-z]+\s+[a-z]+\s+var\.\s+[a-z]+$/,  // With variety
    ];
    
    return validPatterns.some(pattern => pattern.test(name.trim()));
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

async function findInvalidNames() {
    console.log('🔍 Scanning for invalid scientific names...\n');
    console.log('='.repeat(80));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    const invalidEntries = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            if (!isValidScientificName(plant.scientificName)) {
                invalidEntries.push({
                    file: filename,
                    path: filePath,
                    name: plant.name,
                    scientificName: plant.scientificName,
                    id: plant.id
                });
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log(`\n📊 SCAN RESULTS:`);
    console.log(`   Total files scanned: ${plantFiles.length}`);
    console.log(`   Invalid scientific names found: ${invalidEntries.length}\n`);
    
    if (invalidEntries.length > 0) {
        console.log('❌ INVALID SCIENTIFIC NAMES:\n');
        
        invalidEntries.forEach((entry, idx) => {
            console.log(`${idx + 1}. ${entry.file}`);
            console.log(`   Name: "${entry.name}"`);
            console.log(`   Scientific: "${entry.scientificName}" ❌`);
            console.log(`   Path: ${entry.path}\n`);
        });
    }
    
    // Save report
    const reportPath = path.join(__dirname, 'invalid-scientific-names-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(invalidEntries, null, 2));
    console.log(`✅ Full report saved to: ${reportPath}\n`);
    
    return invalidEntries;
}

findInvalidNames().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

