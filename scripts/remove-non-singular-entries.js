// Remove non-singular entries (bundles, kits, pairs, duplicates)

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

function isNonSingularEntry(plant) {
    const name = (plant.name || '').toLowerCase();
    const sci = (plant.scientificName || '').toLowerCase();
    
    // Check NAME (not description) for clear non-singular indicators
    const namePatterns = [
        /\b(bundle|kit|pair|set|pack|collection)\b/i,
        /\bstarter\s+(set|kit|pack)/i,
        /plant\s+plug/i,
        /\b(2|3|4|5|6|7|8|9|10)\s+plants?\b/i,
        /plants?\s+(set|kit|pack|bundle)/i,
        /gift\s+card/i,
        /e-gift/i,
        /support\s+pole/i,
        /moss\s+pole/i,
        /planter/i,
        /substrate/i,
        /potting\s+(mix|soil)/i,
        /fertilizer/i,
        /tool/i,
        /grow\s+light/i,
        /noid\s*#/i
    ];
    
    // Only check the NAME field, not description
    const fullText = name + ' ' + sci;
    
    if (namePatterns.some(pattern => pattern.test(fullText))) {
        return true;
    }
    
    // Also check for size-only entries that might be duplicates (e.g., "Alocasia M", "Monstera L")
    const sizePattern = /\b[SMXL]\s*$/;
    if (sizePattern.test(name.trim())) {
        // Check if there's another entry without the size
        const baseName = name.replace(/\s*[SMXL]\s*$/, '').trim();
        if (baseName.length > 3 && baseName !== name.trim()) {
            // This might be a duplicate - flag it but don't auto-delete
            return false; // Don't auto-delete size variants, just flag for review
        }
    }
    
    return false;
}

function areExactSameSpecies(plant1, plant2) {
    const base1 = getBaseScientific(plant1.scientificName);
    const base2 = getBaseScientific(plant2.scientificName);
    
    if (!base1 || !base2) return false;
    if (base1 !== base2) return false;
    
    const sci1 = (plant1.scientificName || '').toLowerCase().split(/\s+/);
    const sci2 = (plant2.scientificName || '').toLowerCase().split(/\s+/);
    
    if (sci1.length >= 2 && sci2.length >= 2) {
        return sci1[0] === sci2[0] && sci1[1] === sci2[1];
    }
    
    return true;
}

function areSameByCommonName(plant1, plant2) {
    const name1 = (plant1.name || '').toLowerCase();
    const name2 = (plant2.name || '').toLowerCase();
    
    const knownDuplicates = [
        ['fittonia', 'nerve plant'],
        ["baby's tears", "baby tears"],
        ['syngonium', 'arrowhead'],
        ['oxalis', 'purple shamrock']
    ];
    
    for (const [nameA, nameB] of knownDuplicates) {
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
    console.log('🗑️  Removing Non-Singular Entries and Duplicates...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    const allPlants = [];
    
    // Load all plants
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
    
    // Find non-singular entries (bundles, kits, etc.)
    const toDeleteNonSingular = [];
    
    for (const plant of allPlants) {
        if (isNonSingularEntry(plant)) {
            toDeleteNonSingular.push(plant);
        }
    }
    
    console.log(`🚫 Non-singular entries to delete: ${toDeleteNonSingular.length}`);
    if (toDeleteNonSingular.length > 0) {
        toDeleteNonSingular.forEach(p => console.log(`   - ${p.name}`));
    }
    console.log();
    
    // Find duplicates
    const duplicates = [];
    const processed = new Set();
    
    for (let i = 0; i < allPlants.length; i++) {
        if (processed.has(i)) continue;
        if (toDeleteNonSingular.includes(allPlants[i])) continue;
        
        const plant1 = allPlants[i];
        const group = [plant1];
        
        for (let j = i + 1; j < allPlants.length; j++) {
            if (processed.has(j)) continue;
            if (toDeleteNonSingular.includes(allPlants[j])) continue;
            
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
    
    console.log(`🔍 Duplicate groups found: ${duplicates.length}\n`);
    
    // Merge duplicates
    const toDeleteDuplicates = [];
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
        toDeleteDuplicates.push(...others);
        toUpdate.push(best);
        
        console.log(`   Merging: ${group.map(p => p.name).join(', ')}`);
        console.log(`            → Keeping: "${best.name}"\n`);
        
        // Merge data into best
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
    }
    
    // Delete non-singular entries
    console.log(`🗑️  Deleting ${toDeleteNonSingular.length} non-singular entries...`);
    for (const plant of toDeleteNonSingular) {
        try {
            await fs.unlink(plant.filePath);
            console.log(`   ❌ Deleted: ${plant.name}`);
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
        }
    }
    
    // Delete duplicates
    console.log(`\n🗑️  Deleting ${toDeleteDuplicates.length} duplicate entries...`);
    for (const plant of toDeleteDuplicates) {
        try {
            await fs.unlink(plant.filePath);
            console.log(`   ❌ Deleted: ${plant.name}`);
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
        }
    }
    
    // Update merged plants
    console.log(`\n💾 Updating ${toUpdate.length} merged plants...`);
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
    
    const totalDeleted = toDeleteNonSingular.length + toDeleteDuplicates.length;
    console.log(`\n✅ Complete!`);
    console.log(`   Deleted non-singular entries: ${toDeleteNonSingular.length}`);
    console.log(`   Deleted duplicates: ${toDeleteDuplicates.length}`);
    console.log(`   Total deleted: ${totalDeleted}`);
    console.log(`   Remaining plants: ${allPlants.length - totalDeleted}`);
}

main().catch(console.error);

