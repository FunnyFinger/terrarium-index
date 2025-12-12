// Script to update all genus-level plants to species-level identifiers
// Ensures each plant has a unique species-level ID

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Species assignments for common genus-level entries
// Based on most common terrarium/vivarium species
const SPECIES_ASSIGNMENTS = {
    'Dischidia spp.': 'Dischidia ovata',
    'Myrmecodia spp.': 'Myrmecodia tuberosa',
    'Peperomia spp.': 'Peperomia caperata',
    'Selaginella spp.': 'Selaginella kraussiana',
    'Utricularia spp.': 'Utricularia gibba',
    'Heliamphora spp.': 'Heliamphora minor',
    'Drosera spp. (Miniature)': 'Drosera capensis',
    'Begonia spp.': 'Begonia rex',
    'Bromeliaceae': 'Guzmania lingulata', // Family level -> common species
    'Mammillaria spp. (Miniature)': 'Mammillaria hahniana',
    'Echinocactus spp. (Miniature)': 'Echinocactus grusonii',
    'Sedum spp. (Miniature)': 'Sedum morganianum',
    'Rhipsalis spp.': 'Rhipsalis baccifera',
    'Lithops spp.': 'Lithops hookeri',
    'Haworthia spp.': 'Haworthia cooperi',
    'Echeveria spp. (Miniature)': 'Echeveria elegans',
    'Crassula spp. (Miniature)': 'Crassula ovata',
    'Aloe spp. (Miniature)': 'Aloe vera',
    'Pleurothallis spp.': 'Pleurothallis grobyi',
    'Phalaenopsis spp. (Miniature)': 'Phalaenopsis amabilis',
    'Masdevallia spp.': 'Masdevallia veitchiana',
    'Lepanthes spp.': 'Lepanthes calodictyon',
    'Dracula spp.': 'Dracula vampira',
    'Bulbophyllum spp. (Miniature)': 'Bulbophyllum medusae',
    'Sphagnum spp.': 'Sphagnum palustre',
    'Hypnum spp.': 'Hypnum cupressiforme',
    'Sarracenia spp. (Small varieties)': 'Sarracenia purpurea',
    'Pinguicula spp.': 'Pinguicula moranensis',
    'Nepenthes spp. (Small varieties)': 'Nepenthes ventricosa',
    'Vallisneria spp.': 'Vallisneria spiralis',
    'Cryptocoryne spp.': 'Cryptocoryne wendtii',
    'Halimeda spp.': 'Halimeda opuntia',
    'Gracilaria spp.': 'Gracilaria verrucosa',
    'Tillandsia spp. (Miniature)': 'Tillandsia stricta',
    'Various genera': 'Cladonia rangiferina' // Common lichen species
};

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
 * Extract genus from scientific name
 */
function extractGenus(scientificName) {
    if (!scientificName) return null;
    const parts = scientificName.trim().split(/\s+/);
    return parts[0];
}

/**
 * Extract species from scientific name
 */
function extractSpecies(scientificName) {
    if (!scientificName) return null;
    const parts = scientificName.trim().split(/\s+/);
    if (parts.length >= 2 && !parts[1].toLowerCase().includes('spp') && parts[1] !== '(Miniature)' && parts[1] !== '(Small') {
        return parts[1].replace(/[()]/g, '');
    }
    return null;
}

/**
 * Update plant to species level
 */
function updatePlantToSpeciesLevel(plant) {
    const originalName = plant.scientificName;
    
    if (!originalName) {
        return { updated: false, plant };
    }
    
    // Skip if already at species level (has species name, not just genus)
    // Hybrids (with 'x') are considered species-level
    if (originalName.includes(' x ') && !originalName.includes('spp.')) {
        return { updated: false, plant }; // Hybrids are valid species-level identifiers
    }
    
    if (!originalName.includes('spp.') && !originalName.includes('Bromeliaceae') && !originalName.includes('Various genera')) {
        const species = extractSpecies(originalName);
        // Check if it's a valid species (not a variety/cultivar marker)
        if (species && species.length > 2 && 
            !species.toLowerCase().includes('miniature') && 
            !species.toLowerCase().includes('var') &&
            !species.toLowerCase().includes('cultivar')) {
            return { updated: false, plant };
        }
    }
    
    // Get species assignment - try exact match first
    let newScientificName = SPECIES_ASSIGNMENTS[originalName];
    
    if (!newScientificName) {
        // Try to find by genus (remove parenthetical notes for matching)
        const genus = extractGenus(originalName);
        if (genus) {
            // Find any key that starts with this genus
            const genusKey = Object.keys(SPECIES_ASSIGNMENTS).find(k => {
                const keyGenus = extractGenus(k);
                return keyGenus && keyGenus.toLowerCase() === genus.toLowerCase();
            });
            if (genusKey) {
                newScientificName = SPECIES_ASSIGNMENTS[genusKey];
            }
        }
    }
    
    if (!newScientificName) {
        console.warn(`⚠️  No species assignment found for: ${originalName}`);
        return { updated: false, plant };
    }
    
    // Update scientific name
    const oldScientificName = plant.scientificName;
    plant.scientificName = newScientificName;
    
    // Update taxonomy
    if (!plant.taxonomy) {
        plant.taxonomy = {};
    }
    
    const parts = newScientificName.split(' ');
    if (parts.length >= 2) {
        plant.taxonomy.genus = parts[0];
        plant.taxonomy.species = parts[1];
    }
    
    // Ensure kingdom
    if (!plant.taxonomy.kingdom) {
        plant.taxonomy.kingdom = 'Plantae';
    }
    
    console.log(`✅ Updated: ${oldScientificName} → ${newScientificName}`);
    
    return { updated: true, plant };
}

/**
 * Main function
 */
async function main() {
    console.log('🔍 Scanning for genus-level plants...\n');
    
    const plantFiles = await findPlantFiles(PLANTS_DIR);
    console.log(`Found ${plantFiles.length} plant files\n`);
    
    let updatedCount = 0;
    const updates = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            const result = updatePlantToSpeciesLevel(plant);
            
            if (result.updated) {
                // Write updated plant back
                await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
                updatedCount++;
                updates.push({
                    file: path.relative(PLANTS_DIR, filePath),
                    old: plant.scientificName === result.plant.scientificName ? 'N/A' : extractGenus(plant.scientificName) + ' spp.',
                    new: plant.scientificName
                });
            }
        } catch (error) {
            console.error(`❌ Error processing ${filePath}:`, error.message);
        }
    }
    
    console.log(`\n✅ Updated ${updatedCount} plants to species level`);
    
    if (updates.length > 0) {
        console.log('\n📋 Summary of updates:');
        updates.forEach(update => {
            console.log(`   ${update.file}: ${update.old} → ${update.new}`);
        });
    }
    
    // Verify uniqueness
    console.log('\n🔍 Verifying species uniqueness...');
    const allSpecies = new Map();
    const duplicates = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            if (plant.scientificName) {
                const key = plant.scientificName.toLowerCase();
                if (allSpecies.has(key)) {
                    duplicates.push({
                        file: path.relative(PLANTS_DIR, filePath),
                        species: plant.scientificName,
                        existing: allSpecies.get(key)
                    });
                } else {
                    allSpecies.set(key, path.relative(PLANTS_DIR, filePath));
                }
            }
        } catch (error) {
            // Skip errors
        }
    }
    
    if (duplicates.length > 0) {
        console.warn(`\n⚠️  Found ${duplicates.length} duplicate species:`);
        duplicates.forEach(dup => {
            console.warn(`   ${dup.species}: ${dup.existing} and ${dup.file}`);
        });
    } else {
        console.log('✅ All species are unique!');
    }
}

// Run
main().catch(console.error);

