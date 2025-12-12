// Script to enhance common names by checking web sources
// Processes plants in batches of 50

const fs = require('fs').promises;
const path = require('path');
const https = require('https');

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

// Search web for common names (using Wikipedia API as primary source)
async function searchCommonNames(plant) {
    const scientificName = plant.scientificName || '';
    const name = plant.name || '';
    
    // Try Wikipedia API first
    try {
        const wikiNames = await searchWikipedia(scientificName || name);
        if (wikiNames && wikiNames.length > 0) {
            return wikiNames;
        }
    } catch (error) {
        console.log(`  Wikipedia search failed: ${error.message}`);
    }
    
    // Fallback: extract from description if available
    const description = plant.description || '';
    const commonNames = extractFromDescription(description, name, scientificName);
    
    return commonNames;
}

// Search Wikipedia for common names
function searchWikipedia(query) {
    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedQuery}`;
        
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const result = JSON.parse(data);
                        const extract = result.extract || '';
                        const title = result.title || '';
                        
                        // Extract common names from extract text
                        const commonNames = [];
                        
                        // Look for patterns like "commonly known as", "also called", etc.
                        const patterns = [
                            /(?:commonly known as|also called|also known as|popularly known as|sometimes called|colloquially called)\s+([^.,;()]+)/gi,
                            /"([^"]+)"\s+(?:is|are)\s+(?:a|an|the)\s+common\s+name/gi,
                            /common\s+name[s]?\s+(?:is|are|include[s]?)\s+([^.,;()]+)/gi
                        ];
                        
                        for (const pattern of patterns) {
                            const matches = extract.matchAll(pattern);
                            for (const match of matches) {
                                if (match[1]) {
                                    const extracted = match[1].trim()
                                        .replace(/^(?:a|an|the)\s+/i, '')
                                        .replace(/\s+(?:a|an|the)$/i, '')
                                        .trim();
                                    
                                    if (extracted && extracted.length > 2 && extracted.length < 50) {
                                        const formatted = extracted.split(/\s+/).map(word => 
                                            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                        ).join(' ');
                                        
                                        if (!commonNames.includes(formatted) && 
                                            formatted.toLowerCase() !== query.toLowerCase() &&
                                            formatted.toLowerCase() !== title.toLowerCase()) {
                                            commonNames.push(formatted);
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Also check if title is different from scientific name
                        if (title && title.toLowerCase() !== query.toLowerCase() && 
                            !title.includes('(') && title.length < 50) {
                            commonNames.push(title);
                        }
                        
                        resolve(commonNames.length > 0 ? commonNames : null);
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
        
        // Set timeout
        setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 5000);
    });
}

// Extract common names from description
function extractFromDescription(description, name, scientificName) {
    if (!description) return [];
    
    const commonNames = [];
    const lowerDesc = description.toLowerCase();
    
    // Patterns to find common names
    const patterns = [
        /(?:commonly known as|also called|also known as|popularly known as|sometimes called|colloquially called|referred to as)\s+([^.,;()]+)/gi,
        /"([^"]+)"\s+(?:is|are)\s+(?:a|an|the)\s+common\s+name/gi,
        /common\s+name[s]?\s+(?:is|are|include[s]?)\s+([^.,;()]+)/gi,
        /(?:known as|called)\s+"([^"]+)"/gi
    ];
    
    for (const pattern of patterns) {
        const matches = description.matchAll(pattern);
        for (const match of matches) {
            if (match[1]) {
                const extracted = match[1].trim()
                    .replace(/^(?:a|an|the)\s+/i, '')
                    .replace(/\s+(?:a|an|the)$/i, '')
                    .replace(/^["']|["']$/g, '')
                    .trim();
                
                if (extracted && extracted.length > 2 && extracted.length < 50) {
                    const formatted = extracted.split(/\s+/).map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                    ).join(' ');
                    
                    if (!commonNames.includes(formatted) && 
                        formatted.toLowerCase() !== name.toLowerCase() &&
                        formatted.toLowerCase() !== scientificName.toLowerCase()) {
                        commonNames.push(formatted);
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

// Process a batch
async function processBatch(batchNumber = 1, batchSize = 50) {
    console.log(`\n=== Processing Batch ${batchNumber} ===\n`);
    
    const { batch, total, batchNumber: actualBatch } = await getPlantsNeedingEnhancement(batchNumber, batchSize);
    
    console.log(`Found ${total} plants needing enhancement`);
    console.log(`Processing batch ${batchNumber}: ${batch.length} plants\n`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (let i = 0; i < batch.length; i++) {
        const { file, plant, filePath } = batch[i];
        console.log(`[${i + 1}/${batch.length}] ${plant.name} (${plant.scientificName || 'N/A'})`);
        
        try {
            // Search for common names
            const foundNames = await searchCommonNames(plant);
            
            if (foundNames && foundNames.length > 0) {
                const result = await updatePlantFile(filePath, plant, foundNames);
                if (result.success) {
                    console.log(`  ✓ Added: ${foundNames.join(', ')}`);
                    updated++;
                } else {
                    console.log(`  ✗ Error updating: ${result.error}`);
                    errors++;
                }
            } else {
                console.log(`  - No additional common names found`);
                skipped++;
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.log(`  ✗ Error: ${error.message}`);
            errors++;
        }
    }
    
    console.log(`\n=== Batch ${batchNumber} Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`\nNext batch: node scripts/enhance-common-names-batch.js ${batchNumber + 1}`);
}

// Main
const batchNumber = parseInt(process.argv[2]) || 1;
processBatch(batchNumber, 50).catch(console.error);

