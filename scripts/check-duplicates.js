const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const files = fs.readdirSync(plantsDir).filter(f => f.endsWith('.json') && f !== 'index.json');

console.log(`Total plant files: ${files.length}\n`);

const plants = [];
const scientificNames = new Map();
const ids = new Map();
const names = new Map();

files.forEach(file => {
  try {
    const content = fs.readFileSync(path.join(plantsDir, file), 'utf8');
    const plant = JSON.parse(content);
    
    plants.push({
      file,
      id: plant.id,
      name: plant.name,
      scientificName: plant.scientificName
    });
    
    // Check scientific name duplicates
    const sciName = plant.scientificName?.toLowerCase() || '';
    if (!scientificNames.has(sciName)) {
      scientificNames.set(sciName, []);
    }
    scientificNames.get(sciName).push(file);
    
    // Check ID duplicates
    if (plant.id) {
      if (!ids.has(plant.id)) {
        ids.set(plant.id, []);
      }
      ids.get(plant.id).push(file);
    }
    
    // Check name duplicates
    const plantName = plant.name?.toLowerCase() || '';
    if (!names.has(plantName)) {
      names.set(plantName, []);
    }
    names.get(plantName).push(file);
    
  } catch (e) {
    console.error(`Error reading ${file}:`, e.message);
  }
});

console.log('=== DUPLICATE ANALYSIS ===\n');

// Scientific name duplicates
const sciNameDupes = Array.from(scientificNames.entries())
  .filter(([name, files]) => files.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

console.log(`Scientific Name Duplicates: ${sciNameDupes.length}`);
if (sciNameDupes.length > 0) {
  sciNameDupes.forEach(([name, files]) => {
    console.log(`  "${name}" appears in ${files.length} files:`);
    files.forEach(f => console.log(`    - ${f}`));
  });
}

// ID duplicates
const idDupes = Array.from(ids.entries())
  .filter(([id, files]) => files.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

console.log(`\nID Duplicates: ${idDupes.length}`);
if (idDupes.length > 0) {
  idDupes.forEach(([id, files]) => {
    console.log(`  ID ${id} appears in ${files.length} files:`);
    files.forEach(f => console.log(`    - ${f}`));
  });
}

// Name duplicates (common name)
const nameDupes = Array.from(names.entries())
  .filter(([name, files]) => files.length > 1 && name)
  .sort((a, b) => b[1].length - a[1].length);

console.log(`\nCommon Name Duplicates: ${nameDupes.length}`);
if (nameDupes.length > 0) {
  nameDupes.slice(0, 10).forEach(([name, files]) => {
    console.log(`  "${name}" appears in ${files.length} files:`);
    files.forEach(f => console.log(`    - ${f}`));
  });
  if (nameDupes.length > 10) {
    console.log(`  ... and ${nameDupes.length - 10} more`);
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`Total files: ${files.length}`);
console.log(`Scientific name duplicates: ${sciNameDupes.length}`);
console.log(`ID duplicates: ${idDupes.length}`);
console.log(`Common name duplicates: ${nameDupes.length}`);

