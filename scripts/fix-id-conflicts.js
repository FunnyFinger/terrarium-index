const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const files = fs.readdirSync(plantsDir).filter(f => f.endsWith('.json') && f !== 'index.json');

const ids = new Map();
const conflicts = [];

// First pass: find conflicts
files.forEach(file => {
    try {
        const plant = JSON.parse(fs.readFileSync(path.join(plantsDir, file), 'utf8'));
        if (ids.has(plant.id)) {
            conflicts.push({
                file: file,
                id: plant.id,
                existing: ids.get(plant.id)
            });
        } else {
            ids.set(plant.id, file);
        }
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});

console.log('ID Conflicts found:');
conflicts.forEach(c => {
    console.log(`  ID ${c.id}: ${c.existing} and ${c.file}`);
});

// Find max ID
let maxId = 0;
files.forEach(file => {
    try {
        const plant = JSON.parse(fs.readFileSync(path.join(plantsDir, file), 'utf8'));
        if (plant.id && typeof plant.id === 'number' && plant.id > maxId && plant.id < 1000000) {
            maxId = plant.id;
        }
    } catch (e) {}
});

console.log(`\nMax normal ID: ${maxId}`);
console.log(`Next available IDs: ${maxId + 1} to ${maxId + 10}\n`);

// Fix conflicts - assign new IDs to Marcgravia plants
const marcgraviaFiles = conflicts.filter(c => c.file.includes('marcgravia'));
let newId = maxId + 1;

marcgraviaFiles.forEach(conflict => {
    const filePath = path.join(plantsDir, conflict.file);
    try {
        const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const oldId = plant.id;
        plant.id = newId;
        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        console.log(`✅ Fixed ${conflict.file}: ID ${oldId} → ${newId}`);
        newId++;
    } catch (e) {
        console.error(`❌ Error fixing ${conflict.file}:`, e.message);
    }
});

console.log(`\n✅ Fixed ${marcgraviaFiles.length} ID conflicts`);

