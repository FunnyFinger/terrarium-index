// Find all non-singular plant entries (bundles, kits, duplicates, etc.)

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

function isNonSingularEntry(name, scientificName, description) {
    const text = ((name || '') + ' ' + (scientificName || '') + ' ' + (description || '')).toLowerCase();
    
    // Check for bundle/kit/pair/multi-plant indicators
    const nonSingularPatterns = [
        /\bbundle\b/i,
        /\bkit\b/i,
        /\bpair\b/i,
        /\bset\s+of\b/i,
        /\bpack\b/i,
        /\bcollection\b/i,
        /\bstarter\s+(set|kit|pack)/i,
        /\bmultiple\b/i,
        /\bseveral\b/i,
        /\bgroup\b/i,
        /\b(2|3|4|5|6|7|8|9|10)\s+plants?\b/i,  // "3 plants"
        /\bplants?\s+(set|kit|pack|bundle)/i,
        /\bplant\s+plug\b/i  // "plant plug" = multiple plants
    ];
    
    // Check for accessories/non-plants
    const nonPlantPatterns = [
        /gift\s+card/i,
        /e-gift/i,
        /support\s+pole/i,
        /moss\s+pole/i,
        /planter/i,
        /substrate/i,
        /potting\s+(mix|soil)/i,
        /fertilizer/i,
        /tool/i,
        /grow\s+light/i,
        /lamp/i,
        /book/i,
        /art\b/i,
        /noid\s*#/i,
        /unknown\s+plant/i
    ];
    
    // Check if it's a bundle/kit
    if (nonSingularPatterns.some(pattern => pattern.test(text))) {
        return { reason: 'bundle/kit/multiple', match: true };
    }
    
    // Check if it's not a plant at all
    if (nonPlantPatterns.some(pattern => pattern.test(text))) {
        return { reason: 'non-plant', match: true };
    }
    
    return { reason: null, match: false };
}

function areExactSameSpecies(plant1, plant2) {
    const base1 = getBaseScientific(plant1.scientificName);
    const base2 = getBaseScientific(plant2.scientificName);
    
    if (!base1 || !base2 || base1 !== base2) return false;
    
    // Also check species epithet
    const sci1 = (plant1.scientificName || '').toLowerCase().split(/\s+/);
    const sci2 = (plant2.scientificName || '').toLowerCase().split(/\s+/);
    
    if (sci1.length >= 2 && sci2.length >= 2) {
        return sci1[0] === sci2[0] && sci1[1] === sci2[1];
    }
    
    return true;
}

function areSameByCommonName(plant1, plant2) {
    const name1 = (plant1.name || '').toLowerCase();
    const name2 = (plant2.name || '').toLowerCase();
    
    // Known duplicates
    const knownDuplicates = [
        ['fittonia', 'nerve plant'],
        ["baby's tears", "baby tears"],
        ['syngonium', 'arrowhead'],
        ['oxalis', 'purple shamrock']
    ];
    
    for (const [nameA, nameB] of knownDuplicates) {
        if ((name1.includes(nameA) && name2.includes(nameB)) ||
            (name1.includes(nameB) && name2.includes(nameA))) {
            return true;
        }
    }
    
    // Remove size indicators and check
    const clean1 = name1.replace(/\s*(mini|dwarf|small|large|xl)\b/gi, '').trim();
    const clean2 = name2.replace(/\s*(mini|dwarf|small|large|xl)\b/gi, '').trim();
    
    return clean1 === clean2 && clean1.length > 3;
}

async function main() {
    console.log('🔍 Finding All Non-Singular Plant Entries...\n');
    
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
    
    console.log(`📊 Total plants: ${allPlants.length}\n`);
    
    // Find non-singular entries
    const nonSingular = [];
    
    for (const plant of allPlants) {
        const check = isNonSingularEntry(plant.name, plant.scientificName, plant.description);
        if (check.match) {
            nonSingular.push({ plant, reason: check.reason });
        }
    }
    
    console.log(`⚠️  Non-singular entries found: ${nonSingular.length}\n`);
    
    if (nonSingular.length > 0) {
        console.log('Non-singular entries:');
        for (const { plant, reason } of nonSingular) {
            console.log(`   - ${plant.name} (${reason})`);
        }
        console.log();
    }
    
    // Find duplicates
    const duplicates = [];
    const processed = new Set();
    
    for (let i = 0; i < allPlants.length; i++) {
        if (processed.has(i)) continue;
        
        const plant1 = allPlants[i];
        const group = [plant1];
        
        for (let j = i + 1; j < allPlants.length; j++) {
            if (processed.has(j)) continue;
            
            const plant2 = allPlants[j];
            
            if (areExactSameSpecies(plant1, plant2) || areSameByCommonName(plant1, plant2)) {
                group.push(plant2);
                processed.add(j);
            }
        }
        
        if (group.length > 1) {
            duplicates.push(group);
            processed.add(i);
        }
    }
    
    console.log(`🔍 Duplicate groups found: ${duplicates.length}\n`);
    
    if (duplicates.length > 0) {
        console.log('Duplicate groups:');
        for (const group of duplicates) {
            console.log(`   Group (${group.length} entries):`);
            group.forEach(p => {
                console.log(`     - ${p.name} (${p.scientificName || 'no scientific name'})`);
            });
            console.log();
        }
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   Total plants: ${allPlants.length}`);
    console.log(`   Non-singular entries: ${nonSingular.length}`);
    console.log(`   Duplicate groups: ${duplicates.length}`);
    console.log(`   Total entries to remove: ${nonSingular.length + duplicates.reduce((sum, g) => sum + g.length - 1, 0)}`);
}

main().catch(console.error);

