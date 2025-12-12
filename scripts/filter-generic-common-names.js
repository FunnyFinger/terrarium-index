// Filter out generic/trash common names from all plants
// Uses intelligent criteria to identify and remove non-useful common names

const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '../data/plants-merged');

// Generic names that appear too frequently and don't add value
const GENERIC_NAMES = new Set([
    // Just genus names (too generic)
    'Anthurium', 'Philodendron', 'Hoya', 'Begonia', 'Alocasia', 'Monstera',
    'Peperomia', 'Tillandsia', 'Masdevallia', 'Lepanthes', 'Agave', 'Adenia',
    'Albuca', 'Anoectochilus', 'Aspidogyne', 'Bulbophyllum', 'Cryptanthus',
    'Dracaena', 'Elaphoglossum', 'Episcia', 'Ficus', 'Macodes', 'Pilea',
    'Pleurothallis', 'Restrepia', 'Specklinia', 'Utricularia', 'Vriesea',
    'Cryptocoryne', 'Ludwigia', 'Rotala', 'Sagittaria', 'Selaginella',
    'Sphagnum', 'Taxiphyllum', 'Vesicularia', 'Phalaenopsis', 'Ludisia',
    'Nepenthes', 'Sarracenia', 'Drosera', 'Pinguicula', 'Rhipsalis',
    'Echeveria', 'Haworthia', 'Senecio', 'Aloe', 'Euphorbia', 'Opuntia',
    'Aglaonema', 'Syngonium', 'Fittonia', 'Hypoestes', 'Tradescantia',
    'Chlorophytum', 'Scindapsus', 'Epipremnum', 'Ceropegia', 'Crassula',
    'Sedum', 'Sempervivum', 'Oxalis', 'Maranta', 'Calathea', 'Goeppertia',
    'Dischidia', 'Callisia', 'Plectranthus', 'Saxifraga', 'Soleirolia',
    'Biophytum', 'Arisaema', 'Aristolochia', 'Asarum', 'Asparagus',
    'Asplenium', 'Azolla', 'Bacopa', 'Blechnum', 'Byblis', 'Catopsis',
    'Cephalotus', 'Ceratophyllum', 'Ceratopteris', 'Cissus', 'Cladonia',
    'Columnea', 'Cryptocoryne', 'Cyathea', 'Darlingtonia', 'Davallia',
    'Dendrochilum', 'Dichondra', 'Dicksonia', 'Dicranum', 'Dionaea',
    'Dioscorea', 'Dossinia', 'Dryopteris', 'Drynaria', 'Echinodorus',
    'Eleocharis', 'Elodea', 'Epiphyllum', 'Fissidens', 'Genlisea',
    'Hedera', 'Heliamphora', 'Hemionitis', 'Hygrophila', 'Hypnum',
    'Kleinia', 'Kroenleinia', 'Labisia', 'Lecanopteris', 'Lemna',
    'Leucobryum', 'Limnobium', 'Marcgravia', 'Medinilla', 'Mentha',
    'Microsorum', 'Monosolenium', 'Mycena', 'Myrmecodia', 'Neoregelia',
    'Nephrolepis', 'Pellaea', 'Pellionia', 'Phlebodium', 'Phyllanthus',
    'Pistia', 'Platycerium', 'Pogonatum', 'Procris', 'Pteris', 'Racinaea',
    'Rhaphidophora', 'Riccardia', 'Riccia', 'Roridula', 'Saintpaulia',
    'Salvinia', 'Syntrichia', 'Thuidium', 'Wallisia',
    
    // Too generic descriptors
    'Plant', 'Fern', 'Orchid', 'Cactus', 'Succulent', 'Moss', 'Algae',
    'Liverwort', 'Bromeliad', 'Vine', 'Tree', 'Shrub', 'Herb',
    
    // Generic qualifiers that don't add value
    'Air Plant', 'Water Plant', 'Aquatic Plant', 'Terrarium Plant',
    'House Plant', 'Indoor Plant', 'Tropical Plant',
    
    // Very common names that appear in many plants (too generic)
    'Century Plant', 'Basket Plant', 'Jewel Orchid', 'Pitcher Plant',
    'Bladderwort', 'Butterwort', 'Sundew', 'Spiderwort', 'Arrowhead Plant',
    'Nerve Plant', 'Polka Dot Plant', 'String of Hearts', 'String of Pearls',
    'String of Beads', 'String of Turtles', 'String of Nickels',
    'Baby Tears', 'Baby\'s Tears', 'Angel\'s Tears', 'Mother Fern',
    'Rabbit\'s Foot Fern', 'Staghorn Fern', 'Elk Horn Fern',
    'Bird\'s Nest Fern', 'Maidenhair Fern', 'Button Fern', 'Sword Fern',
    'Boston Fern', 'Ladder Fern', 'Ribbon Fern', 'Table Fern',
    'Java Fern', 'Water Fern', 'Floating Fern', 'Tree Fern',
    'Mistletoe Cactus', 'Christmas Cactus', 'Easter Cactus',
    'Hens and Chicks', 'Hens And Chicks', 'Living Stones',
    'Desert Rose', 'Impala Lily', 'Mock Azalea', 'Maguey',
    'Urn Plant', 'Silver Vase', 'Flaming Sword',
    'Lipstick Plant', 'Blushwort', 'Goldfish Plant',
    'Prayer Plant', 'Maranta', 'Calathea',
    'Spider Plant', 'Airplane Plant', 'Ribbon Plant',
    'Pothos', 'Devil\'s Ivy', 'Golden Pothos', 'Satin Pothos', 'Silver Pothos',
    'Friendship Plant', 'Chinese Money Plant', 'Pancake Plant', 'UFO Plant',
    'Missionary Plant', 'Aluminum Plant', 'Watermelon Pilea',
    'Creeping Fig', 'Fig Ivy', 'Climbing Fig',
    'Arrowhead Vine', 'Goosefoot Plant', 'Nephthytis',
    'Wandering Jew', 'Wandering Dude', 'Inch Plant',
    'Creeping Charlie', 'Swedish Ivy',
    'Strawberry Begonia', 'Strawberry Geranium', 'Mother of Thousands',
    'Creeping Saxifrage',
    'Lucky Bamboo', 'Chinese Water Bamboo',
    'Snake Plant', 'Mother-in-law\'s Tongue', 'Saint George\'s Sword',
    'Viper\'s Bowstring Hemp', 'Whale Fin Snake Plant',
    'African Spear', 'Cylindrical Snake Plant',
    'Water Sprite', 'Indian Fern',
    'Duckweed', 'Frogbit', 'Water Lettuce', 'Water Cabbage',
    'Crystalwort', 'Floating Crystalwort',
    'Java Moss', 'Christmas Moss', 'Xmas Moss', 'Weeping Moss',
    'Phoenix Moss', 'Water Pocket Moss', 'Sheet Moss', 'Mood Moss',
    'Star Moss', 'Twisted Moss', 'Haircap Moss', 'Pincushion Moss',
    'Peat Moss', 'Bog Moss', 'Common Sphagnum', 'Sphagnum Moss',
    'Clubmoss', 'Spikemoss', 'Spike Mosses', 'Resurrection Plant',
    'Hornwort', 'Coontail', 'Rigid Hornwort',
    'Amazon Sword', 'Amazon Sword Plant',
    'Dwarf Hairgrass', 'Hairgrass', 'Small Spike-rush',
    'Cryptocoryne', 'Crypt', 'Wendt\'s Crypt', 'Wendt\'s Water Trumpet',
    'Anubias', 'Anubias Barteri',
    'Rotala', 'Dwarf Rotala', 'Roundleaf Toothcup',
    'Ludwigia', 'Creeping Ludwigia', 'Red Ludwigia', 'Creeping Primrose-willow',
    'Sagittaria', 'Dwarf Sagittaria', 'Narrowleaf Sagittaria', 'Narrow-leaved Arrowhead',
    'Bacopa', 'Lemon Bacopa', 'Water Hyssop', 'Blue Water Hyssop',
    'Salvinia', 'Common Salvinia', 'Water Spangles', 'Watermoss',
    'Riccia', 'Crystalwort', 'Floating Crystalwort',
    'Chaeto', 'Chaetomorpha', 'Green Hair Algae', 'Spaghetti Algae',
    'Marimo', 'Marimo Moss Ball', 'Lake Ball', 'Moss Ball',
    'Pellia', 'Pellia Liverwort', 'Mini Pellia', 'Mini Liverwort',
    'Chameleon Liverwort',
    'Reindeer Lichen', 'Reindeer Moss',
    'Lichens (Various)',
    
    // Scientific name patterns
    'Variegated', 'Mini', 'Miniature', 'Dwarf', 'Giant', 'Large', 'Small',
    
    // Single letters or very short
    'M', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'Kidney', 'Java', 'Rush', 'White', 'Medusa', 'Veitch', 'Brooks',
    'Marble', 'Groby', 'Rural Syntrichia', 'Cypress-leaved Plait-moss',
    'Delicate Fern Moss', 'Fern Moss', 'Broom Fork-moss', 'Cirrate Haircap Moss'
]);

// Check if a name is generic/trash
function isGenericName(name, plant) {
    if (!name || typeof name !== 'string') return true;
    
    const trimmed = name.trim();
    if (trimmed.length < 2) return true;
    
    // Check against generic names set
    if (GENERIC_NAMES.has(trimmed)) return true;
    
    // Check if it's just the genus name
    if (plant.taxonomy && plant.taxonomy.genus) {
        const genus = plant.taxonomy.genus.toLowerCase();
        if (trimmed.toLowerCase() === genus) return true;
        
        // Check if it's "Adjective Genus" pattern (e.g., "Green Adenia", "Red Anthurium")
        // This is often too generic unless it's a well-known specific name
        const words = trimmed.split(/\s+/);
        if (words.length === 2 && words[1].toLowerCase() === genus) {
            // Check if the adjective is too generic
            const genericAdjectives = ['green', 'red', 'blue', 'yellow', 'white', 'black', 
                                     'purple', 'pink', 'orange', 'brown', 'gray', 'grey',
                                     'small', 'large', 'big', 'tiny', 'mini', 'dwarf', 
                                     'giant', 'tall', 'short', 'wide', 'narrow', 'thick', 'thin',
                                     'round', 'oval', 'long', 'flat', 'curved', 'straight',
                                     'smooth', 'rough', 'soft', 'hard', 'thick', 'thin',
                                     'common', 'rare', 'uncommon', 'typical', 'normal', 'standard'];
            if (genericAdjectives.includes(words[0].toLowerCase())) {
                return true;
            }
        }
    }
    
    // Check if it's the scientific name
    if (plant.scientificName && trimmed.toLowerCase() === plant.scientificName.toLowerCase()) {
        return true;
    }
    
    // Check if it's the main plant name (already displayed)
    if (plant.name && trimmed.toLowerCase() === plant.name.toLowerCase()) {
        return true;
    }
    
    // Check if it's just "Genus species" format (scientific name)
    if (/^[A-Z][a-z]+\s+[a-z]+$/.test(trimmed) && trimmed.split(' ').length === 2) {
        // Might be scientific name, check if it matches the pattern
        if (plant.scientificName && trimmed.toLowerCase() === plant.scientificName.toLowerCase()) {
            return true;
        }
    }
    
    // Very short names (less than 3 characters) unless they're well-known abbreviations
    if (trimmed.length < 3 && !['UFO', 'IV', 'III', 'II'].includes(trimmed)) {
        return true;
    }
    
    // Names that are just numbers or mostly numbers
    if (/^\d+$/.test(trimmed) || /^\d+\s*$/.test(trimmed)) {
        return true;
    }
    
    // Names that are just common words without plant context
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for'];
    if (commonWords.includes(trimmed.toLowerCase())) {
        return true;
    }
    
    return false;
}

// Filter common names for a plant
function filterCommonNames(plant) {
    if (!plant.commonNames || !Array.isArray(plant.commonNames)) {
        return [];
    }
    
    const filtered = plant.commonNames.filter(name => !isGenericName(name, plant));
    
    // Remove duplicates (case-insensitive)
    const seen = new Set();
    const unique = [];
    for (const name of filtered) {
        const lower = name.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            unique.push(name);
        }
    }
    
    return unique;
}

// Process all plant files
function processAllPlants() {
    console.log('🔍 Filtering generic common names from all plants...\n');
    
    const files = fs.readdirSync(PLANTS_DIR)
        .filter(f => f.endsWith('.json') && f !== 'index.json');
    
    console.log(`Found ${files.length} plant files to process\n`);
    
    let changedCount = 0;
    const changes = [];
    
    for (const file of files) {
        const filePath = path.join(PLANTS_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            const originalCommonNames = plant.commonNames || [];
            const filteredCommonNames = filterCommonNames(plant);
            
            // Check if there are changes
            const originalStr = JSON.stringify(originalCommonNames.sort());
            const filteredStr = JSON.stringify(filteredCommonNames.sort());
            
            if (originalStr !== filteredStr) {
                plant.commonNames = filteredCommonNames.length > 0 ? filteredCommonNames : [];
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
                
                changes.push({
                    file: file,
                    scientificName: plant.scientificName,
                    original: originalCommonNames,
                    filtered: filteredCommonNames,
                    removed: originalCommonNames.filter(n => !filteredCommonNames.includes(n))
                });
                
                changedCount++;
                
                if (changes.length <= 20) {
                    console.log(`✅ ${file}:`);
                    console.log(`   Removed: ${changes[changes.length - 1].removed.join(', ') || '(none)'}`);
                    console.log(`   Kept: ${filteredCommonNames.join(', ') || '(none)'}\n`);
                }
            }
        } catch (error) {
            console.error(`Error processing ${file}:`, error.message);
        }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`   Total files processed: ${files.length}`);
    console.log(`   Files changed: ${changedCount}`);
    console.log(`   Files unchanged: ${files.length - changedCount}`);
    
    if (changes.length > 20) {
        console.log(`\n   (Showing first 20 changes, ${changes.length - 20} more files were updated)`);
    }
    
    // Show statistics
    const removedCounts = new Map();
    changes.forEach(change => {
        change.removed.forEach(name => {
            removedCounts.set(name, (removedCounts.get(name) || 0) + 1);
        });
    });
    
    const topRemoved = Array.from(removedCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
    
    if (topRemoved.length > 0) {
        console.log('\n📉 Most frequently removed generic names:');
        topRemoved.forEach(([name, count]) => {
            console.log(`   ${name}: removed from ${count} plants`);
        });
    }
    
    console.log('\n✅ Generic common names have been filtered!');
}

processAllPlants();

