// Final integration: Move Araflora plants to proper folders and update indexes
// Filters duplicates, validates data, and organizes everything

const fs = require('fs').promises;
const path = require('path');

// Support both old and new extraction directories
const ARAFLORA_IMPORT_DIR = path.join(__dirname, '..', 'data', 'plants', 'araflora-import');
const ARAFLORA_ALL_DIR = path.join(__dirname, '..', 'data', 'araflora-all');
const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Load existing plants to check for duplicates
 */
async function loadExistingPlants() {
    const existing = new Map();
    
    async function scanFolder(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && entry.name !== 'araflora-import') {
                await scanFolder(fullPath);
            } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
                try {
                    const content = await fs.readFile(fullPath, 'utf8');
                    const plant = JSON.parse(content);
                    const key = (plant.scientificName || plant.name || '').toLowerCase().trim();
                    if (key) {
                        existing.set(key, { path: fullPath, plant });
                    }
                } catch {}
            }
        }
    }
    
    await scanFolder(PLANTS_DIR);
    return existing;
}

/**
 * Determine correct category folder for a plant
 */
function determineCategory(plant) {
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    
    // Carnivorous
    if (name.includes('pitcher') || name.includes('sundew') || 
        name.includes('flytrap') || name.includes('bladderwort') ||
        scientific.includes('drosera') || scientific.includes('nepenthes') ||
        scientific.includes('sarracenia') || scientific.includes('utricularia') ||
        scientific.includes('cephalotus') || scientific.includes('pinguicula') ||
        scientific.includes('darlingtonia')) {
        return 'carnivorous';
    }
    
    // Orchids
    if (name.includes('orchid') || scientific.includes('orchid') ||
        scientific.match(/\b(phalaenopsis|dendrobium|masdevallia|pleurothallis|bulbophyllum|aerangis|promenaea)\b/)) {
        return 'orchids';
    }
    
    // Ferns
    if (name.includes('fern') || scientific.match(/\b(adiantum|asplenium|pteris|nephrolepis|actiniopteris|aglaomorpha)\b/)) {
        return 'ferns';
    }
    
    // Air plants
    if (name.includes('tillandsia') || name.includes('air plant') || 
        scientific.includes('tillandsia')) {
        return 'air-plants';
    }
    
    // Aquarium
    if (name.includes('aquarium') || scientific.includes('aquatic')) {
        return 'aquarium';
    }
    
    // Default
    return 'additional';
}

/**
 * Check if plant is a duplicate or invalid
 */
function isValidPlant(plant, existingPlants) {
    // Skip packages, media, accessories
    const name = (plant.name || '').toLowerCase();
    if (name.includes('package') || 
        name.includes('media') ||
        name.includes('potting') ||
        name.includes('sphagnum') && name.includes('fine') ||
        name.includes('accessory')) {
        return { valid: false, reason: 'Not a plant product' };
    }
    
    // Check for duplicates by scientific name
    const scientificKey = (plant.scientificName || '').toLowerCase().trim();
    if (scientificKey && existingPlants.has(scientificKey)) {
        const existing = existingPlants.get(scientificKey);
        // If same scientific name, might be size variant (skip duplicates)
        if (existing.plant.name.toLowerCase() === plant.name.toLowerCase()) {
            return { valid: false, reason: 'Duplicate species' };
        }
    }
    
    // Must have a name
    if (!plant.name || plant.name.length < 2) {
        return { valid: false, reason: 'Missing name' };
    }
    
    return { valid: true };
}

/**
 * Clean up plant data
 */
function cleanPlantData(plant) {
    // Remove temporary fields
    delete plant.source;
    delete plant.sourceUrl;
    delete plant.attribution;
    delete plant.arafloraData;
    
    // Ensure required fields
    if (!plant.vivariumType || plant.vivariumType.length === 0) {
        plant.vivariumType = ['Closed Terrarium'];
    }
    
    if (!plant.type || plant.type.length === 0) {
        plant.type = ['vivarium', 'terrarium'];
    }
    
    // Ensure taxonomy has at least kingdom
    if (!plant.taxonomy) {
        plant.taxonomy = { kingdom: 'Plantae' };
    }
    
    return plant;
}

/**
 * Update category index.json
 */
async function updateCategoryIndex(categoryFolder, newPlantFile) {
    const indexFile = path.join(PLANTS_DIR, categoryFolder, 'index.json');
    
    let index = { plants: [], count: 0 };
    
    try {
        const content = await fs.readFile(indexFile, 'utf8');
        index = JSON.parse(content);
    } catch {
        // Create new index
    }
    
    const filename = path.basename(newPlantFile);
    if (!index.plants.includes(filename)) {
        index.plants.push(filename);
        index.count = index.plants.length;
        await fs.writeFile(indexFile, JSON.stringify(index, null, 2));
    }
}

/**
 * Update main index.json
 */
async function updateMainIndex(newCount) {
    const indexFile = path.join(PLANTS_DIR, 'index.json');
    
    let index = { totalPlants: 113, categories: [], categoryCounts: {} };
    
    try {
        const content = await fs.readFile(indexFile, 'utf8');
        index = JSON.parse(content);
    } catch {}
    
    index.totalPlants = newCount;
    index.lastUpdated = new Date().toISOString();
    
    await fs.writeFile(indexFile, JSON.stringify(index, null, 2));
}

/**
 * Main integration function
 */
async function main() {
    console.log('🔧 Finalizing Araflora Integration...\n');
    
    // Load existing plants
    console.log('📚 Loading existing database...');
    const existingPlants = await loadExistingPlants();
    console.log(`   Found ${existingPlants.size} existing plants\n`);
    
    // Get all imported plants (check both directories, prefer araflora-all)
    let importFiles = [];
    let dirToUse = ARAFLORA_ALL_DIR;
    
    try {
        // First try the new comprehensive extraction directory
        importFiles = await fs.readdir(ARAFLORA_ALL_DIR);
        dirToUse = ARAFLORA_ALL_DIR;
        console.log('   ✅ Using comprehensive extraction directory (araflora-all)');
    } catch {
        try {
            // Fallback to old directory
            importFiles = await fs.readdir(ARAFLORA_IMPORT_DIR);
            dirToUse = ARAFLORA_IMPORT_DIR;
            console.log('   ✅ Using old extraction directory (araflora-import)');
        } catch {
            console.log('❌ No Araflora data found. Run extract-all-araflora-plants.js first.');
            return;
        }
    }
    
    const plantFiles = importFiles.filter(f => 
        f.endsWith('.json') && 
        f !== 'import-summary.json' && 
        f !== 'extraction-summary.json'
    );
    
    console.log(`   Using directory: ${dirToUse}`);
    
    console.log(`📦 Processing ${plantFiles.length} imported plants...\n`);
    
    let added = 0;
    let skipped = 0;
    const stats = {};
    
    for (const file of plantFiles) {
        const filePath = path.join(dirToUse, file);
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            // Validate
            const validation = isValidPlant(plant, existingPlants);
            if (!validation.valid) {
                console.log(`⏭️  Skipping ${plant.name}: ${validation.reason}`);
                skipped++;
                continue;
            }
            
            // Determine category
            const category = determineCategory(plant);
            
            // Clean plant data
            const cleanedPlant = cleanPlantData(plant);
            
            // Copy to category folder
            const categoryDir = path.join(PLANTS_DIR, category);
            await fs.mkdir(categoryDir, { recursive: true });
            
            const destPath = path.join(categoryDir, file);
            await fs.writeFile(destPath, JSON.stringify(cleanedPlant, null, 2));
            
            // Update category index
            await updateCategoryIndex(category, destPath);
            
            // Track in existing plants
            const scientificKey = (plant.scientificName || '').toLowerCase().trim();
            if (scientificKey) {
                existingPlants.set(scientificKey, { path: destPath, plant: cleanedPlant });
            }
            
            stats[category] = (stats[category] || 0) + 1;
            added++;
            
            console.log(`✅ Added: ${plant.name} → ${category}/ (ID: ${plant.id})`);
            
        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
        }
    }
    
    // Update main index with new total
    const totalCount = existingPlants.size;
    await updateMainIndex(totalCount);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('INTEGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Added: ${added} plants`);
    console.log(`⏭️  Skipped: ${skipped} plants`);
    console.log(`📊 Total in database: ${totalCount} plants\n`);
    console.log('By category:');
    Object.entries(stats).forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count}`);
    });
    
    console.log('\n✅ Integration complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Review the added plants');
    console.log('   2. Add more detailed care information where needed');
    console.log('   3. Verify scientific names');
    console.log('   4. Add taxonomy data using your taxonomy script');
    console.log('   5. Test the website to see new plants');
}

main().catch(console.error);

