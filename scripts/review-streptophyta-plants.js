/**
 * Script to review plants with Streptophyta phylum
 * Checks if they should be Tracheophyta instead
 * 
 * Streptophyta is a broader clade that includes:
 * - Tracheophyta (vascular plants with xylem/phloem)
 * - Bryophyta (non-vascular plants like mosses)
 * 
 * Tracheophyta includes all vascular plants (ferns, gymnosperms, flowering plants)
 * Most plants in this collection should be Tracheophyta, not Streptophyta
 */

const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Non-vascular plant classes that should stay in Streptophyta
const NON_VASCULAR_CLASSES = [
    'bryopsida', 'bryophyta', 'marchantiopsida', 'anthocerotopsida',
    'hepaticopsida', 'hornworts', 'liverworts'
];

// Vascular plant classes that should be Tracheophyta
const VASCULAR_CLASSES = [
    'polypodiopsida', 'lycopodiopsida', 'pinopsida', 'gnetopsida',
    'cycadopsida', 'magnoliopsida', 'liliopsida', 'equisetopsida',
    'psilotopsida', 'marattiopsida', 'osmundopsida', 'gleicheniopsida',
    'schizaeopsida', 'salviniales', 'cyatheales', 'polypodiales'
];

function shouldBeTracheophyta(plant) {
    if (!plant.taxonomy) return false;
    
    const phylum = (plant.taxonomy.phylum || '').toLowerCase();
    const phylumClass = (plant.taxonomy.class || '').toLowerCase();
    const family = (plant.taxonomy.family || '').toLowerCase();
    
    // If already Tracheophyta, skip
    if (phylum === 'tracheophyta') return false;
    
    // If not Streptophyta, skip
    if (phylum !== 'streptophyta') return false;
    
    // Check if it's a non-vascular plant (should stay Streptophyta)
    if (NON_VASCULAR_CLASSES.some(c => phylumClass.includes(c))) {
        return false; // Should stay Streptophyta
    }
    
    // Check if it's a vascular plant (should be Tracheophyta)
    if (VASCULAR_CLASSES.some(c => phylumClass.includes(c))) {
        return true; // Should be Tracheophyta
    }
    
    // Check by family - most plant families are vascular
    // Bryophytes (mosses) families
    const bryophyteFamilies = ['bryaceae', 'polytrichaceae', 'sphagnaceae', 
                               'marchantiaceae', 'ricciaceae', 'lunulariaceae'];
    if (bryophyteFamilies.some(f => family.includes(f))) {
        return false; // Should stay Streptophyta
    }
    
    // If we have a class but it's not in our lists, assume vascular (most plants are)
    if (phylumClass && phylumClass !== 'unknown') {
        return true; // Likely vascular, should be Tracheophyta
    }
    
    // If we have a family, assume vascular (most plant families are vascular)
    if (family && family !== 'unknown') {
        return true; // Likely vascular, should be Tracheophyta
    }
    
    // Default: if we can't determine, assume vascular (most plants in collection are)
    return true;
}

function main() {
    console.log('🔍 Reviewing plants with Streptophyta phylum...\n');
    
    if (!fs.existsSync(PLANTS_DIR)) {
        console.error(`❌ Plants directory not found: ${PLANTS_DIR}`);
        process.exit(1);
    }
    
    const files = fs.readdirSync(PLANTS_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(PLANTS_DIR, file));
    
    const streptophytaPlants = [];
    const shouldUpdate = [];
    
    files.forEach(filePath => {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            if (plant.taxonomy && plant.taxonomy.phylum === 'Streptophyta') {
                streptophytaPlants.push({
                    file: path.basename(filePath),
                    plant: plant
                });
                
                if (shouldBeTracheophyta(plant)) {
                    shouldUpdate.push({
                        file: path.basename(filePath),
                        plant: plant
                    });
                }
            }
        } catch (error) {
            // Skip invalid files
        }
    });
    
    console.log(`📊 Found ${streptophytaPlants.length} plants with Streptophyta phylum\n`);
    
    if (shouldUpdate.length > 0) {
        console.log(`✅ ${shouldUpdate.length} plants should be updated to Tracheophyta:\n`);
        shouldUpdate.forEach(({ file, plant }) => {
            console.log(`  - ${file}`);
            console.log(`    Name: ${plant.scientificName || plant.name}`);
            console.log(`    Class: ${plant.taxonomy.class || 'Unknown'}`);
            console.log(`    Family: ${plant.taxonomy.family || 'Unknown'}`);
            console.log('');
        });
    } else {
        console.log('✅ All Streptophyta plants are correctly classified (non-vascular)\n');
    }
    
    const nonVascular = streptophytaPlants.length - shouldUpdate.length;
    if (nonVascular > 0) {
        console.log(`ℹ️  ${nonVascular} plants correctly remain as Streptophyta (non-vascular)\n`);
    }
    
    return shouldUpdate;
}

if (require.main === module) {
    const shouldUpdate = main();
    
    if (shouldUpdate.length > 0) {
        console.log('\n💡 To update these plants, run:');
        console.log('   node scripts/update-streptophyta-to-tracheophyta.js');
    }
}

module.exports = { shouldBeTracheophyta, main };

