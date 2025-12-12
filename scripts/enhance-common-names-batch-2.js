// Enhance common names for batch 2 (plants 51-100)
// Based on known common names and descriptions

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Extended common names database for batch 2
const commonNamesMap = {
    // Ferns
    'Nephrolepis cordifolia': ['Lemon Button Fern', 'Sword Fern', 'Boston Fern'],
    'Adiantum raddianum': ['Delta Maidenhair Fern', 'Maidenhair Fern'],
    'Actiniopteris australis': ['Eyelash Fern', 'Australian Eyelash Fern'],
    'Blechnum brasiliense': ['Brazilian Tree Fern', 'Red Brazilian Tree Fern'],
    'Elaphoglossum metallicum': ['Metallic Tongue Fern', 'Metallic Fern'],
    'Hemionitis doryopteris': ['Digit Fern', 'Heart Fern'],
    'Cyathea cooperi': ['Australian Tree Fern', 'Cooper\'s Tree Fern', 'Lacy Tree Fern'],
    
    // Aquatic plants
    'Ceratophyllum demersum': ['Hornwort', 'Coontail', 'Rigid Hornwort'],
    'Pistia stratiotes': ['Water Lettuce', 'Nile Cabbage', 'Water Cabbage'],
    'Limnobium laevigatum': ['Amazon Frogbit', 'Frogbit', 'South American Frogbit'],
    'Ceratopteris thalictroides': ['Water Sprite', 'Water Fern', 'Indian Fern'],
    'Salvinia minima': ['Water Spangles', 'Common Salvinia'],
    'Azolla filiculoides': ['Water Fern', 'Fairy Moss', 'Mosquito Fern'],
    
    // Mosses
    'Hypnum cupressiforme': ['Sheet Moss', 'Cypress-leaved Plait-moss'],
    'Leucobryum glaucum': ['Cushion Moss', 'Pincushion Moss'],
    'Syntrichia ruralis': ['Star Moss', 'Twisted Moss'],
    'Dicranum scoparium': ['Mood Moss', 'Broom Fork-moss'],
    'Thuidium delicatulum': ['Fern Moss', 'Delicate Fern Moss'],
    'Sphagnum palustre': ['Sphagnum Moss', 'Peat Moss'],
    'Vesicularia montagnei': ['Christmas Moss', 'Xmas Moss'],
    'Vesicularia ferriei': ['Weeping Moss'],
    'Fissidens fontanus': ['Phoenix Moss'],
    
    // Algae
    'Chaetomorpha linum': ['Spaghetti Algae', 'Green Hair Algae'],
    'Halymenia durvillei': ['Dragon\'s Tongue Algae', 'Red Dragon\'s Tongue'],
    'Gracilaria verrucosa': ['Gracilaria', 'Red Gracilaria'],
    'Monosolenium tenerum': ['Pellia', 'Monosolenium'],
    'Riccardia chamedryfolia': ['Mini Pellia', 'Coral Pellia'],
    'Cladonia rangiferina': ['Reindeer Lichen', 'Reindeer Moss', 'Caribou Moss'],
    'Lemna minor': ['Duckweed', 'Common Duckweed'],
    
    // Other plants
    'Ficus pumila': ['Creeping Fig', 'Climbing Fig', 'Fig Ivy'],
    'Microsorum pteropus': ['Java Fern', 'Java Water Fern'],
    'Echinodorus amazonicus': ['Amazon Sword', 'Amazon Sword Plant'],
    'Cryptocoryne wendtii': ['Wendt\'s Crypt', 'Wendtii Crypt', 'Wendt\'s Water Trumpet'],
    'Taxiphyllum barbieri': ['Java Moss', 'Singapore Moss'],
    'Eleocharis parvula': ['Hairgrass', 'Dwarf Hairgrass', 'Small Spike-rush'],
    'Aegagropila linnaei': ['Marimo Moss Ball', 'Marimo', 'Lake Ball'],
    'Selaginella kraussiana': ['Selaginella', 'Spike Moss', 'Krauss\'s Spikemoss'],
    'Pellionia repens': ['Pellionia', 'Trailing Watermelon Begonia'],
    'Hypoestes phyllostachya': ['Polka Dot Plant', 'Freckle Face', 'Measles Plant'],
    'Oxalis triangularis': ['Purple Shamrock', 'False Shamrock', 'Love Plant'],
    'Fittonia albivenis': ['Nerve Plant', 'Mosaic Plant', 'Fittonia'],
    'Tradescantia zebrina': ['Wandering Jew', 'Inch Plant', 'Spiderwort'],
    'Saintpaulia ionantha': ['African Violet', 'Usambara Violet'],
    'Rotala rotundifolia': ['Dwarf Rotala', 'Roundleaf Toothcup'],
    'Pilea cadierei': ['Aluminum Plant', 'Watermelon Pilea'],
    'Dichondra argentea': ['Silver Falls', 'Silver Ponyfoot'],
    'Hygrophila difformis': ['Water Wisteria', 'Water Wisteria Plant'],
    'Elodea densa': ['Brazilian Waterweed', 'Brazilian Elodea', 'Anacharis'],
    'Sagittaria subulata': ['Dwarf Sagittaria', 'Narrow-leaved Arrowhead'],
    'Ludwigia repens': ['Creeping Ludwigia', 'Red Ludwigia', 'Creeping Primrose-willow'],
    'Bacopa caroliniana': ['Lemon Bacopa', 'Blue Water Hyssop'],
    'Phyllanthus fluitans': ['Red Root Floater', 'Floating Spurge'],
    'Riccia fluitans': ['Crystalwort', 'Floating Crystalwort']
};

// Extract common names from description
function extractFromDescription(plant) {
    const description = plant.description || '';
    const careTips = Array.isArray(plant.careTips) ? plant.careTips.join(' ') : '';
    const combinedText = description + ' ' + careTips;
    
    const commonNames = [];
    
    const patterns = [
        /(?:commonly known as|also called|also known as|popularly known as|sometimes called|colloquially called|referred to as|known as|called)\s+([^.,;()]+?)(?:[,;]|\.|$)/gi,
        /"([^"]+)"\s+(?:is|are)\s+(?:a|an|the)\s+common\s+name/gi,
        /common\s+name[s]?\s+(?:is|are|include[s]?)\s+([^.,;()]+)/gi,
        /(?:known as|called)\s+"([^"]+)"/gi
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

async function processBatch2() {
    console.log('=== Processing Batch 2: Plants 51-100 ===\n');
    
    const files = await fs.readdir(PLANTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json').sort();
    
    const batch = jsonFiles.slice(50, 100); // Plants 51-100
    
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
            
            let newCommonNames = [];
            
            // Check database
            if (commonNamesMap[plant.scientificName]) {
                newCommonNames = commonNamesMap[plant.scientificName];
            } else if (commonNamesMap[plant.name]) {
                newCommonNames = commonNamesMap[plant.name];
            }
            
            // Extract from description
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
    
    console.log(`\n=== Batch 2 Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`\nNext batch: node scripts/enhance-common-names-batch-2.js 3`);
}

// Support batch numbers
const batchNum = parseInt(process.argv[2]) || 2;
if (batchNum === 2) {
    processBatch2().catch(console.error);
} else {
    console.log('This script is for batch 2. Use enhance-all-common-names-batch.js for other batches.');
}

