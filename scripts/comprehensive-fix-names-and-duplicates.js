// Comprehensive fix for scientific names and TRUE duplicates only
// 1. Fix all incorrect/missing scientific names
// 2. Only merge TRUE duplicates (same exact species OR known common name pairs)
// 3. Keep different species in same genus separate

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Known common name duplicates (same plant, different names)
const KNOWN_DUPLICATES = [
    ['fittonia', 'nerve plant'],
    ["baby's tears", "baby tears"],
    ['peperomia', 'peperomia caperata'],
    ['syngonium', 'arrowhead'],
    ['oxalis', 'purple shamrock'],
    ['selaginella', 'resurrection plant']
];

/**
 * Get base scientific name (genus + species, no variants)
 */
function getBaseScientific(scientificName) {
    if (!scientificName) return null;
    
    let normalized = scientificName
        .toLowerCase()
        .replace(/['"]/g, '')
        .trim();
    
    // Remove variant/cultivar info
    normalized = normalized.replace(/\s+var\.\s+\w+/gi, '');
    normalized = normalized.replace(/\s+cv\.\s+\w+/gi, '');
    normalized = normalized.replace(/\s+variegat[ea]/gi, '');
    normalized = normalized.replace(/\s+['"].*?['"]/g, '');
    
    // Extract genus + species
    const parts = normalized.split(/\s+/).filter(p => 
        p.length > 0 && 
        !p.match(/^(var|ssp|subsp|f|form|cultivar|cv)\.?$/i)
    );
    
    if (parts.length >= 2) {
        // Handle hybrids
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

/**
 * Check if two plants are the EXACT same species
 */
function areExactSameSpecies(plant1, plant2) {
    const base1 = getBaseScientific(plant1.scientificName);
    const base2 = getBaseScientific(plant2.scientificName);
    
    if (!base1 || !base2) return false;
    
    // Must match exactly
    if (base1 !== base2) return false;
    
    // Also check species epithet to be sure
    const sci1 = (plant1.scientificName || '').toLowerCase().split(/\s+/);
    const sci2 = (plant2.scientificName || '').toLowerCase().split(/\s+/);
    
    if (sci1.length >= 2 && sci2.length >= 2) {
        // If genus matches but species differs, they're different
        if (sci1[0] === sci2[0] && sci1[1] !== sci2[1] && sci1[1] !== 'x' && sci2[1] !== 'x') {
            return false;
        }
    }
    
    return true;
}

/**
 * Check if same by common name (known duplicates)
 */
function areSameByCommonName(plant1, plant2) {
    const name1 = (plant1.name || '').toLowerCase();
    const name2 = (plant2.name || '').toLowerCase();
    
    // Check known duplicate pairs
    for (const [nameA, nameB] of KNOWN_DUPLICATES) {
        const match1A = name1.includes(nameA);
        const match1B = name1.includes(nameB);
        const match2A = name2.includes(nameA);
        const match2B = name2.includes(nameB);
        
        if ((match1A && match2B) || (match1B && match2A)) {
            return true;
        }
    }
    
    // Remove size indicators
    const clean1 = name1.replace(/\s*(mini|dwarf|small|large|xl)\b/gi, '').trim();
    const clean2 = name2.replace(/\s*(mini|dwarf|small|large|xl)\b/gi, '').trim();
    
    // Exact match after cleaning
    if (clean1 === clean2 && clean1.length > 3) {
        return true;
    }
    
    return false;
}

/**
 * Fix scientific name from description or common name
 */
async function fixScientificName(plant) {
    const current = plant.scientificName || '';
    
    // If already valid (has genus + species, not generic terms)
    if (current && 
        current.length > 8 && 
        !current.toLowerCase().match(/\b(sp|species|hybrid|noid|unknown)\b/) &&
        current.match(/^[A-Z][a-z]+\s+[a-z]+/)) {
        return current;
    }
    
    const name = (plant.name || '').toLowerCase();
    
    // Common name mappings
    const mappings = {
        'fittonia': 'Fittonia albivenis',
        'nerve plant': 'Fittonia albivenis',
        "baby's tears": 'Soleirolia soleirolii',
        'baby tears': 'Soleirolia soleirolii',
        'peperomia': 'Peperomia caperata',
        'hoya': 'Hoya carnosa',
        'syngonium': 'Syngonium podophyllum',
        'dischidia': 'Dischidia nummularia',
        'oxalis': 'Oxalis triangularis',
        'selaginella': 'Selaginella lepidophylla',
        'pellaea': 'Pellaea rotundifolia',
        'pellionia': 'Pellionia repens',
        'hypoestes': 'Hypoestes phyllostachya',
        'utricularia': 'Utricularia gibba',
        'rotala': 'Rotala rotundifolia',
        'monte carlo': 'Micranthemum tweediei',
        'artillery fern': 'Pilea microphylla',
        'african violet': 'Saintpaulia ionantha',
        'silver falls': 'Dichondra argentea',
        'nerve plant mini': 'Fittonia albivenis'
    };
    
    // Try mappings
    for (const [common, scientific] of Object.entries(mappings)) {
        if (name.includes(common)) {
            return scientific;
        }
    }
    
    // Try to extract from description
    if (plant.description) {
        const patterns = [
            /([A-Z][a-z]+\s+[a-z]+(?:\s+x\s+[a-z]+)?)/,  // Genus species
            /Scientific name[:\s]+([A-Z][a-z]+\s+[a-z]+)/i,
            /Binomial[:\s]+([A-Z][a-z]+\s+[a-z]+)/i,
            /([A-Z][a-z]+\s+[a-z]+\s+[a-z]+)/
        ];
        
        for (const pattern of patterns) {
            const match = plant.description.match(pattern);
            if (match && match[1] && 
                match[1].length > 8 && match[1].length < 50 &&
                !match[1].toLowerCase().match(/\b(sp|species|hybrid)\b/)) {
                return match[1].trim();
            }
        }
    }
    
    return null;
}

async function main() {
    console.log('🔧 Comprehensive Fix: Scientific Names & TRUE Duplicates Only\n');
    
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
    
    // Fix scientific names
    console.log('🔬 Fixing scientific names...');
    let fixedNames = 0;
    const nameFixes = [];
    
    for (const plant of allPlants) {
        const fixedSci = await fixScientificName(plant);
        if (fixedSci && (!plant.scientificName || plant.scientificName !== fixedSci)) {
            const old = plant.scientificName || 'none';
            plant.scientificName = fixedSci;
            nameFixes.push({ name: plant.name, old, new: fixedSci });
            fixedNames++;
        }
    }
    
    console.log(`   Fixed ${fixedNames} scientific names`);
    if (nameFixes.length > 0 && nameFixes.length <= 20) {
        nameFixes.forEach(fix => {
            console.log(`     "${fix.name}": "${fix.old}" → "${fix.new}"`);
        });
    }
    console.log();
    
    // Find TRUE duplicates only
    const duplicates = [];
    const processed = new Set();
    
    for (let i = 0; i < allPlants.length; i++) {
        if (processed.has(i)) continue;
        
        const plant1 = allPlants[i];
        const group = [plant1];
        
        for (let j = i + 1; j < allPlants.length; j++) {
            if (processed.has(j)) continue;
            
            const plant2 = allPlants[j];
            
            // Only merge if EXACT same species OR known common name duplicate
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
    
    console.log(`🔍 Found ${duplicates.length} TRUE duplicate groups\n`);
    
    // Merge duplicates
    const toDelete = [];
    const toUpdate = [];
    
    for (const group of duplicates) {
        // Keep the best one
        const best = group.reduce((best, current) => {
            const bestScore = (best.description?.length || 0) + 
                             (best.scientificName?.length || 0) * 3 +
                             (best.images?.length || 0) * 10 +
                             (best.scientificName && best.scientificName.length > 10 ? 20 : 0);
            const currentScore = (current.description?.length || 0) + 
                                (current.scientificName?.length || 0) * 3 +
                                (current.images?.length || 0) * 10 +
                                (current.scientificName && current.scientificName.length > 10 ? 20 : 0);
            return currentScore > bestScore ? current : best;
        });
        
        const others = group.filter(p => p !== best);
        
        // Merge data
        for (const other of others) {
            if (other.scientificName && 
                (!best.scientificName || other.scientificName.length > best.scientificName.length)) {
                best.scientificName = other.scientificName;
            }
            if (other.description && 
                (!best.description || other.description.length > best.description.length)) {
                best.description = other.description;
            }
            if (other.images && other.images.length > 0) {
                if (!best.images) best.images = [];
                other.images.forEach(img => {
                    if (!best.images.includes(img)) {
                        best.images.push(img);
                    }
                });
                if (!best.imageUrl && other.imageUrl) {
                    best.imageUrl = other.imageUrl;
                }
            }
        }
        
        toUpdate.push(best);
        toDelete.push(...others);
        
        console.log(`   Merging: ${group.map(p => `"${p.name}"`).join(', ')}`);
        console.log(`            → Keeping: "${best.name}" (${best.scientificName || 'no scientific name'})\n`);
    }
    
    // Delete duplicates
    if (toDelete.length > 0) {
        console.log(`🗑️  Deleting ${toDelete.length} duplicate entries...`);
        for (const plant of toDelete) {
            try {
                await fs.unlink(plant.filePath);
                console.log(`   ❌ Deleted: ${plant.name}`);
            } catch (error) {
                console.log(`   ⚠️  Error: ${error.message}`);
            }
        }
    }
    
    // Update all plants
    console.log(`\n💾 Updating ${toUpdate.length + allPlants.length - toDelete.length} plants...`);
    
    // Update merged plants
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
    
    // Update plants with fixed scientific names
    for (const plant of allPlants) {
        if (plant.filePath && !toDelete.includes(plant) && !toUpdate.includes(plant)) {
            try {
                const filePath = plant.filePath;
                delete plant.filePath;
                delete plant.category;
                await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            } catch (error) {
                // Skip
            }
        }
    }
    
    console.log(`\n✅ Fix complete!`);
    console.log(`   Fixed scientific names: ${fixedNames}`);
    console.log(`   Merged duplicate groups: ${duplicates.length}`);
    console.log(`   Deleted duplicates: ${toDelete.length}`);
    console.log(`   Final plant count: ${allPlants.length - toDelete.length}`);
}

main().catch(console.error);

