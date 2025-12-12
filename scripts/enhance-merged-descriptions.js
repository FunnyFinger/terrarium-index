// Enhance placeholder descriptions in data/plants-merged
// Sources: Wikipedia Summary API, validate scientificName via GBIF species/match

const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const DELAY_MS = 1200;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Terrarium Index Bot/1.0', ...headers }}, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function fetchWikipediaSummary(title) {
  const safe = encodeURIComponent(title.replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${safe}`;
  const json = await httpGetJson(url);
  if (!json || json.type === 'disambiguation' || !json.extract) return null;
  let text = String(json.extract).trim();
  if (text.length > 600) {
    text = text.slice(0, 600);
    const last = text.lastIndexOf('.');
    if (last > 400) text = text.slice(0, last + 1);
  }
  return text;
}

async function validateScientificName(scientificName) {
  if (!scientificName || !scientificName.trim()) return false;
  const name = encodeURIComponent(scientificName.trim());
  const url = `https://api.gbif.org/v1/species/match?name=${name}`;
  const res = await httpGetJson(url);
  if (!res) return false;
  // Accept if a match with rank Plant or contains kingdom Plantae
  if (res.kingdom && /plantae/i.test(res.kingdom)) return true;
  // Some results return higherClassificationMap
  if (res.classification && Array.isArray(res.classification)) {
    if (res.classification.some(x => /plantae/i.test(x.scientificName || ''))) return true;
  }
  return false;
}

function needsEnhancement(desc) {
  if (!desc) return true;
  const d = String(desc);
  if (d.length < 120) return true;
  return /Sorry, no|will become available|no information|beautiful plant suitable/i.test(d);
}

function pickTitle(plant) {
  // Prefer scientific name (trim decorations/quotes), else name
  let sci = (plant.scientificName || '').replace(/\s*\(.*?\)/g, '').replace(/["']/g, '').trim();
  if (sci) return sci;
  return (plant.name || '').trim();
}

async function enhanceOne(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const plant = JSON.parse(raw);
  if (!needsEnhancement(plant.description)) return { enhanced: false };

  const title = pickTitle(plant);
  if (!title) return { enhanced: false };

  // Validate scientific name if present; fallback to genus + species
  let valid = false;
  if (plant.scientificName) {
    valid = await validateScientificName(plant.scientificName);
    await delay(DELAY_MS);
  }

  // Fetch from Wikipedia using scientific name if valid, else try name
  let desc = null;
  if (valid) {
    desc = await fetchWikipediaSummary(plant.scientificName);
    await delay(DELAY_MS);
  }
  if (!desc) {
    desc = await fetchWikipediaSummary(title);
    await delay(DELAY_MS);
  }

  // If still nothing and sci has two parts, try genus only
  if (!desc && plant.scientificName) {
    const parts = plant.scientificName.trim().split(/\s+/);
    if (parts.length >= 2) {
      desc = await fetchWikipediaSummary(parts[0]);
      await delay(DELAY_MS);
      if (desc) desc = `${parts[0]} is a plant genus. ${desc}`;
    }
  }

  if (!desc) return { enhanced: false };

  plant.description = desc;
  await fs.writeFile(filePath, JSON.stringify(plant, null, 2), 'utf8');
  return { enhanced: true };
}

async function main() {
  console.log('🌐 Enhancing merged plant descriptions...');
  const files = (await fs.readdir(MERGED_DIR)).filter(f => f.endsWith('.json') && f !== 'index.json');

  let processed = 0, enhanced = 0;
  for (const f of files) {
    const p = path.join(MERGED_DIR, f);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const j = JSON.parse(raw);
      if (!needsEnhancement(j.description)) continue;
      console.log('  🔍', j.name || f);
      const res = await enhanceOne(p);
      if (res.enhanced) enhanced++;
      processed++;
    } catch (_) {}
  }
  console.log(`✅ Done. Enhanced ${enhanced}, Checked ${processed}`);
}

if (require.main === module) {
  main().catch(err => { console.error('❌ Enhance failed:', err); process.exit(1); });
}

module.exports = { main };
