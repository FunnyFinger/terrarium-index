// Comprehensive check for all non-singular entries and duplicates

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

function getBaseScientific(scientificName) {
    if (!scientificName) return null;
    
    let normalized = scientificName
        .toLowerCase()
        .replace(/['"]/g, '')
        .replace(/\s+var\.\s+\w+/gi, '')
        .replace(/\s+cv\.\s+\w+/gi, '')
        .replace(/\s+variegat[ea]/gi, '')
        .replace(/\s+['"].*?['"]/g, '')
        .trim();
    
    const parts = normalized.split(/\s+/).filter(p => 
        p.length > 0 && !p.match(/^(var|ssp|subsp|f|form|cultivar|cv)\.?$/i)
    );
    
    if (parts.length >= 2) {
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, '')  // Remove parentheses
        .replace(/\s*\[.*?\]/g, '')    // Remove brackets
        .replace(/\s*(mini|dwarf|small|large|xl|s|m|l)\s*$/i, '')  // Remove size indicators
        .replace(/\s+/g, ' ')
        .trim();
}

function areLikelyDuplicates(plant1, plant2) {
    const name1 = normalizeName(plant1.name);
    const name2 = normalizeName(plant2.name);
    
    // Exact match after normalization
    if (name1 === name2 && name1.length > 3) {
        return true;
    }
    
    // One contains the other (and it's not a short word)
    if ((name1.includes(name2) || name2.includes(name1)) && 
        Math.min(name1.length, name2.length) > 5) {
        // But check if they're clearly different species
        const sci1 = getBaseScientific(plant1.scientificName);
        const sci2 = getBaseScientific(plant2.scientificName);
        
        if (sci1 && sci2 && sci1 !== sci2) {
            // Different scientific names = different species
            return false;
        }
        
        return true;
    }
    
    // Check scientific names
    const base1 = getBaseScientific(plant1.scientificName);
    const base2 = getBaseScientific(plant2.scientificName);
    
    if (base1 && base2 && base1 === base2) {
        const sci1 = (plant1.scientificName || '').toLowerCase().split(/\s+/);
        const sci2 = (plant2.scientificName || '').toLowerCase().split(/\s+/);
        
        if (sci1.length >= 2 && sci2.length >= 2) {
            // Same genus and species
            return sci1[0] === sci2[0] && sci1[1] === sci2[1];
        }
        return true;
    }
    
    return false;
}

function isNonSingular(plant) {
    const name = (plant.name || '').toLowerCase();
    
    // Clear non-singular patterns in NAME
    const patterns = [
        /\b(bundle|kit|pair|set|pack|collection)\b/i,
        /\bstarter\s+(set|kit|pack)/i,
        /plant\s+plug/i,
        /\b(2|3|4|5|6|7|8|9|10)\s+plants?\b/i,
        /plants?\s+(set|kit|pack|bundle)/i,
        /gift\s+card/i,
        /e-gift/i
    ];
    
    return patterns.some(pattern => pattern.test(name));
}

async function main() {
    console.log('🔍 Comprehensive Duplicate & Non-Singular Check...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    const allPlants = [];
    
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const plant = JSON.parse(content);
                plant.filePath = filePath;
                plant.category = category;
                allPlants.push(plant);
            }
        } catch (error) {
            // Skip
        }
    }
    
    console.log(`📊 Total plants: ${allPlants.length}\n`);
    
    // Check for non-singular
    const nonSingular = allPlants.filter(p => isNonSingular(p));
    
    console.log(`🚫 Non-singular entries: ${nonSingular.length}`);
    nonSingular.forEach(p => console.log(`   - ${p.name}`));
    console.log();
    
    // Find all potential duplicates
    const duplicates = [];
    const processed = new Set();
    
    for (let i = 0; i < allPlants.length; i++) {
        if (processed.has(i)) continue;
        if (nonSingular.includes(allPlants[i])) continue;
        
        const plant1 = allPlants[i];
        const group = [plant1];
        
        for (let j = i + 1; j < allPlants.length; j++) {
            if (processed.has(j)) continue;
            if (nonSingular.includes(allPlants[j])) continue;
            
            const plant2 = allPlants[j];
            
            if (areLikelyDuplicates(plant1, plant2)) {
                group.push(plant2);
                processed.add(j);
            }
        }
        
        if (group.length > 1) {
            duplicates.push(group);
            processed.add(i);
        }
    }
    
    console.log(`🔍 Duplicate groups: ${duplicates.length}\n`);
    
    for (const group of duplicates) {
        console.log(`   Group (${group.length} entries):`);
        group.forEach(p => {
            console.log(`     - ${p.name} (${p.scientificName || 'no scientific name'})`);
        });
        console.log();
    }
    
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   Non-singular entries: ${nonSingular.length}`);
    console.log(`   Duplicate groups: ${duplicates.length}`);
    console.log(`   Total to remove: ${nonSingular.length + duplicates.reduce((sum, g) => sum + g.length - 1, 0)}`);
}

main().catch(console.error);

