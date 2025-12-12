// Script to add airCirculation field to all plant JSON files
// Uses the same extraction logic as the main application

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Extract air circulation from plant data (same logic as extractAirCirculation in script.js)
function extractAirCirculation(plant) {
    // First check if plant already has airCirculation field
    if (plant.airCirculation) {
        return plant.airCirculation;
    }
    
    // Try to extract from description and careTips
    const description = (plant.description || '').toLowerCase();
    const careTips = Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '';
    const combinedText = description + ' ' + careTips;
    
    if (combinedText.includes('closed') || combinedText.includes('sealed') || combinedText.includes('self-contained')) {
        return 'Minimal (Closed/Sealed)';
    } else if (combinedText.includes('semi-closed') || combinedText.includes('partially open')) {
        return 'Low (Semi-closed)';
    } else if (combinedText.includes('ventilated') || combinedText.includes('air circulation')) {
        return 'Moderate (Ventilated)';
    } else if (combinedText.includes('open') || combinedText.includes('well-ventilated') || combinedText.includes('good air flow')) {
        return 'High (Open/Well-ventilated)';
    } else if (combinedText.includes('open air') || combinedText.includes('outdoor')) {
        return 'Very High (Open air)';
    }
    
    // Infer from humidity if not found in text
    const humidityStr = (plant.humidity || '').toLowerCase();
    if (humidityStr.includes('very high') || humidityStr.includes('70-90') || humidityStr.includes('80-100') || humidityStr.includes('85-100')) {
        if (!humidityStr.includes('submerged')) {
            return 'Minimal (Closed/Sealed)'; // High humidity usually means closed terrarium
        }
    } else if (humidityStr.includes('high') || humidityStr.includes('60-80') || humidityStr.includes('70-80')) {
        return 'Low (Semi-closed)';
    } else if (humidityStr.includes('low') || humidityStr.includes('40-50') || humidityStr.includes('30-40') || humidityStr.includes('20-30') || humidityStr.includes('very low')) {
        return 'High (Open/Well-ventilated)';
    }
    
    // Default
    return 'Moderate (Ventilated)';
}

async function processPlantFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        // Skip if already has airCirculation
        if (plant.airCirculation) {
            return { updated: false, plant: plant.name };
        }
        
        // Extract air circulation
        const airCirculation = extractAirCirculation(plant);
        
        // Add airCirculation field after humidity (or after temperature if humidity doesn't exist)
        const updatedPlant = { ...plant };
        
        // Find the position to insert (after temperature, before watering)
        const keys = Object.keys(updatedPlant);
        const tempIndex = keys.indexOf('temperature');
        const wateringIndex = keys.indexOf('watering');
        const insertIndex = tempIndex >= 0 ? tempIndex + 1 : (wateringIndex >= 0 ? wateringIndex : keys.length);
        
        // Create new object with airCirculation in the right position
        const newPlant = {};
        let inserted = false;
        
        for (let i = 0; i < keys.length; i++) {
            if (i === insertIndex && !inserted) {
                newPlant.airCirculation = airCirculation;
                inserted = true;
            }
            newPlant[keys[i]] = updatedPlant[keys[i]];
        }
        
        if (!inserted) {
            newPlant.airCirculation = airCirculation;
        }
        
        // Write back to file
        await fs.writeFile(filePath, JSON.stringify(newPlant, null, 2) + '\n', 'utf8');
        
        return { updated: true, plant: plant.name, airCirculation };
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return { updated: false, plant: 'unknown', error: error.message };
    }
}

async function main() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        console.log(`Found ${jsonFiles.length} plant files to process...\n`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const result = await processPlantFile(filePath);
            
            if (result.updated) {
                updatedCount++;
                console.log(`✓ ${result.plant}: ${result.airCirculation}`);
            } else if (result.error) {
                errorCount++;
                console.log(`✗ ${result.plant}: Error - ${result.error}`);
            } else {
                skippedCount++;
                console.log(`- ${result.plant}: Already has airCirculation`);
            }
        }
        
        console.log(`\n=== Summary ===`);
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped (already has field): ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log(`Total: ${jsonFiles.length}`);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();

