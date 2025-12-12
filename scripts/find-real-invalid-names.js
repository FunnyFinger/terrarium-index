// Find REAL invalid scientific names
// Only flag entries with descriptive text, not valid botanical names

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Check for REALLY invalid scientific names (descriptive text, sentences, etc.)
function isReallyInvalid(scientificName) {
    if (!scientificName || scientificName.trim() === '') return true;
    
    // Clearly invalid patterns (descriptive English phrases)
    const reallyInvalidPatterns = [
        /^(the|this|that|a|an)\s/i,  // Starts with articles
        /\b(excellent|attractive|beautiful|hardy|fast|slow|dense|compact|stunning)\s/i,  // Descriptive adjectives
        /\b(plant|growing|with|for|from|is|are|was|were)\b/i,  // Common verbs/words
        /^[a-z]/,  // Starts with lowercase (scientific names always start with capital)
        /\s+(and|or|but|the|with)\s+/,  // Conjunctions mid-phrase
        /varieties of/i,
        /similar to/i,
        /known for/i,
        /native to/i,
        /requires/i
    ];
    
    return reallyInvalidPatterns.some(pattern => pattern.test(scientificName));
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

async function findRealInvalidNames() {
    console.log('🔍 Finding REAL invalid scientific names...\n');
    console.log('='.repeat(80));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    const reallyInvalid = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            if (isReallyInvalid(plant.scientificName)) {
                reallyInvalid.push({
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
    console.log(`   REAL invalid scientific names: ${reallyInvalid.length}\n`);
    
    if (reallyInvalid.length > 0) {
        console.log('❌ ENTRIES WITH DESCRIPTIVE TEXT (NOT SCIENTIFIC NAMES):\n');
        
        reallyInvalid.forEach((entry, idx) => {
            console.log(`${idx + 1}. ${entry.file}`);
            console.log(`   Name: "${entry.name}"`);
            console.log(`   Scientific: "${entry.scientificName}" ❌ (INVALID!)`);
            console.log(`   Path: ${path.basename(path.dirname(entry.path))}/${entry.file}\n`);
        });
    } else {
        console.log('✅ No invalid scientific names found! All entries are clean.\n');
    }
    
    console.log('='.repeat(80));
    
    return reallyInvalid;
}

findRealInvalidNames().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

