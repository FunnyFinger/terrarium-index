// Fix Critical Issues - Invalid scientific names and size descriptors

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Manual fixes for invalid scientific names
const scientificNameFixes = {
    'anthurium-bakerii-type-a03.json': {
        name: 'Anthurium Type A03',
        scientificName: 'Anthurium bakerii'
    },
    'macodes-sanderiana-x-limii.json': {
        // This is a hybrid - keep name as is
        name: 'Macodes Hybrid',
        scientificName: 'Macodes sanderiana × limii'
    },
    'philodendron-silver-sword.json': {
        name: "Philodendron 'Silver Sword'",
        scientificName: 'Philodendron hastatum'
    },
    'caput-medusae.json': {
        name: "Medusa's Head Air Plant",
        scientificName: 'Tillandsia caput-medusae'
    },
    'asplenium-dimorphum-x-difforme-x-parvati.json': {
        name: "Asplenium 'Parvati'",
        scientificName: 'Asplenium dimorphum'
    },
    'staghorn-fern-mini.json': {
        name: 'Staghorn Fern',
        scientificName: 'Platycerium bifurcatum'
    },
    'medinilla.json': {
        name: 'Rose Grape',
        scientificName: 'Medinilla magnifica'
    }
};

// Size descriptors to remove from names
const sizePattern = /\s*\(?(mini|miniature|dwarf|small|tiny|large|xl|giant|compact)\)?/gi;

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

async function fixCriticalIssues() {
    console.log('🔧 Fixing critical issues...\n');
    
    const plantFiles = getAllPlantFiles(plantsDir);
    let fixedCount = 0;
    const fixes = [];
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            let modified = false;
            
            // Fix 1: Invalid scientific names
            if (scientificNameFixes[filename]) {
                const fix = scientificNameFixes[filename];
                fixes.push({
                    file: filename,
                    type: 'Scientific Name Fix',
                    from: `"${plant.name}" / "${plant.scientificName}"`,
                    to: `"${fix.name}" / "${fix.scientificName}"`
                });
                plant.name = fix.name;
                plant.scientificName = fix.scientificName;
                modified = true;
            }
            
            // Fix 2: Remove size descriptors from names (except for official names like "Dwarf Umbrella Tree")
            const originalName = plant.name;
            if (originalName && sizePattern.test(originalName)) {
                // Special cases where size is part of official name
                const keepSize = [
                    'dwarf umbrella',
                    'miniature maidenhair',
                    'giant sword'
                ];
                
                const shouldKeep = keepSize.some(term => 
                    originalName.toLowerCase().includes(term)
                );
                
                if (!shouldKeep) {
                    plant.name = originalName
                        .replace(sizePattern, '')
                        .replace(/\s+/g, ' ')
                        .replace(/\(\s*\)/g, '')
                        .trim();
                    
                    if (plant.name !== originalName) {
                        fixes.push({
                            file: filename,
                            type: 'Remove Size Descriptor',
                            from: originalName,
                            to: plant.name
                        });
                        modified = true;
                    }
                }
            }
            
            if (modified) {
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                fixedCount++;
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    console.log('📊 SUMMARY:');
    console.log(`   Files fixed: ${fixedCount}\n`);
    
    if (fixes.length > 0) {
        console.log('✅ FIXES APPLIED:\n');
        fixes.forEach(fix => {
            console.log(`   ${fix.file}`);
            console.log(`   Type: ${fix.type}`);
            console.log(`   From: ${fix.from}`);
            console.log(`   To:   ${fix.to}\n`);
        });
    }
    
    console.log('✅ Critical fixes complete!\n');
}

fixCriticalIssues().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

