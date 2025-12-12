// Restore legitimate plants that were incorrectly deleted

const fs = require('fs').promises;
const path = require('path');

const GROWTROPICALS_DIR = path.join(__dirname, '..', 'data', 'growtropicals-import');
const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants', 'additional');

// Plants that should be restored
const plantsToRestore = [
    'alluaudia-procera.json',
    'alocasia-azlanii.json',
    'alocasia-sinuata.json',
    'asparagus-setaceus-plumosus-asparagus-fern.json',
    'artocarpus-species.json',
    'anubias.json',
    'roridula-gorgonias.json'
];

async function restorePlants() {
    console.log('🔄 Restoring legitimate plants...\n');
    
    let restored = 0;
    
    for (const filename of plantsToRestore) {
        const sourcePath = path.join(GROWTROPICALS_DIR, filename);
        const destPath = path.join(PLANTS_DIR, filename);
        
        try {
            // Check if source exists
            await fs.access(sourcePath);
            
            // Read and check if it's a real plant
            const content = await fs.readFile(sourcePath, 'utf8');
            const plant = JSON.parse(content);
            
            // Skip if it's actually a non-plant
            if (plant.name && (
                plant.name.toLowerCase().includes('bundle') ||
                plant.name.toLowerCase().includes('kit') ||
                plant.name.toLowerCase().includes('gift card')
            )) {
                console.log(`   ⏭️  Skipping: ${plant.name} (is non-plant)`);
                continue;
            }
            
            // Copy to additional directory
            await fs.copyFile(sourcePath, destPath);
            console.log(`   ✅ Restored: ${plant.name}`);
            restored++;
        } catch (error) {
            // File doesn't exist in source, skip
            console.log(`   ⏭️  Not found: ${filename}`);
        }
    }
    
    console.log(`\n✅ Restored ${restored} plants`);
}

restorePlants().catch(console.error);

