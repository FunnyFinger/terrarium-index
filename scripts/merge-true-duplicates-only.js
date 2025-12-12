// Merge ONLY true duplicates (same exact species OR known common name pairs)
// Do NOT merge different species in same genus

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Known common name duplicates (same plant, different names)
const KNOWN_DUPLICATES = [
    ['fittonia', 'nerve plant'],
    ["baby's tears", "baby tears"],
    ['peperomia', 'peperomia caperata'],
    ['syngonium', 'arrowhead'],
    ['oxalis', 'purple shamrock'],
    ['selaginella', 'resurrection plant']
];

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

function areExactSameSpecies(plant1, plant2) {
    const base1 = getBaseScientific(plant1.scientificName);
    const base2 = getBaseScientific(plant2.scientificName);
    
    if (!base1 || !base2 || base1 !== base2) return false;
    
    // Check species epithet to ensure they're the same
    const sci1 = (plant1.scientificName || '').toLowerCase().split(/\s+/);
    const sci2 = (plant2.scientificName || '').toLowerCase().split(/\s+/);
    
    if (sci1.length >= 2 && sci2.length >= 2) {
        // Same genus and same species
        return sci1[0] === sci2[0] && sci1[1] === sci2[1];
    }
    
    return true;
}

function areSameByCommonName(plant1, plant2) {
    const name1 = (plant1.name || '').toLowerCase();
    const name2 = (plant2.name || '').toLowerCase();
    
    for (const [nameA, nameB] of KNOWN_DUPLICATES) {
        if ((name1.includes(nameA) && name2.includes(nameB)) ||
            (name1.includes(nameB) && name2.includes(nameA))) {
            return true;
        }
    }
    
    const clean1 = name1.replace(/\s*(mini|dwarf|small|large|xl)\b/gi, '').trim();
    const clean2 = name2.replace(/\s*(mini|dwarf|small|large|xl)\b/gi, '').trim();
    
    return clean1 === clean2 && clean1.length > 3;
}

async function main() {
    console.log('🔍 Finding TRUE Duplicates Only...\n');
    
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
    
    // Find TRUE duplicates only
    const duplicates = [];
    const processed = new Set();
    
    for (let i = 0; i < allPlants.length; i++) {
        if (processed.has(i)) continue;
        
        const plant1 = allPlants[i];
        const group = [plant1];
        
        for (let j = i + 1; j < allPlants.length; j++) {
            if (processed.has(j)) continue;
            
            const plant2 = allPlants[j];
            
            if (areExactSameSpecies(plant1, plant2) || areSameByCommonName(plant1, plant2)) {
                group.push(plant2);
                processed.add(j);
            }
        }
        
        if (group.length > 1) {
            duplicates.push(group);
            processed.add(i);
        }
    }
    
    console.log(`🔍 Found ${duplicates.length} duplicate groups\n`);
    
    if (duplicates.length === 0) {
        console.log('✅ No duplicates found!\n');
        return;
    }
    
    // Show duplicates
    for (const group of duplicates) {
        console.log(`📦 Group:`);
        group.forEach(p => {
            console.log(`   - ${p.name} (${p.scientificName || 'no scientific name'})`);
        });
        console.log();
    }
    
    // Merge
    const toDelete = [];
    const toUpdate = [];
    
    for (const group of duplicates) {
        const best = group.reduce((best, current) => {
            const bestScore = (best.description?.length || 0) + 
                             (best.scientificName?.length || 0) * 3 +
                             (best.images?.length || 0) * 10;
            const currentScore = (current.description?.length || 0) + 
                                (current.scientificName?.length || 0) * 3 +
                                (current.images?.length || 0) * 10;
            return currentScore > bestScore ? current : best;
        });
        
        const others = group.filter(p => p !== best);
        
        // Merge data
        for (const other of others) {
            if (other.scientificName && 
                (!best.scientificName || other.scientificName.length > best.scientificName.length)) {
                best.scientificName = other.scientificName;
            }
            if (other.description && 
                (!best.description || other.description.length > best.description.length)) {
                best.description = other.description;
            }
            if (other.images && other.images.length > 0) {
                if (!best.images) best.images = [];
                other.images.forEach(img => {
                    if (!best.images.includes(img)) {
                        best.images.push(img);
                    }
                });
            }
        }
        
        toUpdate.push(best);
        toDelete.push(...others);
        
        console.log(`   ✅ Keeping: "${best.name}" (deleting ${others.length} duplicates)\n`);
    }
    
    // Delete
    console.log(`🗑️  Deleting ${toDelete.length} duplicates...`);
    for (const plant of toDelete) {
        try {
            await fs.unlink(plant.filePath);
            console.log(`   ❌ Deleted: ${plant.name}`);
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
        }
    }
    
    // Update
    console.log(`\n💾 Updating ${toUpdate.length} plants...`);
    for (const plant of toUpdate) {
        try {
            const filePath = plant.filePath;
            delete plant.filePath;
            delete plant.category;
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
        }
    }
    
    console.log(`\n✅ Complete! Deleted ${toDelete.length} duplicates`);
}

main().catch(console.error);

