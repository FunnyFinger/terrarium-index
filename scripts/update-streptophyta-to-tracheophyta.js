/**
 * Script to update plants from Streptophyta to Tracheophyta phylum
 * All vascular plants should be Tracheophyta, not Streptophyta
 */

const fs = require('fs');
const path = require('path');
const { shouldBeTracheophyta } = require('./review-streptophyta-plants');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function updatePlantFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        if (!plant.taxonomy || plant.taxonomy.phylum !== 'Streptophyta') {
            return false;
        }
        
        if (shouldBeTracheophyta(plant)) {
            plant.taxonomy.phylum = 'Tracheophyta';
            fs.writeFileSync(filePath, JSON.stringify(plant, null, 4) + '\n', 'utf8');
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return false;
    }
}

function main() {
    console.log('🔄 Updating Streptophyta to Tracheophyta...\n');
    
    if (!fs.existsSync(PLANTS_DIR)) {
        console.error(`❌ Plants directory not found: ${PLANTS_DIR}`);
        process.exit(1);
    }
    
    const files = fs.readdirSync(PLANTS_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(PLANTS_DIR, file));
    
    let updated = 0;
    
    files.forEach(filePath => {
        if (updatePlantFile(filePath)) {
            updated++;
            const fileName = path.basename(filePath);
            console.log(`✅ Updated: ${fileName}`);
        }
    });
    
    console.log(`\n✨ Done! Updated ${updated} plant files from Streptophyta to Tracheophyta.`);
}

if (require.main === module) {
    main();
}

module.exports = { updatePlantFile, main };

