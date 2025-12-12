const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');

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

// Check if plant is carnivorous
function isCarnivorousPlant(plant) {
    const plantType = (plant.plantType || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    
    if (plantType === 'carnivorous plant' || plantType.includes('carnivorous')) return true;
    if (category.includes('carnivorous')) return true;
    
    return false;
}

// Parse size string to get min and max
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
        
        return { min, max, unit: 'cm' };
    }
    
    return null;
}

// Generate search query for flowering size
function generateFloweringSizeQuery(plant) {
    const scientificName = plant.scientificName || '';
    const commonName = plant.name || '';
    return `${scientificName} ${commonName} flowering size when first flowers mature height cm`;
}

// Main function
function main() {
    const files = getAllPlantFiles();
    const carnivorousPlants = [];
    
    console.log('🔍 Finding all carnivorous plants...\n');
    
    files.forEach(filePath => {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            if (isCarnivorousPlant(plant)) {
                const currentSize = parseSize(plant.size);
                const searchQuery = generateFloweringSizeQuery(plant);
                
                carnivorousPlants.push({
                    file: path.basename(filePath),
                    path: filePath,
                    name: plant.name,
                    scientificName: plant.scientificName,
                    currentSize: plant.size,
                    parsedSize: currentSize,
                    searchQuery: searchQuery
                });
            }
        } catch (error) {
            console.error(`Error reading ${filePath}:`, error.message);
        }
    });
    
    console.log(`Found ${carnivorousPlants.length} carnivorous plants:\n`);
    
    carnivorousPlants.forEach((plant, index) => {
        console.log(`${index + 1}. ${plant.name} (${plant.scientificName})`);
        console.log(`   Current size: ${plant.currentSize}`);
        if (plant.parsedSize) {
            console.log(`   Parsed: ${plant.parsedSize.min}-${plant.parsedSize.max} cm`);
        }
        console.log(`   Search query: "${plant.searchQuery}"`);
        console.log('');
    });
    
    // Save to file for manual review
    const outputFile = path.join(__dirname, '..', 'data', 'size-updates', 'carnivorous-plants-review.json');
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(carnivorousPlants, null, 2));
    
    console.log(`\n✅ Results saved to: ${outputFile}`);
    console.log('\n📝 Next steps:');
    console.log('   1. Review each plant and perform web searches');
    console.log('   2. Determine flowering size (minSize) and mature size (maxSize)');
    console.log('   3. Update the JSON file with new size ranges');
}

main();

