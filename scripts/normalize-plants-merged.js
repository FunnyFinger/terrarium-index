// Normalize all plant JSONs in data/plants-merged to a canonical schema
// - Ensure consistent keys and types
// - Derive category from type/name if missing, and standardize
// - Keep original values where present; fill safe defaults

const fs = require('fs').promises;
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'plants-merged');

const KNOWN_CATEGORIES = [
  'tropical', 'ferns', 'succulents', 'carnivorous', 'orchids', 'mosses',
  'aquarium', 'air-plants', 'aglaonema', 'alocasia', 'anthurium', 'begonia',
  'bromeliads', 'cacti-and-succulents', 'hoya', 'monstera', 'philodendron', 'syngonium',
  'additional', 'other', 'vivarium', 'terrarium'
];

const NAME_TO_CATEGORY_HINTS = [
  [/\bfern\b/i, 'ferns'],
  [/\b(anubias|hornwort|elodea|cryptocoryne|bucephalandra|java\s*moss)\b/i, 'aquarium'],
  [/\b(tillandsia|air\s*plant|bromeliad|cryptanthus|neoregelia|catopsis)\b/i, 'air-plants'],
  [/\b(orchid|phalaenopsis|cattleya|masdevallia|pleurothallis)\b/i, 'orchids'],
  [/\b(moss|sphagnum|java\s*moss)\b/i, 'mosses'],
  [/\b(cactus|succulent|aloe|haworthia|echeveria|crassula|agave)\b/i, 'succulents'],
  [/\b(nepenthes|sarracenia|drosera|pinguicula|heliamphora|byblis|utricularia)\b/i, 'carnivorous'],
  [/\baglaonema\b/i, 'aglaonema'],
  [/\balocasia\b/i, 'alocasia'],
  [/\banthurium\b/i, 'anthurium'],
  [/\bbegonia\b/i, 'begonia'],
  [/\bbromeliad|tillandsia|cryptanthus|neoregelia\b/i, 'bromeliads'],
  [/\bhoya\b/i, 'hoya'],
  [/\bmonstera\b/i, 'monstera'],
  [/\bphilodendron\b/i, 'philodendron'],
  [/\bsyngonium\b/i, 'syngonium']
];

function standardizeCategory(cat, plant) {
  if (typeof cat === 'string' && cat.trim()) {
    const c = cat.trim().toLowerCase();
    // match known list
    const found = KNOWN_CATEGORIES.find(k => k.toLowerCase() === c);
    if (found) return found;
  }
  // derive from type array
  const types = Array.isArray(plant.type) ? plant.type : (plant.type ? [plant.type] : []);
  for (const t of types) {
    const c = String(t).toLowerCase();
    if (KNOWN_CATEGORIES.includes(c)) return c;
  }
  // derive from name or scientific name
  const text = `${plant.name || ''} ${plant.scientificName || ''}`;
  for (const [re, mapped] of NAME_TO_CATEGORY_HINTS) {
    if (re.test(text)) return mapped;
  }
  // fallback
  return 'additional';
}

function ensureArray(x) {
  if (Array.isArray(x)) return x;
  if (x === undefined || x === null) return [];
  return [x];
}

function normalize(plant) {
  const normalized = {};
  normalized.id = plant.id ?? plant.id; // keep as-is if present
  normalized.name = plant.name || '';
  normalized.scientificName = plant.scientificName || plant.name || '';
  normalized.category = standardizeCategory(plant.category, plant);
  normalized.type = Array.from(new Set(ensureArray(plant.type).map(v => String(v).toLowerCase())));
  // Images
  const imgs = ensureArray(plant.images).filter(Boolean);
  normalized.imageUrl = plant.imageUrl || imgs[0] || '';
  normalized.images = imgs.length ? imgs : (normalized.imageUrl ? [normalized.imageUrl] : []);
  // Care
  normalized.difficulty = plant.difficulty || 'Moderate';
  normalized.lightRequirements = plant.lightRequirements || 'Bright Indirect to Medium Light';
  normalized.humidity = plant.humidity || 'High (60-80%)';
  normalized.temperature = plant.temperature || '18-24°C';
  normalized.watering = plant.watering || 'Keep soil moist, not soggy';
  normalized.substrate = plant.substrate || 'Well-draining mix';
  normalized.size = plant.size || 'Varies';
  normalized.growthRate = plant.growthRate || 'Moderate';
  normalized.description = plant.description || '';
  normalized.careTips = ensureArray(plant.careTips);
  normalized.compatibility = plant.compatibility || '';
  // Taxonomy
  normalized.taxonomy = plant.taxonomy && typeof plant.taxonomy === 'object' ? plant.taxonomy : { kingdom: 'Plantae' };
  normalized.vivariumType = ensureArray(plant.vivariumType);
  // intentionally omit sourceUrl from normalized schema

  return normalized;
}

async function main() {
  console.log('🛠️ Normalizing data/plants-merged to canonical schema...');
  const files = (await fs.readdir(DIR)).filter(f => f.endsWith('.json') && f !== 'index.json');
  let changed = 0, processed = 0;

  for (const f of files) {
    const p = path.join(DIR, f);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const plant = JSON.parse(raw);
      const before = JSON.stringify(plant);
      const out = normalize(plant);
      const after = JSON.stringify(out, null, 2);
      if (after !== raw) {
        await fs.writeFile(p, after, 'utf8');
        changed++;
      }
      processed++;
    } catch (e) {
      // skip
    }
  }

  // Rebuild index.json listing
  const remaining = (await fs.readdir(DIR)).filter(x => x.endsWith('.json') && x !== 'index.json').sort();
  const indexObj = { count: remaining.length, plants: remaining };
  await fs.writeFile(path.join(DIR, 'index.json'), JSON.stringify(indexObj, null, 2), 'utf8');

  console.log(`✅ Normalization complete. Processed: ${processed}, Changed: ${changed}`);
}

if (require.main === module) {
  main().catch(err => { console.error('❌ Normalize failed:', err); process.exit(1); });
}

module.exports = { main };
