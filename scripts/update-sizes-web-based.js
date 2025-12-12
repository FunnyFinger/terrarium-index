const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants-merged');

// Get all plant files
function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

// Check if plant is a flowering plant
function isFloweringPlant(plant) {
    const plantType = (plant.plantType || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    const floweringPeriod = (plant.floweringPeriod || '').toLowerCase();
    
    // Check if it's a flowering plant
    if (plantType === 'flowering plant') return true;
    if (category.includes('flowering')) return true;
    if (floweringPeriod && !floweringPeriod.includes('does not flower') && !floweringPeriod.includes('non-flowering')) return true;
    
    return false;
}

// Parse size string to extract min and max in cm
function parseSize(sizeStr) {
    if (!sizeStr) return null;
    
    const size = sizeStr.toLowerCase();
    let minSize = null;
    let maxSize = null;
    
    // Handle cm ranges like "10-30 cm" or "30 cm"
    if (size.includes('cm')) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            minSize = parseFloat(numbers[0]);
            maxSize = numbers.length > 1 ? parseFloat(numbers[1]) : minSize;
        }
    }
    
    // Handle meter ranges like "1-2 m" or "2 m"
    if (size.includes('m') && !size.includes('cm')) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            const minM = parseFloat(numbers[0]);
            const maxM = numbers.length > 1 ? parseFloat(numbers[1]) : minM;
            minSize = minM * 100;
            maxSize = maxM * 100;
        }
    }
    
    return { min: minSize, max: maxSize };
}

// Generate search query for web search
function generateSearchQuery(plant, isFlowering) {
    const scientificName = plant.scientificName || '';
    const commonName = plant.name || '';
    
    if (isFlowering) {
        return `${scientificName} ${commonName} flowering size mature size height`;
    } else {
        return `${scientificName} ${commonName} juvenile size mature size height`;
    }
}

// This script will output search queries that need to be run via browser
// The user will need to run these searches and provide the results
async function generateSearchQueries() {
    console.log('🔍 Generating web search queries for plant sizes...\n');
    console.log('This script will generate search queries for each plant.\n');
    console.log('For flowering plants: Search for "flowering size" to "mature size"\n');
    console.log('For non-flowering plants: Search for "juvenile size" to "mature size"\n');
    console.log('='.repeat(100));
    console.log();
    
    const files = getAllPlantFiles(plantsDir);
    const queries = [];
    
    for (const filePath of files) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            const currentSize = parseSize(plant.size);
            if (!currentSize) continue;
            
            const isFlowering = isFloweringPlant(plant);
            const searchQuery = generateSearchQuery(plant, isFlowering);
            
            queries.push({
                file: path.basename(filePath),
                name: plant.name,
                scientificName: plant.scientificName,
                isFlowering: isFlowering,
                currentSize: plant.size,
                searchQuery: searchQuery
            });
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }
    
    // Output queries in a format that can be used
    console.log(`Total plants to search: ${queries.length}\n`);
    console.log('Search Queries:\n');
    
    queries.forEach((q, index) => {
        console.log(`${index + 1}. ${q.name} (${q.scientificName})`);
        console.log(`   Type: ${q.isFlowering ? 'Flowering Plant' : 'Non-Flowering'}`);
        console.log(`   Current Size: ${q.currentSize}`);
        console.log(`   Search: "${q.searchQuery}"`);
        console.log(`   File: ${q.file}`);
        console.log();
    });
    
    // Save to file for reference
    const outputFile = path.join(__dirname, 'plant-size-search-queries.json');
    fs.writeFileSync(outputFile, JSON.stringify(queries, null, 2), 'utf8');
    console.log(`\n✅ Search queries saved to: ${outputFile}`);
    console.log(`\nNext steps:`);
    console.log(`1. Use browser tools to search for each plant`);
    console.log(`2. Extract juvenile/flowering size and mature size`);
    console.log(`3. Update the plant files with the new size ranges`);
}

generateSearchQueries().catch(console.error);

