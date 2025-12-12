const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Mapping of species to their common names and specific information
const BUTTERWORT_INFO = {
  'Pinguicula ehlersiae': {
    commonName: 'Ehlersiae Butterwort',
    size: '5-10 cm rosette',
    floweringPeriod: 'spring-summer'
  },
  'Pinguicula esseriana': {
    commonName: 'Esseriana Butterwort',
    size: '3-5 cm rosette',
    floweringPeriod: 'spring-summer',
    temperature: '15-25°C' // Tropical but frost-tolerant
  },
  'Pinguicula gypsicola': {
    commonName: 'Gypsum Butterwort',
    size: '5-8 cm rosette',
    floweringPeriod: 'spring-summer',
    description: 'Pinguicula gypsicola is an insectivorous plant of the genus Pinguicula native to the Mexican state of San Luis Potosi, a heterophyllous member of the section Orcheosanthus. It grows in gypsum soils and forms stemless rosettes of upright, narrow leaves. It requires specialized care for carnivorous plants.'
  },
  'Pinguicula jaumavensis': {
    commonName: 'Jaumavensis Butterwort',
    size: '5-10 cm rosette',
    floweringPeriod: 'spring-summer'
  },
  'Pinguicula laueana': {
    commonName: 'Laueana Butterwort',
    size: '5-8 cm rosette',
    floweringPeriod: 'spring-summer',
    description: 'Pinguicula laueana is a perennial rosette-forming insectivorous plant native to the state of Oaxaca in Mexico. It is one of only two species of butterwort known to have a red flower, the other being P. caryophyllacea. It has gained the Royal Horticultural Society\'s Award of Garden Merit.'
  },
  'Pinguicula leptoceras': {
    commonName: 'Leptoceras Butterwort',
    size: '3-6 cm rosette',
    floweringPeriod: 'summer',
    temperature: '10-20°C' // Alpine/temperate
  },
  'Pinguicula moctezumae': {
    commonName: 'Moctezumae Butterwort',
    size: '5-10 cm rosette',
    floweringPeriod: 'spring-summer'
  },
  'Pinguicula moranensis': {
    commonName: 'Moranensis Butterwort',
    size: '8-15 cm rosette',
    floweringPeriod: 'spring-summer',
    description: 'Pinguicula moranensis is a perennial rosette-forming insectivorous herb native to El Salvador, Guatemala, Honduras and Mexico. It forms summer rosettes of flat, succulent leaves up to 10 centimeters long, which are covered in mucilaginous glands that attract, trap, and digest arthropod prey. Nutrients derived from the prey are used to supplement the nutrient-poor substrate.'
  },
  'Pinguicula primuliflora': {
    commonName: 'Primrose Butterwort',
    size: '5-10 cm rosette',
    floweringPeriod: 'spring',
    description: 'Pinguicula primuliflora, commonly known as the southern butterwort or primrose butterwort, is a species of carnivorous plant native to the southeastern United States. The typical variety forms a white flower in blooming. Like other butterworts, it has sticky adhesive leaves that attract, capture and digest arthropod prey to supply the plant with nutrients. Its name derives from the fact it is usually the first one to flower in the spring.'
  }
};

function fixButterwortEntry(plant) {
  const fixed = { ...plant };
  const sciName = String(plant.scientificName || '').split("'")[0].trim(); // Remove cultivar names
  
  // Get species-specific info or use defaults
  const info = BUTTERWORT_INFO[sciName] || {};
  
  // Fix name
  if (fixed.name && fixed.name.includes('Butterworth')) {
    fixed.name = info.commonName || fixed.name.replace('Butterworth ´Pinguicula', 'Pinguicula').replace('Pinguicula ', '');
    // If still has scientific name, make it readable
    if (fixed.name.toLowerCase().includes('pinguicula')) {
      const species = sciName.split(' ')[1] || sciName.split(' ')[0];
      fixed.name = `${species.charAt(0).toUpperCase() + species.slice(1)} Butterwort`;
    }
  }
  
  // Fix categories - remove unnecessary ones
  if (fixed.category) {
    fixed.category = fixed.category.filter(c => 
      ['carnivorous', 'flowering'].includes(c)
    );
    if (fixed.category.length === 0) {
      fixed.category = ['carnivorous', 'flowering'];
    }
  }
  
  // Fix watering
  fixed.watering = 'Keep moist with distilled/rain water';
  
  // Fix substrate
  fixed.substrate = 'Live sphagnum or specialized mix';
  
  // Fix size
  if (info.size) {
    fixed.size = info.size;
  } else if (fixed.size === 'Varies' || !fixed.size) {
    fixed.size = '5-10 cm rosette';
  }
  
  // Fix growth pattern
  fixed.growthPattern = 'rosette';
  
  // Fix temperature if species-specific
  if (info.temperature) {
    fixed.temperature = info.temperature;
  } else if (fixed.temperature === '18-24°C') {
    // Most tropical species, but some may prefer different
    fixed.temperature = '18-26°C';
  }
  
  // Fix plant type
  fixed.plantType = 'carnivorous plant';
  
  // Fix flowering period
  if (info.floweringPeriod) {
    fixed.floweringPeriod = info.floweringPeriod;
  } else if (fixed.floweringPeriod === 'seasonal') {
    fixed.floweringPeriod = 'spring-summer';
  }
  
  // Fix description if generic
  if (info.description) {
    fixed.description = info.description;
  } else if (fixed.description && fixed.description.includes('Pinguicula is a genus of plants')) {
    // Keep existing specific descriptions, only replace generic ones
    const sciSpecies = sciName.split(' ')[1] || sciName.split(' ')[0];
    fixed.description = `${sciName}, commonly known as butterwort, is a carnivorous plant species that uses sticky, glandular leaves to trap and digest insects, supplementing the poor mineral nutrition from its environment.`;
  }
  
  // Fix care tips
  fixed.careTips = [
    'Requires distilled or rain water only',
    'Bright light essential for health',
    'Use specialized carnivorous plant media',
    'High humidity preferred',
    'Feed with small insects occasionally'
  ];
  
  // Fix hazard
  fixed.hazard = 'non-toxic (carnivorous - safe for humans/pets)';
  
  // Fix vivarium types - remove incorrect ones
  if (fixed.vivariumType) {
    fixed.vivariumType = fixed.vivariumType.filter(v => 
      ['Terrarium', 'Paludarium'].includes(v)
    );
    if (fixed.vivariumType.length === 0) {
      fixed.vivariumType = ['Terrarium', 'Paludarium'];
    }
  }
  
  // Fix taxonomy if wrong (jaumavensis has wrong species)
  if (fixed.taxonomy && fixed.taxonomy.species) {
    const expectedSpecies = sciName.split(' ').slice(0, 2).join(' ');
    if (fixed.taxonomy.species.toLowerCase() !== expectedSpecies.toLowerCase()) {
      fixed.taxonomy.species = expectedSpecies;
    }
  }
  
  return fixed;
}

function main() {
  console.log('🔧 Fixing all Butterworth entries...\n');
  
  const butterworthFiles = [
    '00180-butterworth-pinguicula-alpina.json',
    '00181-butterworth-pinguicula-ehlersiae.json',
    '00182-butterworth-pinguicula-esseriana.json',
    '00183-butterworth-pinguicula-gypsicola-x-moctezumae.json',
    '00184-butterworth-pinguicula-jaumavensis.json',
    '00185-butterworth-pinguicula-laueana.json',
    '00186-butterworth-pinguicula-leptoceras.json',
    '00187-butterworth-pinguicula-moctezumae.json',
    '00188-butterworth-pinguicula-moranensis.json',
    '00189-butterworth-pinguicula-primuliflora.json'
  ];
  
  let updated = 0;
  
  for (const file of butterworthFiles) {
    const filePath = path.join(PLANTS_DIR, file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      continue;
    }
    
    try {
      const plantData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const fixed = fixButterwortEntry(plantData);
      
      fs.writeFileSync(filePath, JSON.stringify(fixed, null, 2) + '\n', 'utf8');
      updated++;
      console.log(`✅ Fixed: ${fixed.name}`);
      
    } catch (error) {
      console.error(`  ❌ Error processing ${file}: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Summary: Fixed ${updated} entries\n✨ Complete!`);
}

if (require.main === module) {
  main();
}

