const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function generateCareTips(plant) {
  // If already has tips, skip
  if (plant.careTips && plant.careTips.length > 0) {
    return plant.careTips;
  }

  const tips = [];
  const categories = (plant.category || []).map(c => String(c).toLowerCase());
  const plantType = String(plant.plantType || '').toLowerCase();
  const growthHabit = String(plant.growthHabit || '').toLowerCase();
  const watering = String(plant.watering || '').toLowerCase();
  const lightReq = String(plant.lightRequirements || '').toLowerCase();
  const humidity = String(plant.humidity || '').toLowerCase();
  const substrate = String(plant.substrate || '').toLowerCase();
  const difficulty = String(plant.difficulty || '').toLowerCase();
  const growthPattern = String(plant.growthPattern || '').toLowerCase();
  const co2 = String(plant.co2 || '').toLowerCase();
  const family = String((plant.taxonomy || {}).family || '').toLowerCase();
  const genus = String((plant.taxonomy || {}).genus || '').toLowerCase();

  // Carnivorous plants
  if (categories.includes('carnivorous') || plantType.includes('carnivorous')) {
    tips.push('Requires distilled or rain water only - no tap water');
    tips.push('Bright light essential for healthy growth');
    tips.push('Use specialized carnivorous plant media (sphagnum moss, perlite)');
    tips.push('High humidity preferred');
    tips.push('Feed with small insects occasionally');
    if (plant.scientificName && plant.scientificName.toLowerCase().includes('pinguicula')) {
      tips.push('Keep substrate consistently moist but not waterlogged');
    }
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Aquatic plants
  if (categories.includes('aquatic') || growthHabit === 'aquatic' || watering.includes('aquatic') || humidity === 'submerged') {
    if (substrate.includes('epiphytic') || substrate.includes('mounted') || substrate.includes('not be buried')) {
      tips.push('Do not bury rhizome - attach to driftwood or rocks');
      tips.push('Can grow emersed or submerged');
    } else {
      tips.push('Fully aquatic - keep fully submerged');
    }
    if (co2.includes('beneficial') || co2.includes('recommended')) {
      tips.push('Benefits from CO2 supplementation');
    }
    tips.push('Regular fertilization recommended');
    tips.push('Prune regularly to control growth');
    if (lightReq.includes('low')) {
      tips.push('Tolerates low light conditions well');
    } else if (lightReq.includes('bright') || lightReq.includes('high')) {
      tips.push('Requires adequate lighting for optimal growth');
    }
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Air plants / Tillandsia
  if (genus === 'tillandsia' || plant.name.toLowerCase().includes('air plant')) {
    tips.push('Mist regularly or soak in water weekly');
    tips.push('Provide good air circulation');
    tips.push('Bright, indirect light preferred');
    tips.push('Allow to dry completely after watering');
    tips.push('Can be mounted on driftwood, bark, or other supports');
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Ferns
  if (categories.includes('fern') || plantType === 'fern' || family.includes('fern')) {
    tips.push('High humidity is essential');
    tips.push('Keep soil consistently moist but not waterlogged');
    tips.push('Avoid direct sunlight - prefers bright indirect light');
    if (growthHabit === 'epiphytic' || substrate.includes('epiphytic')) {
      tips.push('Can be mounted on bark or grown in well-draining media');
    }
    tips.push('Brown edges indicate low humidity or underwatering');
    if (difficulty === 'easy' || difficulty === 'very easy') {
      tips.push('Very forgiving and easy to care for');
    }
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Orchids
  if (family === 'orchidaceae' || categories.includes('orchid')) {
    tips.push('Provide high humidity (60-80%)');
    tips.push('Water when media begins to dry');
    tips.push('Bright indirect light - avoid direct sun');
    tips.push('Good air circulation is important');
    if (substrate.includes('epiphytic') || substrate.includes('mounted')) {
      tips.push('Epiphytic - can be mounted or grown in orchid bark');
    }
    tips.push('Feed with orchid fertilizer during growing season');
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Bromeliads
  if (family === 'bromeliaceae' || categories.includes('bromeliad')) {
    tips.push('Keep central cup (vase) filled with water');
    tips.push('Water soil sparingly - mainly keep cup filled');
    tips.push('Bright indirect light preferred');
    tips.push('High humidity beneficial');
    tips.push('Remove dead leaves to maintain appearance');
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Succulents
  if (categories.includes('succulent') || plantType.includes('succulent')) {
    tips.push('Let soil dry completely between waterings');
    tips.push('Well-draining soil is essential');
    tips.push('Bright light preferred - can tolerate direct sun');
    tips.push('Avoid overwatering - prone to root rot');
    if (genus === 'echeveria' || genus === 'sedum' || genus === 'crassula') {
      tips.push('Very drought tolerant');
    }
    if (categories.includes('cactus')) {
      tips.push('Minimal watering required');
      tips.push('Very bright light to full sun');
    }
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Aroids (Araceae family - Philodendron, Monstera, Alocasia, Anthurium, etc.)
  if (family === 'araceae' || genus === 'philodendron' || genus === 'monstera' || genus === 'alocasia' || genus === 'anthurium' || genus === 'syngonium' || genus === 'aglaonema') {
    tips.push('Keep soil consistently moist but well-draining');
    tips.push('High humidity preferred');
    tips.push('Bright indirect light');
    if (plant.hazard && plant.hazard.toLowerCase().includes('toxic')) {
      tips.push('Toxic if ingested - keep away from pets and children');
    }
    if (genus === 'monstera') {
      tips.push('Provide support for climbing growth');
      tips.push('Aerial roots can be trained or trimmed');
    }
    if (genus === 'alocasia') {
      tips.push('Requires high humidity and consistent moisture');
      tips.push('Dormant period in winter - reduce watering');
    }
    if (genus === 'anthurium') {
      tips.push('Prefers warm, humid conditions');
      tips.push('Bright indirect light for best flowering');
    }
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Begonias
  if (genus === 'begonia' || categories.includes('begonia')) {
    tips.push('Keep soil moist but not soggy');
    tips.push('High humidity beneficial');
    tips.push('Bright indirect light - avoid direct sun');
    tips.push('Good air circulation prevents disease');
    tips.push('Prune regularly to maintain shape');
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Hoyas
  if (genus === 'hoya') {
    tips.push('Let soil dry between waterings');
    tips.push('Bright indirect light preferred');
    tips.push('High humidity encourages better growth');
    tips.push('Trailing or vining - provide support if needed');
    tips.push('Can be propagated from stem cuttings');
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // Mosses
  if (categories.includes('moss')) {
    tips.push('Requires consistently high humidity');
    tips.push('Keep moist at all times');
    tips.push('Low to medium indirect light');
    tips.push('Mist regularly to maintain moisture');
    tips.push('Can grow on various substrates');
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // General tropical/house plants
  if (categories.includes('tropical') || categories.includes('house-plant') || difficulty === 'easy') {
    if (humidity.includes('high')) {
      tips.push('High humidity preferred');
    }
    if (watering.includes('moist') || watering.includes('consistently')) {
      tips.push('Keep soil consistently moist');
    } else if (watering.includes('dry')) {
      tips.push('Allow soil to dry between waterings');
    }
    if (lightReq.includes('bright indirect')) {
      tips.push('Bright indirect light preferred');
    } else if (lightReq.includes('low')) {
      tips.push('Tolerates low light conditions');
    }
    tips.push('Regular fertilization during growing season');
    if (growthPattern === 'vining' || growthPattern.includes('vining')) {
      tips.push('Provide support for vining growth');
    }
    return tips.length > 0 ? tips : plant.careTips || [];
  }

  // General tips based on fields
  if (tips.length === 0) {
    if (humidity.includes('high')) {
      tips.push('High humidity preferred');
    }
    if (lightReq.includes('bright')) {
      tips.push('Bright indirect light recommended');
    } else if (lightReq.includes('low')) {
      tips.push('Low light tolerant');
    }
    if (watering.includes('moist')) {
      tips.push('Keep soil moist');
    } else if (watering.includes('dry')) {
      tips.push('Allow soil to dry between waterings');
    }
    if (difficulty === 'moderate' || difficulty === 'difficult') {
      tips.push('Requires consistent care and attention');
    }
    tips.push('Monitor plant regularly for health');
  }

  return tips.length > 0 ? tips : ['Provide appropriate care based on plant requirements'];
}

function main() {
  console.log('💡 Populating care tips for all plants...\n');
  
  const files = fs.readdirSync(PLANTS_DIR)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .sort();
  
  console.log(`Found ${files.length} plant files to process\n`);
  
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    
    try {
      const plantData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const existingTips = plantData.careTips || [];
      
      // Skip if already has good tips
      if (existingTips.length >= 3) {
        skipped++;
        processed++;
        continue;
      }
      
      // Generate new tips
      const newTips = generateCareTips(plantData);
      
      if (newTips.length > 0 && JSON.stringify(newTips) !== JSON.stringify(existingTips)) {
        plantData.careTips = newTips;
        
        fs.writeFileSync(filePath, JSON.stringify(plantData, null, 2) + '\n', 'utf8');
        updated++;
        console.log(`✅ Updated: ${plantData.name || file} (${newTips.length} tips)`);
      }
      
      processed++;
      
    } catch (error) {
      console.error(`  ❌ Error processing ${file}: ${error.message}`);
      processed++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped (already has tips): ${skipped}`);
  console.log(`\n✨ Care tips population complete!`);
}

if (require.main === module) {
  main();
}

