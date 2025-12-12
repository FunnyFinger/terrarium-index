// Merge all plant JSONs into a single folder: data/plants-merged
// Sources: data/plants/** (category folders), data/araflora-all, data/growtropicals-import (if exists)
// Dedupes by id (preferred), else by scientificName+name, preferring entries with longer descriptions

const fs = require('fs').promises;
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES = [
  path.join(ROOT, 'data', 'plants'),
  path.join(ROOT, 'data', 'araflora-all'),
  path.join(ROOT, 'data', 'growtropicals-import')
];
const OUTPUT_DIR = path.join(ROOT, 'data', 'plants-merged');

function slugify(name) {
  return (name || 'plant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildKey(plant) {
  if (plant && (plant.id || plant.id === 0)) return `id:${plant.id}`;
  const sci = (plant.scientificName || '').trim().toLowerCase();
  const name = (plant.name || '').trim().toLowerCase();
  if (sci || name) return `sn:${sci}|n:${name}`;
  return `rand:${Math.random().toString(36).slice(2)}`;
}

function scorePlant(plant) {
  const descLen = (plant.description || '').length;
  const images = Array.isArray(plant.images) ? plant.images.length : 0;
  let score = 0;
  score += Math.min(descLen, 1000); // prioritize richer descriptions
  score += images * 10;
  // prefer having scientificName
  if (plant.scientificName && plant.scientificName.length > 0) score += 50;
  return score;
}

async function collectFromPlantsDir(dir, out) {
  try {
    const categories = await fs.readdir(dir, { withFileTypes: true });
    for (const cat of categories) {
      if (!cat.isDirectory()) continue;
      const catDir = path.join(dir, cat.name);
      const files = await fs.readdir(catDir);
      for (const f of files) {
        if (!f.endsWith('.json') || f === 'index.json') continue;
        const p = path.join(catDir, f);
        await addPlantFile(p, out);
      }
    }
  } catch (_) {
    // ignore missing
  }
}

async function collectFlatDir(dir, out) {
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(dir, f);
      await addPlantFile(p, out);
    }
  } catch (_) {
    // ignore missing
  }
}

async function addPlantFile(filePath, out) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const plant = JSON.parse(raw);
    const key = buildKey(plant);
    const next = { ...plant };
    const existing = out.map.get(key);
    if (!existing) {
      out.map.set(key, next);
      out.source.set(key, filePath);
    } else {
      // pick the better one by score; merge some arrays if needed
      const currentScore = scorePlant(existing);
      const newScore = scorePlant(next);
      if (newScore > currentScore) {
        out.map.set(key, next);
        out.source.set(key, filePath);
      } else if (newScore === currentScore) {
        // merge images unique
        const imgsA = Array.isArray(existing.images) ? existing.images : [];
        const imgsB = Array.isArray(next.images) ? next.images : [];
        const merged = Array.from(new Set([...imgsA, ...imgsB]));
        existing.images = merged;
      }
    }
  } catch (e) {
    // skip
  }
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (_) {}
}

async function main() {
  console.log('🧩 Merging plants into data/plants-merged ...');
  const out = { map: new Map(), source: new Map() };

  // Collect from structured plants dir
  await collectFromPlantsDir(SOURCES[0], out);
  // Collect from flat import dirs
  await collectFlatDir(SOURCES[1], out);
  await collectFlatDir(SOURCES[2], out);

  await ensureDir(OUTPUT_DIR);

  const entries = Array.from(out.map.entries());
  let index = [];
  let written = 0;

  for (const [key, plant] of entries) {
    // Create filename using id and slug
    const idPart = (plant.id || plant.id === 0) ? String(plant.id) : null;
    const baseName = slugify(plant.name || plant.scientificName || 'plant');
    const fileName = idPart ? `${idPart}-${baseName}.json` : `${baseName}.json`;
    const outPath = path.join(OUTPUT_DIR, fileName);

    try {
      await fs.writeFile(outPath, JSON.stringify(plant, null, 2), 'utf8');
      index.push(fileName);
      written++;
    } catch (e) {
      // skip errors
    }
  }

  // Write index.json
  const indexObj = { count: index.length, plants: index.sort() };
  await fs.writeFile(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify(indexObj, null, 2), 'utf8');

  console.log(`✅ Merged ${written} plants into ${OUTPUT_DIR}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Merge failed:', err);
    process.exit(1);
  });
}

module.exports = { main };
