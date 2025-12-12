const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

/**
 * Determine propagation method based on plant characteristics
 */
function determinePropagation(plant) {
    const plantType = (plant.plantType || '').toLowerCase();
    const growthHabit = (plant.growthHabit || '').toLowerCase();
    const growthPattern = (plant.growthPattern || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    const name = (plant.name || '').toLowerCase();
    const scientificName = (plant.scientificName || '').toLowerCase();
    
    // Check careTips for existing propagation info
    const careTips = Array.isArray(plant.careTips) ? plant.careTips : [];
    const propagationFromTips = careTips.find(tip => 
        tip.toLowerCase().includes('propagat') || 
        tip.toLowerCase().includes('division') ||
        tip.toLowerCase().includes('cutting') ||
        tip.toLowerCase().includes('spore')
    );
    
    if (propagationFromTips) {
        // Extract propagation method from care tips
        if (propagationFromTips.toLowerCase().includes('division')) {
            return 'Division, stem cuttings';
        }
        if (propagationFromTips.toLowerCase().includes('cutting')) {
            return 'Stem cuttings, division';
        }
        if (propagationFromTips.toLowerCase().includes('spore')) {
            return 'Spores';
        }
    }
    
    // Mosses and liverworts
    if (plantType === 'moss' || category.includes('moss')) {
        if (growthHabit === 'aquatic') {
            return 'Division, trimming and reattachment';
        }
        return 'Division, spores';
    }
    
    // Ferns
    if (plantType === 'fern' || category.includes('fern') || scientificName.includes('fern')) {
        return 'Spores, division';
    }
    
    // Algae
    if (plantType === 'algae' || category.includes('algae')) {
        return 'Division, fragmentation';
    }
    
    // Aquatic plants
    if (growthHabit === 'aquatic' || category.includes('aquatic')) {
        if (growthPattern.includes('carpet') || growthPattern.includes('mat')) {
            return 'Division, runners, trimming';
        }
        return 'Stem cuttings, division';
    }
    
    // Epiphytic plants (orchids, air plants, etc.)
    if (growthHabit === 'epiphytic' || category.includes('air-plant') || category.includes('orchid')) {
        if (plantType === 'orchid') {
            return 'Division, keiki, seed';
        }
        return 'Division, offsets, pups';
    }
    
    // Succulents and cacti
    if (category.includes('succulent') || category.includes('cactus')) {
        return 'Leaf cuttings, stem cuttings, offsets';
    }
    
    // Vining plants
    if (growthPattern.includes('vining') || growthPattern.includes('trailing') || category.includes('creeper')) {
        return 'Stem cuttings, layering';
    }
    
    // Carpeting/ground cover
    if (growthPattern.includes('carpet') || growthPattern.includes('mat')) {
        return 'Division, stem cuttings';
    }
    
    // Bulbous plants
    if (category.includes('bulb') || name.includes('bulb')) {
        return 'Division, offsets';
    }
    
    // Flowering plants (general)
    if (plantType === 'flowering plant') {
        if (growthPattern.includes('bushy') || growthPattern.includes('upright')) {
            return 'Stem cuttings, division, seed';
        }
        return 'Stem cuttings, division';
    }
    
    // Default for terrestrial plants
    if (growthHabit === 'terrestrial') {
        return 'Stem cuttings, division';
    }
    
    // Fallback
    return 'Stem cuttings, division';
}

/**
 * Process a single plant file
 */
async function processPlantFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        // Skip if propagation already exists and is not empty
        if (plant.propagation && plant.propagation.trim() !== '') {
            return { skipped: true, name: plant.name };
        }
        
        // Determine propagation method
        plant.propagation = determinePropagation(plant);
        
        // Write back to file
        await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        
        return { updated: true, name: plant.name, propagation: plant.propagation };
    } catch (error) {
        return { error: true, file: path.basename(filePath), message: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🌱 Adding propagation methods to all plants...\n');
    
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        console.log(`Found ${jsonFiles.length} plant files\n`);
        
        const results = {
            updated: [],
            skipped: [],
            errors: []
        };
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const result = await processPlantFile(filePath);
            
            if (result.error) {
                results.errors.push(result);
                console.error(`❌ Error processing ${result.file}: ${result.message}`);
            } else if (result.skipped) {
                results.skipped.push(result);
            } else if (result.updated) {
                results.updated.push(result);
                console.log(`✅ ${result.name}: ${result.propagation}`);
            }
        }
        
        console.log(`\n📊 Summary:`);
        console.log(`   ✅ Updated: ${results.updated.length}`);
        console.log(`   ⏭️  Skipped (already had propagation): ${results.skipped.length}`);
        console.log(`   ❌ Errors: ${results.errors.length}`);
        
        if (results.errors.length > 0) {
            console.log(`\n⚠️  Errors encountered:`);
            results.errors.forEach(err => {
                console.log(`   - ${err.file}: ${err.message}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { determinePropagation, processPlantFile };

