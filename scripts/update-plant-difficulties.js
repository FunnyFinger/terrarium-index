const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Plant difficulty assessment based on characteristics
function assessDifficulty(plant) {
  const name = (plant.name || '').toLowerCase();
  const scientificName = (plant.scientificName || '').toLowerCase();
  const categories = (plant.category || []).map(c => c.toLowerCase());
  const plantType = (plant.plantType || '').toLowerCase();
  const humidity = (plant.humidity || '').toLowerCase();
  const watering = (plant.watering || '').toLowerCase();
  const careTips = (plant.careTips || []).join(' ').toLowerCase();
  const description = (plant.description || '').toLowerCase();
  const rarity = (plant.rarity || '').toLowerCase();
  
  let difficultyScore = 0; // 0 = easy, 1 = moderate, 2 = hard
  
  // HARD indicators (add points)
  // Carnivorous plants are generally hard
  if (categories.includes('carnivorous') || name.includes('pitcher') || 
      name.includes('sundew') || name.includes('bladderwort') || 
      name.includes('venus') || scientificName.includes('nepenthes') ||
      scientificName.includes('drosera') || scientificName.includes('dionaea') ||
      scientificName.includes('utricularia') || scientificName.includes('sarracenia') ||
      scientificName.includes('darlingtonia') || scientificName.includes('heliamphora') ||
      scientificName.includes('cephalotus') || scientificName.includes('pinguicula') ||
      scientificName.includes('genlisea') || scientificName.includes('roridula')) {
    difficultyScore = Math.max(difficultyScore, 2);
  }
  
  // High-maintenance orchids (especially rare or specific care needs)
  if (categories.includes('orchid') || plantType === 'orchid') {
    if (name.includes('masdevallia') || name.includes('pleurothallis') || 
        name.includes('lepanthes') || name.includes('bulbophyllum') ||
        scientificName.includes('masdevallia') || scientificName.includes('pleurothallis') ||
        scientificName.includes('lepanthes') || scientificName.includes('bulbophyllum') ||
        (rarity.includes('rare') && !name.includes('phalaenopsis') && !name.includes('moth'))) {
      difficultyScore = Math.max(difficultyScore, 2);
    } else if (name.includes('phalaenopsis') || name.includes('moth orchid') ||
               scientificName.includes('phalaenopsis')) {
      difficultyScore = Math.max(difficultyScore, 1); // Moderate for Phalaenopsis (beginner-friendly orchids)
    } else {
      difficultyScore = Math.max(difficultyScore, 1); // Most orchids are moderate to hard
    }
  }
  
  // Very high humidity requirements (70%+)
  if (humidity.includes('very high') || humidity.includes('70') || humidity.includes('80') || 
      humidity.includes('90') || humidity.includes('100')) {
    difficultyScore += 0.5;
  }
  
  // Specialized watering (distilled water only, specific requirements)
  if (watering.includes('distilled') || watering.includes('rain water') || 
      watering.includes('only') || careTips.includes('distilled') ||
      careTips.includes('rain water only')) {
    difficultyScore += 1;
  }
  
  // Temperature sensitive (very specific ranges)
  const temp = (plant.temperature || '').toLowerCase();
  if (temp.includes('avoid') || temp.includes('must') || temp.includes('critical') ||
      temp.includes('sensitive') || (temp.match(/\d+/g) && temp.split('°').length > 3)) {
    difficultyScore += 0.5;
  }
  
  // Rare plants often need more care
  if (rarity.includes('very rare') || rarity.includes('extremely rare')) {
    difficultyScore += 0.5;
  }
  
  // Specific substrate requirements (sphagnum, specialized mixes)
  const substrate = (plant.substrate || '').toLowerCase();
  if (substrate.includes('sphagnum') || substrate.includes('specialized') ||
      substrate.includes('carnivorous') || substrate.includes('epiphytic') ||
      substrate.includes('mounted')) {
    difficultyScore += 0.5;
  }
  
  // Complex care requirements mentioned in tips
  if (careTips.includes('requires') && (careTips.includes('very') || careTips.includes('must') ||
      careTips.includes('essential') || careTips.includes('critical') ||
      careTips.includes('specific') || careTips.includes('only'))) {
    difficultyScore += 0.5;
  }
  
  // Anthuriums and Alocasias - some are harder than others
  if (name.includes('anthurium') || scientificName.includes('anthurium')) {
    if (name.includes('warocqueanum') || name.includes('magnificum') || 
        name.includes('veitchii') || name.includes('regale') || 
        name.includes('luxurians') || rarity.includes('rare')) {
      difficultyScore = Math.max(difficultyScore, 2);
    } else {
      difficultyScore = Math.max(difficultyScore, 1);
    }
  }
  
  if (name.includes('alocasia') || scientificName.includes('alocasia')) {
    if (name.includes('azlanii') || name.includes('cuprea') || 
        name.includes('dragon scale') || name.includes('silver dragon') ||
        rarity.includes('rare')) {
      difficultyScore = Math.max(difficultyScore, 2);
    } else {
      difficultyScore = Math.max(difficultyScore, 1);
    }
  }
  
  // EASY indicators (subtract points or keep at easy)
  // Succulents and cacti are generally easy
  if (categories.includes('succulent') || plantType === 'succulent' ||
      categories.includes('cactus') || name.includes('cactus') ||
      name.includes('echeveria') || name.includes('haworthia') ||
      name.includes('crassula') || name.includes('sedum') ||
      name.includes('aloe') || name.includes('agave') ||
      name.includes('sansevieria') || name.includes('snake plant') ||
      scientificName.includes('echeveria') || scientificName.includes('haworthia') ||
      scientificName.includes('crassula') || scientificName.includes('sedum') ||
      scientificName.includes('aloe') || scientificName.includes('agave') ||
      scientificName.includes('dracaena') || scientificName.includes('sansevieria')) {
    if (difficultyScore < 1) difficultyScore = 0;
  }
  
  // Common houseplants are generally easy
  if (name.includes('pothos') || name.includes('epipremnum') ||
      (name.includes('philodendron') && !name.includes('pink princess') && !name.includes('white')) ||
      (name.includes('monstera') && !name.includes('obliqua') && !name.includes('esqueleto') && !name.includes('adansonii european mint')) ||
      name.includes('pilea') || name.includes('peperomia') ||
      name.includes('tradescantia') || name.includes('spider plant') ||
      name.includes('zebra plant') || name.includes('nerve plant') ||
      name.includes('hypoestes') || name.includes('syngonium') ||
      (name.includes('aglaonema') && !rarity.includes('rare')) ||
      (name.includes('bromeliad') && !rarity.includes('rare')) ||
      name.includes('spider plant') || name.includes('snake plant') ||
      name.includes('sansevieria') || scientificName.includes('sansevieria') ||
      scientificName.includes('dracaena') || name.includes('dracaena')) {
    if (difficultyScore < 1) difficultyScore = 0;
  }
  
  // Mosses are generally easy
  if (categories.includes('moss') || name.includes('moss') || 
      name.includes('marimo') || scientificName.includes('moss') ||
      scientificName.includes('sphagnum') || scientificName.includes('java moss')) {
    difficultyScore = 0;
  }
  
  // Aquatic plants in aquariums are generally easy
  if (name.includes('java fern') || name.includes('anubias') ||
      name.includes('cryptocoryne') || name.includes('hairgrass') ||
      name.includes('water') && (name.includes('weed') || name.includes('lettuce') || 
      name.includes('sprite') || name.includes('wisteria'))) {
    if (difficultyScore < 1) difficultyScore = 0;
  }
  
  // Ferns - most are moderate, some are easy
  if (categories.includes('fern') || name.includes('fern') || 
      scientificName.includes('fern') || scientificName.includes('asplenium') ||
      scientificName.includes('nephrolepis') || scientificName.includes('platycerium') ||
      scientificName.includes('microsorum') || scientificName.includes('elaphoglossum')) {
    if (name.includes('boston') || (name.includes('maidenhair') && 
        !name.includes('miniature')) || name.includes('rabbit') ||
        name.includes('staghorn') || name.includes('kangaroo') ||
        name.includes('blue star') || name.includes('tree fern') ||
        name.includes('bird\'s nest') || name.includes('asplenium nidus')) {
      difficultyScore = Math.max(difficultyScore, 1);
    } else if (name.includes('java fern') || name.includes('lemon button') ||
               name.includes('microsorum') || scientificName.includes('microsorum')) {
      difficultyScore = 0;
    } else {
      difficultyScore = Math.max(difficultyScore, 1);
    }
  }
  
  // Air plants - most are moderate
  if (name.includes('air plant') || name.includes('tillandsia') ||
      scientificName.includes('tillandsia') || name.includes('spanish moss') ||
      name.includes('xerographica') || scientificName.includes('tillandsia')) {
    difficultyScore = Math.max(difficultyScore, 1);
  }
  
  // Begonias - most are moderate to hard
  if (name.includes('begonia') || scientificName.includes('begonia')) {
    if (name.includes('ferox') || name.includes('amphioxus') || rarity.includes('rare')) {
      difficultyScore = Math.max(difficultyScore, 2);
    } else {
      difficultyScore = Math.max(difficultyScore, 1);
    }
  }
  
  // Jewel orchids - generally moderate (easier than most orchids)
  if (name.includes('jewel orchid') || name.includes('ludisia') ||
      name.includes('macodes') || name.includes('anoectochilus') ||
      scientificName.includes('ludisia') || scientificName.includes('macodes') ||
      scientificName.includes('anoectochilus') || scientificName.includes('goodyera') ||
      scientificName.includes('dossinia')) {
    difficultyScore = Math.max(difficultyScore, 1); // Moderate - jewel orchids are easier than most orchids
  }
  
  // Hoya - generally easy to moderate
  if (name.includes('hoya') || scientificName.includes('hoya')) {
    difficultyScore = Math.max(difficultyScore, 0.5);
  }
  
  // Selaginella and other primitive plants - moderate
  if (name.includes('selaginella') || scientificName.includes('selaginella') ||
      name.includes('clubmoss')) {
    difficultyScore = Math.max(difficultyScore, 1);
  }
  
  // Philodendron Pink Princess and rare variegated plants
  if (name.includes('pink princess') || name.includes('white princess') ||
      name.includes('white knight') || (name.includes('variegated') && rarity.includes('rare'))) {
    difficultyScore = Math.max(difficultyScore, 2);
  }
  
  // Monstera Obliqua and rare Monsteras
  if (name.includes('monstera') && (name.includes('obliqua') || 
      name.includes('esqueleto') || name.includes('adansonii') && name.includes('mint'))) {
    difficultyScore = Math.max(difficultyScore, 2);
  }
  
  // Determine final difficulty
  if (difficultyScore >= 2) {
    return 'Hard';
  } else if (difficultyScore >= 1) {
    return 'Moderate';
  } else {
    return 'Easy';
  }
}

function updatePlantDifficulties() {
  console.log('🔍 Reviewing and updating plant difficulties...\n');
  
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json'));
  let updated = 0;
  let unchanged = 0;
  const changes = [];
  
  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const plant = JSON.parse(content);
    
    const oldDifficulty = plant.difficulty || 'Unknown';
    const newDifficulty = assessDifficulty(plant);
    
    // Normalize old difficulty for comparison (standardize to Easy, Moderate, Hard)
    const oldNorm = (oldDifficulty || '').toLowerCase();
    const normalizedOld = oldNorm.includes('easy') && !oldNorm.includes('moderate') && !oldNorm.includes('difficult') ? 'Easy' :
                         oldNorm.includes('hard') || oldNorm.includes('difficult') ? 'Hard' :
                         oldNorm.includes('moderate') ? 'Moderate' : null;
    
    // Always update to ensure consistent format (Easy, Moderate, Hard)
    if (normalizedOld !== newDifficulty) {
      plant.difficulty = newDifficulty;
      fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
      updated++;
      changes.push({
        file,
        name: plant.name,
        old: oldDifficulty,
        new: newDifficulty
      });
    } else if (oldDifficulty !== newDifficulty) {
      // Update to ensure consistent capitalization
      plant.difficulty = newDifficulty;
      fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
      updated++;
    } else {
      unchanged++;
    }
  }
  
  console.log(`✅ Updated ${updated} plants`);
  console.log(`✓ Unchanged ${unchanged} plants`);
  console.log(`\n📊 Summary of changes:\n`);
  
  // Group changes by new difficulty
  const byDifficulty = { Easy: [], Moderate: [], Hard: [] };
  changes.forEach(c => {
    if (byDifficulty[c.new]) {
      byDifficulty[c.new].push(c);
    }
  });
  
  console.log(`Easy: ${byDifficulty.Easy.length} plants`);
  console.log(`Moderate: ${byDifficulty.Moderate.length} plants`);
  console.log(`Hard: ${byDifficulty.Hard.length} plants`);
  
  if (changes.length > 0 && changes.length <= 50) {
    console.log('\n📝 Changes made:');
    changes.forEach(c => {
      console.log(`  ${c.name}: ${c.old} → ${c.new}`);
    });
  }
  
  console.log('\n✨ Done!');
}

updatePlantDifficulties();

