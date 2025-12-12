// Check for duplicate entries with "dwarf", "mini", "small" variations
// These should be variants of the same species, not separate entries

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
        p.length > 0 && !p.match(/^(var|ssp|subsp|f|form|cultivar|cv|mini|dwarf)\.?$/i)
    );
    
    if (parts.length >= 2) {
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, '')  // Remove parentheses
        .replace(/\s*\[.*?\]/g, '')    // Remove brackets
        .replace(/\s*(mini|dwarf|small|large|xl|s|m|l)\s*$/i, '')  // Remove size indicators
        .replace(/\s*(mini|dwarf|small)\s+/gi, ' ')  // Remove size from middle
        .replace(/\s+/g, ' ')
        .trim();
}

function hasSizeIndicator(name) {
    return /\b(mini|dwarf|small|tiny|micro|petite)\b/i.test(name);
}

async function main() {
    console.log('🔍 Checking for Dwarf/Mini Duplicates...\n');
    
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
    
    console.log(`📊 Total plants: ${allPlants.length}\n`);
    
    // Group by base scientific name
    const byScientific = new Map();
    
    for (const plant of allPlants) {
        const baseSci = getBaseScientific(plant.scientificName);
        if (!baseSci) continue;
        
        if (!byScientific.has(baseSci)) {
            byScientific.set(baseSci, []);
        }
        byScientific.get(baseSci).push(plant);
    }
    
    // Find groups with size variations
    const sizeVariants = [];
    
    for (const [baseSci, plants] of byScientific.entries()) {
        if (plants.length < 2) continue;
        
        // Check if any have size indicators
        const hasSizeVariant = plants.some(p => hasSizeIndicator(p.name));
        const hasRegular = plants.some(p => !hasSizeIndicator(p.name));
        
        if (hasSizeVariant && hasRegular) {
            sizeVariants.push({
                base: baseSci,
                plants: plants,
                withSize: plants.filter(p => hasSizeIndicator(p.name)),
                regular: plants.filter(p => !hasSizeIndicator(p.name))
            });
        }
    }
    
    // Also check by normalized name (removing size indicators)
    const byNormalizedName = new Map();
    
    for (const plant of allPlants) {
        const normalized = normalizeName(plant.name);
        if (normalized.length < 3) continue;
        
        if (!byNormalizedName.has(normalized)) {
            byNormalizedName.set(normalized, []);
        }
        byNormalizedName.get(normalized).push(plant);
    }
    
    const nameVariants = [];
    
    for (const [normalized, plants] of byNormalizedName.entries()) {
        if (plants.length < 2) continue;
        
        // Check if they're size variants
        const sizeVariantNames = plants.filter(p => hasSizeIndicator(p.name));
        const regularNames = plants.filter(p => !hasSizeIndicator(p.name));
        
        if (sizeVariantNames.length > 0 && regularNames.length > 0) {
            // Check if scientific names match
            const sizeVariantSci = sizeVariantNames.map(p => getBaseScientific(p.scientificName));
            const regularSci = regularNames.map(p => getBaseScientific(p.scientificName));
            
            const matchingSci = sizeVariantSci.some(sci => regularSci.includes(sci));
            
            if (matchingSci || sizeVariantSci.length === 0 || regularSci.length === 0) {
                nameVariants.push({
                    normalized,
                    plants: plants,
                    withSize: sizeVariantNames,
                    regular: regularNames
                });
            }
        }
    }
    
    console.log(`📦 Size variant groups by scientific name: ${sizeVariants.length}\n`);
    for (const group of sizeVariants) {
        console.log(`   ${group.base}:`);
        group.regular.forEach(p => console.log(`     Regular: ${p.name}`));
        group.withSize.forEach(p => console.log(`     Size variant: ${p.name}`));
        console.log();
    }
    
    console.log(`📦 Size variant groups by normalized name: ${nameVariants.length}\n`);
    for (const group of nameVariants) {
        console.log(`   Base name: "${group.normalized}"`);
        group.regular.forEach(p => console.log(`     Regular: ${p.name} (${p.scientificName || 'no scientific name'})`));
        group.withSize.forEach(p => console.log(`     Size variant: ${p.name} (${p.scientificName || 'no scientific name'})`));
        console.log();
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   Size variant groups (scientific name): ${sizeVariants.length}`);
    console.log(`   Size variant groups (normalized name): ${nameVariants.length}`);
    console.log(`\n💡 Recommendation:`);
    console.log(`   These size variants should be:`);
    console.log(`   1. Marked as variants (variantInfo)`);
    console.log(`   2. OR merged if they're truly the same plant`);
    console.log(`   3. Keep separate only if they're distinct cultivars/varieties`);
}

main().catch(console.error);

