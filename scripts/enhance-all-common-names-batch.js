// Enhance common names for all plants in batches of 50
// This script will check each plant and add more common names if found

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Known common names database (will be expanded with web research)
const commonNamesDatabase = {
    // Batch 1 - Already done
    'Adenia viridiflora': ['Green Adenia'],
    'Soleirolia soleirolii': ['Angel\'s Tears', 'Corsican Creeper', 'Irish Moss', 'Mind-Your-Own-Business', 'Corsican Carpet'],
    'Ficus pumila': ['Climbing Fig', 'Fig Ivy', 'Creeping Ficus'],
    'Microsorum pteropus': ['Java Water Fern'],
    'Echinodorus amazonicus': ['Amazon Sword Plant'],
    'Cryptocoryne wendtii': ['Wendtii Crypt', 'Wendt\'s Water Trumpet'],
    'Taxiphyllum barbieri': ['Singapore Moss'],
    'Eleocharis parvula': ['Dwarf Hairgrass', 'Small Spike-rush'],
    'Aegagropila linnaei': ['Marimo', 'Lake Ball'],
    'Selaginella kraussiana': ['Spike Moss', 'Krauss\'s Spikemoss'],
    'Pellionia repens': ['Trailing Watermelon Begonia'],
    'Hypoestes phyllostachya': ['Freckle Face', 'Measles Plant'],
    'Oxalis triangularis': ['False Shamrock', 'Love Plant'],
    'Fittonia albivenis': ['Mosaic Plant', 'Fittonia'],
    'Tradescantia zebrina': ['Inch Plant', 'Spiderwort'],
    'Saintpaulia ionantha': ['Usambara Violet'],
    'Rotala rotundifolia': ['Roundleaf Toothcup'],
    'Pilea cadierei': ['Watermelon Pilea'],
    'Nephrolepis cordifolia': ['Sword Fern', 'Boston Fern'],
    'Adiantum raddianum': ['Delta Maidenhair Fern'],
    'Dichondra argentea': ['Silver Ponyfoot'],
    'Hygrophila difformis': ['Water Wisteria Plant'],
    'Elodea densa': ['Brazilian Elodea', 'Anacharis'],
    'Sagittaria subulata': ['Narrow-leaved Arrowhead'],
    'Ludwigia repens': ['Red Ludwigia', 'Creeping Primrose-willow'],
    'Bacopa caroliniana': ['Blue Water Hyssop'],
    'Phyllanthus fluitans': ['Floating Spurge'],
    'Riccia fluitans': ['Floating Crystalwort'],
    'Ceratophyllum demersum': ['Coontail', 'Rigid Hornwort'],
    'Pistia stratiotes': ['Nile Cabbage', 'Water Cabbage'],
    'Limnobium laevigatum': ['Amazon Frogbit', 'South American Frogbit'],
    'Ceratopteris thalictroides': ['Water Fern', 'Indian Fern'],
    'Salvinia minima': ['Common Salvinia'],
    'Azolla filiculoides': ['Fairy Moss', 'Mosquito Fern'],
    'Hypnum cupressiforme': ['Cypress-leaved Plait-moss'],
    'Leucobryum glaucum': ['Pincushion Moss'],
    'Syntrichia ruralis': ['Twisted Moss'],
    'Dicranum scoparium': ['Broom Fork-moss'],
    'Thuidium delicatulum': ['Delicate Fern Moss'],
    'Sphagnum palustre': ['Peat Moss'],
    'Vesicularia montagnei': ['Xmas Moss'],
    'Chaetomorpha linum': ['Green Hair Algae'],
    'Halymenia durvillei': ['Red Dragon\'s Tongue'],
    'Gracilaria verrucosa': ['Red Gracilaria'],
    'Monosolenium tenerum': ['Monosolenium'],
    'Riccardia chamedryfolia': ['Coral Pellia'],
    'Cladonia rangiferina': ['Reindeer Lichen', 'Reindeer Moss', 'Caribou Moss'],
    'Lemna minor': ['Common Duckweed'],
    'Argostemma bicolor': ['Two-colored Argostemma'],
    'Arisaema filiforme': ['Thread-leaved Arisaema', 'Java Cobra Lily'],
    'Acanthostachys pitcairnioides': ['Pineapple Bromeliad'],
    'Genlisea violacea': ['Violet Corkscrew Plant'],
    'Macrocentrum droseroides': ['Drosera-like Macrocentrum'],
    'Roridula gorgonias': ['Gorgon Flycatcher', 'Gorgon Plant'],
    'Adenia spinosa': ['Spiny Adenia'],
    'Adromischus marianiae': ['Marian\'s Adromischus', 'Crinkle Leaf Plant'],
    'Aglaonema hybrid': ['Chinese Evergreen', 'Crete Aglaonema'],
    'Albuca humilis': ['Dwarf Albuca'],
    'Alluaudia procera': ['Madagascar Ocotillo', 'African Ocotillo'],
    'Aglaonema commutatum': ['Chinese Evergreen', 'Philippine Evergreen'],
    'Aglaonema pictum': ['Tricolor Chinese Evergreen', 'Painted Aglaonema'],
    'Aglaomorpha coronans': ['Snake Leaf Fern', 'Crown Fern'],
    'Actiniopteris australis': ['Eyelash Fern', 'Australian Eyelash Fern'],
    'Blechnum brasiliense': ['Brazilian Tree Fern', 'Red Brazilian Tree Fern'],
    'Elaphoglossum metallicum': ['Metallic Tongue Fern', 'Metallic Fern'],
    'Hemionitis doryopteris': ['Digit Fern', 'Heart Fern'],
    'Humata heterophylla': ['Variable Humata Fern'],
    'Elaphoglossum crinitum': ['Hairy Tongue Fern'],
    'Cyathea cooperi': ['Australian Tree Fern', 'Cooper\'s Tree Fern', 'Lacy Tree Fern'],
    'Elaphoglossum peltatum': ['Peltate Tongue Fern', 'Shield Fern'],
    'Anoectochillus formosanus': ['Formosan Jewel Orchid', 'Taiwan Jewel Orchid'],
    'Anoectochillus roxburghii': ['Marbled Jewel Orchid', 'Roxburgh\'s Jewel Orchid'],
    'Anoectochilus burmanicus': ['Burmese Jewel Orchid', 'Burma Jewel Orchid'],
    'Dendrochillum tenellum': ['Grass Orchid', 'Slender Dendrochilum'],
    'Lepanthes uxoria': ['Wife\'s Lepanthes'],
    'Lepanthes tentacula': ['Tentacle Lepanthes'],
    'Lepanthes regularis': ['Regular Lepanthes'],
    'Lepanthes pelvis': ['Pelvis Lepanthes'],
    'Catopsis morreniana': ['Morren\'s Catopsis', 'Air Plant'],
    'Syngonium podophyllum': ['Arrowhead Plant', 'Arrowhead Vine', 'Goosefoot Plant', 'American Evergreen'],
    'Racinaea dyeriana': ['Dyer\'s Racinaea']
};

// Extract common names from description text
function extractFromDescription(plant) {
    const description = plant.description || '';
    const careTips = Array.isArray(plant.careTips) ? plant.careTips.join(' ') : '';
    const combinedText = description + ' ' + careTips;
    
    const commonNames = [];
    const lowerText = combinedText.toLowerCase();
    
    // Patterns to find common names
    const patterns = [
        /(?:commonly known as|also called|also known as|popularly known as|sometimes called|colloquially called|referred to as|known as|called)\s+([^.,;()]+?)(?:[,;]|\.|$)/gi,
        /"([^"]+)"\s+(?:is|are)\s+(?:a|an|the)\s+common\s+name/gi,
        /common\s+name[s]?\s+(?:is|are|include[s]?)\s+([^.,;()]+)/gi,
        /(?:known as|called)\s+"([^"]+)"/gi,
        /(?:also|other)\s+common\s+name[s]?\s+(?:is|are|include[s]?)\s+([^.,;()]+)/gi
    ];
    
    for (const pattern of patterns) {
        const matches = combinedText.matchAll(pattern);
        for (const match of matches) {
            if (match[1]) {
                let extracted = match[1].trim()
                    .replace(/^(?:a|an|the)\s+/i, '')
                    .replace(/\s+(?:a|an|the)$/i, '')
                    .replace(/^["']|["']$/g, '')
                    .replace(/\s*\([^)]*\)\s*/g, '')
                    .trim();
                
                const names = extracted.split(/\s*[,;]\s*or\s*|\s*[,;]\s*and\s*|\s*[,;]\s*/);
                
                for (let name of names) {
                    name = name.trim();
                    if (name && name.length > 2 && name.length < 50) {
                        const formatted = name.split(/\s+/).map(word => {
                            if (word.match(/^(mc|o'|mac)/i)) {
                                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                            }
                            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                        }).join(' ');
                        
                        if (!commonNames.includes(formatted) && 
                            formatted.toLowerCase() !== plant.name.toLowerCase() &&
                            formatted.toLowerCase() !== (plant.scientificName || '').toLowerCase() &&
                            !formatted.match(/^(the|a|an)\s/i)) {
                            commonNames.push(formatted);
                        }
                    }
                }
            }
        }
    }
    
    return commonNames;
}

// Update plant file with enhanced common names
async function updatePlantFile(filePath, plant, newCommonNames) {
    try {
        const existing = (plant.commonNames || []).map(n => n.toLowerCase());
        const merged = [...(plant.commonNames || [])];
        
        for (const newName of newCommonNames) {
            if (!existing.includes(newName.toLowerCase()) && 
                newName.toLowerCase() !== plant.name.toLowerCase() &&
                newName.toLowerCase() !== (plant.scientificName || '').toLowerCase()) {
                merged.push(newName);
            }
        }
        
        plant.commonNames = merged;
        await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        
        return { success: true, commonNames: merged };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Process a batch
async function processBatch(batchNumber = 1, batchSize = 50) {
    console.log(`\n=== Processing Batch ${batchNumber} ===\n`);
    
    const files = await fs.readdir(PLANTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json').sort();
    
    const startIndex = (batchNumber - 1) * batchSize;
    const endIndex = startIndex + batchSize;
    const batch = jsonFiles.slice(startIndex, endIndex);
    
    console.log(`Processing plants ${startIndex + 1} to ${Math.min(endIndex, jsonFiles.length)} of ${jsonFiles.length}\n`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (let i = 0; i < batch.length; i++) {
        const file = batch[i];
        const filePath = path.join(PLANTS_DIR, file);
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            console.log(`[${i + 1}/${batch.length}] ${plant.name} (${plant.scientificName || 'N/A'})`);
            
            // Check database first
            let newCommonNames = [];
            if (commonNamesDatabase[plant.scientificName]) {
                newCommonNames = commonNamesDatabase[plant.scientificName];
            } else if (commonNamesDatabase[plant.name]) {
                newCommonNames = commonNamesDatabase[plant.name];
            }
            
            // Also extract from description
            const descNames = extractFromDescription(plant);
            newCommonNames = [...new Set([...newCommonNames, ...descNames])];
            
            if (newCommonNames.length > 0) {
                const result = await updatePlantFile(filePath, plant, newCommonNames);
                if (result.success) {
                    const added = newCommonNames.filter(n => 
                        !(plant.commonNames || []).map(c => c.toLowerCase()).includes(n.toLowerCase())
                    );
                    if (added.length > 0) {
                        console.log(`  ✓ Added: ${added.join(', ')}`);
                        updated++;
                    } else {
                        console.log(`  - Already has these names`);
                        skipped++;
                    }
                } else {
                    console.log(`  ✗ Error: ${result.error}`);
                    errors++;
                }
            } else {
                console.log(`  - No additional common names found`);
                skipped++;
            }
            
        } catch (error) {
            console.log(`  ✗ Error: ${error.message}`);
            errors++;
        }
    }
    
    console.log(`\n=== Batch ${batchNumber} Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`\nNext batch: node scripts/enhance-all-common-names-batch.js ${batchNumber + 1}`);
}

// Main
const batchNumber = parseInt(process.argv[2]) || 1;
processBatch(batchNumber, 50).catch(console.error);

