// List all plants with dwarf/mini/small and ensure they're marked as variants

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
        .replace(/\s+variegat[ea]/gi, '')
        .replace(/\s+['"].*?['"]/g, '')
        .trim();
    
    const parts = normalized.split(/\s+/).filter(p => 
        p.length > 0 && !p.match(/^(var|ssp|subsp|f|form|cultivar|cv)\.?$/i)
    );
    
    if (parts.length >= 2) {
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

function hasSizeIndicator(name) {
    return /\b(mini|dwarf|small|tiny|micro|petite)\b/i.test(name);
}

async function main() {
    console.log('🔍 Listing and Marking Dwarf/Mini Variants...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    const allPlants = [];
    
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
    
    // Find all plants with size indicators
    const sizeVariantPlants = allPlants.filter(p => hasSizeIndicator(p.name));
    
    console.log(`📊 Plants with size indicators: ${sizeVariantPlants.length}\n`);
    console.log('Plants with dwarf/mini/small:');
    sizeVariantPlants.forEach(p => {
        console.log(`   - ${p.name} (${p.scientificName || 'no scientific name'})`);
    });
    console.log();
    
    // Group by base scientific name to find variants
    const byScientific = new Map();
    
    for (const plant of allPlants) {
        const baseSci = getBaseScientific(plant.scientificName);
        if (!baseSci) continue;
        
        if (!byScientific.has(baseSci)) {
            byScientific.set(baseSci, []);
        }
        byScientific.get(baseSci).push(plant);
    }
    
    // Find size variants that need marking
    const toUpdate = [];
    
    for (const plant of sizeVariantPlants) {
        const baseSci = getBaseScientific(plant.scientificName);
        if (!baseSci) continue;
        
        const relatedPlants = byScientific.get(baseSci) || [];
        const hasRegular = relatedPlants.some(p => 
            p !== plant && !hasSizeIndicator(p.name)
        );
        
        // If this is a size variant and there's a regular version, mark it
        if (hasRegular && !plant.variantInfo) {
            plant.variantInfo = {
                isVariant: true,
                baseSpecies: baseSci,
                variantName: plant.name,
                variantScientificName: plant.scientificName,
                variantType: 'size' // Add variant type
            };
            toUpdate.push(plant);
        } else if (!hasRegular && !plant.variantInfo && hasSizeIndicator(plant.name)) {
            // Even if no regular version found, mark as size variant
            plant.variantInfo = {
                isVariant: true,
                baseSpecies: baseSci,
                variantName: plant.name,
                variantScientificName: plant.scientificName,
                variantType: 'size'
            };
            toUpdate.push(plant);
        }
    }
    
    console.log(`🔧 Plants needing variant marking: ${toUpdate.length}\n`);
    
    for (const plant of toUpdate) {
        console.log(`   ${plant.name}:`);
        console.log(`      Base species: ${plant.variantInfo.baseSpecies}`);
        console.log(`      Variant type: ${plant.variantInfo.variantType}`);
        console.log();
    }
    
    // Update plants
    if (toUpdate.length > 0) {
        console.log(`💾 Updating ${toUpdate.length} plants...`);
        for (const plant of toUpdate) {
            try {
                const filePath = plant.filePath;
                delete plant.filePath;
                delete plant.category;
                await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            } catch (error) {
                console.log(`   ⚠️  Error updating ${plant.name}: ${error.message}`);
            }
        }
        console.log(`\n✅ Updated ${toUpdate.length} plants with variant info`);
    } else {
        console.log(`\n✅ All size variants already marked`);
    }
}

main().catch(console.error);

