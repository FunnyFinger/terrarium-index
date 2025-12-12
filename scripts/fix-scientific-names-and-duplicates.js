// Fix scientific names and merge duplicate entries
// 1. Fix missing/incorrect scientific names
// 2. Merge duplicates based on common names
// 3. Ensure all plants have proper scientific names

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Common name to scientific name mapping
const commonToScientific = {
    'fittonia': 'Fittonia albivenis',
    'nerve plant': 'Fittonia albivenis',
    'baby tears': 'Soleirolia soleirolii',
    "baby's tears": 'Soleirolia soleirolii',
    'peperomia': 'Peperomia caperata',
    'hoya': 'Hoya carnosa',
    'begonia': 'Begonia rex',
    'alocasia': 'Alocasia amazonica',
    'anthurium': 'Anthurium andraeanum',
    'aglaonema': 'Aglaonema commutatum',
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
    'silver falls': 'Dichondra argentea'
};

/**
 * Extract or fix scientific name
 */
async function fixScientificName(plant) {
    // If already has good scientific name, return it
    if (plant.scientificName && 
        plant.scientificName.length > 5 && 
        !plant.scientificName.includes('sp') &&
        !plant.scientificName.includes('species') &&
        !plant.scientificName.includes('hybrid') &&
        !plant.scientificName.match(/^[a-z]+\s+[a-z]+$/i)) {
        return plant.scientificName;
    }
    
    const name = (plant.name || '').toLowerCase();
    
    // Try common name mapping
    for (const [common, scientific] of Object.entries(commonToScientific)) {
        if (name.includes(common)) {
            return scientific;
        }
    }
    
    // Try to extract from description
    if (plant.description) {
        const sciPatterns = [
            /([A-Z][a-z]+\s+[a-z]+(?:\s+x\s+[a-z]+)?)/,  // Genus species
            /([A-Z][a-z]+\s+[a-z]+\s+[a-z]+)/,           // Three-word names
            /Scientific name[:\s]+([A-Z][a-z]+\s+[a-z]+)/i,
            /Binomial[:\s]+([A-Z][a-z]+\s+[a-z]+)/i
        ];
        
        for (const pattern of sciPatterns) {
            const match = plant.description.match(pattern);
            if (match && match[1] && match[1].length > 5 && match[1].length < 50) {
                return match[1].trim();
            }
        }
    }
    
    // Try to extract from name if it looks scientific
    const nameMatch = plant.name.match(/^([A-Z][a-z]+\s+[a-z]+(?:\s+x\s+[a-z]+)?)/);
    if (nameMatch) {
        return nameMatch[1];
    }
    
    return null; // Could not determine
}

/**
 * Normalize common name for comparison
 */
function normalizeCommonName(name) {
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical
        .replace(/mini|dwarf|small|large|xl/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Check if two plants are the same based on common names
 */
function areSamePlant(plant1, plant2) {
    const name1 = normalizeCommonName(plant1.name);
    const name2 = normalizeCommonName(plant2.name);
    
    // Common duplicates
    const duplicates = [
        ['fittonia', 'nerve plant'],
        ["baby's tears", "baby tears", 'soleirolia'],
        ['peperomia', 'peperomia caperata'],
        ['hoya', 'wax plant'],
        ['begonia', 'rex begonia'],
        ['alocasia', 'alocasia amazonica'],
        ['anthurium', 'flamingo flower'],
        ['syngonium', 'arrowhead'],
        ['oxalis', 'purple shamrock'],
        ['selaginella', 'resurrection plant'],
        ['pellaea', 'button fern'],
        ['pellionia', 'trailing watermelon']
    ];
    
    // Check if both match a duplicate group
    for (const group of duplicates) {
        const match1 = group.some(g => name1.includes(g));
        const match2 = group.some(g => name2.includes(g));
        if (match1 && match2) {
            return true;
        }
    }
    
    // Direct match
    if (name1 === name2) return true;
    
    // One contains the other
    if (name1.includes(name2) || name2.includes(name1)) {
        // But not if they're clearly different (e.g., "Alocasia azlanii" vs "Alocasia amazonica")
        const words1 = name1.split(' ');
        const words2 = name2.split(' ');
        if (words1.length >= 2 && words2.length >= 2) {
            // If both have scientific-sounding names, check if genus matches
            if (words1[0] === words2[0] && words1[1] !== words2[1]) {
                return false; // Different species
            }
        }
        return true;
    }
    
    return false;
}

async function main() {
    console.log('🔧 Fixing Scientific Names and Merging Duplicates...\n');
    
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
                plant.filename = file;
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
        
        if (fixedSci && (!plant.scientificName || 
            plant.scientificName.length < 5 ||
            plant.scientificName.includes('sp') ||
            plant.scientificName.includes('species') ||
            plant.scientificName.includes('hybrid') ||
            plant.scientificName === fixedSci)) {
            
            if (!plant.scientificName || plant.scientificName !== fixedSci) {
                const old = plant.scientificName || 'none';
                plant.scientificName = fixedSci;
                nameFixes.push({ plant: plant.name, old, new: fixedSci });
                fixedNames++;
            }
        }
    }
    
    console.log(`   Fixed ${fixedNames} scientific names\n`);
    
    // Find duplicates by common name
    console.log('🔍 Finding duplicates by common name...');
    const duplicates = [];
    const processed = new Set();
    
    for (let i = 0; i < allPlants.length; i++) {
        if (processed.has(i)) continue;
        
        const plant1 = allPlants[i];
        const group = [plant1];
        
        for (let j = i + 1; j < allPlants.length; j++) {
            if (processed.has(j)) continue;
            
            const plant2 = allPlants[j];
            if (areSamePlant(plant1, plant2)) {
                group.push(plant2);
                processed.add(j);
            }
        }
        
        if (group.length > 1) {
            duplicates.push(group);
            processed.add(i);
        }
    }
    
    console.log(`   Found ${duplicates.length} duplicate groups\n`);
    
    // Merge duplicates
    const toDelete = [];
    const toUpdate = [];
    
    for (const group of duplicates) {
        // Keep the best one
        const best = group.reduce((best, current) => {
            const bestScore = (best.description?.length || 0) + 
                             (best.scientificName?.length || 0) * 2 +
                             (best.images?.length || 0) * 10 +
                             (best.scientificName && best.scientificName.length > 10 ? 20 : 0);
            const currentScore = (current.description?.length || 0) + 
                                (current.scientificName?.length || 0) * 2 +
                                (current.images?.length || 0) * 10 +
                                (current.scientificName && current.scientificName.length > 10 ? 20 : 0);
            return currentScore > bestScore ? current : best;
        });
        
        const others = group.filter(p => p !== best);
        
        // Merge data
        for (const other of others) {
            if (other.scientificName && (!best.scientificName || other.scientificName.length > best.scientificName.length)) {
                best.scientificName = other.scientificName;
            }
            if (other.description && (!best.description || other.description.length > best.description.length)) {
                best.description = other.description;
            }
            if (other.images && other.images.length > 0) {
                if (!best.images) best.images = [];
                other.images.forEach(img => {
                    if (!best.images.includes(img)) {
                        best.images.push(img);
                    }
                });
            }
        }
        
        toUpdate.push(best);
        toDelete.push(...others);
        
        console.log(`   Merging: ${group.map(p => p.name).join(', ')} → keeping "${best.name}"`);
    }
    
    // Delete duplicates
    console.log(`\n🗑️  Deleting ${toDelete.length} duplicate entries...`);
    for (const plant of toDelete) {
        try {
            await fs.unlink(plant.filePath);
            console.log(`   ❌ Deleted: ${plant.name}`);
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}`);
        }
    }
    
    // Update plants with fixed names
    console.log(`\n💾 Updating ${toUpdate.length + nameFixes.length} plants...`);
    for (const plant of toUpdate) {
        try {
            const filePath = plant.filePath;
            delete plant.filePath;
            delete plant.category;
            delete plant.filename;
            
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
        } catch (error) {
            console.log(`   ⚠️  Error updating ${plant.name}: ${error.message}`);
        }
    }
    
    // Update plants with fixed scientific names
    for (const fix of nameFixes) {
        const plant = allPlants.find(p => p.name === fix.plant);
        if (plant && plant.filePath && !toDelete.includes(plant)) {
            try {
                const filePath = plant.filePath;
                delete plant.filePath;
                delete plant.category;
                delete plant.filename;
                
                await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            } catch (error) {
                // Skip
            }
        }
    }
    
    console.log(`\n✅ Fix complete!`);
    console.log(`   Fixed scientific names: ${fixedNames}`);
    console.log(`   Merged duplicates: ${duplicates.length} groups`);
    console.log(`   Deleted: ${toDelete.length} duplicate entries`);
}

main().catch(console.error);

