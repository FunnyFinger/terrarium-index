// Auto-fix obviously invalid scientific names
// Fix entries with descriptive text instead of botanical names

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Map of filenames to correct scientific names
const fixes = {
    'amazon-sword.json': 'Echinodorus amazonicus',
    'java-fern.json': 'Microsorum pteropus',
    'java-moss.json': 'Taxiphyllum barbieri',
    'phoenix-moss.json': 'Fissidens fontanus',
    'mood-moss.json': 'Dicranum scoparium',
    'pellionia.json': 'Pellionia repens',
    'polypodium-sp.json': 'Polypodium sp.',
    'ant-fern-species.json': 'Lecanopteris sp.',
    'antenna-fern-doryopteris-cordata-medium.json': 'Doryopteris cordata',
    'aglaonema.json': 'Aglaonema sp.',
    'aglaonema-hybrid.json': 'Aglaonema hybrid',
    'aglaonema-hybrid-1.json': 'Aglaonema hybrid',
    'aglaonema-hybrid-2.json': 'Aglaonema hybrid',
    'aglaonema-hybrid-3.json': 'Aglaonema hybrid',
    'aglaonema-hybrid-red.json': 'Aglaonema hybrid',
    'aglaonema-species.json': 'Aglaonema sp.',
    'aglaonema-pumilum.json': 'Aglaonema pumilum',
    'african-spear-sansevieria.json': 'Sansevieria cylindrica',
    'asparagus-setaceus-plumosus-asparagus-fern.json': 'Asparagus setaceus',
    'dioscorea-mexicana.json': 'Dioscorea mexicana',
    'hemionitis-doryopteris-digit-fern.json': 'Hemionitis arifolia',
    'hoya.json': 'Hoya waymaniae',
    'bromeliad.json': 'Acanthostachys pitcairnioides',
    'araflora-no-name-bromelia-vdv.json': 'Bromeliaceae sp.',
    'vriesea-sp-green-fleck.json': 'Vriesea sp.',
    'european-aldrovanda-vesiculosa.json': 'Aldrovanda vesiculosa',
    'australian-pitcherplant.json': 'Cephalotus follicularis',
    'butterworth-pinguicula-x.json': 'Pinguicula × weser',
    'darlingtonia-californica.json': 'Darlingtonia californica',
    'sun-pitcherplant-heliamphora-nutans-s.json': 'Heliamphora nutans',
    'trumpet-pitcherplant.json': 'Sarracenia × yellowbird',
    'actiniopteris-radiata.json': 'Actiniopteris radiata',
    'monstera-adansonii-european-mint.json': 'Monstera adansonii',
    'philodendron-burle-marx-variegated.json': 'Philodendron burle-marxii',
    'philodendron-felix.json': 'Philodendron felix',
    'philodendron-florida-ghost.json': 'Philodendron florida',
    'philodendron-imperial-green.json': 'Philodendron imperial',
    'philodendron-purple-congo.json': 'Philodendron rojo',
    'philodendron-rugosum.json': 'Philodendron rugosum',
    'philodendron-sodiroi.json': 'Philodendron sodiroi',
    'agave-stricta-var-nana.json': 'Agave stricta var. nana',
    'agave-victoriae-reginae.json': 'Agave victoriae-reginae',
    'alocasia-boyceana.json': 'Alocasia boyceana',
    'anoectochillus-simensis-x-ludisia-discolor.json': 'Anoectochilus simensis × Ludisia discolor',
    'arisaema-filiforme.json': 'Arisaema filiforme',
    'asplenium-antiquum-leslie.json': 'Asplenium antiquum',
    'episcia-cupreata.json': 'Episcia cupreata',
    'anoectochillus-albolineatus-variegata.json': 'Anoectochillus albolineatus',
    'anoectochillus-leyli-green.json': 'Anoectochillus leyli',
    'miniature-maidenhair-fern.json': 'Adiantum raddianum',
    'adenium-obesum-2.json': 'Adenium obesum',
    'adenium-variegated-grafted.json': 'Adenium obesum',
    'adromischus-marianiae.json': 'Adromischus marianiae',
    'aeonium-tabuliforme-variegata.json': 'Aeonium tabuliforme',
    'aglaomorpha-coronans-snake-leaf-fern.json': 'Aglaomorpha coronans',
    'acalypha-hispida-small-form.json': 'Acalypha hispida'
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

async function autoFixInvalidNames() {
    console.log('🔧 Auto-fixing invalid scientific names...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let fixedCount = 0;
    const fixLog = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            if (fixes[filename]) {
                const oldScientific = plant.scientificName;
                plant.scientificName = fixes[filename];
                
                fixLog.push({
                    file: filename,
                    name: plant.name,
                    from: oldScientific,
                    to: fixes[filename]
                });
                
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                fixedCount++;
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('📊 AUTO-FIX SUMMARY:');
    console.log(`   Files fixed: ${fixedCount}\n`);
    
    if (fixLog.length > 0) {
        console.log('✅ FIXED ENTRIES:\n');
        fixLog.forEach((fix, idx) => {
            console.log(`${idx + 1}. ${fix.file}`);
            console.log(`   Name: "${fix.name}"`);
            console.log(`   From: "${fix.from}"`);
            console.log(`   To:   "${fix.to}"\n`);
        });
    }
    
    console.log('✅ Auto-fix complete!\n');
}

autoFixInvalidNames().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

