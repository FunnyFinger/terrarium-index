/**
 * Create images/supplies/equipment-{id}/ for each supply and set equipment.json image paths.
 * Run: node scripts/setup-equipment-image-folders.js
 * Then add image files (e.g. 1.jpg, 2.jpg) into each images/supplies/equipment-{id}/ folder.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const dataPath = path.join(rootDir, 'data', 'equipment.json');
const imagesDir = path.join(rootDir, 'images');
const suppliesDir = path.join(imagesDir, 'supplies');

const list = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

if (!fs.existsSync(suppliesDir)) {
  fs.mkdirSync(suppliesDir, { recursive: true });
}

list.forEach(function (item) {
  const id = item.id;
  if (id == null) return;
  const folderName = 'equipment-' + id;
  const dir = path.join(suppliesDir, folderName);
  const relPath = 'images/supplies/' + folderName;

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created', relPath + '/');
  }

  const firstImage = relPath + '/1.jpg';
  item.imageUrl = firstImage;
  item.images = [firstImage];
});

fs.writeFileSync(dataPath, JSON.stringify(list, null, 2), 'utf8');
console.log('Updated data/equipment.json with image paths for', list.length, 'supplies.');
console.log('Add image files (e.g. 1.jpg) to each images/supplies/equipment-{id}/ folder.');
