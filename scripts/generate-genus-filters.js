const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');

// Common name mappings for genera (genus -> common name)
const genusCommonNames = {
  'anthurium': 'Anthurium',
  'alocasia': 'Alocasia',
  'philodendron': 'Philodendron',
  'monstera': 'Monstera',
  'begonia': 'Begonia',
  'hoya': 'Hoya',
  'tillandsia': 'Air Plant',
  'pinguicula': 'Butterwort',
  'masdevallia': 'Masdevallia',
  'lepanthes': 'Lepanthes',
  'agave': 'Agave',
  'anoectochilus': 'Jewel Orchid',
  'aglaonema': 'Aglaonema',
  'syngonium': 'Arrowhead Plant',
  'pilea': 'Pilea',
  'nephrolepis': 'Boston Fern',
  'asplenium': 'Spleenwort',
  'adiantum': 'Maidenhair Fern',
  'davallia': "Rabbit's Foot Fern",
  'dracaena': 'Dracaena',
  'elaphoglossum': 'Elaphoglossum',
  'goodyera': 'Jewel Orchid',
  'episcia': 'Episcia',
  'aeschynanthus': 'Lipstick Plant',
  'albuca': 'Albuca',
  'cryptanthus': 'Earth Star',
  'soleirolia': "Baby's Tears",
  'ficus': 'Fig',
  'aquarius': 'Amazon Sword',
  'cryptocoryne': 'Cryptocoryne',
  'selaginella': 'Spikemoss',
  'hypoestes': 'Polka Dot Plant',
  'oxalis': 'Shamrock',
  'fittonia': 'Nerve Plant',
  'tradescantia': 'Spiderwort',
  'rotala': 'Rotala',
  'ceratophyllum': 'Hornwort',
  'sagittaria': 'Arrowhead',
  'ludwigia': 'Ludwigia',
  'bacopa': 'Bacopa',
  'pistia': 'Water Lettuce',
  'phyllanthus': 'Phyllanthus',
  'riccia': 'Crystalwort',
  'hydrocharis': 'Frogbit',
  'ceratopteris': 'Water Sprite',
  'sphagnum': 'Sphagnum Moss',
  'thuidium': 'Fern Moss',
  'fissidens': 'Fissidens Moss',
  'chaetomorpha': 'Chaetomorpha',
  'phalaenopsis': 'Moth Orchid',
  'ludisia': 'Jewel Orchid',
  'nepenthes': 'Pitcher Plant',
  'sarracenia': 'Pitcher Plant',
  'rhipsalis': 'Mistletoe Cactus',
  'echeveria': 'Echeveria',
  'haworthia': 'Haworthia',
  'senecio': 'Senecio',
  'aloe': 'Aloe',
  'crassula': 'Crassula',
  'sedum': 'Stonecrop',
  'cephalotus': 'Australian Pitcher',
  'ananas': 'Pineapple',
  'dischidia': 'Dischidia',
  'argostemma': 'Argostemma',
  'arisaema': 'Cobra Lily',
  'asarum': 'Wild Ginger',
  'aristolochia': "Dutchman's Pipe",
  'dryopteris': 'Wood Fern',
  'epipremnum': 'Pothos',
  'dioscorea': 'Yam',
  'byblis': 'Rainbow Plant',
  'darlingtonia': 'Cobra Lily',
  'aldrovanda': 'Waterwheel Plant',
  'genlisea': 'Corkscrew Plant',
  'roridula': 'Roridula',
  'heliamphora': 'Sun Pitcher',
  'acalypha': 'Copperleaf',
  'achimenes': 'Hot Water Plant',
  'adromischus': 'Plover Eggs',
  'aeonium': 'Aeonium',
  'alluaudia': 'Alluaudia',
  'platycerium': 'Staghorn Fern',
  'asparagus': 'Asparagus Fern',
  'dicksonia': 'Tree Fern',
  'bulbophyllum': 'Bulbophyllum',
  'dossinia': 'Jewel Orchid',
  'macodes': 'Jewel Orchid',
  'pleurothallis': 'Pleurothallis',
  'restrepia': 'Restrepia',
  'anathallis': 'Anathallis',
  'aechmea': 'Aechmea',
  'catopsis': 'Catopsis',
  'vriesea': 'Vriesea',
  'opuntia': 'Prickly Pear',
  'euphorbia': 'Spurge',
  'adenium': 'Desert Rose',
  'peperomia': 'Peperomia',
  'ceropegia': 'String of Hearts',
  'racinaea': 'Racinaea',
  'wallisia': 'Pink Quill',
  'microsorum': 'Java Fern',
  'neoregelia': 'Neoregelia',
  'utricularia': 'Bladderwort',
  'drosera': 'Sundew',
  'vesicularia': 'Christmas Moss',
  'taxiphyllum': 'Java Moss',
  'eleocharis': 'Dwarf Hairgrass',
  'aegagropila': 'Marimo',
  'procris': 'Procris',
  'streptocarpus': 'Streptocarpus',
  'saintpaulia': 'African Violet',
  'dichondra': 'Silver Falls',
  'hygrophila': 'Hygrophila',
  'elodea': 'Elodea',
  'hypnum': 'Hypnum Moss',
  'leucobryum': 'Leucobryum',
  'syntrichia': 'Syntrichia',
  'dicranum': 'Dicranum',
  'halymenia': 'Halymenia',
  'gracilaria': 'Gracilaria',
  'monosolenium': 'Monosolenium',
  'riccardia': 'Riccardia',
  'cladonia': 'Lichens',
  'lemna': 'Duckweed',
  'salvinia': 'Salvinia',
  'azolla': 'Water Fern',
  'specklinia': 'Specklinia',
  'myrmecodia': 'Ant Plant',
  'medinilla': 'Medinilla',
  'phlebodium': 'Blue Star Fern',
  'kleinia': 'Kleinia',
  'kroenleinia': 'Kroenleinia',
  'acrostichum': 'Acrostichum',
  'leptochilus': 'Leptochilus',
  'acanthostachys': 'Acanthostachys',
  'actiniopteris': 'Actiniopteris',
  'drynaria': 'Drynaria',
  'coelogyne': 'Coelogyne',
  'goudaea': 'Goudaea',
  'acianthera': 'Acianthera',
  'platystele': 'Platystele',
  'aspidogyne': 'Aspidogyne',
  'dendrochilum': 'Dendrochilum'
};

const genera = {};
files.forEach(f => {
  try {
    const plant = JSON.parse(fs.readFileSync(path.join(PLANTS_DIR, f), 'utf8'));
    if (plant.taxonomy && plant.taxonomy.genus) {
      const g = plant.taxonomy.genus.toLowerCase();
      if (!genera[g]) genera[g] = 0;
      genera[g]++;
    }
  } catch(e) {}
});

// Group by category for better organization
const categories = {
  'Ferns': [],
  'Mosses': [],
  'Orchids': [],
  'Air Plants': [],
  'Carnivorous': [],
  'Succulents': [],
  'Tropical': []
};

const fernPhyla = ['tracheophyta'];
const mossPhyla = ['bryophyta'];
const orchidFamilies = ['orchidaceae'];
const airPlantFamilies = ['bromeliaceae'];
const carnivorousFamilies = ['nepenthaceae', 'droseraceae', 'sarraceniaceae', 'dionaeaceae', 'lentibulariaceae', 'cephalotaceae', 'byblidaceae', 'roridulaceae'];
const succulentFamilies = ['crassulaceae', 'cactaceae', 'aizoaceae', 'agavaceae', 'asparagaceae'];

Object.entries(genera).forEach(([genus, count]) => {
  // Get plant example to check family/phylum
  let found = false;
  for (const file of files.slice(0, 10)) {
    try {
      const plant = JSON.parse(fs.readFileSync(path.join(PLANTS_DIR, file), 'utf8'));
      if (plant.taxonomy && plant.taxonomy.genus && plant.taxonomy.genus.toLowerCase() === genus) {
        const phylum = (plant.taxonomy.phylum || '').toLowerCase();
        const family = (plant.taxonomy.family || '').toLowerCase();
        const phylumClass = (plant.taxonomy.class || '').toLowerCase();
        
        if (phylum === 'bryophyta') {
          categories['Mosses'].push({ genus, count });
          found = true;
          break;
        } else if (phylum === 'tracheophyta' && phylumClass === 'polypodiopsida') {
          categories['Ferns'].push({ genus, count });
          found = true;
          break;
        } else if (orchidFamilies.includes(family)) {
          categories['Orchids'].push({ genus, count });
          found = true;
          break;
        } else if (airPlantFamilies.includes(family)) {
          categories['Air Plants'].push({ genus, count });
          found = true;
          break;
        } else if (carnivorousFamilies.includes(family)) {
          categories['Carnivorous'].push({ genus, count });
          found = true;
          break;
        } else if (succulentFamilies.includes(family) || ['echeveria', 'crassula', 'sedum', 'aloe', 'agave', 'haworthia', 'dracaena', 'euphorbia', 'opuntia', 'mammillaria'].includes(genus)) {
          categories['Succulents'].push({ genus, count });
          found = true;
          break;
        } else {
          categories['Tropical'].push({ genus, count });
          found = true;
          break;
        }
      }
    } catch(e) {}
  }
  if (!found) {
    categories['Tropical'].push({ genus, count });
  }
});

// Generate HTML
console.log('<!-- Plant Classification Filters - Genus Level -->');
Object.entries(categories).forEach(([category, genusList]) => {
  if (genusList.length === 0) return;
  
  console.log(`\n<!-- ${category} -->`);
  genusList.sort((a, b) => b.count - a.count).forEach(({ genus, count }) => {
    const commonName = genusCommonNames[genus] || genus.charAt(0).toUpperCase() + genus.slice(1);
    const displayName = commonName === genus.charAt(0).toUpperCase() + genus.slice(1) 
      ? commonName 
      : `${commonName} (${genus.charAt(0).toUpperCase() + genus.slice(1)})`;
    
    console.log(`<label class="checkbox-label">`);
    console.log(`    <input type="checkbox" class="filter-checkbox" data-filter="classification" value="genus:${genus}">`);
    console.log(`    <span>${displayName}</span>`);
    console.log(`</label>`);
  });
});

