// Add Common Names - For entries using scientific names as display names
// Only change if there's a well-known common name

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Map of scientific names to common names
// Only include if the common name is well-known and widely used
const commonNameMappings = {
    // Ferns
    'Nephrolepis exaltata': 'Boston Fern',
    'Platycerium bifurcatum': 'Staghorn Fern',
    'Davallia fejeensis': "Rabbit's Foot Fern",
    'Asplenium nidus': "Bird's Nest Fern",
    'Adiantum raddianum': 'Maidenhair Fern',
    'Pellaea rotundifolia': 'Button Fern',
    
    // Carnivorous
    'Dionaea muscipula': 'Venus Flytrap',
    'Sarracenia': 'Pitcher Plant',
    'Nepenthes': 'Tropical Pitcher Plant',
    'Drosera': 'Sundew',
    'Pinguicula': 'Butterwort',
    
    // Air Plants - keep Tillandsia name, it's commonly used
    
    // Succulents - most keep genus name
    'Lithops': 'Living Stones',
    'Senecio rowleyanus': 'String of Pearls',
    'Ceropegia woodii': 'String of Hearts',
    'Echeveria': 'Echeveria', // Keep as is
    'Haworthia': 'Haworthia', // Keep as is
    
    // Tropical plants
    'Epipremnum aureum': 'Golden Pothos',
    'Ficus pumila': 'Creeping Fig',
    'Fittonia albivenis': 'Nerve Plant',
    'Hypoestes phyllostachya': 'Polka Dot Plant',
    'Pilea involucrata': 'Friendship Plant',
    'Soleirolia soleirolii': 'Baby Tears',
    'Syngonium podophyllum': 'Arrowhead Plant',
    
    // Aquarium
    'Microsorum pteropus': 'Java Fern',
    'Anubias barteri': 'Anubias',
    'Eleocharis parvula': 'Dwarf Hairgrass',
    'Riccia fluitans': 'Crystalwort',
    
    // Mosses - many keep scientific names as they're used in hobby
    'Taxiphyllum barbieri': 'Java Moss',
    'Vesicularia montagnei': 'Christmas Moss',
    
    // Orchids - many keep genus names
    'Phalaenopsis': 'Moth Orchid'
};

// Genera that commonly use scientific names in horticulture
const scientificNameIsCommon = [
    'Aechmea',
    'Aglaonema',
    'Anthurium',
    'Begonia',
    'Cryptanthus',
    'Neoregelia',
    'Philodendron',
    'Monstera',
    'Peperomia',
    'Tillandsia',
    'Hoya',
    'Dischidia',
    'Ludisia',
    'Masdevallia',
    'Restrepia',
    'Bulbophyllum'
];

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

async function addCommonNames() {
    console.log('📝 Adding common names where appropriate...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let changedCount = 0;
    let keptCount = 0;
    const changes = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            // Check if plant uses scientific name as display name
            const isScientificName = /^[A-Z][a-z]+(\s+[a-z]+)?/.test(plant.name);
            
            if (isScientificName && plant.name === plant.scientificName) {
                // Check if we have a common name mapping
                if (commonNameMappings[plant.scientificName]) {
                    const commonName = commonNameMappings[plant.scientificName];
                    changes.push({
                        file: filename,
                        from: plant.name,
                        to: commonName,
                        scientific: plant.scientificName
                    });
                    plant.name = commonName;
                    fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                    changedCount++;
                } else {
                    // Check if genus name is commonly used as-is
                    const genus = plant.scientificName.split(' ')[0];
                    if (scientificNameIsCommon.includes(genus)) {
                        keptCount++;
                    }
                }
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('📊 SUMMARY:');
    console.log(`   Common names added: ${changedCount}`);
    console.log(`   Scientific names kept (common in hobby): ${keptCount}\n`);
    
    if (changes.length > 0) {
        console.log('✅ COMMON NAMES ADDED:\n');
        changes.forEach(change => {
            console.log(`   ${change.file}`);
            console.log(`   From: "${change.from}"`);
            console.log(`   To:   "${change.to}"`);
            console.log(`   Scientific: ${change.scientific}\n`);
        });
    }
    
    console.log('✅ Common names updated!\n');
}

addCommonNames().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

