const fs = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(HTML_FILE, 'utf8');

// Fern and moss genera to remove
const fernGenera = [
  'acrostichum', 'actiniopteris', 'adiantum', 'asplenium', 'azolla', 
  'ceratopteris', 'davallia', 'dicksonia', 'doryopteris', 'drynaria', 
  'dryopteris', 'elaphoglossum', 'lecanopteris', 'leptochilus', 
  'microsorum', 'neoblechnum', 'nephrolepis', 'phlebodium', 
  'platycerium', 'salvinia', 'sphaeropteris'
];

const mossGenera = [
  'dicranum', 'fissidens', 'hypnum', 'leucobryum', 'sphagnum', 
  'syntrichia', 'taxiphyllum', 'thuidium', 'vesicularia'
];

const allToRemove = [...fernGenera, ...mossGenera];

// Pattern to match each label block
const labelPattern = /<label class="checkbox-label">\s*<input type="checkbox" class="filter-checkbox" data-filter="classification" value="genus:([^"]+)">\s*<span>([^<]+)<\/span>\s*<\/label>/g;

let match;
let removedCount = 0;
let newHtml = html;

// Remove each fern/moss genus filter
allToRemove.forEach(genus => {
  const pattern = new RegExp(
    `<label class="checkbox-label">\\s*<input type="checkbox" class="filter-checkbox" data-filter="classification" value="genus:${genus}">\\s*<span>[^<]+<\\/span>\\s*<\\/label>`,
    'g'
  );
  const before = newHtml;
  newHtml = newHtml.replace(pattern, '');
  if (before !== newHtml) {
    removedCount++;
    console.log(`Removed: genus:${genus}`);
  }
});

// Clean up extra blank lines (more than 2 consecutive)
newHtml = newHtml.replace(/\n(\s*\n){3,}/g, '\n\n');

fs.writeFileSync(HTML_FILE, newHtml, 'utf8');
console.log(`\n✅ Removed ${removedCount} fern/moss genus filters`);
console.log(`Total genera to remove: ${allToRemove.length}`);

