// Script to add commonNames field to all plant JSON files that don't have it
const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Extract common names from plant data
function extractCommonNames(plant) {
    // If already has commonNames, return it
    if (plant.commonNames && Array.isArray(plant.commonNames) && plant.commonNames.length > 0) {
        return plant.commonNames;
    }
    
    const commonNames = [];
    const name = (plant.name || '').trim();
    const scientificName = (plant.scientificName || '').trim();
    const description = (plant.description || '').toLowerCase();
    
    // If the name is not the scientific name, it might be a common name
    // But we need to be careful - sometimes the name field IS the common name
    
    // Look for "commonly known as", "also called", "also known as" patterns in description
    const patterns = [
        /(?:commonly known as|also called|also known as|also referred to as|popularly known as|sometimes called)\s+([^.,;]+)/gi,
        /(?:known as|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
        /"([^"]+)"\s+(?:is|are)\s+(?:a|an|the)/gi
    ];
    
    for (const pattern of patterns) {
        const matches = description.matchAll(pattern);
        for (const match of matches) {
            if (match[1]) {
                const extracted = match[1].trim();
                // Clean up the extracted name
                const cleaned = extracted
                    .replace(/^(?:a|an|the)\s+/i, '')
                    .replace(/\s+(?:a|an|the)$/i, '')
                    .trim();
                
                if (cleaned && cleaned.length > 2 && cleaned.length < 50) {
                    // Capitalize first letter of each word
                    const formatted = cleaned.split(/\s+/).map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                    ).join(' ');
                    
                    if (!commonNames.includes(formatted) && formatted !== name && formatted !== scientificName) {
                        commonNames.push(formatted);
                    }
                }
            }
        }
    }
    
    // If name is different from scientific name and looks like a common name, add it
    if (name && name !== scientificName && !scientificName.toLowerCase().includes(name.toLowerCase())) {
        // Check if name looks like a common name (not all caps, not too long, contains spaces or is a simple name)
        if (name.length < 50 && (name.includes(' ') || name.split(' ').length <= 3)) {
            if (!commonNames.includes(name)) {
                commonNames.unshift(name); // Add at beginning
            }
        }
    }
    
    // If we found common names, return them
    if (commonNames.length > 0) {
        return commonNames;
    }
    
    // Fallback: if name exists and is different from scientific name, use it as common name
    if (name && name !== scientificName) {
        return [name];
    }
    
    // Last resort: return empty array (will be set to name if name exists)
    return [];
}

async function processPlantFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        // Skip if already has commonNames
        if (plant.commonNames && Array.isArray(plant.commonNames) && plant.commonNames.length > 0) {
            return { updated: false, plant: plant.name };
        }
        
        // Extract common names
        let commonNames = extractCommonNames(plant);
        
        // If no common names found but name exists, use name as common name
        if (commonNames.length === 0 && plant.name) {
            commonNames = [plant.name];
        }
        
        // Add commonNames field after scientificName
        const updatedPlant = { ...plant };
        const keys = Object.keys(updatedPlant);
        const scientificNameIndex = keys.indexOf('scientificName');
        const insertIndex = scientificNameIndex >= 0 ? scientificNameIndex + 1 : keys.length;
        
        // Create new object with commonNames in the right position
        const newPlant = {};
        let inserted = false;
        
        for (let i = 0; i < keys.length; i++) {
            newPlant[keys[i]] = updatedPlant[keys[i]];
            if (i === insertIndex - 1 && !inserted) {
                newPlant.commonNames = commonNames;
                inserted = true;
            }
        }
        
        if (!inserted) {
            newPlant.commonNames = commonNames;
        }
        
        // Write back to file
        await fs.writeFile(filePath, JSON.stringify(newPlant, null, 2) + '\n', 'utf8');
        
        return { updated: true, plant: plant.name, commonNames };
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return { updated: false, plant: 'unknown', error: error.message };
    }
}

async function main() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
        
        console.log(`Found ${jsonFiles.length} plant files to process...\n`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const result = await processPlantFile(filePath);
            
            if (result.updated) {
                updatedCount++;
                const names = Array.isArray(result.commonNames) ? result.commonNames.join(', ') : result.commonNames;
                console.log(`✓ ${result.plant}: [${names}]`);
            } else if (result.error) {
                errorCount++;
                console.log(`✗ ${result.plant}: Error - ${result.error}`);
            } else {
                skippedCount++;
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

