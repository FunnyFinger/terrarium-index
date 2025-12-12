// Find and fix all plants with missing, incorrect, or generic scientific names

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Comprehensive mapping of common names to scientific names
const COMMON_TO_SCIENTIFIC = {
    // Fittonia/Nerve Plant
    'fittonia': 'Fittonia albivenis',
    'nerve plant': 'Fittonia albivenis',
    'mosaic plant': 'Fittonia albivenis',
    
    // Baby Tears
    "baby's tears": 'Soleirolia soleirolii',
    'baby tears': 'Soleirolia soleirolii',
    
    // Others
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
    'silver falls': 'Dichondra argentea'
};

/**
 * Check if scientific name is valid
 */
function isValidScientificName(scientificName) {
    if (!scientificName || scientificName.length < 5) return false;
    
    const sci = scientificName.toLowerCase();
    
    // Reject generic/placeholder names
    if (sci.match(/\b(sp|species|hybrid|noid|unknown|various|mix)\b/)) {
        return false;
    }
    
    // Reject if it's corrupted (has descriptive text at start or end)
    if (scientificName.length > 50 || 
        scientificName.match(/\s+(is|are|has|originates|found|native|forms)\s+/i) ||
        scientificName.match(/^(is|are|has|originates|found|native|forms)\s+/i) ||
        scientificName.match(/\s+(is|are|has|originates|found|native|forms)$/i)) {
        return false;
    }
    
    // Must be in format: Genus species (at minimum)
    if (!scientificName.match(/^[A-Z][a-z]+(?:\s+[a-z]+(?:\s+[a-z]+)?)?/)) {
        return false;
    }
    
    return true;
}

/**
 * Fix scientific name
 */
async function fixScientificName(plant) {
    const current = plant.scientificName || '';
    
    // If already valid, return it
    if (isValidScientificName(current)) {
        return current;
    }
    
    const name = (plant.name || '').toLowerCase();
    
    // Try common name mappings
    for (const [common, scientific] of Object.entries(COMMON_TO_SCIENTIFIC)) {
        if (name.includes(common)) {
            return scientific;
        }
    }
    
    // Try to extract from description - be more careful
    if (plant.description) {
        // First, try to find explicit scientific name mentions
        const explicitPatterns = [
            /Scientific name[:\s]+([A-Z][a-z]+\s+[a-z]+(?:\s+[a-z]+)?)/i,
            /Binomial[:\s]+([A-Z][a-z]+\s+[a-z]+(?:\s+[a-z]+)?)/i,
            /([A-Z][a-z]+\s+[a-z]+)\s+is\s+a\s+species/i,  // "Genus species is a species"
            /([A-Z][a-z]+\s+[a-z]+)\s+\(formerly\s+known/i  // "Genus species (formerly known"
        ];
        
        for (const pattern of explicitPatterns) {
            const matches = plant.description.match(pattern);
            if (matches && matches[1]) {
                const extracted = matches[1].trim();
                if (isValidScientificName(extracted)) {
                    return extracted;
                }
            }
        }
        
        // Then try generic patterns, but be more strict
        const genericPatterns = [
            /^([A-Z][a-z]+\s+[a-z]+(?:\s+x\s+[a-z]+)?)\s+is/i,  // First sentence
            /([A-Z][a-z]+\s+[a-z]+(?:\s+['"][^'"]+['"])?)/      // Anywhere but validate carefully
        ];
        
        for (const pattern of genericPatterns) {
            const matches = plant.description.match(pattern);
            if (matches && matches[1]) {
                const extracted = matches[1].trim();
                // Only accept if it's clearly a scientific name
                if (isValidScientificName(extracted) && 
                    !extracted.match(/\b(is|are|has|originates|native|found)\b/i)) {
                    return extracted;
                }
            }
        }
    }
    
    // Try to extract from name if it looks scientific
    const nameMatch = plant.name.match(/^([A-Z][a-z]+\s+[a-z]+(?:\s+[a-z]+)?)/);
    if (nameMatch && isValidScientificName(nameMatch[1])) {
        return nameMatch[1];
    }
    
    return null;
}

async function main() {
    console.log('🔬 Fixing All Scientific Names...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents', 'other'];
    
    const allPlants = [];
    const problems = [];
    
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
    
    // Find problems
    for (const plant of allPlants) {
        if (!isValidScientificName(plant.scientificName)) {
            problems.push(plant);
        }
    }
    
    console.log(`⚠️  Plants with missing/invalid scientific names: ${problems.length}\n`);
    
    // Fix problems
    let fixed = 0;
    const fixes = [];
    
    for (const plant of problems) {
        const fixedSci = await fixScientificName(plant);
        if (fixedSci) {
            const old = plant.scientificName || 'none';
            plant.scientificName = fixedSci;
            fixes.push({ name: plant.name, old, new: fixedSci });
            fixed++;
        } else {
            console.log(`   ⚠️  Could not fix: ${plant.name} (${plant.scientificName || 'no scientific name'})`);
        }
    }
    
    console.log(`\n✅ Fixed ${fixed} scientific names:\n`);
    fixes.slice(0, 30).forEach(fix => {
        console.log(`   "${fix.name}": "${fix.old}" → "${fix.new}"`);
    });
    if (fixes.length > 30) {
        console.log(`   ... and ${fixes.length - 30} more`);
    }
    
    // Save fixes
    console.log(`\n💾 Saving fixes...`);
    for (const plant of problems) {
        if (plant.filePath) {
            try {
                const filePath = plant.filePath;
                delete plant.filePath;
                delete plant.category;
                await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            } catch (error) {
                console.log(`   ⚠️  Error updating ${plant.name}: ${error.message}`);
            }
        }
    }
    
    console.log(`\n✅ Done! Fixed ${fixed} out of ${problems.length} plants`);
}

main().catch(console.error);

