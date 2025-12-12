const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

async function addCarnivorousField() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
        
        let updated = 0;
        let skipped = 0;
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            // Skip if carnivorous field already exists
            if ('carnivorous' in plant) {
                skipped++;
                continue;
            }
            
            // Add carnivorous: false
            plant.carnivorous = false;
            
            // Write back to file with proper formatting
            const updatedContent = JSON.stringify(plant, null, 2) + '\n';
            await fs.writeFile(filePath, updatedContent, 'utf8');
            updated++;
        }
        
        console.log(`✅ Updated ${updated} files with carnivorous: false`);
        console.log(`⏭️  Skipped ${skipped} files (already have carnivorous field)`);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

addCarnivorousField();

