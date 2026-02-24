/**
 * Normalize data/equipment.json: remove inline base64 image data (data:image/...)
 * so imageUrl and images use local paths or empty. Run: node scripts/normalize-equipment-images.js
 */
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'equipment.json');
const raw = fs.readFileSync(dataPath, 'utf8');
const list = JSON.parse(raw);

function isDataUrl(s) {
  return typeof s === 'string' && s.trim().toLowerCase().startsWith('data:');
}

let changed = 0;
list.forEach(function (item) {
  if (isDataUrl(item.imageUrl)) {
    item.imageUrl = '';
    changed++;
  }
  if (Array.isArray(item.images) && item.images.length) {
    const before = item.images.length;
    item.images = item.images.filter(function (url) {
      return typeof url === 'string' && !isDataUrl(url);
    });
    if (item.images.length !== before) changed++;
  }
});

fs.writeFileSync(dataPath, JSON.stringify(list, null, 2), 'utf8');
console.log('Normalized equipment.json: cleared data URLs from', changed, 'entries. Total items:', list.length);
