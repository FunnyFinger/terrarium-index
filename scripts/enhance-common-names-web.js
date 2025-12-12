// Script to enhance common names using web search
// Processes plants in batches of 50

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Check if plant needs common names enhancement
function needsEnhancement(plant) {
    if (!plant.commonNames || !Array.isArray(plant.commonNames) || plant.commonNames.length === 0) {
        return true;
    }
    // If only has the name itself as common name, needs enhancement
    if (plant.commonNames.length === 1 && plant.commonNames[0] === plant.name) {
        return true;
    }
    return false;
}

// Get plants that need enhancement
async function getPlantsNeedingEnhancement(batchNumber = 1, batchSize = 50) {
    const files = await fs.readdir(PLANTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
    
    const plantsNeedingEnhancement = [];
    
    for (const file of jsonFiles) {
        const filePath = path.join(PLANTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        if (needsEnhancement(plant)) {
            plantsNeedingEnhancement.push({ file, plant, filePath });
        }
    }
    
    const startIndex = (batchNumber - 1) * batchSize;
    const endIndex = startIndex + batchSize;
    const batch = plantsNeedingEnhancement.slice(startIndex, endIndex);
    
    return { batch, total: plantsNeedingEnhancement.length, batchNumber };
}

// Extract common names from text using patterns
function extractCommonNamesFromText(text, plantName, scientificName) {
    if (!text) return [];
    
    const commonNames = [];
    const lowerText = text.toLowerCase();
    
    // Patterns to find common names
    const patterns = [
        /(?:commonly known as|also called|also known as|popularly known as|sometimes called|colloquially called|referred to as|known as|called)\s+([^.,;()]+?)(?:[,;]|\.|$)/gi,
        /"([^"]+)"\s+(?:is|are)\s+(?:a|an|the)\s+common\s+name/gi,
        /common\s+name[s]?\s+(?:is|are|include[s]?)\s+([^.,;()]+)/gi,
        /(?:known as|called)\s+"([^"]+)"/gi,
        /(?:also|other)\s+common\s+name[s]?\s+(?:is|are|include[s]?)\s+([^.,;()]+)/gi
    ];
    
    for (const pattern of patterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            if (match[1]) {
                let extracted = match[1].trim()
                    .replace(/^(?:a|an|the)\s+/i, '')
                    .replace(/\s+(?:a|an|the)$/i, '')
                    .replace(/^["']|["']$/g, '')
                    .replace(/\s*\([^)]*\)\s*/g, '') // Remove parenthetical notes
                    .trim();
                
                // Split by commas if multiple names
                const names = extracted.split(/\s*[,;]\s*or\s*|\s*[,;]\s*and\s*|\s*[,;]\s*/);
                
                for (let name of names) {
                    name = name.trim();
                    if (name && name.length > 2 && name.length < 50) {
                        // Capitalize first letter of each word
                        const formatted = name.split(/\s+/).map(word => {
                            // Handle special cases like "Mc", "O'", etc.
                            if (word.match(/^(mc|o'|mac)/i)) {
                                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                            }
                            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                        }).join(' ');
                        
                        if (!commonNames.includes(formatted) && 
                            formatted.toLowerCase() !== plantName.toLowerCase() &&
                            formatted.toLowerCase() !== scientificName.toLowerCase() &&
                            !formatted.match(/^(the|a|an)\s/i)) {
                            commonNames.push(formatted);
                        }
                    }
                }
            }
        }
    }
    
    return commonNames;
}

// Update plant file with enhanced common names
async function updatePlantFile(filePath, plant, newCommonNames) {
    try {
        // Merge with existing common names, avoiding duplicates
        const existing = plant.commonNames || [];
        const merged = [...new Set([...existing, ...newCommonNames])];
        
        // Update plant object
        plant.commonNames = merged;
        
        // Write back to file
        await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        
        return { success: true, commonNames: merged };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Process a batch - this will output data for manual web search
async function processBatch(batchNumber = 1, batchSize = 50) {
    console.log(`\n=== Processing Batch ${batchNumber} ===\n`);
    
    const { batch, total } = await getPlantsNeedingEnhancement(batchNumber, batchSize);
    
    console.log(`Found ${total} plants needing enhancement`);
    console.log(`Processing batch ${batchNumber}: ${batch.length} plants\n`);
    
    // Output JSON for batch processing
    const batchData = batch.map(({ plant }) => ({
        name: plant.name,
        scientificName: plant.scientificName,
        description: plant.description?.substring(0, 500) || '',
        currentCommonNames: plant.commonNames || []
    }));
    
    console.log(JSON.stringify(batchData, null, 2));
    console.log(`\n=== Batch ${batchNumber} Data (for web search) ===`);
    console.log(`Total plants in batch: ${batch.length}`);
    console.log(`\nUse web_search tool to find common names for these plants, then update the files.`);
}

// Main
const batchNumber = parseInt(process.argv[2]) || 1;
processBatch(batchNumber, 50).catch(console.error);
