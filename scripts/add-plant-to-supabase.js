#!/usr/bin/env node
/**
 * Add one new plant to Supabase plants_catalog.
 * Reads plant data from a JSON file or stdin (--stdin). Assigns next available id and POSTs.
 *
 * Usage:
 *   node scripts/add-plant-to-supabase.js path/to/plant.json
 *   node scripts/add-plant-to-supabase.js --stdin < plant.json
 *   echo '{"name":"My Plant","scientificName":"..."}' | node scripts/add-plant-to-supabase.js --stdin
 *
 * Config from env or js/config.js (SUPABASE_URL, SUPABASE_ANON_KEY).
 * The plant JSON need not include id; it will be set to the next available id from Supabase.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const { formatCultivarScientificName } = require('./lib/format-cultivar-scientific-name.js');
const { formatHybridScientificName } = require('./lib/format-hybrid-scientific-name.js');

function getConfig() {
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) {
    try {
      const configPath = path.join(ROOT, 'js', 'config.js');
      const content = fs.readFileSync(configPath, 'utf8');
      const urlMatch = content.match(/SUPABASE_URL\s*=\s*[^'"]*['"](https:\/\/[^'"]+)['"]/);
      const keyMatch = content.match(/SUPABASE_ANON_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/) ||
        content.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/);
      if (urlMatch) url = urlMatch[1].trim();
      if (keyMatch) key = keyMatch[1].trim();
    } catch (e) { /* ignore */ }
  }
  url = (url || '').toString().trim().replace(/\/$/, '');
  key = (key || '').toString().trim();
  return { url, key };
}

function request(method, baseUrl, key, pathname, body, prefer) {
  const pathPart = pathname.replace(/^\//, '');
  const fullUrl = baseUrl.replace(/\/$/, '') + '/' + pathPart;
  const u = new URL(fullUrl);
  const payload = body != null ? JSON.stringify(body) : null;
  const opts = {
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation'
    },
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : []); }
          catch { resolve([]); }
        } else {
          reject(new Error((res.statusCode || '') + ' ' + (res.statusMessage || '') + ' ' + data));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const defaultRanges = {
  humidityRange: { min: 60, max: 80, ideal: 70 },
  lightRange: { min: 60, max: 80, ideal: 70 },
  airCirculationRange: { min: 10, max: 50, ideal: 30 },
  waterNeedsRange: { min: 40, max: 60, ideal: 50 },
  temperatureRange: { min: 36, max: 48, ideal: 42 },
  difficultyRange: { min: 20, max: 60, ideal: 40 },
  soilPhRange: { min: 42.9, max: 50, ideal: 46.4 },
  growthRateRange: { min: 40, max: 60, ideal: 50 },
  waterCirculationRange: { min: null, max: null, ideal: null },
  waterTemperatureRange: { min: null, max: null, ideal: null },
  waterPhRange: { min: null, max: null, ideal: null },
  waterHardnessRange: { min: null, max: null, ideal: null },
  salinityRange: { min: null, max: null, ideal: null }
};

function normalizePlant(data) {
  const plant = typeof data === 'object' && data !== null ? { ...data } : {};
  if (!plant.name) plant.name = 'Unknown plant';
  if (!plant.scientificName) plant.scientificName = plant.name;
  if (!Array.isArray(plant.careTips)) plant.careTips = [];
  if (!Array.isArray(plant.commonNames)) plant.commonNames = [];
  if (!Array.isArray(plant.category)) plant.category = ['tropical', 'leafy'];
  if (!plant.description) plant.description = '';
  if (!plant.substrate) plant.substrate = 'Well Draining';
  if (!plant.size) plant.size = '15–60 cm';
  if (!plant.growthRate) plant.growthRate = 'Moderate';
  if (!plant.propagation) plant.propagation = 'Stem Cuttings';
  if (!plant.colors) plant.colors = 'Green';
  if (!plant.taxonomy || typeof plant.taxonomy !== 'object') {
    const genus = (plant.scientificName || '').split(/\s+/)[0] || 'Unknown';
    plant.taxonomy = {
      kingdom: 'Plantae',
      phylum: 'Tracheophyta',
      class: 'Liliopsida',
      order: 'Alismatales',
      family: 'Araceae',
      genus,
      species: plant.scientificName || plant.name
    };
  }
  const defaults = {
    growthPattern: 'upright-bushy',
    hazard: 'non-toxic',
    rarity: 'common',
    growthHabit: 'ground-dwelling',
    plantType: 'flowering-plant',
    floweringPeriod: 'seasonal',
    substrateType: 'dry',
    specialNeeds: 'none',
    carnivorous: false,
    geographicOrigin: null,
    additionalInfo: null
  };
  Object.keys(defaults).forEach((k) => {
    if (plant[k] === undefined) plant[k] = defaults[k];
  });
  Object.keys(defaultRanges).forEach((k) => {
    if (plant[k] == null) plant[k] = defaultRanges[k];
  });
  if (!Array.isArray(plant.images)) plant.images = [];
  if (!plant.imageUrl) plant.imageUrl = plant.images[0] || '';
  // Cultivar convention: full species name + 'Cultivar', e.g. "Aglaonema commutatum 'Red Ruby'"
  const cultivarName = formatCultivarScientificName(plant);
  if (cultivarName) plant.scientificName = cultivarName;
  // Hybrid convention: interspecific = "Genus Species1 × Species2", intergeneric = "Genus1 Species1 × Genus2 Species2"
  const hybridName = formatHybridScientificName(plant);
  if (hybridName) plant.scientificName = hybridName;
  return plant;
}

async function main() {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env vars or update js/config.js.');
    process.exit(1);
  }

  let raw;
  const stdin = process.argv.includes('--stdin');
  if (stdin) {
    raw = await new Promise((resolve) => {
      const chunks = [];
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  } else {
    const filePath = process.argv[2];
    if (!filePath) {
      console.error('Usage: node add-plant-to-supabase.js <plant.json>');
      console.error('   or: node add-plant-to-supabase.js --stdin < plant.json');
      process.exit(1);
    }
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) {
      console.error('File not found:', absPath);
      process.exit(1);
    }
    raw = fs.readFileSync(absPath, 'utf8');
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }

  const base = url + '/rest/v1';
  const plant = normalizePlant(data);
  delete plant.id;

  let nextId = 1;
  try {
    const rows = await request('GET', base, key, '/plants_catalog?select=id&order=id.desc&limit=1');
    if (Array.isArray(rows) && rows.length > 0 && rows[0].id != null) {
      nextId = Number(rows[0].id) + 1;
    }
  } catch (e) {
    console.warn('Could not get max id from Supabase, using 1:', e.message);
  }

  plant.id = nextId;
  const row = { id: nextId, data: plant };

  try {
    await request('POST', base, key, '/plants_catalog', [row], 'resolution=merge-duplicates,return=representation');
    console.log('Added plant to Supabase:', plant.name, '(id:', nextId, ')');
    console.log(JSON.stringify({ id: nextId, name: plant.name, scientificName: plant.scientificName }));
  } catch (e) {
    console.error('Failed to add plant:', e.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
