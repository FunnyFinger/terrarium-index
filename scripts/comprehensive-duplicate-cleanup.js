// Comprehensive duplicate cleanup
// 1. Identify true duplicates (same base species, no variants) - merge them
// 2. Keep variants separate but mark them properly
// 3. Remove any remaining non-plants

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
        .trim();
    
    // Extract genus + species
    const parts = normalized.split(/\s+/).filter(p => p.length > 0 && !p.match(/^(var|ssp|subsp|f|form)\.?$/i));
    
    if (parts.length >= 2) {
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

function hasVariantIndicator(name, scientific) {
    const text = ((name || '') + ' ' + (scientific || '')).toLowerCase();
    return /variegat|var\.|cultivar|cv\.|'[^']+'|"[^"]+"/i.test(text);
}

function areSameBaseSpecies(plant1, plant2) {
    const base1 = getBaseScientific(plant1.scientificName);
    const base2 = getBaseScientific(plant2.scientificName);
    
    if (!base1 || !base2) return false;
    return base1 === base2;
}

function getBestPlant(plants) {
    return plants.reduce((best, current) => {
        const bestScore = (best.description?.length || 0) + 
                         (best.scientificName?.length || 0) * 2 +
                         (best.images?.length || 0) * 10;
        const currentScore = (current.description?.length || 0) + 
                            (current.scientificName?.length || 0) * 2 +
                            (current.images?.length || 0) * 10;
        return currentScore > bestScore ? current : best;
    });
}

function mergeIntoBest(best, others) {
    for (const other of others) {
        if (other.description && (!best.description || other.description.length > best.description.length)) {
            best.description = other.description;
        }
        if (other.scientificName && (!best.scientificName || other.scientificName.length > best.scientificName.length)) {
            best.scientificName = other.scientificName;
        }
        if (other.images && other.images.length > 0) {
            if (!best.images) best.images = [];
            other.images.forEach(img => {
                if (!best.images.includes(img)) {
                    best.images.push(img);
                }
            });
            if (!best.imageUrl && other.imageUrl) {
                best.imageUrl = other.imageUrl;
            }
        }
    }
    return best;
}

async function main() {
    console.log('🔍 Comprehensive Duplicate Cleanup...\n');
    
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
    
    // Group by base species
    const bySpecies = new Map();
    
    for (const plant of allPlants) {
        const base = getBaseScientific(plant.scientificName) || 
                    plant.name.toLowerCase().split(' ').slice(0, 2).join(' ');
        
        if (!bySpecies.has(base)) {
            bySpecies.set(base, []);
        }
        bySpecies.get(base).push(plant);
    }
    
    const toDelete = [];
    const toUpdate = [];
    let duplicateGroups = 0;
    let variantGroups = 0;
    
    // Process each species group
    for (const [baseSci, plants] of bySpecies.entries()) {
        if (plants.length === 1) {
            // Single entry - mark as variant if needed
            const plant = plants[0];
            if (hasVariantIndicator(plant.name, plant.scientificName) && !plant.variantInfo) {
                plant.variantInfo = {
                    isVariant: true,
                    baseSpecies: baseSci,
                    variantName: plant.name,
                    variantScientificName: plant.scientificName
                };
                toUpdate.push(plant);
            }
            continue;
        }
        
        // Multiple entries - separate variants from duplicates
        const variants = [];
        const nonVariants = [];
        
        for (const plant of plants) {
            if (hasVariantIndicator(plant.name, plant.scientificName)) {
                variants.push(plant);
                // Ensure variant info
                if (!plant.variantInfo) {
                    plant.variantInfo = {
                        isVariant: true,
                        baseSpecies: baseSci,
                        variantName: plant.name,
                        variantScientificName: plant.scientificName
                    };
                    toUpdate.push(plant);
                }
            } else {
                nonVariants.push(plant);
            }
        }
        
        if (nonVariants.length > 1) {
            // True duplicates - merge
            duplicateGroups++;
            const best = getBestPlant(nonVariants);
            const others = nonVariants.filter(p => p !== best);
            
            mergeIntoBest(best, others);
            toUpdate.push(best);
            
            others.forEach(other => {
                toDelete.push(other);
            });
        }
        
        if (variants.length > 0) {
            variantGroups++;
        }
    }
    
    // Delete duplicates
    console.log(`🗑️  Deleting ${toDelete.length} duplicate entries...`);
    for (const plant of toDelete) {
        try {
            await fs.unlink(plant.filePath);
            console.log(`   ❌ Deleted: ${plant.name} (base: ${getBaseScientific(plant.scientificName)})`);
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
        }
    }
    
    // Update plants
    console.log(`\n💾 Updating ${toUpdate.length} plants...`);
    for (const plant of toUpdate) {
        try {
            const filePath = plant.filePath;
            delete plant.filePath;
            delete plant.category;
            
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
        } catch (error) {
            console.log(`   ⚠️  Error updating ${plant.name}: ${error.message}`);
        }
    }
    
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Duplicate groups merged: ${duplicateGroups}`);
    console.log(`   Variant groups: ${variantGroups}`);
    console.log(`   Plants deleted: ${toDelete.length}`);
    console.log(`   Plants updated: ${toUpdate.length}`);
}

main().catch(console.error);

