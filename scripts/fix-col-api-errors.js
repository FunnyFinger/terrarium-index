// Fix COL API Wrong Matches
// The API returned wrong species (mollusks, fish, etc.)

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Correct mappings (revert to original correct names)
const correctNames = {
    'african-spear-sansevieria.json': 'Sansevieria cylindrica',
    'african-violet-mini.json': 'Saintpaulia ionantha',
    'agave-stricta-var-nana.json': 'Agave stricta var. nana',
    'aglaonema-hybrid-1.json': 'Aglaonema hybrid',
    'aglaonema-hybrid-2.json': 'Aglaonema hybrid',
    'aglaonema-hybrid-3.json': 'Aglaonema hybrid',
    'aglaonema-hybrid-red.json': 'Aglaonema hybrid',
    'aglaonema-hybrid.json': 'Aglaonema hybrid',
    'monstera-esqueleto.json': 'Monstera adansonii',
    'neoregelia-fancy.json': 'Neoregelia sp.',
    'philodendron-felix.json': 'Philodendron felix',
    'philodendron-prince-of-orange.json': 'Philodendron hybrid',
    'vriesea-ospinae.json': 'Vriesea ospinae',
    'java-moss.json': 'Taxiphyllum barbieri',
    'aloe-mini.json': 'Aloe vera',
    'pillow-moss.json': 'Leucobryum glaucum',
    'sheet-moss.json': 'Hypnum cupressiforme'
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

async function fixCOLErrors() {
    console.log('🔧 Fixing COL API wrong matches...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let fixedCount = 0;
    const fixes = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            if (correctNames[filename]) {
                const oldValue = typeof plant.scientificName === 'object' 
                    ? (plant.scientificName.scientificName || 'Object')
                    : plant.scientificName;
                
                fixes.push({
                    file: filename,
                    from: oldValue,
                    to: correctNames[filename]
                });
                
                plant.scientificName = correctNames[filename];
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                fixedCount++;
            }
            
        } catch (err) {
            console.error(`Error processing ${path.basename(filePath)}:`, err.message);
        }
    }
    
    console.log('📊 RESTORATION SUMMARY:');
    console.log(`   Files fixed: ${fixedCount}\n`);
    
    if (fixes.length > 0) {
        console.log('✅ FIXED ENTRIES:\n');
        fixes.forEach((fix, idx) => {
            console.log(`${idx + 1}. ${fix.file}`);
            console.log(`   Restored to: "${fix.to}"\n`);
        });
    }
    
    console.log('✅ Fix complete!\n');
}

fixCOLErrors().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

