// Final Common Names Update
// Adding well-documented common names for remaining species

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Known common names from botanical references
const knownCommonNames = {
    'Albuca spiralis': 'Frizzle Sizzle',
    'Aspidistra elatior': 'Cast Iron Plant',
    'Drosophyllum lusitanicum': 'Portuguese Sundew',
    'Aristolochia fimbriata': 'White-Veined Dutchman\'s Pipe',
    'Aristolochia littoralis': 'Calico Flower',
    'Asarum splendens': 'Chinese Wild Ginger',
    'Astilboides tabularis': 'Shieldleaf',
    'Byblis liniflora': 'Rainbow Plant',
    'Genlisea violacea': 'Corkscrew Plant',
    'Goodyera daibuzanensis': 'Jewel Orchid',
    'Dossinia marmorata': 'Jewel Orchid',
    'Adiantum hispidulum': 'Rosy Maidenhair Fern',
    'Adiantum reniformis': 'Kidney Fern'
};

function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.json') && item !== 'index.json') {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

async function updateFinalNames() {
    console.log('📝 Applying final common names...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let updatedCount = 0;
    const updates = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            // Check if we have a common name for this scientific name
            if (knownCommonNames[plant.scientificName] && 
                plant.name === plant.scientificName) {
                
                const commonName = knownCommonNames[plant.scientificName];
                updates.push({
                    file: filename,
                    from: plant.name,
                    to: commonName,
                    scientific: plant.scientificName
                });
                
                plant.name = commonName;
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                updatedCount++;
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('📊 FINAL UPDATE SUMMARY:');
    console.log(`   Common names added: ${updatedCount}\n`);
    
    if (updates.length > 0) {
        console.log('✅ COMMON NAMES ADDED:\n');
        updates.forEach(update => {
            console.log(`   ${update.file}`);
            console.log(`   "${update.from}" → "${update.to}"`);
            console.log(`   Scientific: ${update.scientific}\n`);
        });
    }
    
    console.log('✅ Final update complete!\n');
}

updateFinalNames().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

