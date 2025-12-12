// Comprehensive script to enhance common names using description extraction and web knowledge
const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Expanded knowledge base with more specific common names
const COMMON_NAMES_DB = {
    // Aquatic plants
    'Hygrophila difformis': ['Water Wisteria', 'Indian Water Star', 'Water Wisteria'],
    'Elodea densa': ['Brazilian Waterweed', 'Brazilian Elodea', 'Anacharis', 'Egeria densa'],
    'Phyllanthus fluitans': ['Red Root Floater', 'Red Rooted Floater', 'Floating Spurge'],
    'Microsorum pteropus': ['Java Fern', 'Java Water Fern', 'Leptochilus pteropus'],
    
    // Mosses
    'Syntrichia ruralis': ['Star Moss', 'Twisted Moss', 'Rural Syntrichia'],
    'Sphagnum palustre': ['Sphagnum Moss', 'Peat Moss', 'Bog Moss', 'Common Sphagnum'],
    'Vesicularia ferriei': ['Weeping Moss', 'Christmas Moss', 'Ferrie\'s Moss'],
    'Fissidens fontanus': ['Phoenix Moss', 'Fissidens Moss', 'Water Pocket Moss'],
    
    // Algae
    'Chaetomorpha linum': ['Spaghetti Algae', 'Green Hair Algae', 'Chaeto', 'Chaetomorpha'],
    'Gracilaria verrucosa': ['Gracilaria', 'Red Gracilaria', 'Ogonori'],
    
    // Liverworts
    'Monosolenium tenerum': ['Pellia', 'Liverwort', 'Monosolenium', 'Pellia Liverwort'],
    'Riccardia chamedryfolia': ['Mini Pellia', 'Mini Liverwort', 'Riccardia', 'Chameleon Liverwort'],
    
    // Floating plants
    'Salvinia minima': ['Water Spangles', 'Common Salvinia', 'Floating Fern', 'Watermoss'],
    'Azolla': ['Water Fern', 'Fairy Moss', 'Mosquito Fern'],
    
    // Orchids
    'Phalaenopsis amabilis': ['Moth Orchid', 'Moon Orchid', 'Butterfly Orchid', 'Phalaenopsis'],
    'Specklinia grobyi': ['Pleurothallis', 'Groby\'s Pleurothallis', 'Specklinia'],
    'Lepanthes calodictyon': ['Lepanthes', 'Jewel Orchid', 'Lepanthes Orchid'],
    
    // Carnivorous
    'Myrmecodia tuberosa': ['Ant Plant', 'Ant-house Plant', 'Myrmecodia'],
    'Pinguicula': ['Butterwort', 'Butterwort Plant'],
    'Drosera': ['Sundew', 'Dew Plant'],
    'Utricularia': ['Bladderwort', 'Floating Bladderwort'],
    'Nepenthes': ['Pitcher Plant', 'Monkey Cup', 'Tropical Pitcher Plant'],
    'Sarracenia': ['Pitcher Plant', 'Trumpet Pitcher', 'North American Pitcher Plant'],
    'Cephalotus follicularis': ['Albany Pitcher Plant', 'Australian Pitcher Plant', 'Western Australian Pitcher Plant'],
    
    // Succulents
    'Aloe vera': ['Aloe', 'Aloe Vera', 'Medicinal Aloe', 'Burn Plant', 'First Aid Plant'],
    'Echinocactus grusonii': ['Golden Barrel Cactus', 'Golden Ball Cactus', 'Mother-in-law\'s Cushion', 'Golden Barrel'],
    'Crassula ovata': ['Jade Plant', 'Money Plant', 'Lucky Plant', 'Jade Tree'],
    'Senecio rowleyanus': ['String of Pearls', 'String of Beads', 'Rosary Vine', 'Bead Vine'],
    'Ceropegia woodii': ['String of Hearts', 'Rosary Vine', 'Chain of Hearts', 'Sweetheart Vine'],
    'Echeveria': ['Echeveria', 'Mexican Snowball', 'Hens and Chicks (some species)'],
    'Haworthia': ['Haworthia', 'Zebra Plant', 'Pearl Plant', 'Window Plant'],
    'Agave': ['Agave', 'Century Plant', 'Maguey'],
    'Opuntia': ['Prickly Pear', 'Paddle Cactus', 'Nopal'],
    'Euphorbia': ['Spurge', 'Euphorbia', 'Milkweed (some species)'],
    'Adenium': ['Desert Rose', 'Impala Lily', 'Mock Azalea'],
    
    // Ferns
    'Asplenium': ['Spleenwort', 'Bird\'s Nest Fern', 'Mother Fern'],
    'Nephrolepis': ['Boston Fern', 'Sword Fern', 'Ladder Fern'],
    'Platycerium': ['Staghorn Fern', 'Elk Horn Fern', 'Antelope Ears'],
    'Davallia': ['Rabbit\'s Foot Fern', 'Hare\'s Foot Fern', 'Squirrel\'s Foot Fern'],
    'Phlebodium': ['Blue Star Fern', 'Golden Polypody', 'Polypody'],
    'Selaginella': ['Spikemoss', 'Clubmoss', 'Resurrection Plant (some species)'],
    'Pellionia': ['Pellionia', 'Trailing Watermelon Begonia', 'Rainbow Vine'],
    'Hypoestes': ['Polka Dot Plant', 'Freckle Face', 'Measles Plant'],
    
    // Houseplants
    'Oxalis': ['Purple Shamrock', 'Wood Sorrel', 'False Shamrock', 'Love Plant'],
    'Fittonia': ['Nerve Plant', 'Mosaic Plant', 'Fittonia', 'Painted Net Leaf'],
    'Tradescantia': ['Wandering Jew', 'Spiderwort', 'Inch Plant', 'Wandering Dude'],
    'Saintpaulia': ['African Violet', 'Usambara Violet'],
    'Episcia': ['Flame Violet', 'Carpet Plant', 'Peacock Plant'],
    'Aeschynanthus': ['Lipstick Plant', 'Basket Plant', 'Blushwort'],
    'Dischidia': ['Dischidia', 'Million Hearts', 'String of Nickels (some species)'],
    'Medinilla': ['Medinilla', 'Rose Grape', 'Philippine Orchid'],
    'Rhipsalis': ['Mistletoe Cactus', 'Coral Cactus', 'Rhipsalis Cactus'],
    'Peperomia': ['Peperomia', 'Radiator Plant', 'Baby Rubber Plant (some species)'],
    'Pilea': ['Chinese Money Plant', 'Pancake Plant', 'UFO Plant', 'Missionary Plant'],
    'Sansevieria': ['Snake Plant', 'Mother-in-law\'s Tongue', 'Viper\'s Bowstring Hemp', 'Saint George\'s Sword'],
    
    // Aroids
    'Anthurium': ['Flamingo Flower', 'Laceleaf', 'Tailflower', 'Painter\'s Palette'],
    'Philodendron': ['Philodendron', 'Tree Philodendron', 'Heartleaf Philodendron (some species)'],
    'Monstera': ['Swiss Cheese Plant', 'Monstera', 'Split-leaf Philodendron', 'Mexican Breadfruit'],
    'Alocasia': ['Elephant Ear', 'Alocasia', 'Giant Taro (some species)'],
    'Begonia': ['Begonia', 'Wax Begonia', 'Angel Wing Begonia (some species)'],
    'Hoya': ['Wax Plant', 'Hoya', 'Porcelain Flower', 'Honey Plant'],
    'Syngonium': ['Arrowhead Plant', 'Goosefoot Plant', 'Nephthytis'],
    
    // Bromeliads
    'Tillandsia': ['Air Plant', 'Spanish Moss', 'Old Man\'s Beard'],
    'Guzmania': ['Guzmania', 'Scarlet Star', 'Orange Star'],
    'Vriesea': ['Vriesea', 'Flaming Sword', 'Vriesea Bromeliad'],
    'Neoregelia': ['Neoregelia', 'Blushing Bromeliad', 'Neoregelia Bromeliad'],
    'Aechmea': ['Aechmea', 'Urn Plant', 'Silver Vase'],
    'Ananas': ['Pineapple', 'Pineapple Plant'],
    'Cryptanthus': ['Earth Star', 'Starfish Plant', 'Cryptanthus'],
    
    // Jewel Orchids
    'Ludisia': ['Jewel Orchid', 'Black Jewel Orchid', 'Ludisia'],
    'Macodes': ['Jewel Orchid', 'Lightning Jewel Orchid', 'Macodes'],
    'Goodyera': ['Jewel Orchid', 'Rattlesnake Plantain', 'Goodyera'],
    'Anoectochilus': ['Jewel Orchid', 'Anoectochilus'],
    
    // Other orchids
    'Masdevallia': ['Masdevallia', 'Kite Orchid', 'Masdevallia Orchid'],
    'Pleurothallis': ['Pleurothallis', 'Side-flower Orchid'],
    'Bulbophyllum': ['Bulbophyllum', 'Bulb Orchid'],
    'Dendrobium': ['Dendrobium', 'Dendrobium Orchid'],
    'Coelogyne': ['Coelogyne', 'Necklace Orchid'],
    'Restrepia': ['Restrepia', 'Restrepia Orchid'],
    'Anathallis': ['Anathallis', 'Anathallis Orchid'],
    'Dendrochilum': ['Dendrochilum', 'Chain Orchid'],
    'Aspidogyne': ['Aspidogyne', 'Aspidogyne Orchid'],
    'Acianthera': ['Acianthera', 'Acianthera Orchid'],
    'Platystele': ['Platystele', 'Platystele Orchid'],
    'Goudaea': ['Goudaea', 'Goudaea Orchid'],
    'Specklinia': ['Specklinia', 'Specklinia Orchid']
};

// Extract common names from description with better patterns
function extractFromDescription(plant) {
    const found = new Set();
    const description = (plant.description || '').toLowerCase();
    const careTips = Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '';
    const combined = description + ' ' + careTips;
    
    // Pattern 1: "commonly known as X" or "also called X"
    const pattern1 = /(?:commonly known as|also called|also known as|also referred to as|popularly known as|sometimes called|known as|called|referred to as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+[A-Z][a-z]+)*)/gi;
    let match;
    while ((match = pattern1.exec(combined)) !== null) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 60) {
            found.add(name);
        }
    }
    
    // Pattern 2: "X (common name)" or "X, also Y"
    const pattern2 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\([^)]*common[^)]*\)/gi;
    while ((match = pattern2.exec(combined)) !== null) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 60) {
            found.add(name);
        }
    }
    
    // Pattern 3: Quoted names
    const pattern3 = /"([^"]{3,50})"/g;
    while ((match = pattern3.exec(combined)) !== null) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 60 && !name.includes('(') && !name.includes(')')) {
            found.add(name);
        }
    }
    
    return Array.from(found);
}

// Get common names for a plant
function getCommonNames(plant) {
    const found = new Set();
    const name = (plant.name || '').trim();
    const scientificName = (plant.scientificName || '').trim();
    const currentCommonNames = plant.commonNames || [];
    
    // Add current common names
    if (Array.isArray(currentCommonNames)) {
        currentCommonNames.forEach(n => {
            if (n && n.trim()) found.add(n.trim());
        });
    }
    
    // Check knowledge base
    if (scientificName && COMMON_NAMES_DB[scientificName]) {
        COMMON_NAMES_DB[scientificName].forEach(n => found.add(n));
    }
    
    // Check genus-level
    const genus = scientificName.split(' ')[0];
    if (genus && COMMON_NAMES_DB[genus]) {
        COMMON_NAMES_DB[genus].forEach(n => found.add(n));
    }
    
    // Extract from description
    const fromDesc = extractFromDescription(plant);
    fromDesc.forEach(n => {
        if (n !== name && n !== scientificName) {
            found.add(n);
        }
    });
    
    // If name is different from scientific name, it's likely a common name
    if (name && name !== scientificName && !scientificName.toLowerCase().includes(name.toLowerCase())) {
        found.add(name);
    }
    
    // Remove duplicates and filter out invalid names
    const result = Array.from(found)
        .filter(n => {
            if (!n || n.length < 2 || n.length > 60) return false;
            // Filter out scientific-sounding names
            if (/^[A-Z][a-z]+\s+[a-z]+$/.test(n) && n.split(' ').length === 2) {
                // Might be scientific name, check if it's in our exclusion list
                return true; // Keep for now, can be filtered later
            }
            return true;
        })
        .sort();
    
    return result.length > 0 ? result : (name ? [name] : []);
}

async function processPlantFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const enhancedCommonNames = getCommonNames(plant);
        
        // Only update if we have meaningful common names
        if (enhancedCommonNames.length > 0) {
            const currentCommonNames = plant.commonNames || [];
            const currentSet = new Set((currentCommonNames.map(n => String(n).toLowerCase())));
            const newNames = enhancedCommonNames.filter(n => !currentSet.has(String(n).toLowerCase()));
            
            // Update if we have new names or if current is empty/minimal
            if (newNames.length > 0 || (currentCommonNames.length === 0 && enhancedCommonNames.length > 0) ||
                (currentCommonNames.length === 1 && currentCommonNames[0] === plant.name && enhancedCommonNames.length > 1)) {
                
                plant.commonNames = enhancedCommonNames;
                
                // Write back to file
                await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
                
                return { 
                    updated: true, 
                    plant: plant.name, 
                    added: newNames,
                    total: enhancedCommonNames
                };
            }
        }
        
        return { updated: false, plant: plant.name };
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return { updated: false, plant: 'unknown', error: error.message };
    }
}

async function main() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
        
        console.log(`Processing ${jsonFiles.length} plant files...\n`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const result = await processPlantFile(filePath);
            
            if (result.updated) {
                updatedCount++;
                const added = result.added.length > 0 ? ` (+${result.added.join(', ')})` : '';
                console.log(`✓ ${result.plant}: [${result.total.join(', ')}]${added}`);
            } else if (result.error) {
                errorCount++;
                console.log(`✗ ${result.plant}: Error - ${result.error}`);
            } else {
                skippedCount++;
            }
        }
        
        console.log(`\n=== Summary ===`);
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log(`Total: ${jsonFiles.length}`);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();

