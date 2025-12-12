// Script to verify all plants have species-level identifiers and unique IDs

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Recursively find all JSON plant files
 */
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

/**
 * Check if scientific name is at species level
 */
function isSpeciesLevel(scientificName) {
    if (!scientificName) return false;
    
    // Genus-only indicators
    if (scientificName.includes('spp.')) return false;
    if (scientificName === 'Bromeliaceae') return false;
    if (scientificName === 'Various genera') return false;
    
    // Check if it has a species component (at least two words)
    const parts = scientificName.trim().split(/\s+/);
    if (parts.length < 2) return false;
    
    // Hybrids (with 'x') are species-level
    if (scientificName.includes(' x ')) return true;
    
    // Cultivar names in quotes are acceptable
    if (scientificName.includes("'")) return true;
    
    // Check if second part is a valid species name (not a qualifier)
    const speciesPart = parts[1].toLowerCase();
    if (speciesPart.includes('miniature') || 
        speciesPart.includes('small') ||
        speciesPart.includes('varieties') ||
        speciesPart.includes('various')) {
        return false;
    }
    
    return true;
}

/**
 * Extract genus from scientific name
 */
function extractGenus(scientificName) {
    if (!scientificName) return null;
    const parts = scientificName.trim().split(/\s+/);
    return parts[0];
}

/**
 * Main verification function
 */
async function main() {
    console.log('🔍 Verifying all plants have species-level identifiers...\n');
    
    const plantFiles = await findPlantFiles(PLANTS_DIR);
    console.log(`Found ${plantFiles.length} plant files\n`);
    
    const plants = [];
    const genusLevelPlants = [];
    const idMap = new Map();
    const duplicateIds = [];
    const speciesCounts = new Map();
    
    for (const filePath of plantFiles) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            const relativePath = path.relative(PLANTS_DIR, filePath);
            
            // Check ID uniqueness
            if (plant.id !== undefined) {
                if (idMap.has(plant.id)) {
                    duplicateIds.push({
                        id: plant.id,
                        files: [idMap.get(plant.id), relativePath]
                    });
                } else {
                    idMap.set(plant.id, relativePath);
                }
            }
            
            // Check species level
            if (!isSpeciesLevel(plant.scientificName)) {
                genusLevelPlants.push({
                    file: relativePath,
                    name: plant.name,
                    scientificName: plant.scientificName,
                    id: plant.id
                });
            }
            
            // Count species occurrences
            if (plant.scientificName) {
                const key = plant.scientificName.toLowerCase();
                if (!speciesCounts.has(key)) {
                    speciesCounts.set(key, []);
                }
                speciesCounts.get(key).push({
                    file: relativePath,
                    id: plant.id,
                    name: plant.name
                });
            }
            
            plants.push({
                id: plant.id,
                name: plant.name,
                scientificName: plant.scientificName,
                file: relativePath
            });
        } catch (error) {
            console.error(`❌ Error processing ${filePath}:`, error.message);
        }
    }
    
    // Report results
    console.log('='.repeat(60));
    console.log('VERIFICATION RESULTS');
    console.log('='.repeat(60));
    
    // Check IDs
    if (duplicateIds.length > 0) {
        console.log(`\n❌ Found ${duplicateIds.length} duplicate IDs:`);
        duplicateIds.forEach(dup => {
            console.log(`   ID ${dup.id}: ${dup.files.join(' and ')}`);
        });
    } else {
        console.log(`\n✅ All ${idMap.size} plant IDs are unique`);
    }
    
    // Check species level
    if (genusLevelPlants.length > 0) {
        console.log(`\n❌ Found ${genusLevelPlants.length} plants still at genus level:`);
        genusLevelPlants.forEach(plant => {
            console.log(`   ${plant.file}: ${plant.scientificName} (ID: ${plant.id})`);
        });
    } else {
        console.log(`\n✅ All ${plants.length} plants are at species level`);
    }
    
    // Report duplicate species (same species, different IDs - acceptable for different contexts)
    const duplicateSpecies = Array.from(speciesCounts.entries())
        .filter(([_, files]) => files.length > 1)
        .map(([species, files]) => ({ species, files }));
    
    if (duplicateSpecies.length > 0) {
        console.log(`\n📋 Found ${duplicateSpecies.length} species used in multiple contexts (acceptable):`);
        duplicateSpecies.forEach(({ species, files }) => {
            console.log(`   ${species}:`);
            files.forEach(f => {
                console.log(`      - ${f.file} (ID: ${f.id}) - ${f.name}`);
            });
        });
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total plants: ${plants.length}`);
    console.log(`Unique IDs: ${idMap.size}`);
    console.log(`Species-level entries: ${plants.length - genusLevelPlants.length}`);
    console.log(`Genus-level entries: ${genusLevelPlants.length}`);
    
    if (duplicateIds.length === 0 && genusLevelPlants.length === 0) {
        console.log('\n✅ All requirements met!');
        console.log('   - All plants have unique IDs');
        console.log('   - All plants are at species level');
        return true;
    } else {
        console.log('\n⚠️  Some issues need to be resolved');
        return false;
    }
}

// Run
main().catch(console.error).then(success => {
    process.exit(success ? 0 : 1);
});

