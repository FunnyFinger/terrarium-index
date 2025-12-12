// Properly fix duplicates - only merge TRUE duplicates (same species)
// Do NOT merge different species in the same genus

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Get base scientific name (genus + species)
 */
function getBaseScientific(scientificName) {
    if (!scientificName) return null;
    
    let normalized = scientificName
        .toLowerCase()
        .replace(/['"]/g, '')
        .trim();
    
    // Remove variant/cultivar info but keep species
    normalized = normalized.replace(/\s+var\.\s+\w+/gi, '');
    normalized = normalized.replace(/\s+cv\.\s+\w+/gi, '');
    normalized = normalized.replace(/\s+variegat[ea]/gi, '');
    
    // Extract genus + species (first two meaningful words)
    const parts = normalized.split(/\s+/).filter(p => 
        p.length > 0 && 
        !p.match(/^(var|ssp|subsp|f|form|cultivar|cv)\.?$/i) &&
        !p.match(/^(x|×)$/) // Handle hybrids
    );
    
    if (parts.length >= 2) {
        // Check for hybrid notation before species
        if (parts[1] === 'x' || parts[1] === '×') {
            return parts[0] + ' ' + parts[1] + ' ' + (parts[2] || '');
        }
        return parts[0] + ' ' + parts[1];
    }
    
    return normalized;
}

/**
 * Check if two plants are the EXACT same species (not just same genus)
 */
function areExactSameSpecies(plant1, plant2) {
    const base1 = getBaseScientific(plant1.scientificName);
    const base2 = getBaseScientific(plant2.scientificName);
    
    // Must have matching base scientific names
    if (!base1 || !base2) return false;
    if (base1 !== base2) return false;
    
    // If they have different specific names (e.g., "Alocasia azlanii" vs "Alocasia amazonica"), they're different
    const sci1 = (plant1.scientificName || '').toLowerCase();
    const sci2 = (plant2.scientificName || '').toLowerCase();
    
    // Extract second word (species epithet)
    const parts1 = sci1.split(/\s+/).filter(p => p && p !== 'x' && p !== '×');
    const parts2 = sci2.split(/\s+/).filter(p => p && p !== 'x' && p !== '×');
    
    if (parts1.length >= 2 && parts2.length >= 2) {
        // Different species epithets = different species
        if (parts1[1] !== parts2[1]) {
            return false;
        }
    }
    
    return true;
}

/**
 * Check if two plants are the same by common name (e.g., Fittonia = Nerve Plant)
 */
function areSameByCommonName(plant1, plant2) {
    const name1 = (plant1.name || '').toLowerCase();
    const name2 = (plant2.name || '').toLowerCase();
    
    // Known duplicates (same plant, different names)
    const duplicatePairs = [
        ['fittonia', 'nerve plant'],
        ['baby tears', "baby's tears"],
        ['peperomia', 'peperomia caperata'],
        ['syngonium', 'arrowhead'],
        ['oxalis', 'purple shamrock'],
        ['selaginella', 'resurrection plant']
    ];
    
    for (const [nameA, nameB] of duplicatePairs) {
        if ((name1.includes(nameA) && name2.includes(nameB)) ||
            (name1.includes(nameB) && name2.includes(nameA))) {
            return true;
        }
    }
    
    // Remove size indicators and check
    const clean1 = name1.replace(/\s*(mini|dwarf|small|large|xl)\b/gi, '').trim();
    const clean2 = name2.replace(/\s*(mini|dwarf|small|large|xl)\b/gi, '').trim();
    
    if (clean1 === clean2) return true;
    
    return false;
}

/**
 * Fix scientific name if it's missing or invalid
 */
async function fixScientificName(plant) {
    const current = plant.scientificName || '';
    
    // If it's already good (has genus + species, not just "sp" or generic)
    if (current && 
        current.length > 8 && 
        !current.toLowerCase().includes('sp') &&
        !current.toLowerCase().includes('species') &&
        !current.toLowerCase().includes('hybrid') &&
        current.match(/^[A-Z][a-z]+\s+[a-z]+/)) {
        return current;
    }
    
    const name = (plant.name || '').toLowerCase();
    
    // Common name to scientific mapping
    const mappings = {
        'fittonia': 'Fittonia albivenis',
        'nerve plant': 'Fittonia albivenis',
        "baby's tears": 'Soleirolia soleirolii',
        'baby tears': 'Soleirolia soleirolii',
        'peperomia': 'Peperomia caperata',
        'hoya': 'Hoya carnosa',
        'begonia': 'Begonia rex',
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
        'bromeliad': 'Bromeliaceae family'
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
            /([A-Z][a-z]+\s+[a-z]+(?:\s+x\s+[a-z]+)?)/,
            /Scientific name[:\s]+([A-Z][a-z]+\s+[a-z]+)/i,
            /Binomial[:\s]+([A-Z][a-z]+\s+[a-z]+)/i,
            /([A-Z][a-z]+\s+[a-z]+\s+[a-z]+)/
        ];
        
        for (const pattern of patterns) {
            const match = plant.description.match(pattern);
            if (match && match[1] && match[1].length > 8 && match[1].length < 50) {
                return match[1].trim();
            }
        }
    }
    
    return null;
}

async function main() {
    console.log('🔧 Fixing Duplicates and Scientific Names Properly...\n');
    
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
    
    // Fix scientific names first
    console.log('🔬 Fixing scientific names...');
    let fixedNames = 0;
    
    for (const plant of allPlants) {
        const fixedSci = await fixScientificName(plant);
        if (fixedSci && (!plant.scientificName || plant.scientificName !== fixedSci)) {
            const old = plant.scientificName || 'none';
            plant.scientificName = fixedSci;
            fixedNames++;
        }
    }
    
    console.log(`   Fixed ${fixedNames} scientific names\n`);
    
    // Find TRUE duplicates (same species OR same common name)
    const duplicates = [];
    const processed = new Set();
    
    for (let i = 0; i < allPlants.length; i++) {
        if (processed.has(i)) continue;
        
        const plant1 = allPlants[i];
        const group = [plant1];
        
        for (let j = i + 1; j < allPlants.length; j++) {
            if (processed.has(j)) continue;
            
            const plant2 = allPlants[j];
            
            // Check if same species OR same by common name
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
    
    console.log(`🔍 Found ${duplicates.length} duplicate groups\n`);
    
    // Merge duplicates
    const toDelete = [];
    const toUpdate = [];
    
    for (const group of duplicates) {
        // Keep the best one
        const best = group.reduce((best, current) => {
            const bestScore = (best.description?.length || 0) + 
                             (best.scientificName?.length || 0) * 3 +
                             (best.images?.length || 0) * 10;
            const currentScore = (current.description?.length || 0) + 
                                (current.scientificName?.length || 0) * 3 +
                                (current.images?.length || 0) * 10;
            return currentScore > bestScore ? current : best;
        });
        
        const others = group.filter(p => p !== best);
        
        // Merge data into best
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
        
        console.log(`   Merging: ${group.map(p => p.name).join(', ')}`);
        console.log(`            → Keeping: "${best.name}"\n`);
    }
    
    // Delete duplicates
    console.log(`🗑️  Deleting ${toDelete.length} duplicate entries...`);
    for (const plant of toDelete) {
        try {
            await fs.unlink(plant.filePath);
        } catch (error) {
            console.log(`   ⚠️  Error deleting ${plant.name}: ${error.message}`);
        }
    }
    
    // Update plants
    console.log(`\n💾 Updating ${toUpdate.length} plants...`);
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
    
    // Update all plants with fixed scientific names
    for (const plant of allPlants) {
        if (plant.filePath && !toDelete.includes(plant)) {
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
}

main().catch(console.error);

