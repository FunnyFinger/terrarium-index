// Final cleanup - find entries with same scientific name and mark variants properly

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

function getExactScientific(scientificName) {
    if (!scientificName) return null;
    
    // Get exact scientific name (genus + species) without variants
    let normalized = scientificName
        .toLowerCase()
        .replace(/['"]/g, '')
        .trim();
    
    // Remove variant indicators but keep the base name
    normalized = normalized.replace(/\s+var\.\s+\w+/gi, '');
    normalized = normalized.replace(/\s+cv\.\s+\w+/gi, '');
    normalized = normalized.replace(/\s+['"].*?['"]/g, '');  // Remove cultivar names in quotes
    normalized = normalized.replace(/\s+variegat[ea]/gi, '');
    
    // Extract just genus + species (first two meaningful words)
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

function hasVariantIndicator(name, scientific) {
    const text = ((name || '') + ' ' + (scientific || '')).toLowerCase();
    return /variegat|var\.|cultivar|cv\.|'[^']+'|"[^"]+"/i.test(text);
}

async function main() {
    console.log('🔍 Final Duplicate Cleanup...\n');
    
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
    
    // Group by exact scientific name
    const byScientific = new Map();
    
    for (const plant of allPlants) {
        const baseSci = getExactScientific(plant.scientificName);
        if (!baseSci) continue;
        
        if (!byScientific.has(baseSci)) {
            byScientific.set(baseSci, []);
        }
        byScientific.get(baseSci).push(plant);
    }
    
    // Find duplicates (same exact scientific name)
    const duplicates = [];
    const toDelete = [];
    const toUpdate = [];
    
    for (const [baseSci, plants] of byScientific.entries()) {
        if (plants.length === 1) {
            // Single entry - check if it should be marked as variant
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
        
        // Multiple entries with same scientific name
        const variants = [];
        const nonVariants = [];
        
        for (const plant of plants) {
            if (hasVariantIndicator(plant.name, plant.scientificName)) {
                variants.push(plant);
            } else {
                nonVariants.push(plant);
            }
        }
        
        // If multiple non-variants, they're true duplicates
        if (nonVariants.length > 1) {
            duplicates.push({ base: baseSci, plants: nonVariants });
            
            // Keep best one
            const best = nonVariants.reduce((best, current) => {
                const bestScore = (best.description?.length || 0) + 
                                 (best.scientificName?.length || 0) * 3 +
                                 (best.images?.length || 0) * 10;
                const currentScore = (current.description?.length || 0) + 
                                    (current.scientificName?.length || 0) * 3 +
                                    (current.images?.length || 0) * 10;
                return currentScore > bestScore ? current : best;
            });
            
            const others = nonVariants.filter(p => p !== best);
            
            // Merge data
            for (const other of others) {
                if (other.scientificName && (!best.scientificName || other.scientificName.length > best.scientificName.length)) {
                    best.scientificName = other.scientificName;
                }
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
            
            console.log(`   ⚠️  Duplicates: ${baseSci}`);
            console.log(`      Keeping: "${best.name}"`);
            others.forEach(p => console.log(`      Deleting: "${p.name}"`));
            console.log();
        }
        
        // Mark variants
        for (const variant of variants) {
            if (!variant.variantInfo) {
                variant.variantInfo = {
                    isVariant: true,
                    baseSpecies: baseSci,
                    variantName: variant.name,
                    variantScientificName: variant.scientificName
                };
                toUpdate.push(variant);
            }
        }
    }
    
    // Delete duplicates
    if (toDelete.length > 0) {
        console.log(`🗑️  Deleting ${toDelete.length} duplicate entries...`);
        for (const plant of toDelete) {
            try {
                await fs.unlink(plant.filePath);
                console.log(`   ❌ Deleted: ${plant.name}`);
            } catch (error) {
                console.log(`   ⚠️  Error: ${error.message}`);
            }
        }
    }
    
    // Update plants
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
    console.log(`   Duplicate groups: ${duplicates.length}`);
    console.log(`   Deleted: ${toDelete.length}`);
    console.log(`   Updated: ${toUpdate.length}`);
    console.log(`   Final count: ${allPlants.length - toDelete.length}`);
}

main().catch(console.error);

