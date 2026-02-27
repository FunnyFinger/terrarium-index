#!/usr/bin/env node
/**
 * Populate each plant's `images` and `imageUrl` from files in images/plants/<slug>/.
 * Run this so the bundle (and Supabase after re-migration) has the full gallery for every plant.
 *
 * Usage: node scripts/populate-plant-images-from-folders.js
 *
 * Then: node scripts/build-plants-bundle.js && npm run migrate-plants-catalog
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MERGED_DIR = path.join(ROOT, 'data', 'plants-merged');
const IMAGES_PLANTS = path.join(ROOT, 'images', 'plants');
const INDEX_PATH = path.join(MERGED_DIR, 'index.json');

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
// Match <slug>-<number>.<ext> or legacy 01.jpg, 2.jpg
const NUM_SUFFIX = /-(\d+)\.(jpg|jpeg|png|gif|webp)$/i;
const LEGACY_NUM = /^(\d{1,2})\.(jpg|jpeg|png|gif|webp)$/i;

function listPlantImagePaths(slug) {
  const out = [];
  const dirPlants = path.join(IMAGES_PLANTS, slug);
  const dirLegacy = path.join(ROOT, 'images', slug);

  for (const [dir, urlPrefix] of [[dirPlants, 'images/plants/'], [dirLegacy, 'images/']]) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    const folderName = path.basename(dir);
    const files = fs.readdirSync(dir);
    const numbered = [];
    for (const f of files) {
      if (!IMAGE_EXT.test(f)) continue;
      const fullPath = path.join(dir, f);
      if (!fs.statSync(fullPath).isFile()) continue;
      const matchNum = f.match(NUM_SUFFIX);
      const matchLegacy = f.match(LEGACY_NUM);
      let num;
      if (matchNum) num = parseInt(matchNum[1], 10);
      else if (matchLegacy) num = parseInt(matchLegacy[1], 10);
      else continue;
      // Store path that matches the file on disk so hosted site can serve it
      const relPath = `${urlPrefix}${folderName}/${f}`;
      numbered.push({ num, path: relPath });
    }
    numbered.sort((a, b) => a.num - b.num);
    for (const { path: p } of numbered) out.push(p);
    if (out.length) break;
  }
  return out;
}

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('Missing data/plants-merged/index.json');
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const files = index.plants || [];
  let updated = 0;
  let withImages = 0;

  for (const file of files) {
    const slug = file.replace(/\.json$/i, '');
    const filePath = path.join(MERGED_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const imagePaths = listPlantImagePaths(slug);
    if (!imagePaths.length) continue;

    let plant;
    try {
      plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      continue;
    }

    const prev = (plant.images && plant.images.length) || 0;
    plant.images = imagePaths;
    plant.imageUrl = imagePaths[0] || null;
    fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf8');
    updated++;
    if (imagePaths.length > 0) withImages++;
    if (prev !== imagePaths.length && imagePaths.length > 1) {
      console.log(`${slug}: ${imagePaths.length} images`);
    }
  }

  console.log(`Done. Updated ${updated} plant files with images from folders (${withImages} with at least one image).`);
  console.log('Next: node scripts/build-plants-bundle.js && npm run migrate-plants-catalog');
}

main();
