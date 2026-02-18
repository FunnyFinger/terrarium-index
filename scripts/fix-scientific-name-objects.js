/**
 * Fix scientificName: convert object (GBIF-style) to plain string "Genus species".
 * Also report any plant with a string scientificName that is only one word.
 */
const fs = require('fs');
const path = require('path');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function getScientificString(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') return obj;
  if (obj.scientificName && typeof obj.scientificName === 'string') return obj.scientificName;
  if (obj.genus && obj.specificEpithet) return [obj.genus, obj.specificEpithet].filter(Boolean).join(' ');
  return null;
}

const indexPath = path.join(MERGED_DIR, 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const files = index.files || index.plants || Object.keys(index).filter(k => k.endsWith('.json'));

let fixed = 0;
const singleWord = [];

for (const file of files) {
  if (file === 'bundle.json' || file === 'version.json' || file === 'index.json') continue;
  const filePath = path.join(MERGED_DIR, file);
  if (!fs.existsSync(filePath)) continue;

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const sn = data.scientificName;

  if (typeof sn === 'object' && sn !== null) {
    const str = getScientificString(sn);
    if (str) {
      data.scientificName = str;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      console.log('Fixed:', file, '->', str);
      fixed++;
    }
  } else if (typeof sn === 'string') {
    const trimmed = sn.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 1 && trimmed.length > 0) {
      singleWord.push({ file, name: data.name, scientificName: trimmed });
    }
  }
}

console.log('\nTotal fixed (object -> string):', fixed);
if (singleWord.length > 0) {
  console.log('\nSingle-word scientific name (review):', singleWord.length);
  singleWord.forEach(({ file, name, scientificName }) => console.log('  ', file, '|', name, '|', scientificName));
}
