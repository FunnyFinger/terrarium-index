// Fix duplicate common names and "or" separators in plant data files
// This script:
// 1. Removes duplicate common names (case-insensitive)
// 2. Splits names containing " or " into separate entries
// 3. Removes the main plant name if it's in commonNames
// 4. Ensures all names are properly formatted

const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '../data/plants-merged');

function normalizeCommonNames(plant) {
    if (!plant.commonNames || !Array.isArray(plant.commonNames)) {
        return [];
    }
    
    const processedNames = [];
    const seen = new Set();
    
    for (const name of plant.commonNames) {
        if (!name || typeof name !== 'string') continue;
        
        // Split on " or " (with spaces) to separate multiple names
        const parts = name.split(/\s+or\s+/i);
        
        for (let part of parts) {
            part = part.trim();
            if (!part) continue;
            
            // Remove duplicates (case-insensitive)
            const lowerPart = part.toLowerCase();
            if (!seen.has(lowerPart)) {
                seen.add(lowerPart);
                processedNames.push(part);
            }
        }
    }
    
    // Remove the main plant name and scientific name if they're in common names
    const filteredNames = processedNames.filter(n => {
        const lowerN = n.toLowerCase();
        return lowerN !== (plant.name || '').toLowerCase() && 
               lowerN !== (plant.scientificName || '').toLowerCase();
    });
    
    return filteredNames;
}

function processPlantFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const originalCommonNames = plant.commonNames || [];
        const normalizedCommonNames = normalizeCommonNames(plant);
        
        // Check if there are changes
        const hasChanges = JSON.stringify(originalCommonNames) !== JSON.stringify(normalizedCommonNames);
        
        if (hasChanges) {
            plant.commonNames = normalizedCommonNames;
            fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
            return {
                file: path.basename(filePath),
                original: originalCommonNames,
                fixed: normalizedCommonNames,
                changed: true
            };
        }
        
        return {
            file: path.basename(filePath),
            changed: false
        };
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return {
            file: path.basename(filePath),
            error: error.message
        };
    }
}

async function main() {
    console.log('🔧 Fixing duplicate common names and "or" separators...\n');
    
    const files = fs.readdirSync(PLANTS_DIR)
        .filter(f => f.endsWith('.json') && f !== 'index.json');
    
    console.log(`Found ${files.length} plant files to process\n`);
    
    const results = [];
    let changedCount = 0;
    
    for (const file of files) {
        const filePath = path.join(PLANTS_DIR, file);
        const result = processPlantFile(filePath);
        results.push(result);
        
        if (result.changed) {
            changedCount++;
            console.log(`✅ Fixed: ${result.file}`);
            console.log(`   Before: ${JSON.stringify(result.original)}`);
            console.log(`   After:  ${JSON.stringify(result.fixed)}\n`);
        }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`   Total files processed: ${files.length}`);
    console.log(`   Files changed: ${changedCount}`);
    console.log(`   Files unchanged: ${files.length - changedCount}`);
    
    if (changedCount > 0) {
        console.log('\n✅ Common names have been cleaned up!');
    } else {
        console.log('\n✨ All common names are already clean!');
    }
}

main().catch(console.error);

