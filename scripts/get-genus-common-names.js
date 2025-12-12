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
  'tillandsia': 'Air Plant (Tillandsia)',
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
  'aristolochia': 'Dutchman\'s Pipe',
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
  'neoregelia': 'Neoregelia'
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

const sorted = Object.entries(genera).sort((a,b) => b[1] - a[1]);
console.log('Genus to Common Name Mapping (for filter checkboxes):\n');
console.log('const genusCommonNames = {');
sorted.forEach(([g, c]) => {
  const commonName = genusCommonNames[g] || g.charAt(0).toUpperCase() + g.slice(1);
  console.log(`  '${g}': '${commonName}', // ${c} plants`);
});
console.log('};');

