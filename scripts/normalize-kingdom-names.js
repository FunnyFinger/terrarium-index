/**
 * Script to normalize kingdom names in plant JSON files
 * Converts "Viridiplantae" to "Plantae" since they are the same
 */

const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function normalizeKingdom(plant) {
    if (!plant.taxonomy || !plant.taxonomy.kingdom) {
        return false;
    }
    
    if (plant.taxonomy.kingdom === 'Viridiplantae') {
        plant.taxonomy.kingdom = 'Plantae';
        return true;
    }
    
    return false;
}

function processPlantFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        if (normalizeKingdom(plant)) {
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
    console.log('🔍 Normalizing kingdom names (Viridiplantae → Plantae)...\n');
    
    if (!fs.existsSync(PLANTS_DIR)) {
        console.error(`❌ Plants directory not found: ${PLANTS_DIR}`);
        process.exit(1);
    }
    
    const files = fs.readdirSync(PLANTS_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(PLANTS_DIR, file));
    
    let updated = 0;
    
    files.forEach(filePath => {
        if (processPlantFile(filePath)) {
            updated++;
            const fileName = path.basename(filePath);
            console.log(`✅ Updated: ${fileName}`);
        }
    });
    
    console.log(`\n✨ Done! Updated ${updated} plant files.`);
}

if (require.main === module) {
    main();
}

module.exports = { normalizeKingdom, processPlantFile };

