// Cleanup duplicates and non-plant items
// 1. Remove bundles, kits, pairs, non-plants
// 2. Merge duplicates of the same species (keeping the best one)
// 3. Keep variants as separate entries
// 4. Ensure only one entry per base species (unless variants)

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Extract base scientific name (genus + species, no variant/cultivar)
 */
function getBaseScientificName(scientificName) {
    if (!scientificName) return null;
    
    // Normalize
    let normalized = scientificName
        .toLowerCase()
        .replace(/['"]/g, '')
        .trim();
    
    // Remove cultivar names in quotes
    normalized = normalized.replace(/\s+['"].*?['"]/g, '');
    
    // Extract first two words (genus + species)
    const parts = normalized.split(/\s+/).filter(p => p.length > 0 && !p.match(/^(var|ssp|subsp|f|form|cv|cultivar)\.?$/i));
    
    if (parts.length >= 2) {
        // Handle hybrid notation (x, ×)
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

/**
 * Check if plant name indicates it's not a single plant
 */
function isNonPlant(name, scientificName) {
    const nameLower = (name || '').toLowerCase();
    const sciLower = (scientificName || '').toLowerCase();
    
    // More specific patterns - must be clear non-plant indicators
    const nonPlantPatterns = [
        /\bbundle\b/i,  // "bundle" as whole word
        /\bkit\b/i,     // "kit" as whole word
        /\bpair\b/i,
        /\bset\b/i,     // Only if it says "starter set" or "set of"
        /\bpack\b/i,
        /\bcollection\b/i,
        /\bstarter\s+(set|kit|pack)/i,
        /gift\s*card/i,
        /e-gift/i,
        /rescue\s+box/i,
        /subscription\s+box/i,
        /support\s+pole/i,
        /moss\s+pole/i,
        /\bpot\b/i,      // Only standalone "pot"
        /plant\s+pot/i,
        /planter/i,
        /substrate/i,
        /potting\s+(mix|soil)/i,
        /fertilizer/i,
        /tool/i,
        /grow\s+light/i,
        /lamp/i,
        /book/i,
        /\bart\b/i,
        /mushroom/i,
        /\bnoid\s*#/i,  // "NOID #" pattern
        /no\s+id/i,
        /unknown\s+plant/i,
        /amazonia.*ecosystems/i,
        /insitu.*terrarium/i
    ];
    
    // Must match pattern AND not be a legitimate plant name
    const matchesPattern = nonPlantPatterns.some(pattern => 
        pattern.test(name) || pattern.test(scientificName)
    );
    
    if (!matchesPattern) return false;
    
    // Exception list - these are real plants even if they match patterns
    const realPlantExceptions = [
        'alluaudia', 'alocasia', 'asparagus', 'begonia', 'artocarpus',
        'anubias', 'roridula', 'asplenium', 'anthurium'
    ];
    
    const isException = realPlantExceptions.some(exception => 
        nameLower.includes(exception) || sciLower.includes(exception)
    );
    
    return !isException;
}

/**
 * Check if two plants are variants of the same species
 */
function isVariant(plant1, plant2) {
    const base1 = getBaseScientificName(plant1.scientificName);
    const base2 = getBaseScientificName(plant2.scientificName);
    
    // Same base species
    if (base1 && base2 && base1 === base2) {
        const name1 = (plant1.name || '').toLowerCase();
        const name2 = (plant2.name || '').toLowerCase();
        const sci1 = (plant1.scientificName || '').toLowerCase();
        const sci2 = (plant2.scientificName || '').toLowerCase();
        
        // Check for variant indicators
        const variantIndicators = ['variegat', 'var.', 'var ', 'cultivar', "'", '"', 'cv.', 'f.'];
        const hasVariant1 = variantIndicators.some(v => name1.includes(v) || sci1.includes(v));
        const hasVariant2 = variantIndicators.some(v => name2.includes(v) || sci2.includes(v));
        
        // If both have variants or both don't, check names
        if (hasVariant1 && hasVariant2) {
            // Both have variants - they're different if names differ
            return name1 !== name2 || sci1 !== sci2;
        }
        
        // One has variant, one doesn't - they're different variants
        if (hasVariant1 !== hasVariant2) {
            return true;
        }
        
        // Check for different cultivar names in quotes
        const cult1 = name1.match(/['"]([^'"]+)['"]/) || sci1.match(/['"]([^'"]+)['"]/);
        const cult2 = name2.match(/['"]([^'"]+)['"]/) || sci2.match(/['"]([^'"]+)['"]/);
        if (cult1 && cult2 && cult1[1] !== cult2[1]) {
            return true;
        }
    }
    
    return false;
}

/**
 * Find best plant to keep (most complete data)
 */
function getBestPlant(plants) {
    // Score each plant
    const scored = plants.map(plant => {
        let score = 0;
        
        // Has scientific name
        if (plant.scientificName && plant.scientificName.length > 5) score += 10;
        
        // Has good description
        if (plant.description && plant.description.length > 100) score += 5;
        
        // Has images
        if (plant.images && plant.images.length > 0) score += 3;
        if (plant.imageUrl) score += 2;
        
        // Has care info
        if (plant.lightRequirements && plant.lightRequirements !== 'Bright Indirect to Medium Light') score += 1;
        if (plant.humidity && plant.humidity !== 'High (60-80%)') score += 1;
        if (plant.temperature && plant.temperature !== '18-24°C') score += 1;
        
        // Has taxonomy
        if (plant.taxonomy && Object.keys(plant.taxonomy).length > 1) score += 2;
        
        return { plant, score };
    });
    
    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    
    return scored[0].plant;
}

/**
 * Merge plant data (combine best info from both)
 */
function mergePlants(basePlant, otherPlant) {
    const merged = JSON.parse(JSON.stringify(basePlant)); // Deep copy
    
    // Merge descriptions (keep longer one)
    if (otherPlant.description && 
        (!merged.description || otherPlant.description.length > merged.description.length)) {
        merged.description = otherPlant.description;
    }
    
    // Merge scientific name (keep more complete one)
    if (otherPlant.scientificName && 
        (!merged.scientificName || otherPlant.scientificName.length > merged.scientificName.length)) {
        merged.scientificName = otherPlant.scientificName;
    }
    
    // Merge images (combine, keep unique)
    if (otherPlant.images && otherPlant.images.length > 0) {
        if (!merged.images) merged.images = [];
        otherPlant.images.forEach(img => {
            if (!merged.images.includes(img)) {
                merged.images.push(img);
            }
        });
        // Update primary image
        if (!merged.imageUrl && otherPlant.imageUrl) {
            merged.imageUrl = otherPlant.imageUrl;
        }
    }
    
    // Merge care info (prefer non-default values)
    if (otherPlant.lightRequirements && 
        otherPlant.lightRequirements !== 'Bright Indirect to Medium Light' &&
        merged.lightRequirements === 'Bright Indirect to Medium Light') {
        merged.lightRequirements = otherPlant.lightRequirements;
    }
    
    if (otherPlant.humidity && 
        otherPlant.humidity !== 'High (60-80%)' &&
        merged.humidity === 'High (60-80%)') {
        merged.humidity = otherPlant.humidity;
    }
    
    if (otherPlant.temperature && 
        otherPlant.temperature !== '18-24°C' &&
        merged.temperature === '18-24°C') {
        merged.temperature = otherPlant.temperature;
    }
    
    // Merge taxonomy (keep more complete)
    if (otherPlant.taxonomy && Object.keys(otherPlant.taxonomy).length > Object.keys(merged.taxonomy || {}).length) {
        merged.taxonomy = otherPlant.taxonomy;
    }
    
    return merged;
}

/**
 * Main cleanup function
 */
async function main() {
    console.log('🔍 Scanning all plants for duplicates and non-plants...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    const allPlants = [];
    const nonPlants = [];
    
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
                plant.filename = file;
                
                // Check if non-plant
                if (isNonPlant(plant.name, plant.scientificName)) {
                    nonPlants.push(plant);
                } else {
                    allPlants.push(plant);
                }
            }
        } catch (error) {
            console.log(`⚠️  Error reading ${category}: ${error.message}`);
        }
    }
    
    console.log(`📊 Total plants found: ${allPlants.length}`);
    console.log(`🚫 Non-plants found: ${nonPlants.length}\n`);
    
    // Group by base scientific name
    const plantsBySpecies = new Map();
    
    for (const plant of allPlants) {
        const baseSci = getBaseScientificName(plant.scientificName) || 
                       plant.name.toLowerCase().split(' ')[0]; // Fallback to first word of name
        
        if (!plantsBySpecies.has(baseSci)) {
            plantsBySpecies.set(baseSci, []);
        }
        plantsBySpecies.get(baseSci).push(plant);
    }
    
    console.log(`🔬 Unique base species: ${plantsBySpecies.size}\n`);
    
    // Identify duplicates and variants
    const duplicates = [];
    const variants = [];
    const toDelete = [];
    const toUpdate = [];
    
    for (const [baseSci, plants] of plantsBySpecies.entries()) {
        if (plants.length === 1) {
            continue; // No duplicates
        }
        
        console.log(`\n📦 ${baseSci}: ${plants.length} entries`);
        
        // Check if they're variants
        const variantGroups = [];
        const nonVariantPlants = [];
        
        for (const plant of plants) {
            let foundGroup = false;
            for (const group of variantGroups) {
                if (isVariant(plant, group[0])) {
                    group.push(plant);
                    foundGroup = true;
                    break;
                }
            }
            if (!foundGroup) {
                // Check if it's a variant of any non-variant plant
                const isVariantOfAny = nonVariantPlants.some(p => isVariant(plant, p));
                if (isVariantOfAny) {
                    // Find which group
                    for (const group of variantGroups) {
                        if (isVariant(plant, group[0])) {
                            group.push(plant);
                            foundGroup = true;
                            break;
                        }
                    }
                    if (!foundGroup) {
                        variantGroups.push([plant]);
                    }
                } else {
                    nonVariantPlants.push(plant);
                }
            }
        }
        
        if (nonVariantPlants.length > 1) {
            // True duplicates (same base species, no variants)
            console.log(`   ⚠️  ${nonVariantPlants.length} duplicates (merging)`);
            const best = getBestPlant(nonVariantPlants);
            const others = nonVariantPlants.filter(p => p !== best);
            
            // Merge all into best
            let merged = best;
            for (const other of others) {
                merged = mergePlants(merged, other);
                toDelete.push(other);
            }
            
            toUpdate.push(merged);
            duplicates.push({ base: baseSci, count: nonVariantPlants.length, kept: best.name });
        }
        
        if (variantGroups.length > 0) {
            // Variants - keep all but ensure they're properly labeled
            console.log(`   ✅ ${variantGroups.length} variant groups (keeping all)`);
            for (const group of variantGroups) {
                variants.push({ base: baseSci, variants: group.map(p => p.name) });
                
                // Ensure variant info is in the plant data
                for (const plant of group) {
                    if (!plant.variantInfo) {
                        plant.variantInfo = {
                            isVariant: true,
                            baseSpecies: baseSci,
                            variantName: plant.name,
                            variantScientificName: plant.scientificName
                        };
                        toUpdate.push(plant);
                    }
                }
            }
        }
    }
    
    // Delete non-plants
    console.log(`\n🗑️  Deleting ${nonPlants.length} non-plant items...`);
    for (const nonPlant of nonPlants) {
        try {
            await fs.unlink(nonPlant.filePath);
            console.log(`   ❌ Deleted: ${nonPlant.name}`);
        } catch (error) {
            console.log(`   ⚠️  Error deleting ${nonPlant.name}: ${error.message}`);
        }
    }
    
    // Delete duplicates
    console.log(`\n🗑️  Deleting ${toDelete.length} duplicate entries...`);
    for (const duplicate of toDelete) {
        try {
            await fs.unlink(duplicate.filePath);
            console.log(`   ❌ Deleted duplicate: ${duplicate.name} (keeping: ${getBaseScientificName(duplicate.scientificName)})`);
        } catch (error) {
            console.log(`   ⚠️  Error deleting ${duplicate.name}: ${error.message}`);
        }
    }
    
    // Update merged/improved plants
    console.log(`\n💾 Updating ${toUpdate.length} plants...`);
    for (const plant of toUpdate) {
        try {
            // Remove internal tracking fields
            delete plant.filePath;
            delete plant.filename;
            delete plant.category;
            
            const filePath = plant.filePath || path.join(PLANTS_DIR, plant.category || 'additional', 
                (plant.filename || plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json'));
            
            // Find actual file path
            const category = plant.category || 'additional';
            const filename = plant.filename || plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
            const actualPath = path.join(PLANTS_DIR, category, filename);
            
            // Try to find the file
            let foundPath = null;
            for (const cat of categories) {
                const testPath = path.join(PLANTS_DIR, cat, filename);
                try {
                    await fs.access(testPath);
                    foundPath = testPath;
                    break;
                } catch {}
            }
            
            if (foundPath) {
                await fs.writeFile(foundPath, JSON.stringify(plant, null, 2));
            }
        } catch (error) {
            console.log(`   ⚠️  Error updating ${plant.name}: ${error.message}`);
        }
    }
    
    console.log(`\n\n✅ Cleanup complete!`);
    console.log(`   Deleted: ${nonPlants.length} non-plants`);
    console.log(`   Merged: ${duplicates.length} duplicate species`);
    console.log(`   Variants kept: ${variants.length} variant groups`);
    console.log(`   Updated: ${toUpdate.length} plants`);
}

main().catch(console.error);

