// Normalize categories to descriptive plant types (multi-category)
// Remove redundant "type" field; consolidate with category and vivariumType

const fs = require('fs').promises;
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Category detection patterns
const CATEGORY_PATTERNS = {
  moss: [/\bmoss\b/i, /\bsphagnum\b/i, /\bpillow\s*moss\b/i, /\bfeather\s*moss\b/i, /\bjava\s*moss\b/i, /\bflame\s*moss\b/i],
  fern: [/\bfern\b/i, /\basplenium\b/i, /\badiantum\b/i, /\bpolypodium\b/i, /\bdryopteris\b/i, /\bphlebodium\b/i],
  succulent: [/\bsucculent\b/i, /\bhaworthia\b/i, /\becheveria\b/i, /\bcrassula\b/i, /\bsedum\b/i, /\bportulacaria\b/i],
  cactus: [/\bcactus\b/i, /\bmammillaria\b/i, /\bcereus\b/i, /\bopuntia\b/i, /\bechinocactus\b/i],
  orchid: [/\borchid\b/i, /\bphalaenopsis\b/i, /\bcattleya\b/i, /\bmasdevallia\b/i, /\bpleurothallis\b/i, /\bmacodes\b/i],
  carnivorous: [/\bnepenthes\b/i, /\bsarracenia\b/i, /\bdrosera\b/i, /\bpinguicula\b/i, /\bheliamphora\b/i, /\bbyblis\b/i, /\butricularia\b/i, /\bgenlisea\b/i],
  aquatic: [/\baquatic\b/i, /\banubias\b/i, /\bcryptocoryne\b/i, /\bbucephalandra\b/i, /\bhornwort\b/i, /\belodea\b/i, /\bjava\s*fern\b/i],
  'air-plant': [/\btillandsia\b/i, /\bair\s*plant\b/i, /\bepiphyte\b/i],
  'house-plant': [/\baglaonema\b/i, /\bphilodendron\b/i, /\bmonstera\b/i, /\banthurium\b/i, /\balocasia\b/i, /\bepipremnum\b/i, /\bpothos\b/i],
  mini: [/\bmini\b/i, /\bdwarf\b/i, /\bsmall\s*form\b/i, /\bcompact\b/i, /\btiny\b/i],
  flowering: [/\bflower\b/i, /\bbloom\b/i, /\binflorescence\b/i],
  colorful: [/\bvariegat\w+\b/i, /\bred\b/i, /\bpink\b/i, /\bpurple\b/i, /\borange\b/i, /\bcolorful\b/i],
  leafy: [/\bleaf\b/i, /\bfoliage\b/i, /\bfrond\b/i],
  creeper: [/\bcreeper\b/i, /\bcrawling\b/i, /\btrailing\b/i, /\bcreeping\b/i, /\bprostrate\b/i],
  tropical: [/\btropical\b/i, /\brainforest\b/i, /\bhumid\b/i],
  bromeliad: [/\bbromeliad\b/i, /\bcryptanthus\b/i, /\bneoregelia\b/i, /\bvriesea\b/i, /\bacanthostachys\b/i],
  begonia: [/\bbegonia\b/i],
  hoya: [/\bhoya\b/i],
  syngonium: [/\bsyngonium\b/i],
  algae: [/\balgae\b/i, /\bhalimeda\b/i, /\bgracilaria\b/i],
  lichen: [/\blichen\b/i],
  aglaonema: [/\baglaonema\b/i],
  alocasia: [/\balocasia\b/i],
  anthurium: [/\banthurium\b/i],
  monstera: [/\bmonstera\b/i],
  philodendron: [/\bphilodendron\b/i]
};

function detectCategories(plant) {
  const text = `${plant.name || ''} ${plant.scientificName || ''} ${plant.description || ''}`.toLowerCase();
  const cats = new Set();
  
  // Pattern matching for specific plant types
  for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      cats.add(cat);
    }
  }
  
  // Size-based (always check if relevant)
  if (/mini|dwarf|small|tiny|compact|baby|miniature/i.test(text)) {
    cats.add('mini');
  }
  
  // Growth form detection
  if (/trail|creep|crawl|prostrate|vine|spread|mat|groundcover|carpet/i.test(text)) {
    cats.add('creeper');
  }
  
  // Leaf characteristics
  if (/leaf|foliage|frond|greenery|green/i.test(text) || cats.has('fern') || cats.has('house-plant') || cats.has('tropical')) {
    cats.add('leafy');
  }
  
  // Visual/appearance
  if (/variegat|multicolor|striped|splotch|pattern|bright|vibrant/i.test(text)) {
    cats.add('colorful');
  }
  if (/flower|bloom|inflorescence|blossom/i.test(text)) {
    cats.add('flowering');
  }
  
  // Habitat/environment
  if (/tropical|rainforest|humid|epiphyte|warm|jungle/i.test(text) || cats.has('bromeliad') || cats.has('anthurium') || cats.has('alocasia')) {
    cats.add('tropical');
  }
  
  // Default assignments for plants without specific type
  if (cats.size === 0 || (!cats.has('moss') && !cats.has('fern') && !cats.has('succulent') && !cats.has('cactus') && !cats.has('orchid') && !cats.has('carnivorous') && !cats.has('aquatic') && !cats.has('air-plant'))) {
    // Likely a houseplant if no specific type detected
    cats.add('house-plant');
  }
  
  return Array.from(cats).sort();
}

// Derive vivarium types from categories and text
// Allowed: Terrarium, Paludarium, Aererium, Deserterium, Aquarium, House plant, Riparium
function deriveVivariumTypes(plant, categories) {
  const allowed = new Set(['Terrarium','Paludarium','Aererium','Deserterium','Aquarium','House plant','Riparium']);
  const vt = new Set();
  const text = `${plant.name || ''} ${plant.scientificName || ''} ${plant.description || ''}`.toLowerCase();
  const humidity = String(plant.humidity || '').toLowerCase();
  const watering = String(plant.watering || '').toLowerCase();

  const has = (c) => categories.includes(c);
  let isAquaticContext = false;

  // Aquatic / marginal / riparian
  if (
    has('aquatic') ||
    /aquarium|submerged|submersed|marginal\s*plant|water\s*plant|riparian|bog\s*plant|marsh|floodplain/i.test(text) ||
    /submerged|submersed|fully\s*aquatic|aquatic/i.test(humidity) ||
    /submerged|submersed|fully\s*aquatic|aquatic/i.test(watering)
  ) {
    vt.add('Aquarium');
    vt.add('Paludarium');
    vt.add('Riparium');
    isAquaticContext = true;
  }

  // Air plants / epiphytes
  if (has('air-plant') || has('bromeliad') || /epiphyte|mounted/i.test(text)) {
    vt.add('Aererium');
    vt.add('Terrarium');
  }

  // Desert/arid types
  if (has('succulent') || has('cactus') || /arid|desert|xeric/i.test(text)) {
    vt.add('Deserterium');
    vt.add('House plant');
  }

  // Tropical forest plants
  if (has('tropical') || has('fern') || has('begonia') || has('anthurium') || has('aglaonema') || has('alocasia') || has('philodendron') || has('monstera') || has('orchid') || has('moss')) {
    vt.add('Terrarium');
    vt.add('House plant');
  }

  // Carnivorous generally fit terrarium/paludarium depending on species
  if (has('carnivorous')) {
    vt.add('Terrarium');
    vt.add('Paludarium');
  }

  // Creepers/leafy minis are great in terrariums
  if (has('creeper') || has('mini') || has('leafy')) {
    vt.add('Terrarium');
  }

  // Fallbacks based on hints
  if (vt.size === 0) {
    if (/indoor|windowsill|house/i.test(text)) vt.add('House plant');
    // default to Terrarium for unknown tropicals
    if (has('house-plant') || has('tropical')) vt.add('Terrarium');
  }

  // Rule: if aquatic/submerged context, do not include Terrarium (no standing water body)
  if (isAquaticContext && vt.has('Terrarium')) {
    vt.delete('Terrarium');
  }

  // Filter to allowed and return as array
  return Array.from(vt).filter(v => allowed.has(v));
}

function normalize(plant) {
  const normalized = { ...plant };
  
  // Assign multi-category
  normalized.category = detectCategories(plant);
  
  // Remove redundant "type" field (information is in category now)
  delete normalized.type;
  
  // Remove redundant "compatibility" field (same info as vivariumType)
  delete normalized.compatibility;
  
  // Keep vivariumType if it's meaningful and different from category
  // Otherwise remove it if redundant
  if (normalized.vivariumType) {
    const vt = Array.isArray(normalized.vivariumType) ? normalized.vivariumType : [normalized.vivariumType];
    const hasViv = vt.some(v => /vivarium|terrarium/i.test(String(v)));
    if (!hasViv || vt.length === 0 || (vt.length === 1 && vt[0] === 'Closed Terrarium' && normalized.category.includes('tropical'))) {
      // Redundant, remove
      delete normalized.vivariumType;
    } else {
      normalized.vivariumType = vt.filter(v => v && String(v).trim());
      if (normalized.vivariumType.length === 0) delete normalized.vivariumType;
    }
  }
  
  // Derive vivariumType from categories/text and enforce rules
  const derived = deriveVivariumTypes(normalized, normalized.category || []);
  if (derived.length > 0) {
    normalized.vivariumType = derived;
  }
  
  return normalized;
}

async function main() {
  console.log('🔄 Normalizing categories to descriptive plant types...');
  const files = (await fs.readdir(DIR)).filter(f => f.endsWith('.json') && f !== 'index.json');
  let changed = 0;
  
  for (const f of files) {
    const p = path.join(DIR, f);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const plant = JSON.parse(raw);
      const out = normalize(plant);
      await fs.writeFile(p, JSON.stringify(out, null, 2), 'utf8');
      changed++;
    } catch (_) {}
  }
  
  console.log(`✅ Normalized ${changed} files. Categories are now multi-value arrays.`);
}

if (require.main === module) {
  main().catch(err => { console.error('❌ Normalize failed:', err); process.exit(1); });
}

module.exports = { main };

