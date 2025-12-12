// Script to help integrate Araflora plants into your database
// Compares Araflora plants with existing plants and suggests additions

const fs = require('fs').promises;
const path = require('path');

const ARAFLORA_DIR = path.join(__dirname, '..', 'data', 'araflora');
const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Load all existing plants
 */
async function loadExistingPlants() {
    const existingPlants = new Map();
    
    async function findPlantFiles(dir) {
        const files = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const subFiles = await findPlantFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
                files.push(fullPath);
            }
        }
        return files;
    }
    
    const plantFiles = await findPlantFiles(PLANTS_DIR);
    
    for (const filePath of plantFiles) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            // Index by scientific name (normalized) and common name
            const scientificKey = (plant.scientificName || '').toLowerCase().trim();
            const nameKey = (plant.name || '').toLowerCase().trim();
            
            if (scientificKey) existingPlants.set(scientificKey, plant);
            if (nameKey && nameKey !== scientificKey) existingPlants.set(nameKey, plant);
        } catch (error) {
            // Skip errors
        }
    }
    
    return existingPlants;
}

/**
 * Normalize scientific name for comparison
 */
function normalizeScientificName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/['"]/g, '') // Remove quotes
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();
}

/**
 * Check if plant already exists
 */
function plantExists(arafloraPlant, existingPlants) {
    const scientificName = normalizeScientificName(arafloraPlant.scientificName);
    const plantName = normalizeScientificName(arafloraPlant.name);
    
    // Check by scientific name
    if (scientificName && existingPlants.has(scientificName)) {
        return { exists: true, match: existingPlants.get(scientificName), by: 'scientificName' };
    }
    
    // Check by common name
    if (plantName && existingPlants.has(plantName)) {
        return { exists: true, match: existingPlants.get(plantName), by: 'name' };
    }
    
    // Check partial matches (genus level)
    if (scientificName) {
        const genus = scientificName.split(' ')[0];
        for (const [key, plant] of existingPlants.entries()) {
            if (key.startsWith(genus + ' ')) {
                return { exists: true, match: plant, by: 'genus', partial: true };
            }
        }
    }
    
    return { exists: false };
}

/**
 * Suggest category for plant
 */
function suggestCategory(plant) {
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    const desc = (plant.description || '').toLowerCase();
    
    if (name.includes('orchid') || scientific.includes('orchid')) return 'orchids';
    if (name.includes('fern') || scientific.includes('fern')) return 'ferns';
    if (name.includes('moss')) return 'mosses';
    if (name.includes('carnivorous') || name.includes('pitcher') || name.includes('sundew') || name.includes('flytrap')) return 'carnivorous';
    if (name.includes('cactus') || name.includes('cacti') || name.includes('succulent')) return 'succulents';
    if (name.includes('air plant') || name.includes('tillandsia')) return 'air-plants';
    if (desc.includes('aquarium') || desc.includes('aquatic')) return 'aquarium';
    
    return 'additional'; // Default
}

/**
 * Main function
 */
async function main() {
    console.log('🔍 Comparing Araflora plants with existing database...\n');
    
    // Load Araflora plants
    const arafloraFile = path.join(ARAFLORA_DIR, 'araflora-plants.json');
    let arafloraPlants = [];
    
    try {
        const content = await fs.readFile(arafloraFile, 'utf8');
        arafloraPlants = JSON.parse(content);
    } catch (error) {
        console.log('❌ No Araflora data found. Run fetch-araflora-data.js first.');
        return;
    }
    
    // Load existing plants
    const existingPlants = await loadExistingPlants();
    console.log(`📊 Loaded ${existingPlants.size} existing plants from database\n`);
    
    const newPlants = [];
    const existingMatches = [];
    
    for (const arafloraPlant of arafloraPlants) {
        const check = plantExists(arafloraPlant, existingPlants);
        
        if (check.exists) {
            existingMatches.push({
                araflora: arafloraPlant,
                existing: check.match,
                matchedBy: check.by,
                partial: check.partial || false
            });
        } else {
            newPlants.push(arafloraPlant);
        }
    }
    
    // Report results
    console.log('='.repeat(60));
    console.log('COMPARISON RESULTS');
    console.log('='.repeat(60));
    console.log(`\n✅ Existing plants: ${existingMatches.length}`);
    console.log(`🆕 New plants found: ${newPlants.length}\n`);
    
    if (newPlants.length > 0) {
        console.log('\n📋 NEW PLANTS TO ADD:');
        console.log('='.repeat(60));
        newPlants.forEach((plant, i) => {
            console.log(`\n${i + 1}. ${plant.name}`);
            console.log(`   Scientific: ${plant.scientificName || 'Not found'}`);
            console.log(`   Source: ${plant.sourceUrl}`);
            console.log(`   Suggested category: ${suggestCategory(plant)}`);
        });
        
        // Save new plants list
        const newPlantsFile = path.join(ARAFLORA_DIR, 'new-plants.json');
        await fs.writeFile(newPlantsFile, JSON.stringify(newPlants, null, 2));
        console.log(`\n💾 Saved new plants list to: ${newPlantsFile}`);
    }
    
    if (existingMatches.length > 0) {
        console.log('\n\n📋 EXISTING PLANTS (Already in database):');
        console.log('='.repeat(60));
        existingMatches.slice(0, 10).forEach((match, i) => {
            console.log(`\n${i + 1}. ${match.araflora.name}`);
            console.log(`   Matched with: ${match.existing.name} (${match.existing.scientificName})`);
            console.log(`   Matched by: ${match.matchedBy}${match.partial ? ' (partial/genus)' : ''}`);
        });
        if (existingMatches.length > 10) {
            console.log(`\n... and ${existingMatches.length - 10} more`);
        }
    }
    
    console.log('\n\n💡 Next steps:');
    console.log('   1. Review new-plants.json');
    console.log('   2. Manually add plants you want to include');
    console.log('   3. Use Araflora data as reference for care information');
    console.log('   4. Ensure proper attribution if using their descriptions');
}

main().catch(console.error);

