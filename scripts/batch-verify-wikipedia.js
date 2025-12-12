// Batch Wikipedia Verification
// Lists entries that need Wikipedia verification with search queries

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Genera commonly used by their scientific names (no change needed)
const botanicalNamesOK = [
    'Aechmea', 'Aglaonema', 'Anthurium', 'Begonia', 'Cryptanthus', 'Neoregelia',
    'Philodendron', 'Monstera', 'Peperomia', 'Tillandsia', 'Hoya', 'Dischidia',
    'Ludisia', 'Masdevallia', 'Restrepia', 'Bulbophyllum', 'Pleurothallis',
    'Lepanthes', 'Anathallis', 'Anoectochilus', 'Aspidogyne',
    'Macodes', 'Asplenium', 'Cyathea', 'Elaphoglossum', 'Humata',
    'Adenia', 'Adenium', 'Adromischus', 'Aeonium', 'Aeschynanthus',
    'Agave', 'Alluaudia', 'Aloe', 'Anacampseros', 'Ceropegia',
    'Crassula', 'Echeveria', 'Euphorbia', 'Gasteria', 'Haworthia',
    'Kalanchoe', 'Lithops', 'Pachypodium', 'Sedum', 'Sempervivum'
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

async function batchVerify() {
    console.log('📋 Generating Wikipedia verification list...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    const needsVerification = [];
    const botanicalNamesUsed = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            // Check if using scientific name as common name
            const isScientificName = /^[A-Z][a-z]+(\s+[a-z]+)?/.test(plant.name);
            
            if (isScientificName && plant.name === plant.scientificName) {
                const genus = plant.scientificName.split(' ')[0];
                
                if (botanicalNamesOK.includes(genus)) {
                    botanicalNamesUsed.push({
                        file: filename,
                        name: plant.name,
                        note: 'Botanical name commonly used - OK'
                    });
                } else {
                    needsVerification.push({
                        file: filename,
                        name: plant.name,
                        scientificName: plant.scientificName,
                        searchQuery: `${plant.scientificName} common name`,
                        wikipediaSearch: `https://en.wikipedia.org/wiki/${plant.scientificName.replace(/ /g, '_')}`
                    });
                }
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('📊 VERIFICATION REPORT:\n');
    console.log(`   Total entries: ${plantFiles.length}`);
    console.log(`   Using botanical names (OK): ${botanicalNamesUsed.length}`);
    console.log(`   Need Wikipedia verification: ${needsVerification.length}\n`);
    
    if (needsVerification.length > 0) {
        console.log('🔍 ENTRIES NEEDING VERIFICATION:\n');
        console.log('Copy these searches to find common names:\n');
        
        needsVerification.slice(0, 30).forEach((item, idx) => {
            console.log(`${idx + 1}. ${item.name}`);
            console.log(`   File: ${item.file}`);
            console.log(`   Search: "${item.searchQuery}"`);
            console.log(`   Wikipedia: ${item.wikipediaSearch}\n`);
        });
        
        if (needsVerification.length > 30) {
            console.log(`... and ${needsVerification.length - 30} more\n`);
        }
    }
    
    // Save to file
    const reportPath = path.join(__dirname, 'wikipedia-verification-list.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        botanicalNamesUsed,
        needsVerification
    }, null, 2));
    
    console.log(`✅ Full list saved to: ${reportPath}\n`);
}

batchVerify().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

