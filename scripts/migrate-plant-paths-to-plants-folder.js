/**
 * Update all plant JSON files in data/plants-merged so image paths use images/plants/.
 * Run: node scripts/migrate-plant-paths-to-plants-folder.js
 * Paths like "images/slug/..." become "images/plants/slug/..."; already "images/plants/..." are unchanged.
 */
const fs = require('fs');
const path = require('path');

const plantsMergedDir = path.join(__dirname, '..', 'data', 'plants-merged');
const prefix = 'images/';
const newPrefix = 'images/plants/';

function updatePath(p) {
  if (typeof p !== 'string' || !p.startsWith(prefix) || p.startsWith(newPrefix)) return p;
  return newPrefix + p.slice(prefix.length);
}

const files = fs.readdirSync(plantsMergedDir).filter(f => f.endsWith('.json'));
let updated = 0;
let totalPaths = 0;

files.forEach(file => {
  const filePath = path.join(plantsMergedDir, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  let changed = false;
  if (data.imageUrl && typeof data.imageUrl === 'string') {
    const next = updatePath(data.imageUrl);
    if (next !== data.imageUrl) {
      data.imageUrl = next;
      changed = true;
      totalPaths++;
    }
  }
  if (Array.isArray(data.images)) {
    data.images = data.images.map(img => {
      const next = updatePath(img);
      if (next !== img) {
        changed = true;
        totalPaths++;
        return next;
      }
      return img;
    });
  }
  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    updated++;
  }
});

console.log('Updated', updated, 'plant JSON files;', totalPaths, 'paths changed to images/plants/.');
