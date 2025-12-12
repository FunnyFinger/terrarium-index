// Final verification report
// Check for duplicates, non-plants, and variant marking

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

function getBaseScientific(scientificName) {
    if (!scientificName) return null;
    
    let normalized = scientificName
        .toLowerCase()
        .replace(/['"]/g, '')
        .replace(/\s+var\.\s+\w+/gi, '')
        .replace(/\s+cv\.\s+\w+/gi, '')
        .trim();
    
    const parts = normalized.split(/\s+/).filter(p => p.length > 0 && !p.match(/^(var|ssp|subsp|f|form)\.?$/i));
    
    if (parts.length >= 2) {
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

function isNonPlant(name, scientific) {
    const text = ((name || '') + ' ' + (scientific || '')).toLowerCase();
    return /\b(bundle|kit|pair|set|pack|gift\s+card|support\s+pole|moss\s+pole|terrarium|accessory|pot|planter|substrate|fertilizer|tool|light|lamp|book|art|mushroom|noid\s*#|no\s+id|unknown\s+plant)\b/i.test(text);
}

async function main() {
    console.log('📋 Final Verification Report\n');
    console.log('=' .repeat(60) + '\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    const allPlants = [];
    
    // Load all plants
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const plant = JSON.parse(content);
                plant.filePath = filePath;
                plant.category = category;
                allPlants.push(plant);
            }
        } catch (error) {
            // Skip
        }
    }
    
    console.log(`📊 Total plants loaded: ${allPlants.length}\n`);
    
    // Check for non-plants
    const nonPlants = allPlants.filter(p => isNonPlant(p.name, p.scientificName));
    
    if (nonPlants.length > 0) {
        console.log(`⚠️  Non-plants found: ${nonPlants.length}`);
        nonPlants.forEach(p => console.log(`   - ${p.name}`));
    } else {
        console.log(`✅ No non-plants found\n`);
    }
    
    // Group by base species
    const bySpecies = new Map();
    
    for (const plant of allPlants) {
        const base = getBaseScientific(plant.scientificName) || 
                    plant.name.toLowerCase().split(' ').slice(0, 2).join(' ');
        
        if (!bySpecies.has(base)) {
            bySpecies.set(base, []);
        }
        bySpecies.get(base).push(plant);
    }
    
    // Check for duplicates (same base, no variant indicators)
    const duplicates = [];
    const variants = [];
    let singleEntries = 0;
    
    for (const [baseSci, plants] of bySpecies.entries()) {
        if (plants.length === 1) {
            singleEntries++;
            continue;
        }
        
        // Check for variant indicators
        const hasVariants = plants.some(p => {
            const text = ((p.name || '') + ' ' + (p.scientificName || '')).toLowerCase();
            return /variegat|var\.|cultivar|cv\.|'[^']+'|"[^"]+"/i.test(text);
        });
        
        if (hasVariants) {
            variants.push({ base: baseSci, count: plants.length, plants: plants.map(p => p.name) });
        } else {
            duplicates.push({ base: baseSci, count: plants.length, plants: plants.map(p => p.name) });
        }
    }
    
    console.log(`\n🔬 Species Analysis:`);
    console.log(`   Unique base species: ${bySpecies.size}`);
    console.log(`   Single entries: ${singleEntries}`);
    console.log(`   Variant groups: ${variants.length}`);
    console.log(`   Duplicate groups: ${duplicates.length}\n`);
    
    if (duplicates.length > 0) {
        console.log(`⚠️  DUPLICATES FOUND (should be merged):\n`);
        duplicates.forEach(dup => {
            console.log(`   ${dup.base}:`);
            dup.plants.forEach(p => console.log(`     - ${p}`));
        });
    } else {
        console.log(`✅ No duplicates found (all properly merged)\n`);
    }
    
    // Check variant marking
    const unmarkedVariants = [];
    for (const plant of allPlants) {
        const text = ((plant.name || '') + ' ' + (plant.scientificName || '')).toLowerCase();
        if (/variegat|var\.|cultivar|cv\.|'[^']+'|"[^"]+"/i.test(text) && !plant.variantInfo) {
            unmarkedVariants.push(plant);
        }
    }
    
    if (unmarkedVariants.length > 0) {
        console.log(`⚠️  Variants without variantInfo: ${unmarkedVariants.length}`);
        unmarkedVariants.slice(0, 10).forEach(p => console.log(`   - ${p.name}`));
    } else {
        console.log(`✅ All variants properly marked\n`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Verification Summary:`);
    console.log(`   Total plants: ${allPlants.length}`);
    console.log(`   Unique species: ${bySpecies.size}`);
    console.log(`   Non-plants: ${nonPlants.length} ${nonPlants.length > 0 ? '⚠️' : '✅'}`);
    console.log(`   Duplicates: ${duplicates.length} ${duplicates.length > 0 ? '⚠️' : '✅'}`);
    console.log(`   Variant groups: ${variants.length}`);
    console.log(`   Unmarked variants: ${unmarkedVariants.length} ${unmarkedVariants.length > 0 ? '⚠️' : '✅'}`);
}

main().catch(console.error);

