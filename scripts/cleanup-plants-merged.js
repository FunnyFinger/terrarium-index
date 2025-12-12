// Remove non-plant items from data/plants-merged
// Keep only living plants (ferns, orchids, mosses, succulents, carnivorous, aquarium, air-plants, tropical, additional, vivarium/terrarium plants)

const fs = require('fs').promises;
const path = require('path');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

const KEEP_TYPES = new Set([
  'ferns', 'orchids', 'mosses', 'succulents', 'carnivorous', 'aquarium', 'air-plants',
  'tropical', 'additional', 'vivarium', 'terrarium'
]);

const KEEP_NAME_PATTERNS = [
  /fern/i, /orchid/i, /moss/i, /lichen/i, /algae/i, /aquarium/i,
  /succulent/i, /cactus/i, /bromeliad/i, /tillandsia/i,
  /nepenthes/i, /sarracenia/i, /drosera/i, /pinguicula/i, /heliamphora/i, /byblis/i,
  /anubias/i, /epipremnum/i, /fittonia/i, /begonia/i, /selaginella/i, /java moss/i
];

const EXCLUDE_NAME_PATTERNS = [
  /root[-\s]?force/i, /fertilizer/i, /substrate/i, /soil/i, /tool/i, /accessor(y|ies)/i,
  /package/i, /starter\s*(set|pack|package)/i, /set\b/i, /kit\b/i, /bundle/i, /mix\b/i,
  /collection/i, /assortment/i, /gift/i, /shipping/i, /privacy/i, /payment/i,
  /newsletter/i, /voucher/i, /pot\b/i, /planter/i, /hanger/i, /spray/i, /mister/i, /bottle/i,
  /lamp/i, /light/i, /grow light/i, /heater/i, /filter/i, /thermometer/i,
  /spore(s)?/i, /seed(s)?/i, /plug\b/i,
  /nutrient(s)?/i, /nutrition/i, /npk\b/i, /macro\s*nutrient/i, /micro\s*nutrient/i,
  /trace\s*(mix|elements)/i, /chelated/i, /iron\b/i, /phosphate/i, /nitrate/i
];

function isPlant(plant, fileName) {
  if (!plant || typeof plant !== 'object') return false;

  // 0) Hard exclude by type for known non-plant categories
  const t0 = Array.isArray(plant.type) ? plant.type : (plant.type ? [plant.type] : []);
  const typesLower0 = t0.map(x => String(x).toLowerCase());
  if (typesLower0.includes('nutrient') || typesLower0.includes('nutrients')) return false;
  // 0b) Hard exclude by category field
  if (String(plant.category || '').toLowerCase() === 'nutrients') return false;
  // 0c) Exclude by sourceUrl path hints
  const src = String(plant.sourceUrl || '');
  if (/\/(collections|category)\/(nutrient|nutrients|fertiliser|fertilizer)/i.test(src)) return false;

  // 1) Taxonomy check
  if (plant.taxonomy && /plantae/i.test(plant.taxonomy.kingdom || '')) return true;

  // 2) Type/category check (exclude 'other' unless taxonomy says Plantae or name matches)
  const t = Array.isArray(plant.type) ? plant.type : (plant.type ? [plant.type] : []);
  const typesLower = t.map(x => String(x).toLowerCase());
  if (typesLower.includes('other')) {
    // continue checks, don't immediately keep
  } else if (typesLower.some(x => KEEP_TYPES.has(x))) {
    return true;
  }

  // 3) Name/ScientificName heuristics
  const name = `${plant.name || ''} ${plant.scientificName || ''}`;
  if (KEEP_NAME_PATTERNS.some(re => re.test(name))) return true;

  // 4) Exclude known non-plant keywords
  if (EXCLUDE_NAME_PATTERNS.some(re => re.test(name)) || EXCLUDE_NAME_PATTERNS.some(re => re.test(fileName))) return false;

  // 5) Default: not sure -> exclude if clearly non-plant by description
  const desc = plant.description || '';
  if (/starter set|package|shipping|payment|privacy|accessor/i.test(desc)) return false;

  // Otherwise, conservative default: keep if has scientificName and images, and does not match exclude keywords
  if (plant.scientificName && (Array.isArray(plant.images) ? plant.images.length > 0 : !!plant.imageUrl)) return true;

  return false;
}

async function main() {
  console.log('🧹 Cleaning data/plants-merged (removing non-plant items)...');
  const files = await fs.readdir(MERGED_DIR);
  let kept = 0, removed = 0, scanned = 0;

  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    if (f === 'index.json') continue;
    scanned++;
    const p = path.join(MERGED_DIR, f);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const plant = JSON.parse(raw);
      if (isPlant(plant, f)) {
        kept++;
      } else {
        await fs.unlink(p);
        removed++;
      }
    } catch (e) {
      // Corrupt or unreadable: remove
      try { await fs.unlink(p); removed++; } catch(_) {}
    }
  }

  // Rebuild index.json
  const remaining = (await fs.readdir(MERGED_DIR)).filter(x => x.endsWith('.json') && x !== 'index.json').sort();
  const indexObj = { count: remaining.length, plants: remaining };
  await fs.writeFile(path.join(MERGED_DIR, 'index.json'), JSON.stringify(indexObj, null, 2), 'utf8');

  console.log(`✅ Cleanup complete. Scanned: ${scanned}, Kept: ${kept}, Removed: ${removed}`);
}

if (require.main === module) {
  main().catch(err => { console.error('❌ Cleanup failed:', err); process.exit(1); });
}

module.exports = { main };
