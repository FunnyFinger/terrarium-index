const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLANTS_DIR = path.join(ROOT, 'data', 'plants-merged');

// REFINED, NON-OVERLAPPING CATEGORIES
// Plant Type: Based on botanical classification (major plant groups)
const PLANT_TYPE_CATEGORIES = {
  'angiosperm': ['flowering plant', 'flowering', 'angiosperm', 'flowering-plant', 'orchid', 'orchids', 
                'herbaceous', 'bromeliad', 'carnivorous plant', 'cactus', 'cacti', 'cactaceae',
                'succulent', 'succulents', 'semi-succulent', 'vine', 'shrub', 'tree', 'lichen'],
  'gymnosperm': ['gymnosperm', 'conifer', 'cycad', 'ginkgo'],
  'fern': ['fern', 'ferns', 'pteridophyte'],
  'lycophyte': ['lycophyte', 'clubmoss', 'spikemoss', 'selaginella', 'lycopodium'],
  'moss': ['moss', 'mosses', 'bryophyte-moss'],
  'liverwort': ['liverwort', 'liverworts', 'marchantiophyta', 'bryophyte-liverwort'],
  'algae': ['algae', 'alga', 'seaweed'],
  'fungus': ['fungus', 'fungi', 'mushroom']
};

// Growth Pattern: Physical form and structure
const GROWTH_PATTERN_CATEGORIES = {
  'upright-columnar': ['upright-columnar', 'columnar', 'tree-like', 'upright/columnar', 'upright columnar'],
  'upright-bushy': ['upright-bushy', 'upright/bushy', 'upright bushy', 'bushy', 'upright', 
                   'upright/clumping', 'compact/bushy', 'upright/arching'],
  'upright-single-stem': ['upright-single-stem', 'single-stem', 'upright single stem', 'tree form'],
  'vining-climbing': ['vining-climbing', 'climbing', 'climbing/trailing', 'trailing/climbing',
                     'climbing/shingling', 'vining/climbing'],
  'vining-trailing': ['vining-trailing', 'trailing', 'vining', 'hanging', 'pendent', 'upright/pendent'],
  'rosette': ['rosette', 'rosette-forming', 'rosette forming', 'upright/rosette', 
             'creeping/rosette', 'floating/whorled'],
  'clumping': ['clumping', 'clump', 'clump-forming', 'clump forming', 'clustering',
              'scattered to clustered', 'cushion'],
  'carpeting': ['carpeting', 'carpet', 'ground cover', 'mat-forming', 'creeping/mat-forming',
               'surface-spreading/mat-forming', 'trailing/mat-forming', 'creeping/ground-cover'],
  'spreading': ['spreading', 'creeping', 'creeping/prostrate', 'low/spreading', 'branching/spreading'],
  'pendent': ['pendent', 'hanging', 'pendent-form']
};

// Growth Habit: Environmental relationship
const GROWTH_HABIT_CATEGORIES = {
  'terrestrial': ['terrestrial', 'ground', 'soil', 'saprotrophic'],
  'epiphytic': ['epiphytic', 'epiphyte', 'air plant'],
  'lithophytic': ['lithophytic', 'lithophyte', 'rock', 'rock-dwelling'],
  'aquatic-submerged': ['aquatic-submerged', 'submerged', 'fully aquatic', 'aquatic'],
  'aquatic-emergent': ['aquatic-emergent', 'emergent', 'marginal', 'semi-aquatic'],
  'semi-aquatic': ['semi-aquatic', 'aquatic or semi-aquatic', 'amphibious'],
  'hemiepiphytic': ['hemiepiphytic', 'hemiepiphyte', 'terrestrial/epiphytic', 'epiphytic/terrestrial']
};

// Legacy mapping for backward compatibility
const CATEGORIES = {
  plantType: PLANT_TYPE_CATEGORIES,
  growthPattern: GROWTH_PATTERN_CATEGORIES,
  growthHabit: GROWTH_HABIT_CATEGORIES,
  hazard: {
    'non-toxic': ['non-toxic', 'non toxic', 'safe', 'non-toxic to pets', 'pet-safe'],
    'toxic-if-ingested': ['toxic if ingested', 'toxic', 'poisonous', 'toxic-if-ingested', 'toxic if eaten', 'inedible'],
    'handle-with-care': ['handle with care', 'handle-with-care', 'handle with care', 'irritant', 'skin irritation', 'caution', 'sharp spines']
  },
  rarity: {
    'common': ['common', 'Common'],
    'uncommon': ['uncommon', 'Uncommon'],
    'rare': ['rare', 'Rare'],
    'very-rare': ['very-rare', 'very rare', 'Very Rare', 'very-rare', 'extremely rare']
  },
  floweringPeriod: {
    'seasonal': ['seasonal', 'spring', 'summer', 'fall', 'winter', 'spring-summer', 'summer-fall'],
    'year-round': ['year-round', 'year round', 'continuous', 'all year', 'Year-round'],
    'irregular': ['irregular', 'sporadic', 'unpredictable'],
    'does-not-flower': ['does not flower', 'does-not-flower', 'non-flowering', 'no flowers'],
    'does-not-flower-in-cultivation': ['does not flower in cultivation', 'does-not-flower-in-cultivation', 'rarely flowers', 'seldom flowers']
  },
  co2: {
    'not-required': ['not required', 'not-required', 'not needed', 'no co2', 'none'],
    'beneficial': ['beneficial', 'helpful', 'optional'],
    'recommended': ['recommended', 'suggested'],
    'required': ['required', 'necessary', 'essential']
  }
};

// Function to normalize and map a value to a category
function mapToCategory(field, value) {
  if (!value || typeof value !== 'string') return null;
  
  const normalized = value.toLowerCase().trim();
  const categories = CATEGORIES[field];
  
  if (!categories) return null;
  
  // Direct match
  for (const [category, variants] of Object.entries(categories)) {
    if (variants.includes(normalized)) {
      return category;
    }
    // Also check if normalized value matches category directly
    if (normalized === category) {
      return category;
    }
  }
  
  // Partial match (check if any variant is contained in the value)
  for (const [category, variants] of Object.entries(categories)) {
    for (const variant of variants) {
      if (normalized.includes(variant) || variant.includes(normalized)) {
        return category;
      }
    }
  }
  
  // Special handling for floweringPeriod with complex strings
  if (field === 'floweringPeriod') {
    const lower = normalized;
    if (lower.includes('year') && (lower.includes('round') || lower.includes('all'))) {
      return 'year-round';
    }
    if (lower.includes('seasonal') || lower.includes('spring') || lower.includes('summer') || 
        lower.includes('fall') || lower.includes('winter') || lower.includes('january') ||
        lower.includes('june') || lower.includes('october') || lower.includes('march') ||
        lower.includes('april') || lower.includes('may') || lower.includes('july') ||
        lower.includes('august') || lower.includes('september') || lower.includes('november') ||
        lower.includes('december') || lower.includes('onwards')) {
      return 'seasonal';
    }
    if (lower.includes('irregular') || lower.includes('sporadic')) {
      return 'irregular';
    }
    if (lower.includes('not flower') || lower.includes('no flower') || lower.includes('non-flower')) {
      if (lower.includes('cultivation') || lower.includes('indoor') || lower.includes('rarely')) {
        return 'does-not-flower-in-cultivation';
      }
      return 'does-not-flower';
    }
  }
  
  // Special handling for growthPattern
  if (field === 'growthPattern') {
    const lower = normalized;
    if (lower.includes('upright') || lower.includes('bushy') || lower.includes('compact') || 
        lower.includes('columnar') || lower.includes('arching')) {
      return 'upright-bushy';
    }
    if (lower.includes('vine') || lower.includes('climb') || lower.includes('trail')) {
      return 'vining';
    }
    if (lower.includes('carpet') || lower.includes('mat') || lower.includes('ground cover') || 
        lower.includes('creeping') || lower.includes('spreading') || lower.includes('prostrate') ||
        lower.includes('low')) {
      return 'carpeting';
    }
    if (lower.includes('rosette') || lower.includes('whorled') || lower.includes('floating')) {
      return 'rosette';
    }
    if (lower.includes('clump') || lower.includes('cluster') || lower.includes('cushion')) {
      return 'clumping';
    }
  }
  
  // Special handling for plantType
  if (field === 'plantType') {
    const lower = normalized;
    if (lower.includes('orchid')) {
      return 'orchid';
    }
    if (lower.includes('fern')) {
      return 'fern';
    }
    if (lower.includes('moss')) {
      return 'moss';
    }
    if (lower.includes('algae')) {
      return 'algae';
    }
    if (lower.includes('cactus') || lower.includes('cacti')) {
      return 'cactus';
    }
    if (lower.includes('succulent')) {
      return 'succulent';
    }
    if (lower.includes('liverwort')) {
      return 'liverwort';
    }
    // Default to flowering-plant if it's a plant but not specifically categorized
    // This includes: carnivorous plant, herbaceous, bromeliad, shrub, vine, fungus, lichen, tree, etc.
    if (lower.length > 0) {
      return 'flowering-plant';
    }
  }
  
  // Special handling for hazard
  if (field === 'hazard') {
    const lower = normalized;
    if (lower.includes('unknown') || lower.includes('edibility')) {
      // For unknown edibility, default to handle-with-care as a safe option
      return 'handle-with-care';
    }
  }
  
  return null;
}

// Scan all plants and collect statistics
function scanAllPlants() {
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const stats = {
    plantType: new Map(),
    growthPattern: new Map(),
    growthHabit: new Map(),
    hazard: new Map(),
    rarity: new Map(),
    floweringPeriod: new Map(),
    co2: new Map()
  };
  
  const unmapped = {
    plantType: new Set(),
    growthPattern: new Set(),
    growthHabit: new Set(),
    hazard: new Set(),
    rarity: new Set(),
    floweringPeriod: new Set(),
    co2: new Set()
  };
  
  let processed = 0;
  let updated = 0;
  
  console.log(`Scanning ${files.length} plant files...\n`);
  
  for (const file of files) {
    try {
      const filePath = path.join(PLANTS_DIR, file);
      const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let plantUpdated = false;
      
      // Process each field
      for (const field of Object.keys(CATEGORIES)) {
        const value = plant[field];
        
        if (value) {
          // Track original value
          const count = stats[field].get(value) || 0;
          stats[field].set(value, count + 1);
          
          // Map to category
          const category = mapToCategory(field, value);
          
          if (category && category !== value) {
            plant[field] = category;
            plantUpdated = true;
          } else if (!category) {
            unmapped[field].add(value);
          }
        } else {
          // Field is missing - we'll leave it as is for now
        }
      }
      
      if (plantUpdated) {
        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        updated++;
      }
      
      processed++;
      if (processed % 50 === 0) {
        console.log(`Processed ${processed}/${files.length} files...`);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }
  
  console.log(`\n✅ Processed ${processed} files, updated ${updated} files\n`);
  
  // Print statistics
  console.log('=== STATISTICS ===\n');
  for (const [field, valueMap] of Object.entries(stats)) {
    console.log(`\n${field.toUpperCase()}:`);
    const sorted = Array.from(valueMap.entries()).sort((a, b) => b[1] - a[1]);
    for (const [value, count] of sorted.slice(0, 20)) {
      const category = mapToCategory(field, value);
      const marker = category ? '✓' : '✗';
      console.log(`  ${marker} ${value} (${count}) -> ${category || 'UNMAPPED'}`);
    }
  }
  
  // Print unmapped values
  console.log('\n=== UNMAPPED VALUES ===\n');
  for (const [field, values] of Object.entries(unmapped)) {
    if (values.size > 0) {
      console.log(`\n${field.toUpperCase()}:`);
      for (const value of Array.from(values).sort()) {
        console.log(`  - "${value}"`);
      }
    }
  }
}

// Run the scan
scanAllPlants();

