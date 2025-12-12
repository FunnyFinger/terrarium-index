const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');

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
        return { min, max };
    }
    return null;
}

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
const issues = [];

files.forEach(filePath => {
    try {
        const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (isFloweringPlant(plant)) {
            const size = parseSize(plant.size);
            
            if (size && size.max > 30) {
                const ratio = size.min / size.max;
                
                // Flag plants where min is less than 10% of max (suggests juvenile-to-mature)
                if (ratio < 0.10) {
                    issues.push({
                        file: path.basename(filePath),
                        name: plant.name,
                        scientificName: plant.scientificName,
                        size: plant.size,
                        min: size.min,
                        max: size.max,
                        ratio: (ratio * 100).toFixed(1) + '%'
                    });
                }
            }
        }
    } catch (error) {
        // Skip
    }
});

// Sort by ratio (lowest first - most problematic)
issues.sort((a, b) => parseFloat(a.ratio) - parseFloat(b.ratio));

console.log(`Found ${issues.length} flowering plants with min < 10% of max (likely juvenile-to-mature):\n`);

if (issues.length > 0) {
    console.log('File | Name | Scientific Name | Size | Min | Max | Ratio');
    console.log('-----|------|----------------|------|-----|-----|------');
    issues.forEach(p => {
        console.log(`${p.file} | ${p.name} | ${p.scientificName} | ${p.size} | ${p.min} | ${p.max} | ${p.ratio}%`);
    });
}

// Save to file
const outputFile = path.join(__dirname, '..', 'data', 'size-updates', 'flowering-low-ratio-plants.json');
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(issues, null, 2));
console.log(`\n📄 Results saved to: ${outputFile}`);

