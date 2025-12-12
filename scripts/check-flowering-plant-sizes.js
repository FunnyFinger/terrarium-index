const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');

// Check if plant is flowering
function isFloweringPlant(plant) {
    const plantType = (plant.plantType || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    const floweringPeriod = (plant.floweringPeriod || '').toLowerCase();
    
    if (plantType === 'flowering plant') return true;
    if (category.includes('flowering')) return true;
    if (plantType === 'carnivorous plant' || plantType.includes('carnivorous')) return true;
    if (category.includes('carnivorous')) return true;
    if (floweringPeriod && !floweringPeriod.includes('does not flower') && !floweringPeriod.includes('non-flowering') && floweringPeriod !== 'rarely flowers') return true;
    
    return false;
}

// Parse size
function parseSize(sizeStr) {
    if (!sizeStr) return null;
    const match = sizeStr.match(/([\d.]+)\s*-\s*([\d.]+)\s*(cm|m)/i);
    if (match) {
        let min = parseFloat(match[1]);
        let max = parseFloat(match[2]);
        const unit = match[3].toLowerCase();
        if (unit === 'm') {
            min *= 100;
            max *= 100;
        }
        return { min, max, unit: 'cm', original: sizeStr };
    }
    return null;
}

// Get all plant files
function getAllPlantFiles() {
    const files = [];
    function traverse(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath);
            } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
                files.push(fullPath);
            }
        }
    }
    traverse(plantsDir);
    return files;
}

const files = getAllPlantFiles();
const floweringPlants = [];
const suspicious = [];

files.forEach(filePath => {
    try {
        const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (isFloweringPlant(plant)) {
            const size = parseSize(plant.size);
            const sizeRange = size ? `${size.min}-${size.max} cm` : 'N/A';
            
            // Check if size seems too small for flowering size
            // For flowering plants, minimum size should typically be at least 5-10% of mature size
            // If min is very small (< 5cm) and max is large (> 50cm), it might be juvenile-to-mature instead of flowering-to-mature
            if (size) {
                const ratio = size.min / size.max;
                if (size.min < 5 && size.max > 50 && ratio < 0.1) {
                    suspicious.push({
                        file: path.basename(filePath),
                        name: plant.name,
                        scientificName: plant.scientificName,
                        size: plant.size,
                        min: size.min,
                        max: size.max,
                        ratio: ratio.toFixed(3),
                        issue: 'Very small min size relative to max (might be juvenile-to-mature instead of flowering-to-mature)'
                    });
                }
            }
            
            floweringPlants.push({
                file: path.basename(filePath),
                name: plant.name,
                scientificName: plant.scientificName,
                size: plant.size,
                parsed: size,
                plantType: plant.plantType,
                category: plant.category,
                floweringPeriod: plant.floweringPeriod
            });
        }
    } catch (error) {
        // Skip errors
    }
});

console.log(`Found ${floweringPlants.length} flowering plants\n`);

if (suspicious.length > 0) {
    console.log(`⚠️  Found ${suspicious.length} plants with suspicious size ranges:\n`);
    console.log('File | Name | Scientific Name | Size | Min | Max | Ratio | Issue');
    console.log('-----|------|----------------|------|-----|-----|-------|------');
    suspicious.forEach(p => {
        console.log(`${p.file} | ${p.name} | ${p.scientificName} | ${p.size} | ${p.min} | ${p.max} | ${p.ratio} | ${p.issue}`);
    });
} else {
    console.log('✅ No suspicious size ranges found');
}

// Save full list
const outputFile = path.join(__dirname, '..', 'data', 'size-updates', 'flowering-plants-review.json');
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify({
    total: floweringPlants.length,
    suspicious: suspicious.length,
    suspiciousPlants: suspicious,
    allPlants: floweringPlants
}, null, 2));

console.log(`\n📄 Full list saved to: ${outputFile}`);

