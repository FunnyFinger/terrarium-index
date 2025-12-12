// Script to enhance commonNames by searching the web for additional common names
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Search web for common names using DuckDuckGo instant answer API or Wikipedia
async function searchCommonNames(plantName, scientificName) {
    try {
        // Try Wikipedia first
        const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(scientificName || plantName)}`;
        
        return new Promise((resolve, reject) => {
            https.get(wikiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const extract = json.extract || '';
                        const title = json.title || '';
                        
                        // Extract common names from Wikipedia extract
                        const commonNames = [];
                        
                        // Look for patterns like "commonly known as", "also called", etc.
                        const patterns = [
                            /(?:commonly known as|also called|also known as|popularly known as|sometimes called|colloquially called)\s+([^.,;()]+)/gi,
                            /(?:known as|called)\s+"([^"]+)"/gi,
                            /(?:known as|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
                        ];
                        
                        for (const pattern of patterns) {
                            const matches = extract.matchAll(pattern);
                            for (const match of matches) {
                                if (match[1]) {
                                    const name = match[1].trim()
                                        .replace(/^(?:a|an|the)\s+/i, '')
                                        .replace(/\s+(?:a|an|the)$/i, '')
                                        .trim();
                                    
                                    if (name && name.length > 2 && name.length < 50 && !name.includes('species')) {
                                        // Capitalize properly
                                        const formatted = name.split(/\s+/).map(word => {
                                            // Handle special cases like "of", "the", "and" in the middle
                                            const smallWords = ['of', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for'];
                                            if (smallWords.includes(word.toLowerCase()) && word !== name.split(/\s+/)[0]) {
                                                return word.toLowerCase();
                                            }
                                            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                                        }).join(' ');
                                        
                                        if (!commonNames.includes(formatted) && 
                                            formatted.toLowerCase() !== plantName.toLowerCase() &&
                                            formatted.toLowerCase() !== scientificName.toLowerCase()) {
                                            commonNames.push(formatted);
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Also check if title is different from scientific name (might be a common name)
                        if (title && title !== scientificName && !title.includes('(')) {
                            const titleLower = title.toLowerCase();
                            const sciLower = scientificName.toLowerCase();
                            if (!titleLower.includes(sciLower) && !sciLower.includes(titleLower)) {
                                if (!commonNames.includes(title) && title.length < 50) {
                                    commonNames.push(title);
                                }
                            }
                        }
                        
                        resolve(commonNames);
                    } catch (error) {
                        resolve([]);
                    }
                });
            }).on('error', (error) => {
                resolve([]);
            });
        });
    } catch (error) {
        return [];
    }
}

// Clean and merge common names
function mergeCommonNames(existing, found) {
    const merged = new Set();
    
    // Add existing names
    if (Array.isArray(existing)) {
        existing.forEach(name => {
            if (name && name.trim()) {
                merged.add(name.trim());
            }
        });
    }
    
    // Add found names (avoid duplicates)
    found.forEach(name => {
        const normalized = name.trim();
        if (normalized) {
            // Check if it's not already in the set (case-insensitive)
            const exists = Array.from(merged).some(existing => 
                existing.toLowerCase() === normalized.toLowerCase()
            );
            if (!exists) {
                merged.add(normalized);
            }
        }
    });
    
    return Array.from(merged);
}

async function processPlantFile(filePath, delay = 1000) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const plantName = plant.name || '';
        const scientificName = plant.scientificName || '';
        const existingCommonNames = plant.commonNames || [];
        
        // Skip if already has good common names (more than just the plant name or if name is different from scientific)
        // Only search if:
        // 1. Has no commonNames or empty array
        // 2. Only has one common name that matches the plant name exactly
        // 3. Scientific name exists (need something to search)
        const hasOnlyNameAsCommon = Array.isArray(existingCommonNames) && 
            existingCommonNames.length === 1 && 
            existingCommonNames[0].toLowerCase() === plantName.toLowerCase();
        
        if (Array.isArray(existingCommonNames) && existingCommonNames.length > 1 && !hasOnlyNameAsCommon) {
            return { 
                updated: false, 
                plant: plantName, 
                reason: 'Already has multiple common names' 
            };
        }
        
        // Skip if no scientific name to search with
        if (!scientificName && !plantName) {
            return { 
                updated: false, 
                plant: plantName, 
                reason: 'No name to search' 
            };
        }
        
        // Search for common names
        console.log(`Searching for: ${plantName} (${scientificName})...`);
        const foundNames = await searchCommonNames(plantName, scientificName);
        
        // Merge with existing
        const mergedNames = mergeCommonNames(existingCommonNames, foundNames);
        
        // Only update if we found new names
        if (mergedNames.length > existingCommonNames.length) {
            plant.commonNames = mergedNames;
            
            // Write back to file
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
            
            return { 
                updated: true, 
                plant: plantName, 
                existing: existingCommonNames,
                found: foundNames,
                merged: mergedNames 
            };
        }
        
        return { 
            updated: false, 
            plant: plantName, 
            reason: 'No new names found' 
        };
        
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return { 
            updated: false, 
            plant: 'unknown', 
            error: error.message 
        };
    }
}

async function main() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
        
        console.log(`Found ${jsonFiles.length} plant files to process...\n`);
        console.log('This will take a while as we search the web for each plant...\n');
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < jsonFiles.length; i++) {
            const file = jsonFiles[i];
            const filePath = path.join(PLANTS_DIR, file);
            
            console.log(`[${i + 1}/${jsonFiles.length}] Processing ${file}...`);
            
            const result = await processPlantFile(filePath);
            
            if (result.updated) {
                updatedCount++;
                console.log(`✓ ${result.plant}`);
                console.log(`  Existing: ${result.existing.join(', ') || 'none'}`);
                console.log(`  Found: ${result.found.join(', ') || 'none'}`);
                console.log(`  Merged: ${result.merged.join(', ')}`);
            } else if (result.error) {
                errorCount++;
                console.log(`✗ ${result.plant}: Error - ${result.error}`);
            } else {
                skippedCount++;
                console.log(`- ${result.plant}: ${result.reason}`);
            }
            
            // Rate limiting - wait 1.5 seconds between requests to be respectful
            if (i < jsonFiles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
            console.log(''); // Blank line for readability
        }
        
        console.log(`\n=== Summary ===`);
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log(`Total: ${jsonFiles.length}`);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();

