// Final check for duplicates and proper variant marking
// Ensures only one entry per base species (variants kept separate)

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Extract base scientific name
 */
function getBaseScientific(scientificName) {
    if (!scientificName) return null;
    
    let normalized = scientificName
        .toLowerCase()
        .replace(/['"]/g, '')
        .trim();
    
    // Remove cultivar/variant designations
    normalized = normalized.replace(/\s+['"].*?['"]/g, '');
    normalized = normalized.replace(/\s+var\.\s+\w+/gi, '');
    normalized = normalized.replace(/\s+cv\.\s+\w+/gi, '');
    normalized = normalized.replace(/\s+variegat[ea]/gi, '');
    
    // Get genus + species
    const parts = normalized.split(/\s+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

/**
 * Check if plant is a variant
 */
function hasVariantIndicators(name, scientific) {
    const text = ((name || '') + ' ' + (scientific || '')).toLowerCase();
    return /variegat|var\.|cultivar|cv\.|'|"|var\s+\w+/i.test(text);
}

/**
 * Main function
 */
async function main() {
    console.log('🔍 Final Duplicate and Variant Check...\n');
    
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
    
    // Group by base scientific name
    const byBaseSpecies = new Map();
    
    for (const plant of allPlants) {
        const base = getBaseScientific(plant.scientificName) || 
                    plant.name.toLowerCase().split(' ')[0];
        
        if (!byBaseSpecies.has(base)) {
            byBaseSpecies.set(base, []);
        }
        byBaseSpecies.get(base).push(plant);
    }
    
    // Find duplicates (same base, no variants)
    const duplicates = [];
    const toUpdate = [];
    
    for (const [baseSci, plants] of byBaseSpecies.entries()) {
        if (plants.length === 1) {
            // Single entry - check if it should be marked as variant
            const plant = plants[0];
            if (hasVariantIndicators(plant.name, plant.scientificName) && !plant.variantInfo) {
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
        
        // Multiple entries - check for variants
        const variants = [];
        const nonVariants = [];
        
        for (const plant of plants) {
            if (hasVariantIndicators(plant.name, plant.scientificName)) {
                variants.push(plant);
                
                // Mark as variant if not already
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
        
        // If multiple non-variants, they're duplicates
        if (nonVariants.length > 1) {
            duplicates.push({
                base: baseSci,
                plants: nonVariants
            });
            
            // Keep the best one, merge others
            const best = nonVariants.reduce((best, current) => {
                const bestScore = (best.description?.length || 0) + 
                                 (best.scientificName?.length || 0) +
                                 (best.images?.length || 0) * 10;
                const currentScore = (current.description?.length || 0) + 
                                    (current.scientificName?.length || 0) +
                                    (current.images?.length || 0) * 10;
                return currentScore > bestScore ? current : best;
            });
            
            // Merge others into best
            for (const other of nonVariants) {
                if (other !== best) {
                    // Merge data
                    if (other.description && other.description.length > (best.description?.length || 0)) {
                        best.description = other.description;
                    }
                    if (other.scientificName && other.scientificName.length > (best.scientificName?.length || 0)) {
                        best.scientificName = other.scientificName;
                    }
                    if (other.images && other.images.length > 0) {
                        if (!best.images) best.images = [];
                        other.images.forEach(img => {
                            if (!best.images.includes(img)) {
                                best.images.push(img);
                            }
                        });
                    }
                    toDelete.push(other);
                }
            }
            
            toUpdate.push(best);
        }
    }
    
    // Update plants with variant info
    console.log(`💾 Updating ${toUpdate.length} plants with variant info...`);
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
    
    console.log(`\n✅ Final check complete!`);
    console.log(`   Total unique species: ${byBaseSpecies.size}`);
    console.log(`   Plants with variants: ${toUpdate.filter(p => p.variantInfo).length}`);
}

main().catch(console.error);

