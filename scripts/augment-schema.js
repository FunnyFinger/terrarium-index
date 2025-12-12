const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLANTS_DIR = path.join(ROOT, 'data', 'plants-merged');

// New fields to add with defaults; we won't overwrite existing non-empty values
const NEW_FIELDS = {
  growthPattern: null,        // e.g., vining, clumping, carpeting, rosette, upright bushy
  hazard: null,               // e.g., non-toxic, toxic if ingested, handle with care
  rarity: null,               // e.g., common, uncommon, rare
  co2: null,                  // e.g., not required, beneficial, recommended, required (for some aquatic)
  growthHabit: null,          // e.g., terrestrial, epiphytic, aquatic, lithophytic
  plantType: null,            // e.g., flowering plant, fern, moss, cactus, succulent, algae, orchid
  floweringPeriod: null       // e.g., spring-summer, seasonal, irregular, does not flower in cultivation
};

function inferFromCategory(categoryArray) {
  const cat = new Set((categoryArray || []).map(s => String(s).toLowerCase()));
  const result = {};

  // plantType
  if (cat.has('fern')) result.plantType = 'fern';
  else if (cat.has('moss')) result.plantType = 'moss';
  else if (cat.has('cactus')) result.plantType = 'cactus';
  else if (cat.has('succulent')) result.plantType = 'succulent';
  else if (cat.has('algae')) result.plantType = 'algae';
  else if (cat.has('orchid')) result.plantType = 'orchid';
  else result.plantType = 'flowering plant';

  // growthHabit
  if (cat.has('aquatic')) result.growthHabit = 'aquatic';
  else if (cat.has('epiphytic') || cat.has('air-plant')) result.growthHabit = 'epiphytic';
  else result.growthHabit = 'terrestrial';

  // growthPattern
  if (cat.has('creeper') || cat.has('vining')) result.growthPattern = 'vining';
  else if (cat.has('moss') || cat.has('carpeting')) result.growthPattern = 'carpeting';
  else if (cat.has('rosette')) result.growthPattern = 'rosette';
  else result.growthPattern = 'upright/bushy';

  // co2
  if (cat.has('aquatic') || (result.growthHabit === 'aquatic')) {
    result.co2 = 'beneficial';
  } else {
    result.co2 = 'not required';
  }

  // rarity default
  result.rarity = 'common';

  // floweringPeriod default
  if (result.plantType === 'orchid') result.floweringPeriod = 'irregular in cultivation';
  else if (result.plantType === 'fern' || result.plantType === 'moss' || result.plantType === 'algae') result.floweringPeriod = 'does not flower';
  else result.floweringPeriod = 'seasonal';

  return result;
}

function inferFromTaxonomy(taxonomy) {
  const result = {};
  const family = taxonomy && String(taxonomy.family || '').toLowerCase();

  // Hazard inference: many Araceae contain calcium oxalate crystals
  if (family === 'araceae') result.hazard = 'toxic if ingested';

  // Orchidaceae flowering behavior often irregular
  if (family === 'orchidaceae') {
    result.plantType = 'orchid';
    result.growthHabit = result.growthHabit || 'epiphytic';
    result.floweringPeriod = 'irregular in cultivation';
  }

  // Cactaceae
  if (family === 'cactaceae') {
    result.plantType = 'cactus';
    result.hazard = result.hazard || 'handle with care';
  }

  // Bromeliaceae often epiphytic
  if (family === 'bromeliaceae') {
    result.growthHabit = 'epiphytic';
  }

  return result;
}

function mergeInferred(base, inferred) {
  const out = { ...base };
  for (const [k, v] of Object.entries(inferred)) {
    if (out[k] === null || out[k] === undefined || out[k] === '') out[k] = v;
  }
  return out;
}

function augmentPlant(plant) {
  const augmented = { ...plant };

  // Prepare newFields starting from defaults
  let newFields = { ...NEW_FIELDS };

  // Infer from category/taxonomy
  newFields = mergeInferred(newFields, inferFromCategory(plant.category));
  if (plant.taxonomy) newFields = mergeInferred(newFields, inferFromTaxonomy(plant.taxonomy));

  // Attach fields if missing or empty
  for (const [key, defaultValue] of Object.entries(newFields)) {
    if (augmented[key] === undefined || augmented[key] === null || augmented[key] === '') {
      augmented[key] = defaultValue;
    }
  }

  return augmented;
}

function main() {
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
  let updated = 0;
  for (const file of files) {
    const p = path.join(PLANTS_DIR, file);
    try {
      const original = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(original);
      const augmented = augmentPlant(data);
      const out = JSON.stringify(augmented, null, 2) + '\n';
      if (out !== original) {
        fs.writeFileSync(p, out, 'utf8');
        updated++;
        console.log(`✅ Augmented: ${file}`);
      }
    } catch (e) {
      console.error(`❌ ${file}: ${e.message}`);
    }
  }
  console.log(`\nDone. Files updated: ${updated}`);
}

if (require.main === module) {
  main();
}


