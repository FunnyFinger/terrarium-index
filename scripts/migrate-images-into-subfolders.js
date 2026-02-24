/**
 * Move existing image folders into images/plants, images/supplies, images/vivariums.
 * Run once after updating code paths. Run: node scripts/migrate-images-into-subfolders.js
 * - images/{plant-slug}/ -> images/plants/{plant-slug}/
 * - images/equipment-* -> images/supplies/equipment-*
 * - images/vivarium-* -> images/vivariums/vivarium-*
 * Skips banner.jpg, carnivorous-icon.png, etc. (files in images/ root).
 */
const fs = require('fs');
const path = require('path');

const imagesDir = path.join(__dirname, '..', 'images');
if (!fs.existsSync(imagesDir)) {
  console.log('No images folder found.');
  process.exit(0);
}

const entries = fs.readdirSync(imagesDir, { withFileTypes: true });
const plantsDir = path.join(imagesDir, 'plants');
const suppliesDir = path.join(imagesDir, 'supplies');
const vivariumsDir = path.join(imagesDir, 'vivariums');

[plantsDir, suppliesDir, vivariumsDir].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

let movedPlants = 0;
let movedSupplies = 0;
let movedVivariums = 0;

entries.forEach(ent => {
  if (!ent.isDirectory()) return;
  const name = ent.name;
  const src = path.join(imagesDir, name);
  if (name === 'plants' || name === 'supplies' || name === 'vivariums') return;
  if (name.startsWith('equipment-')) {
    const dest = path.join(suppliesDir, name);
    if (!fs.existsSync(dest)) {
      fs.renameSync(src, dest);
      movedSupplies++;
      console.log('Moved', name, '-> supplies/');
    }
  } else if (name.startsWith('vivarium-')) {
    const dest = path.join(vivariumsDir, name);
    if (!fs.existsSync(dest)) {
      fs.renameSync(src, dest);
      movedVivariums++;
      console.log('Moved', name, '-> vivariums/');
    }
  } else {
    const dest = path.join(plantsDir, name);
    if (!fs.existsSync(dest)) {
      fs.renameSync(src, dest);
      movedPlants++;
      console.log('Moved', name, '-> plants/');
    }
  }
});

console.log('Done. Moved plants:', movedPlants, ', supplies:', movedSupplies, ', vivariums:', movedVivariums);
