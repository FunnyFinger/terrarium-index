// Integrate GrowTropicals data with existing plant database
// 1. Update existing plants with enhanced descriptions
// 2. Add new plants that don't exist
// 3. Merge care information

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');
const GROWTROPICALS_DIR = path.join(__dirname, '..', 'data', 'growtropicals-import');
const PLANTS_INDEX = path.join(__dirname, '..', 'data', 'plants', 'index.json');

/**
 * Normalize plant name for comparison
 */
function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Normalize scientific name for comparison (extracts genus + species)
 */
function normalizeScientific(scientific) {
    if (!scientific) return '';
    
    // Extract base scientific name (genus + species, ignore cultivars/variants)
    let normalized = scientific
        .toLowerCase()
        .replace(/['"]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Remove cultivar names in quotes
    normalized = normalized.replace(/\s+['"].*?['"]/g, '');
    
    // Extract first two words (genus + species)
    const parts = normalized.split(' ').filter(p => p.length > 0);
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
 * Check if two entries are the same species (ignoring size/age variants)
 */
function isSameSpecies(plant1, plant2) {
    const sci1 = normalizeScientific(plant1.scientificName);
    const sci2 = normalizeScientific(plant2.scientificName);
    
    // Exact scientific name match
    if (sci1 && sci2 && sci1 === sci2 && sci1.length > 5) {
        return true;
    }
    
    // Extract genus + species from names
    const name1 = normalizeName(plant1.name);
    const name2 = normalizeName(plant2.name);
    
    // Remove size/age indicators
    const sizeWords = ['baby', 'small', 'mini', 'dwarf', 'medium', 'large', 'xl', 'xxl', 
                       '6cm', '7cm', '8cm', '9cm', '10cm', '11cm', '12cm', '14cm', '15cm', 
                       '16cm', '17cm', '19cm', '20cm', 'plug', 'cutting'];
    
    const cleanName1 = name1.split(' ').filter(w => !sizeWords.includes(w)).join(' ');
    const cleanName2 = name2.split(' ').filter(w => !sizeWords.includes(w)).join(' ');
    
    // If cleaned names are very similar (one contains the other or vice versa)
    if (cleanName1 && cleanName2 && 
        (cleanName1.includes(cleanName2) || cleanName2.includes(cleanName1))) {
        
        // But not if they're clearly different variants
        const variantIndicators = ['variegata', 'variegated', 'var', 'cultivar', "'", '"'];
        const hasVariant1 = variantIndicators.some(v => name1.includes(v));
        const hasVariant2 = variantIndicators.some(v => name2.includes(v));
        
        // If one has variant indicator and other doesn't, they're different
        if ((hasVariant1 && !hasVariant2) || (hasVariant2 && !hasVariant1)) {
            return false;
        }
        
        return true;
    }
    
    return false;
}

/**
 * Check if two entries are different variants of the same species
 */
function isDifferentVariant(plant1, plant2) {
    const sci1 = normalizeScientific(plant1.scientificName);
    const sci2 = normalizeScientific(plant2.scientificName);
    
    // Same base species but different variants
    if (sci1 && sci2 && sci1 === sci2) {
        const name1 = plant1.name.toLowerCase();
        const name2 = plant2.name.toLowerCase();
        
        // Check for variant indicators
        const variants1 = name1.match(/['"]([^'"]+)['"]|var\.?\s+(\w+)|variegat[ea]|(\w+)\s+cultivar/i);
        const variants2 = name2.match(/['"]([^'"]+)['"]|var\.?\s+(\w+)|variegat[ea]|(\w+)\s+cultivar/i);
        
        if (variants1 && variants2 && variants1[0] !== variants2[0]) {
            return true;
        }
    }
    
    return false;
}

/**
 * Find matching existing plant (same species)
 */
function findMatchingPlant(gtPlant, existingPlants) {
    for (const existing of existingPlants) {
        if (isSameSpecies(gtPlant, existing)) {
            return existing;
        }
    }
    
    return null;
}

/**
 * Load all existing plants
 */
async function loadExistingPlants() {
    const plants = [];
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents'];
    
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
                plants.push(plant);
            }
        } catch (error) {
            // Skip
        }
    }
    
    return plants;
}

/**
 * Enhance existing plant with GrowTropicals data
 */
function enhancePlant(existingPlant, gtData) {
    let updated = false;
    
    // Enhance description if current one is poor
    const needsBetterDesc = !existingPlant.description ||
                           existingPlant.description.length < 100 ||
                           existingPlant.description.includes('beautiful plant suitable') ||
                           existingPlant.description.includes('no information');
    
    if (needsBetterDesc && gtData.description && gtData.description.length > 100) {
        existingPlant.description = gtData.description;
        updated = true;
    }
    
    // Add/update scientific name (prefer more complete one)
    if (gtData.scientificName) {
        if (!existingPlant.scientificName) {
            existingPlant.scientificName = gtData.scientificName;
            updated = true;
        } else if (gtData.scientificName.length > existingPlant.scientificName.length) {
            // Use more complete scientific name
            existingPlant.scientificName = gtData.scientificName;
            updated = true;
        }
    }
    
    // Enhance images if available
    if (gtData.imageUrl && (!existingPlant.imageUrl || existingPlant.imageUrl.includes('placeholder'))) {
        existingPlant.imageUrl = gtData.imageUrl;
        updated = true;
    }
    
    if (gtData.images && gtData.images.length > 0) {
        if (!existingPlant.images || existingPlant.images.length === 0) {
            existingPlant.images = gtData.images;
            updated = true;
        } else {
            // Merge images, keeping unique ones
            const merged = [...existingPlant.images];
            gtData.images.forEach(img => {
                if (!merged.includes(img)) {
                    merged.push(img);
                }
            });
            if (merged.length > existingPlant.images.length) {
                existingPlant.images = merged;
                updated = true;
            }
        }
    }
    
    // Update care info if current is generic
    if (gtData.lightRequirements && existingPlant.lightRequirements === 'Bright Indirect to Medium Light') {
        existingPlant.lightRequirements = gtData.lightRequirements;
        updated = true;
    }
    
    if (gtData.humidity && existingPlant.humidity === 'High (60-80%)') {
        existingPlant.humidity = gtData.humidity;
        updated = true;
    }
    
    if (gtData.temperature && existingPlant.temperature === '18-24°C') {
        existingPlant.temperature = gtData.temperature;
        updated = true;
    }
    
    // Don't update size if it's just pot size info
    if (gtData.size && (existingPlant.size === 'Varies' || !existingPlant.size)) {
        // Only use if it's actual plant size, not pot size
        if (!gtData.size.match(/^\d+cm$/)) {
            existingPlant.size = gtData.size;
            updated = true;
        }
    }
    
    return updated;
}

/**
 * Create new plant from GrowTropicals data
 */
function createNewPlant(gtData, category = 'additional') {
    // Determine tags based on category and description
    const tags = [];
    const desc = (gtData.description || '').toLowerCase();
    
    if (gtData.category && gtData.category.includes('terrarium')) {
        tags.push('terrarium');
    } else {
        tags.push('terrarium'); // Default
    }
    
    if (desc.includes('aquatic') || desc.includes('submerged')) {
        tags.push('aquarium');
    }
    
    if (desc.includes('succulent') || desc.includes('cactus')) {
        tags.push('desertarium');
    }
    
    if (desc.includes('air plant') || desc.includes('tillandsia')) {
        tags.push('aerarium');
    }
    
    // Determine vivarium type
    const vivariumTypes = [];
    if (tags.includes('terrarium')) vivariumTypes.push('Closed Terrarium');
    if (tags.includes('aquarium')) vivariumTypes.push('Aquarium');
    if (tags.includes('desertarium')) vivariumTypes.push('Desertarium');
    if (tags.includes('aerarium')) vivariumTypes.push('Aerarium');
    
    return {
        id: Date.now(), // Temporary ID
        name: gtData.name,
        scientificName: gtData.scientificName || '',
        type: tags,
        imageUrl: gtData.imageUrl || '',
        images: gtData.images || [],
        difficulty: gtData.difficulty || 'Moderate',
        lightRequirements: gtData.lightRequirements || 'Bright Indirect to Medium Light',
        humidity: gtData.humidity || 'High (60-80%)',
        temperature: gtData.temperature || '18-24°C',
        watering: gtData.watering || 'Keep soil moist, not soggy',
        substrate: gtData.substrate || 'Well-draining mix',
        size: gtData.size || 'Varies',
        growthRate: gtData.growthRate || 'Moderate',
        description: gtData.description || 'No description available',
        careTips: gtData.careTips || [],
        compatibility: gtData.compatibility || 'Suitable for terrarium environments',
        vivariumType: vivariumTypes,
        taxonomy: gtData.taxonomy || { kingdom: 'Plantae' },
        source: 'GrowTropicals',
        sourceUrl: gtData.sourceUrl
    };
}

/**
 * Main integration function
 */
async function main() {
    console.log('🔗 Integrating GrowTropicals Data...\n');
    
    // Load GrowTropicals data
    console.log('📥 Loading GrowTropicals data...');
    const gtFiles = await fs.readdir(GROWTROPICALS_DIR);
    const gtPlants = [];
    
    for (const file of gtFiles.filter(f => f.endsWith('.json'))) {
        const filePath = path.join(GROWTROPICALS_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        gtPlants.push(plant);
    }
    
    console.log(`   Loaded ${gtPlants.length} plants from GrowTropicals\n`);
    
    // Load existing plants
    console.log('📚 Loading existing plants...');
    const existingPlants = await loadExistingPlants();
    console.log(`   Found ${existingPlants.length} existing plants\n`);
    
    let updated = 0;
    let added = 0;
    const newPlants = [];
    
    // Track processed scientific names to avoid duplicates
    const processedScientificNames = new Set();
    const processedCommonNames = new Set();
    
    // Filter out non-plants from GrowTropicals data
    const nonPlantKeywords = [
        'kratiste', 'support', 'pole', 'pot', 'planter', 'gift', 'card',
        'substrate', 'soil', 'mix', 'fertilizer', 'tool', 'accessory'
    ];
    
    const filteredPlants = gtPlants.filter(plant => {
        const nameLower = (plant.name || '').toLowerCase();
        return !nonPlantKeywords.some(keyword => nameLower.includes(keyword));
    });
    
    console.log(`📦 Filtered to ${filteredPlants.length} plants (removed ${gtPlants.length - filteredPlants.length} non-plants)\n`);
    
    // Process each GrowTropicals plant
    for (const gtPlant of filteredPlants) {
        const gtSciNorm = normalizeScientific(gtPlant.scientificName);
        const gtNameNorm = normalizeName(gtPlant.name);
        
        // Skip if we've already processed this species (to avoid baby/adult duplicates)
        if (gtSciNorm && processedScientificNames.has(gtSciNorm)) {
            // Check if it's a different variant
            const existingMatch = existingPlants.find(p => 
                normalizeScientific(p.scientificName) === gtSciNorm
            );
            
            if (existingMatch && isDifferentVariant(gtPlant, existingMatch)) {
                // Different variant - create new entry
                const newPlant = createNewPlant(gtPlant);
                newPlants.push(newPlant);
                added++;
                console.log(`➕ New variant: ${gtPlant.name} (${gtSciNorm})`);
            } else {
                // Same species, skip duplicate
                continue;
            }
        } else {
            const match = findMatchingPlant(gtPlant, existingPlants);
            
            if (match) {
                // Enhance existing plant
                const wasUpdated = enhancePlant(match, gtPlant);
                if (wasUpdated) {
                    await fs.writeFile(match.filePath, JSON.stringify(match, null, 2));
                    updated++;
                    console.log(`✅ Enhanced: ${match.name}`);
                }
                
                // Mark as processed
                if (gtSciNorm) processedScientificNames.add(gtSciNorm);
                processedCommonNames.add(gtNameNorm);
            } else {
                // Check if name is too similar (avoid duplicates)
                const isDuplicate = Array.from(processedCommonNames).some(procName => {
                    return gtNameNorm.includes(procName) || procName.includes(gtNameNorm);
                });
                
                if (!isDuplicate) {
                    // New plant - add to list
                    const newPlant = createNewPlant(gtPlant);
                    newPlants.push(newPlant);
                    added++;
                    console.log(`➕ New plant: ${gtPlant.name}${gtSciNorm ? ` (${gtSciNorm})` : ''}`);
                    
                    if (gtSciNorm) processedScientificNames.add(gtSciNorm);
                    processedCommonNames.add(gtNameNorm);
                }
            }
        }
    }
    
    // Save new plants
    if (newPlants.length > 0) {
        console.log(`\n💾 Saving ${newPlants.length} new plants...`);
        const additionalDir = path.join(PLANTS_DIR, 'additional');
        
        for (const newPlant of newPlants) {
            const filename = newPlant.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') + '.json';
            
            const filepath = path.join(additionalDir, filename);
            await fs.writeFile(filepath, JSON.stringify(newPlant, null, 2));
        }
    }
    
    console.log(`\n\n✅ Integration complete!`);
    console.log(`   Enhanced: ${updated} existing plants`);
    console.log(`   Added: ${added} new plants`);
}

main().catch(console.error);

