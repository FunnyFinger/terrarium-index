#!/usr/bin/env node
/**
 * Populate supplies (equipment) and vivariums with full images arrays from disk.
 * - Equipment: images/supplies/equipment-{id}/ (files 1.jpg, 2.jpg, ...)
 * - Vivariums: images/vivariums/vivarium-{id}/ (files 1.jpg, 2.jpg, ...)
 *
 * Run: node scripts/populate-supplies-vivarium-images-from-folders.js
 * Then: npm run migrate-equipment-catalog && npm run migrate-vivariums-catalog
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
const NUM_PREFIX = /^(\d+)\.(jpg|jpeg|png|gif|webp)$/i;

function listImagePathsInFolder(dir, urlPrefix) {
  const out = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return out;
  const files = fs.readdirSync(dir);
  const numbered = [];
  for (const f of files) {
    if (!IMAGE_EXT.test(f)) continue;
    const fullPath = path.join(dir, f);
    if (!fs.statSync(fullPath).isFile()) continue;
    const m = f.match(NUM_PREFIX);
    if (!m) continue;
    const num = parseInt(m[1], 10);
    numbered.push({ num, path: `${urlPrefix}/${f}` });
  }
  numbered.sort((a, b) => a.num - b.num);
  return numbered.map((x) => x.path);
}

function main() {
  // Equipment
  const equipmentPath = path.join(ROOT, 'data', 'equipment.json');
  const suppliesDir = path.join(ROOT, 'images', 'supplies');
  let updatedEq = 0;
  if (fs.existsSync(equipmentPath)) {
    const list = JSON.parse(fs.readFileSync(equipmentPath, 'utf8'));
    const arr = Array.isArray(list) ? list : list.items || list.equipment || [];
    for (const item of arr) {
      if (item.id == null) continue;
      const folderName = 'equipment-' + item.id;
      const dir = path.join(suppliesDir, folderName);
      const urlPrefix = 'images/supplies/' + folderName;
      const imagePaths = listImagePathsInFolder(dir, urlPrefix);
      if (imagePaths.length > 0) {
        item.images = imagePaths;
        item.imageUrl = imagePaths[0];
        updatedEq++;
        if (imagePaths.length > 1) console.log('Equipment', item.id, item.name?.slice(0, 40) + '...:', imagePaths.length, 'images');
      }
    }
    const out = Array.isArray(list) ? arr : { ...list, items: arr };
    fs.writeFileSync(equipmentPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Updated data/equipment.json:', updatedEq, 'supplies with images.');
  }

  // Vivariums
  const vivariumsPath = path.join(ROOT, 'data', 'vivariums.json');
  const vivariumsDir = path.join(ROOT, 'images', 'vivariums');
  let updatedViv = 0;
  if (fs.existsSync(vivariumsPath)) {
    const raw = fs.readFileSync(vivariumsPath, 'utf8');
    const list = JSON.parse(raw);
    const arr = Array.isArray(list) ? list : list.items || list.vivariums || [];
    for (const item of arr) {
      if (item.id == null) continue;
      const folderName = 'vivarium-' + item.id;
      const dir = path.join(vivariumsDir, folderName);
      const urlPrefix = 'images/vivariums/' + folderName;
      const imagePaths = listImagePathsInFolder(dir, urlPrefix);
      if (imagePaths.length > 0) {
        item.images = imagePaths;
        item.imageUrl = imagePaths[0];
        updatedViv++;
        if (imagePaths.length > 1) console.log('Vivarium', item.id, item.name?.slice(0, 40) + '...:', imagePaths.length, 'images');
      }
    }
    const out = Array.isArray(list) ? arr : { ...list, items: arr };
    fs.writeFileSync(vivariumsPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Updated data/vivariums.json:', updatedViv, 'vivariums with images.');
  }

  console.log('Done. Next: npm run migrate-equipment-catalog && npm run migrate-vivariums-catalog');
}

main();
