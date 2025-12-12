// Add common names to first batch of 50 plants
// Based on known common names and descriptions

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Common names mapping for batch 1 plants
const commonNamesMap = {
    'Adenia viridiflora': ['Green Adenia'],
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
    'Anoectochilus burmanicus': ['Burmese Jewel Orchid'],
    'Dendrochillum tenellum': ['Grass Orchid', 'Slender Dendrochilum'],
    'Lepanthes uxoria': ['Wife\'s Lepanthes'],
    'Lepanthes tentacula': ['Tentacle Lepanthes'],
    'Lepanthes regularis': ['Regular Lepanthes'],
    'Lepanthes pelvis': ['Pelvis Lepanthes'],
    'Catopsis morreniana': ['Morren\'s Catopsis', 'Air Plant'],
    'Syngonium podophyllum': ['Arrowhead Plant', 'Arrowhead Vine', 'Goosefoot Plant', 'American Evergreen'],
    'Racinaea dyeriana': ['Dyer\'s Racinaea']
};

async function updatePlantFile(filePath, plant, newCommonNames) {
    try {
        // Merge with existing common names, avoiding duplicates (case-insensitive)
        const existing = (plant.commonNames || []).map(n => n.toLowerCase());
        const merged = [...(plant.commonNames || [])];
        
        for (const newName of newCommonNames) {
            if (!existing.includes(newName.toLowerCase()) && 
                newName.toLowerCase() !== plant.name.toLowerCase() &&
                newName.toLowerCase() !== (plant.scientificName || '').toLowerCase()) {
                merged.push(newName);
            }
        }
        
        // Update plant object
        plant.commonNames = merged;
        
        // Write back to file
        await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        
        return { success: true, commonNames: merged };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function processBatch1() {
    console.log('=== Processing Batch 1: Adding Common Names ===\n');
    
    const files = await fs.readdir(PLANTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const file of jsonFiles) {
        // Skip index.json as it's not a plant file
        if (file === 'index.json') continue;
        
        const filePath = path.join(PLANTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const scientificName = plant.scientificName || '';
        const name = plant.name || '';
        
        // Check if this plant needs common names
        let needsUpdate = false;
        let newCommonNames = [];
        
        if (commonNamesMap[scientificName]) {
            newCommonNames = commonNamesMap[scientificName];
            needsUpdate = true;
        } else if (commonNamesMap[name]) {
            newCommonNames = commonNamesMap[name];
            needsUpdate = true;
        }
        
        if (needsUpdate) {
            const result = await updatePlantFile(filePath, plant, newCommonNames);
            if (result.success) {
                console.log(`✓ ${name}: Added ${newCommonNames.join(', ')}`);
                updated++;
            } else {
                console.log(`✗ ${name}: Error - ${result.error}`);
                errors++;
            }
        } else {
            skipped++;
        }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
}

processBatch1().catch(console.error);

