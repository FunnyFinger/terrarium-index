const fs = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(HTML_FILE, 'utf8');

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

const allToCheck = [...fernGenera, ...mossGenera];

let remaining = [];
allToCheck.forEach(genus => {
  if (html.includes(`genus:${genus}`)) {
    remaining.push(genus);
  }
});

const hasFern = html.includes('value="Fern"');
const hasMoss = html.includes('value="Moss"');

console.log('✅ Verification Results:');
console.log(`Fern phylum filter present: ${hasFern ? 'YES' : 'NO'}`);
console.log(`Moss phylum filter present: ${hasMoss ? 'YES' : 'NO'}`);
console.log(`\nRemaining fern/moss genus filters: ${remaining.length}`);
if (remaining.length > 0) {
  console.log('Still present:', remaining.join(', '));
} else {
  console.log('✅ All fern/moss genus filters successfully removed!');
}

