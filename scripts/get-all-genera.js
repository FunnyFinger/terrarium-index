const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');

const genera = {};
files.forEach(f => {
  try {
    const plant = JSON.parse(fs.readFileSync(path.join(PLANTS_DIR, f), 'utf8'));
    if (plant.taxonomy && plant.taxonomy.genus) {
      const g = plant.taxonomy.genus.toLowerCase();
      if (!genera[g]) genera[g] = 0;
      genera[g]++;
    }
  } catch(e) {}
});

const sorted = Object.entries(genera).sort((a,b) => b[1] - a[1]);
console.log('Total unique genera:', sorted.length);
console.log('\nGenus counts (sorted by frequency):');
sorted.forEach(([g, c]) => console.log(`  ${g}: ${c}`));

