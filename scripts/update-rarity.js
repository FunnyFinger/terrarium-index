const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const CACHE_PATH = path.join(__dirname, '..', 'data', 'rarity-cache.json');

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJsonFile(filePath, data) {
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

function loadCache() {
  try {
    return readJsonFile(CACHE_PATH);
  } catch {
    return {};
  }
}

function saveCache(cache) {
  writeJsonFile(CACHE_PATH, cache);
}

function normalizeRarity(r) {
  if (!r) return null;
  const s = String(r).toLowerCase();
  if (s.includes('very rare') || s.includes('critically endangered')) return 'Very Rare';
  if (s.includes('endangered') || s.includes('threatened')) return 'Rare';
  if (s.includes('rare') || s.includes('scarce') || s.includes('limited')) return 'Rare';
  if (s.includes('uncommon') || s.includes('less common')) return 'Uncommon';
  if (s.includes('widely cultivated') || s.includes('common') || s.includes('popular')) return 'Common';
  return null;
}

async function fetchWikipediaSummary(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    if (data && data.extract) return data.extract;
  } catch {
    // ignore
  }
  return null;
}

async function searchWikipediaAndFetch(term) {
  try {
    const api = 'https://en.wikipedia.org/w/api.php';
    const { data } = await axios.get(api, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: term,
        format: 'json',
        srlimit: 1
      },
      timeout: 10000
    });
    const first = data?.query?.search?.[0];
    if (first && first.title) {
      return fetchWikipediaSummary(first.title);
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchGbifOccurrenceCount(scientificName) {
  if (!scientificName) return null;
  try {
    const url = 'https://api.gbif.org/v1/occurrence/search';
    const { data } = await axios.get(url, {
      params: { scientificName, limit: 0 },
      timeout: 10000
    });
    if (typeof data?.count === 'number') return data.count;
  } catch {
    // ignore
  }
  return null;
}

function rarityFromGbifCount(count) {
  if (count == null) return null;
  if (count > 10000) return 'Common';
  if (count > 1000) return 'Uncommon';
  if (count > 100) return 'Rare';
  return 'Very Rare';
}

async function assessRarityFromText(text) {
  if (!text) return null;
  // Rule priority from strongest to weakest
  const lowered = text.toLowerCase();
  if (/(critically endangered|extremely rare|very rare)/.test(lowered)) return 'Very Rare';
  if (/(endangered|threatened|rare|scarce|limited in cultivation)/.test(lowered)) return 'Rare';
  if (/(uncommon|less common)/.test(lowered)) return 'Uncommon';
  if (/(widely cultivated|common|popular houseplant|popular ornamental)/.test(lowered)) return 'Common';
  return null;
}

async function determineRarity(plant) {
  // Prefer scientificName if available
  const candidates = [];
  if (plant.scientificName) candidates.push(plant.scientificName);
  if (plant.name && plant.name !== plant.scientificName) candidates.push(plant.name);
  if (Array.isArray(plant.commonNames)) candidates.push(...plant.commonNames);

  for (const title of candidates) {
    let text = await fetchWikipediaSummary(title);
    if (!text) {
      text = await searchWikipediaAndFetch(title);
    }
    const rarity = await assessRarityFromText(text);
    if (rarity) return rarity;
  }
  // GBIF fallback using scientificName only
  if (plant.scientificName) {
    const count = await fetchGbifOccurrenceCount(plant.scientificName);
    const r = rarityFromGbifCount(count);
    if (r) return r;
  }
  return null;
}

async function main() {
  const cache = loadCache();
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json'));

  let updatedCount = 0;
  let assessedCount = 0;

  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    const plant = readJsonFile(filePath);

    const cacheKey = plant.scientificName || plant.name || file;
    let assessed = cache[cacheKey];

    if (!assessed) {
      assessed = await determineRarity(plant);
      if (assessed) {
        cache[cacheKey] = assessed;
        assessedCount += 1;
      }
    }

    if (assessed && plant.rarity !== assessed) {
      plant.rarity = assessed;
      writeJsonFile(filePath, plant);
      updatedCount += 1;
      process.stdout.write(`Updated ${file}: ${assessed}\n`);
    }
  }

  saveCache(cache);
  console.log(`\nRarity update complete. Updated: ${updatedCount}, Newly assessed: ${assessedCount}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


