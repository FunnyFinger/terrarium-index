const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLANTS_DIR = path.join(ROOT, 'data', 'plants-merged');

// REFINED, NON-OVERLAPPING CATEGORIES

// Plant Type: Based on botanical classification (major plant groups)
// No overlap - each plant belongs to ONE botanical group
// Using common names instead of scientific terms
const PLANT_TYPE_CATEGORIES = {
  'flowering-plant': {
    // All flowering plants (includes orchids, herbs, trees, cacti, succulents, etc.)
    variants: ['flowering plant', 'flowering', 'angiosperm', 'flowering-plant', 'orchid', 'orchids', 
              'herbaceous', 'bromeliad', 'carnivorous plant', 'cactus', 'cacti', 'cactaceae',
              'succulent', 'succulents', 'semi-succulent', 'vine', 'shrub', 'tree', 'lichen']
  },
  'conifer': {
    // Conifers, cycads, ginkgo, etc. (cone-bearing plants)
    variants: ['gymnosperm', 'conifer', 'cycad', 'ginkgo', 'cone-bearing']
  },
  'fern': {
    // True ferns
    variants: ['fern', 'ferns', 'pteridophyte']
  },
  'spikemoss': {
    // Clubmosses and spikemosses (Selaginella, Lycopodium, etc.)
    variants: ['lycophyte', 'clubmoss', 'spikemoss', 'selaginella', 'lycopodium', 'spike-moss']
  },
  'moss': {
    // True mosses (Bryophyta)
    variants: ['moss', 'mosses', 'bryophyte-moss']
  },
  'liverwort': {
    // Liverworts (Marchantiophyta)
    variants: ['liverwort', 'liverworts', 'marchantiophyta', 'bryophyte-liverwort']
  },
  'algae': {
    // Algae (not true plants but photosynthetic)
    variants: ['algae', 'alga', 'seaweed']
  },
  'fungus': {
    // Fungi (not plants but often included in collections)
    variants: ['fungus', 'fungi', 'mushroom']
  }
};

// Growth Pattern: Physical form and structure (how the plant grows)
// No overlap - each describes a distinct growth form
const GROWTH_PATTERN_CATEGORIES = {
  'upright-columnar': {
    // Tall, narrow, tree-like or columnar form
    variants: ['upright-columnar', 'columnar', 'tree-like', 'upright/columnar', 'upright columnar']
  },
  'upright-bushy': {
    // Multiple stems, full bushy appearance
    variants: ['upright-bushy', 'upright/bushy', 'upright bushy', 'bushy', 'upright', 
              'upright/clumping', 'compact/bushy', 'upright/arching']
  },
  'upright-single-stem': {
    // Single main stem, upright growth
    variants: ['upright-single-stem', 'single-stem', 'upright single stem', 'tree form']
  },
  'vining-climbing': {
    // Climbs with support (aerial roots, tendrils, etc.)
    variants: ['vining-climbing', 'climbing', 'climbing/trailing', 'trailing/climbing',
              'climbing/shingling', 'vining/climbing']
  },
  'vining-trailing': {
    // Hangs down, trailing growth
    variants: ['vining-trailing', 'trailing', 'vining', 'hanging', 'pendent', 'upright/pendent']
  },
  'rosette': {
    // Circular leaf arrangement from central point
    variants: ['rosette', 'rosette-forming', 'rosette forming', 'upright/rosette', 
              'creeping/rosette', 'floating/whorled']
  },
  'clumping': {
    // Forms tight clusters or clumps
    variants: ['clumping', 'clump', 'clump-forming', 'clump forming', 'clustering',
              'scattered to clustered', 'cushion']
  },
  'carpeting': {
    // Low-growing, dense horizontal mat
    variants: ['carpeting', 'carpet', 'ground cover', 'mat-forming', 'creeping/mat-forming',
              'surface-spreading/mat-forming', 'trailing/mat-forming', 'creeping/ground-cover']
  },
  'spreading': {
    // Spreads horizontally but not as dense as carpeting
    variants: ['spreading', 'creeping', 'creeping/prostrate', 'low/spreading', 'branching/spreading']
  },
  'pendent': {
    // Hangs down from attachment point (epiphytic)
    variants: ['pendent', 'hanging', 'pendent-form']
  }
};

// Growth Habit: Environmental relationship (where/how plant grows in relation to substrate)
// No overlap - each describes a distinct environmental relationship
// Using common descriptive terms instead of scientific names
const GROWTH_HABIT_CATEGORIES = {
  'ground-dwelling': {
    // Grows in soil/substrate with roots in ground
    variants: ['terrestrial', 'ground', 'soil', 'saprotrophic', 'ground-dwelling', 'soil-dwelling']
  },
  'tree-dwelling': {
    // Grows on other plants (trees) without being parasitic
    variants: ['epiphytic', 'epiphyte', 'air plant', 'tree-dwelling', 'tree-growing']
  },
  'rock-dwelling': {
    // Grows on or among rocks
    variants: ['lithophytic', 'lithophyte', 'rock', 'rock-dwelling', 'rock-growing']
  },
  'fully-aquatic': {
    // Fully submerged in water
    variants: ['aquatic-submerged', 'submerged', 'fully aquatic', 'aquatic', 'fully-aquatic', 'underwater']
  },
  'emergent-aquatic': {
    // Roots in water, leaves/stems above water
    variants: ['aquatic-emergent', 'emergent', 'marginal', 'emergent-aquatic', 'marginal-aquatic', 'partially-submerged']
  },
  'semi-aquatic': {
    // Can grow in both aquatic and terrestrial conditions
    variants: ['semi-aquatic', 'aquatic or semi-aquatic', 'amphibious', 'both-aquatic-terrestrial']
  },
  'semi-epiphytic': {
    // Starts epiphytic, later becomes terrestrial (or vice versa)
    variants: ['hemiepiphytic', 'hemiepiphyte', 'terrestrial/epiphytic', 'epiphytic/terrestrial', 
              'semi-epiphytic', 'transitional-epiphytic']
  }
};

// Propagation: Methods used to create new plants
// Multiple methods can be listed, separated by commas
const PROPAGATION_CATEGORIES = {
  'stem-cuttings': {
    variants: ['stem cuttings', 'stem-cuttings', 'stem cutting', 'cuttings', 'stem cuttings (pads)', 'pad cuttings']
  },
  'leaf-cuttings': {
    variants: ['leaf cuttings', 'leaf-cuttings', 'leaf cutting']
  },
  'division': {
    variants: ['division', 'division of rhizomes/corms during dormancy', 'division (bulb offsets)', 
              'rhizome division', 'vegetative division/budding', 'division/budding']
  },
  'offsets': {
    variants: ['offsets', 'offsets (chicks)', 'offsets (pups)', 'offset']
  },
  'pups': {
    variants: ['pups', 'pup', 'keikis', 'keiki']
  },
  'runners': {
    variants: ['runners', 'runners (stolons)', 'runners/stolons', 'plantlets on runners (stolons)', 
              'stolons', 'bulbils from stolons']
  },
  'layering': {
    variants: ['layering', 'air layering']
  },
  'spores': {
    variants: ['spores', 'spore']
  },
  'seed': {
    variants: ['seed', 'seeds', 'seed (uncommon)']
  },
  'fragmentation': {
    variants: ['fragmentation', 'trimming and reattachment']
  },
  'plantlets': {
    variants: ['plantlets', 'adventitious plantlets', 'plantlets (spiderettes)']
  },
  'rhizomes': {
    variants: ['rhizomes', 'rhizome cuttings', 'corms', 'tubers']
  },
  'mycelial-culture': {
    variants: ['mycelial culture', 'mycelium']
  }
};

// Substrate: Type of growing medium or surface
const SUBSTRATE_CATEGORIES = {
  'well-draining-mix': {
    variants: ['well-draining mix', 'well-draining', 'well draining mix', 
              'well-draining mix (cactus/succulent blend or potting soil with sand/perlite)',
              'well-draining mix (equal parts potting soil, coarse sand, perlite)',
              'well-draining mix (peat moss, perlite, orchid bark)',
              'well-draining mix (peat moss, perlite, potting soil)',
              'well-draining mix (perlite, coarse sand, organic matter)',
              'well-draining cactus mix (potting soil, coarse sand, perlite/pumice)',
              'well-draining cactus/succulent mix (potting soil with sand or perlite)',
              'potting soil']
  },
  'rich-moisture-retentive': {
    variants: ['rich, moisture-retentive', 'rich moisture retentive', 'rich, nutrient-dense substrate',
              'nutrient-rich substrate', 'nutrient-rich substrate, can grow emersed',
              'rich substrate']
  },
  'fine-substrate': {
    variants: ['fine substrate', 'fine-grained substrate']
  },
  'epiphytic-mix': {
    variants: ['epiphytic mix (bark, perlite, orchid mix)', 'epiphytic/mounted',
              'well-draining epiphytic mix (bark, perlite, sphagnum moss)',
              'orchid bark, sphagnum moss', 'sphagnum moss or fine orchid mix',
              'sphagnum moss or specialized carnivorous plant mix']
  },
  'attach-to-driftwood-rocks-mesh': {
    variants: ['attach to driftwood, rocks, or mesh', 'attach to driftwood, rocks, or other hard surfaces',
              'attach to mesh or hardscape', 'attach to mesh, rocks, driftwood, or hardscape using thread or aquarium-safe glue',
              'attaches to hard substrates', 'attaches to wood, rocks, or bark',
              'can attach to rocks', 'can be attached to wood/rocks or planted in substrate',
              'should not be buried - attach to driftwood/rocks',
              'porous and water-retentive substrate (coco coir, pumice, akadama), or attach to driftwood, rocks, lava rock, or mesh']
  },
  'no-substrate-needed': {
    variants: ['no substrate needed', 'no substrate needed (epiphytic)', 'no substrate needed (floating)',
              'no substrate needed - free-floating', 'floating or anchored', 'can float or attach to surfaces',
              'can be planted in substrate or left floating', 'can be rooted in mud or float free',
              'attach to surfaces or float', 'any terrarium substrate (gets moisture from air and direct watering)']
  },
  'sphagnum-moss': {
    variants: ['live sphagnum moss', 'live sphagnum moss or wet peat', 'live sphagnum or specialized mix',
              'peat moss and perlite or live sphagnum']
  },
  'carnivorous-mix': {
    variants: ['nutrient-poor, acidic mix (50% sphagnum peat moss, 50% perlite or sand)',
              'sphagnum moss or specialized carnivorous plant mix']
  },
  'decaying-wood': {
    variants: ['decaying hardwood logs, stumps, and trunks', 'decaying woody debris, fallen twigs, branches, and logs',
              'soil, wood, or rocks', 'moist soil, rocks, or wood']
  }
};

// Function to map value to category
function mapToCategory(field, value, categories) {
  if (!value || typeof value !== 'string') return null;
  
  const normalized = value.toLowerCase().trim();
  
  // Direct match
  for (const [category, data] of Object.entries(categories)) {
    if (normalized === category) return category;
    if (data.variants && data.variants.includes(normalized)) {
      return category;
    }
  }
  
  // Partial match
  for (const [category, data] of Object.entries(categories)) {
    if (data.variants) {
      for (const variant of data.variants) {
        if (normalized.includes(variant) || variant.includes(normalized)) {
          return category;
        }
      }
    }
  }
  
  return null;
}

// Special intelligent mapping based on plant data
function intelligentMap(field, value, plant) {
  const normalized = (value || '').toLowerCase().trim();
  
  if (field === 'plantType') {
    // Use taxonomy to help determine
    const taxonomy = plant.taxonomy || {};
    const family = (taxonomy.family || '').toLowerCase();
    const genus = (taxonomy.genus || '').toLowerCase();
    const phylum = (taxonomy.phylum || '').toLowerCase();
    const className = (taxonomy.class || '').toLowerCase();
    
    // Spikemosses/Clubmosses
    if (family.includes('selaginellaceae') || genus.includes('selaginella') || 
        genus.includes('lycopodium') || className.includes('selaginellopsida') ||
        className.includes('lycopodiopsida')) {
      return 'spikemoss';
    }
    
    // Ferns
    if (family.includes('fern') || phylum.includes('pteridophyta') || 
        className.includes('polypodiopsida') || className.includes('filicopsida')) {
      return 'fern';
    }
    
    // Orchids (are flowering plants)
    if (family.includes('orchidaceae') || normalized.includes('orchid')) {
      return 'flowering-plant';
    }
    
    // Cacti (are flowering plants)
    if (family.includes('cactaceae') || normalized.includes('cactus') || normalized.includes('cacti')) {
      return 'flowering-plant';
    }
    
    // Mosses
    if (phylum.includes('bryophyta') && !normalized.includes('liverwort')) {
      return 'moss';
    }
    
    // Liverworts
    if (phylum.includes('marchantiophyta') || normalized.includes('liverwort')) {
      return 'liverwort';
    }
    
    // Algae
    if (normalized.includes('algae') || normalized.includes('alga')) {
      return 'algae';
    }
    
    // Fungi
    if (normalized.includes('fungus') || normalized.includes('fungi') || 
        normalized.includes('mycena') || normalized.includes('panellus')) {
      return 'fungus';
    }
    
    // Check category array for clues
    const categories = (plant.category || []).map(c => c.toLowerCase());
    if (categories.includes('lycophyte') || categories.includes('spikemoss') || 
        categories.includes('clubmoss') || categories.includes('spike-moss')) {
      return 'spikemoss';
    }
    if (categories.includes('fungus') || categories.includes('fungi')) {
      return 'fungus';
    }
    
    // Check scientific name
    const scientificName = (plant.scientificName || '').toLowerCase();
    if (scientificName.includes('selaginella') || scientificName.includes('lycopodium')) {
      return 'spikemoss';
    }
    if (scientificName.includes('mycena') || scientificName.includes('panellus')) {
      return 'fungus';
    }
    
    // Default: if it has flowers or is a seed plant, it's a flowering plant
    // BUT only if it's not already identified as something else
    if (!normalized.includes('fern') && !normalized.includes('moss') && 
        !normalized.includes('algae') && !normalized.includes('liverwort') &&
        (normalized.includes('flowering') || (plant.floweringPeriod && 
        !plant.floweringPeriod.includes('does not flower')))) {
      return 'flowering-plant';
    }
  }
  
  if (field === 'growthPattern') {
    const desc = (plant.description || '').toLowerCase();
    const name = (plant.name || '').toLowerCase();
    
    // Check description for clues
    if (normalized.includes('climb') || desc.includes('climbs') || desc.includes('climbing')) {
      return 'vining-climbing';
    }
    if (normalized.includes('trail') || desc.includes('trailing') || desc.includes('hangs')) {
      return 'vining-trailing';
    }
    if (normalized.includes('columnar') || desc.includes('columnar') || desc.includes('tree-like')) {
      return 'upright-columnar';
    }
    if (normalized.includes('rosette') || desc.includes('rosette')) {
      return 'rosette';
    }
    if (normalized.includes('carpet') || normalized.includes('mat') || 
        desc.includes('ground cover') || desc.includes('carpet')) {
      return 'carpeting';
    }
    if (normalized.includes('clump') || normalized.includes('cluster')) {
      return 'clumping';
    }
    if (normalized.includes('spread') || normalized.includes('creep')) {
      return 'spreading';
    }
  }
  
  if (field === 'growthHabit') {
    const desc = (plant.description || '').toLowerCase();
    
    // Check for aquatic indicators
    if (normalized.includes('aquatic') || desc.includes('submerged') || 
        desc.includes('underwater') || desc.includes('aquatic')) {
      if (desc.includes('emergent') || desc.includes('marginal') || desc.includes('above water') ||
          desc.includes('partially-submerged')) {
        return 'emergent-aquatic';
      }
      if (desc.includes('semi') || desc.includes('both') || desc.includes('amphibious')) {
        return 'semi-aquatic';
      }
      if (desc.includes('fully') || desc.includes('completely') || desc.includes('totally')) {
        return 'fully-aquatic';
      }
      // Default aquatic to fully-aquatic if not specified
      return 'fully-aquatic';
    }
    
    // Check for tree-dwelling (epiphytic) indicators
    if (normalized.includes('epiphyte') || desc.includes('grows on trees') || 
        desc.includes('aerial roots') || desc.includes('epiphytic') ||
        desc.includes('tree-dwelling') || desc.includes('air plant')) {
      if (desc.includes('hemiepiphyte') || desc.includes('starts epiphytic') ||
          desc.includes('semi-epiphytic') || desc.includes('transitional')) {
        return 'semi-epiphytic';
      }
      return 'tree-dwelling';
    }
    
    // Check for rock-dwelling
    if (normalized.includes('lithophyte') || desc.includes('grows on rocks') || 
        desc.includes('rock-dwelling') || desc.includes('rock-growing')) {
      return 'rock-dwelling';
    }
    
    // Default to ground-dwelling if not specified
    if (normalized.includes('terrestrial') || desc.includes('grows in soil') ||
        desc.includes('ground-dwelling') || desc.includes('soil-dwelling')) {
      return 'ground-dwelling';
    }
  }
  
  return null;
}

// Function to normalize propagation string (comma-separated methods)
function normalizePropagation(propagationStr) {
  if (!propagationStr || typeof propagationStr !== 'string') return null;
  
  const methods = propagationStr.split(',').map(m => m.trim()).filter(Boolean);
  const normalizedMethods = [];
  
  for (const method of methods) {
    const normalized = method.toLowerCase().trim();
    let mapped = mapToCategory('propagation', method, PROPAGATION_CATEGORIES);
    
    if (!mapped) {
      // Try partial matching
      for (const [category, data] of Object.entries(PROPAGATION_CATEGORIES)) {
        if (data.variants) {
          for (const variant of data.variants) {
            if (normalized.includes(variant.toLowerCase()) || variant.toLowerCase().includes(normalized)) {
              mapped = category;
              break;
            }
          }
        }
        if (mapped) break;
      }
    }
    
    if (mapped) {
      // Convert to display format (e.g., "stem-cuttings" -> "Stem cuttings")
      const displayName = mapped.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      if (!normalizedMethods.includes(displayName)) {
        normalizedMethods.push(displayName);
      }
    } else {
      // Keep original if can't map
      normalizedMethods.push(method.trim());
    }
  }
  
  return normalizedMethods.length > 0 ? normalizedMethods.join(', ') : null;
}

// Function to normalize substrate
function normalizeSubstrate(substrateStr) {
  if (!substrateStr || typeof substrateStr !== 'string') return null;
  
  const normalized = substrateStr.toLowerCase().trim();
  let mapped = mapToCategory('substrate', substrateStr, SUBSTRATE_CATEGORIES);
  
  if (!mapped) {
    // Try partial matching
    for (const [category, data] of Object.entries(SUBSTRATE_CATEGORIES)) {
      if (data.variants) {
        for (const variant of data.variants) {
          if (normalized.includes(variant.toLowerCase()) || variant.toLowerCase().includes(normalized)) {
            mapped = category;
            break;
          }
        }
      }
      if (mapped) break;
    }
  }
  
  if (mapped) {
    // Convert to display format
    const displayName = mapped.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    return displayName;
  }
  
  return null;
}

// Main categorization function
function categorizePlant(plant) {
  const updates = {};
  
  // Categorize plantType - prioritize taxonomy-based detection
  let plantTypeCategory = null;
  
  // First, try intelligent mapping based on taxonomy (most accurate)
  plantTypeCategory = intelligentMap('plantType', plant.plantType || '', plant);
  
  // If no taxonomy match, try mapping current value
  if (!plantTypeCategory && plant.plantType) {
    plantTypeCategory = mapToCategory('plantType', plant.plantType, PLANT_TYPE_CATEGORIES);
  }
  
  // If still no match and we have a value, try intelligent mapping again
  if (!plantTypeCategory && plant.plantType) {
    plantTypeCategory = intelligentMap('plantType', plant.plantType, plant);
  }
  
  if (plantTypeCategory && plantTypeCategory !== plant.plantType) {
    updates.plantType = plantTypeCategory;
  }
  
  // Categorize growthPattern
  if (plant.growthPattern) {
    let category = mapToCategory('growthPattern', plant.growthPattern, GROWTH_PATTERN_CATEGORIES);
    if (!category) {
      category = intelligentMap('growthPattern', plant.growthPattern, plant);
    }
    if (category && category !== plant.growthPattern) {
      updates.growthPattern = category;
    }
  }
  
  // Categorize growthHabit
  if (plant.growthHabit) {
    let category = mapToCategory('growthHabit', plant.growthHabit, GROWTH_HABIT_CATEGORIES);
    if (!category) {
      category = intelligentMap('growthHabit', plant.growthHabit, plant);
    }
    if (category && category !== plant.growthHabit) {
      updates.growthHabit = category;
    }
  }
  
  // Categorize propagation (comma-separated methods)
  if (plant.propagation) {
    const normalized = normalizePropagation(plant.propagation);
    if (normalized && normalized !== plant.propagation) {
      updates.propagation = normalized;
    }
  }
  
  // Categorize substrate
  if (plant.substrate) {
    const normalized = normalizeSubstrate(plant.substrate);
    if (normalized && normalized !== plant.substrate) {
      updates.substrate = normalized;
    }
  }
  
  return updates;
}

// Process all plants
function processAllPlants() {
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  let updated = 0;
  const stats = {
    plantType: new Map(),
    growthPattern: new Map(),
    growthHabit: new Map(),
    propagation: new Map(),
    substrate: new Map()
  };
  
  console.log(`Processing ${files.length} plant files...\n`);
  
  for (const file of files) {
    try {
      const filePath = path.join(PLANTS_DIR, file);
      const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const updates = categorizePlant(plant);
      
      if (Object.keys(updates).length > 0) {
        // Apply updates
        Object.assign(plant, updates);
        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        updated++;
      }
      
      // Track statistics
      if (plant.plantType) {
        const count = stats.plantType.get(plant.plantType) || 0;
        stats.plantType.set(plant.plantType, count + 1);
      }
      if (plant.growthPattern) {
        const count = stats.growthPattern.get(plant.growthPattern) || 0;
        stats.growthPattern.set(plant.growthPattern, count + 1);
      }
      if (plant.growthHabit) {
        const count = stats.growthHabit.get(plant.growthHabit) || 0;
        stats.growthHabit.set(plant.growthHabit, count + 1);
      }
      if (plant.propagation) {
        const count = stats.propagation.get(plant.propagation) || 0;
        stats.propagation.set(plant.propagation, count + 1);
      }
      if (plant.substrate) {
        const count = stats.substrate.get(plant.substrate) || 0;
        stats.substrate.set(plant.substrate, count + 1);
      }
      
      if ((updated + files.length - updated) % 50 === 0) {
        console.log(`Processed ${files.indexOf(file) + 1}/${files.length} files...`);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }
  
  console.log(`\n✅ Updated ${updated} files\n`);
  
  // Print statistics
  console.log('=== STATISTICS ===\n');
  console.log('PLANT TYPE:');
  Array.from(stats.plantType.entries()).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  console.log('\nGROWTH PATTERN:');
  Array.from(stats.growthPattern.entries()).sort((a, b) => b[1] - a[1]).forEach(([pattern, count]) => {
    console.log(`  ${pattern}: ${count}`);
  });
  
  console.log('\nGROWTH HABIT:');
  Array.from(stats.growthHabit.entries()).sort((a, b) => b[1] - a[1]).forEach(([habit, count]) => {
    console.log(`  ${habit}: ${count}`);
  });
  
  if (stats.propagation && stats.propagation.size > 0) {
    console.log('\nPROPAGATION (top 10):');
    Array.from(stats.propagation.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([prop, count]) => {
      console.log(`  ${prop}: ${count}`);
    });
  }
  
  if (stats.substrate && stats.substrate.size > 0) {
    console.log('\nSUBSTRATE (top 10):');
    Array.from(stats.substrate.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([sub, count]) => {
      console.log(`  ${sub}: ${count}`);
    });
  }
}

// Run
processAllPlants();

