// Merge dwarf/mini variants with regular versions if they're the same species

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
    
    // Remove corrupted text
    if (normalized.includes('is ') || normalized.includes('originates')) {
        normalized = normalized.split(/\s+(is|originates|forms|requires)/i)[0];
    }
    
    const parts = normalized.split(/\s+/).filter(p => 
        p.length > 0 && 
        !p.match(/^(var|ssp|subsp|f|form|cultivar|cv|mini|dwarf|small)\.?$/i) &&
        p.length > 2
    );
    
    if (parts.length >= 2) {
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    if (parts.length === 1 && parts[0].length > 4) {
        return parts[0];
    }
    
    return null;
}

function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[.*?\]/g, '')
        .replace(/\s*(mini|dwarf|small|tiny|micro|petite|large|xl)\s*$/i, '')
        .replace(/\s*(mini|dwarf|small)\s+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasSizeIndicator(name) {
    return /\b(mini|dwarf|small|tiny|micro|petite)\b/i.test(name);
}

async function main() {
    console.log('🔍 Merging Dwarf/Mini Duplicates...\n');
    
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
    
    // Group by normalized name and scientific name
    const potentialDuplicates = [];
    const processed = new Set();
    
    for (let i = 0; i < allPlants.length; i++) {
        if (processed.has(i)) continue;
        
        const plant1 = allPlants[i];
        const isSizeVariant1 = hasSizeIndicator(plant1.name);
        
        const group = [plant1];
        
        for (let j = i + 1; j < allPlants.length; j++) {
            if (processed.has(j)) continue;
            
            const plant2 = allPlants[j];
            const isSizeVariant2 = hasSizeIndicator(plant2.name);
            
            // Normalize names
            const norm1 = normalizeName(plant1.name);
            const norm2 = normalizeName(plant2.name);
            
            // Check scientific names
            const sci1 = getBaseScientific(plant1.scientificName);
            const sci2 = getBaseScientific(plant2.scientificName);
            
            // Match if normalized names are same OR scientific names match
            const nameMatch = norm1 === norm2 && norm1.length > 3;
            const sciMatch = sci1 && sci2 && sci1 === sci2 && sci1.length > 4;
            
            if (nameMatch || sciMatch) {
                // If one is size variant and other isn't, they're duplicates
                if ((isSizeVariant1 && !isSizeVariant2) || (!isSizeVariant1 && isSizeVariant2)) {
                    group.push(plant2);
                    processed.add(j);
                } else if (nameMatch && norm1.length > 5) {
                    // Same normalized name, likely duplicates
                    group.push(plant2);
                    processed.add(j);
                }
            }
        }
        
        if (group.length > 1) {
            potentialDuplicates.push(group);
            processed.add(i);
        }
    }
    
    console.log(`🔍 Found ${potentialDuplicates.length} potential duplicate groups\n`);
    
    // Merge duplicates
    const toDelete = [];
    const toUpdate = [];
    
    for (const group of potentialDuplicates) {
        // Keep the one WITHOUT size indicator (regular version)
        const regular = group.find(p => !hasSizeIndicator(p.name));
        const sizeVariant = group.find(p => hasSizeIndicator(p.name));
        
        if (regular && sizeVariant) {
            // Merge size variant into regular
            if (sizeVariant.description && 
                (!regular.description || sizeVariant.description.length > regular.description.length)) {
                regular.description = sizeVariant.description;
            }
            
            if (sizeVariant.scientificName && 
                (!regular.scientificName || sizeVariant.scientificName.length > regular.scientificName.length)) {
                // Only if the scientific name is better
                const regularSci = getBaseScientific(regular.scientificName);
                const variantSci = getBaseScientific(sizeVariant.scientificName);
                if (variantSci && variantSci.length > (regularSci?.length || 0)) {
                    regular.scientificName = sizeVariant.scientificName;
                }
            }
            
            if (sizeVariant.images && sizeVariant.images.length > 0) {
                if (!regular.images) regular.images = [];
                sizeVariant.images.forEach(img => {
                    if (!regular.images.includes(img)) {
                        regular.images.push(img);
                    }
                });
            }
            
            // Add note about size variant in description or common names
            if (!regular.commonNames) regular.commonNames = [];
            const variantName = sizeVariant.name.replace(/\s*\([^)]*\)/g, '').trim();
            if (!regular.commonNames.includes(variantName)) {
                regular.commonNames.push(variantName);
            }
            
            toUpdate.push(regular);
            toDelete.push(sizeVariant);
            
            console.log(`   Merging: "${sizeVariant.name}" → "${regular.name}"`);
        } else if (group.length > 1) {
            // Multiple size variants or multiple regular - keep best one
            const best = group.reduce((best, current) => {
                const bestScore = (best.description?.length || 0) + 
                                 (best.scientificName?.length || 0) * 2 +
                                 (best.images?.length || 0) * 10;
                const currentScore = (current.description?.length || 0) + 
                                    (current.scientificName?.length || 0) * 2 +
                                    (current.images?.length || 0) * 10;
                return currentScore > bestScore ? current : best;
            });
            
            const others = group.filter(p => p !== best);
            
            // Merge data
            for (const other of others) {
                if (other.description && (!best.description || other.description.length > best.description.length)) {
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
            
            console.log(`   Merging: ${group.map(p => p.name).join(', ')} → "${best.name}"`);
        }
    }
    
    // Delete duplicates
    if (toDelete.length > 0) {
        console.log(`\n🗑️  Deleting ${toDelete.length} duplicate entries...`);
        for (const plant of toDelete) {
            try {
                await fs.unlink(plant.filePath);
                console.log(`   ❌ Deleted: ${plant.name}`);
            } catch (error) {
                console.log(`   ⚠️  Error: ${error.message}`);
            }
        }
    }
    
    // Update merged plants
    if (toUpdate.length > 0) {
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
    }
    
    console.log(`\n✅ Complete!`);
    console.log(`   Merged: ${potentialDuplicates.length} groups`);
    console.log(`   Deleted: ${toDelete.length} duplicate entries`);
    console.log(`   Updated: ${toUpdate.length} plants`);
}

main().catch(console.error);

