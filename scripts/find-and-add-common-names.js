// Find and Add Common Names
// Scans all plants where name === scientificName and researches common names

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const DELAY_MS = 500; // Delay between API calls

// Common name patterns to extract from descriptions
const COMMON_NAME_PATTERNS = [
    /commonly known as ([^,\.]+)/i,
    /also known as ([^,\.]+)/i,
    /called ([^,\.]+)/i,
    /referred to as ([^,\.]+)/i,
    /known as ([^,\.]+)/i,
    /common name[:\s]+([^,\.]+)/i,
    /popularly known as ([^,\.]+)/i
];

// Genera that commonly use scientific names in horticulture (keep as-is)
const SCIENTIFIC_NAME_IS_COMMON = [
    'Aechmea', 'Aglaonema', 'Anthurium', 'Begonia', 'Cryptanthus',
    'Neoregelia', 'Philodendron', 'Monstera', 'Peperomia', 'Tillandsia',
    'Hoya', 'Dischidia', 'Ludisia', 'Masdevallia', 'Restrepia',
    'Bulbophyllum', 'Pleurothallis', 'Lepanthes', 'Anoectochilus',
    'Goodyera', 'Dossinia', 'Macodes', 'Asplenium', 'Elaphoglossum',
    'Humata', 'Nephrolepis', 'Davallia', 'Platycerium', 'Adiantum',
    'Pellaea', 'Microsorum', 'Hemionitis', 'Actiniopteris', 'Blechnum',
    'Cyathea', 'Dicksonia', 'Asplenium', 'Anathallis', 'Dendrochillum',
    'Catopsis', 'Vriesea', 'Wallisia', 'Racinea', 'Opuntia', 'Syngonium',
    'Adenium', 'Euphorbia', 'Sansevieria', 'Ceropegia', 'Pilea'
];

function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.json')) {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

function extractCommonNameFromDescription(description, scientificName) {
    if (!description) return null;
    
    for (const pattern of COMMON_NAME_PATTERNS) {
        const match = description.match(pattern);
        if (match && match[1]) {
            let commonName = match[1].trim();
            // Clean up common name
            commonName = commonName.replace(/^the\s+/i, '');
            
            // Handle "X or Y" - prefer the first one, but validate both
            const orParts = commonName.split(/\s+or\s+/i);
            if (orParts.length > 1) {
                // Try first part
                let candidate = orParts[0].trim();
                const genus = scientificName.split(' ')[0];
                if (candidate.toLowerCase() !== scientificName.toLowerCase() && 
                    candidate.toLowerCase() !== genus.toLowerCase() &&
                    candidate.length > 2) {
                    commonName = candidate;
                } else {
                    // Try second part
                    candidate = orParts[1].trim();
                    if (candidate.toLowerCase() !== scientificName.toLowerCase() && 
                        candidate.toLowerCase() !== genus.toLowerCase() &&
                        candidate.length > 2) {
                        commonName = candidate;
                    } else {
                        continue; // Both are invalid
                    }
                }
            }
            
            commonName = commonName.split(',')[0].trim(); // Take first if comma-separated
            commonName = commonName.split('(')[0].trim(); // Remove parenthetical notes
            
            // Skip if it's the same as scientific name or just the genus
            if (commonName.toLowerCase() === scientificName.toLowerCase()) {
                continue;
            }
            const genus = scientificName.split(' ')[0];
            if (commonName.toLowerCase() === genus.toLowerCase()) {
                continue;
            }
            
            // Must be at least 3 characters
            if (commonName.length < 3) {
                continue;
            }
            
            // Capitalize properly - preserve existing capitalization for proper nouns
            // But ensure first letter is uppercase
            if (commonName.length > 0) {
                const words = commonName.split(/\s+/);
                commonName = words.map(word => {
                    if (word.length === 0) return word;
                    // If already has mixed case (like "Rex"), keep it
                    if (/^[A-Z][a-z]+/.test(word)) {
                        return word;
                    }
                    // Otherwise capitalize first letter
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }).join(' ');
            }
            
            return commonName;
        }
    }
    
    return null;
}

async function searchCommonNameWeb(scientificName) {
    try {
        // Try Wikipedia first
        const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(scientificName.replace(/\s+/g, '_'))}`;
        const wikiResponse = await axios.get(wikiUrl, { timeout: 5000 });
        
        if (wikiResponse.data && wikiResponse.data.extract) {
            const extract = wikiResponse.data.extract;
            // Look for common name patterns in Wikipedia extract
            const patterns = [
                /commonly known as ([^,\.]+)/i,
                /also called ([^,\.]+)/i,
                /known as ([^,\.]+)/i
            ];
            
            for (const pattern of patterns) {
                const match = extract.match(pattern);
                if (match && match[1]) {
                    let commonName = match[1].trim();
                    // Clean and validate
                    if (commonName.length > 2 && commonName.length < 50) {
                        commonName = commonName.split(',')[0].trim();
                        // Capitalize
                        commonName = commonName.charAt(0).toUpperCase() + commonName.slice(1).toLowerCase();
                        return commonName;
                    }
                }
            }
        }
    } catch (err) {
        // Wikipedia not available, continue
    }
    
    // Try GBIF for common names
    try {
        const gbifUrl = `https://api.gbif.org/v1/species/search`;
        const gbifResponse = await axios.get(gbifUrl, {
            params: {
                q: scientificName,
                limit: 1
            },
            timeout: 5000
        });
        
        if (gbifResponse.data && gbifResponse.data.results && gbifResponse.data.results.length > 0) {
            const result = gbifResponse.data.results[0];
            // GBIF sometimes has vernacular names
            if (result.vernacularNames && result.vernacularNames.length > 0) {
                // Prefer English names
                const englishName = result.vernacularNames.find(v => v.language === 'eng');
                if (englishName) {
                    return englishName.vernacularName;
                }
                // Otherwise use first one
                return result.vernacularNames[0].vernacularName;
            }
        }
    } catch (err) {
        // GBIF not available
    }
    
    return null;
}

function shouldKeepScientificName(scientificName) {
    const genus = scientificName.split(' ')[0];
    return SCIENTIFIC_NAME_IS_COMMON.includes(genus);
}

async function processPlants() {
    console.log('🔍 Scanning plants for entries where name === scientificName...\n');
    
    const plantFiles = getAllPlantFiles(PLANTS_DIR);
    const candidates = [];
    const results = {
        found: [],
        kept: [],
        notFound: [],
        errors: []
    };
    
    // First pass: identify candidates
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            
            if (!plant.name || !plant.scientificName) continue;
            
            const nameLower = plant.name.toLowerCase().trim();
            const scientificLower = plant.scientificName.toLowerCase().trim();
            
            // Check if name matches scientificName (exact match, case-insensitive)
            if (nameLower === scientificLower) {
                candidates.push({
                    file: filePath,
                    plant: plant,
                    filename: path.basename(filePath),
                    reason: 'exact_match'
                });
            }
            // Also check if name is just the genus (partial match)
            else {
                const genus = scientificLower.split(' ')[0];
                if (nameLower === genus) {
                    // Check if description has a common name
                    const commonName = extractCommonNameFromDescription(plant.description, plant.scientificName);
                    if (commonName) {
                        candidates.push({
                            file: filePath,
                            plant: plant,
                            filename: path.basename(filePath),
                            reason: 'genus_only'
                        });
                    }
                }
            }
        } catch (err) {
            results.errors.push({ file: path.basename(filePath), error: err.message });
        }
    }
    
    console.log(`Found ${candidates.length} plants where name === scientificName\n`);
    console.log('Processing...\n');
    
    // Second pass: try to find common names
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const { plant, file, filename } = candidate;
        
        console.log(`[${i + 1}/${candidates.length}] ${filename}`);
        console.log(`   Scientific: ${plant.scientificName}`);
        
        // Try to extract from description first
        let commonName = extractCommonNameFromDescription(plant.description, plant.scientificName);
        
        if (commonName) {
            // Validate: don't use if it's just the genus or too similar to scientific name
            const genus = plant.scientificName.split(' ')[0];
            if (commonName.toLowerCase() === genus.toLowerCase() || 
                commonName.toLowerCase() === plant.scientificName.toLowerCase()) {
                console.log(`   ⏭️  Skipping (too similar to scientific name)`);
                // Continue to web search
            } else {
                console.log(`   ✅ Found in description: "${commonName}"`);
                plant.name = commonName;
                fs.writeFileSync(file, JSON.stringify(plant, null, 2), 'utf-8');
                results.found.push({
                    file: filename,
                    scientific: plant.scientificName,
                    common: commonName,
                    source: 'description'
                });
                console.log(`   ✅ Updated!\n`);
                continue;
            }
        }
        
        // Try web search
        console.log(`   🔍 Searching web for common name...`);
        try {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            commonName = await searchCommonNameWeb(plant.scientificName);
            
            if (commonName) {
                // Validate: don't use if it's just the genus or too similar to scientific name
                const genus = plant.scientificName.split(' ')[0];
                if (commonName.toLowerCase() === genus.toLowerCase() || 
                    commonName.toLowerCase() === plant.scientificName.toLowerCase()) {
                    console.log(`   ⏭️  Skipping (too similar to scientific name)\n`);
                    if (shouldKeepScientificName(plant.scientificName)) {
                        results.kept.push({
                            file: filename,
                            scientific: plant.scientificName,
                            reason: 'genus commonly used'
                        });
                    } else {
                        results.notFound.push({
                            file: filename,
                            scientific: plant.scientificName
                        });
                    }
                } else {
                    console.log(`   ✅ Found via web search: "${commonName}"`);
                    plant.name = commonName;
                    fs.writeFileSync(file, JSON.stringify(plant, null, 2), 'utf-8');
                    results.found.push({
                        file: filename,
                        scientific: plant.scientificName,
                        common: commonName,
                        source: 'web'
                    });
                    console.log(`   ✅ Updated!\n`);
                }
            } else {
                console.log(`   ❌ No common name found`);
                if (shouldKeepScientificName(plant.scientificName)) {
                    console.log(`   ⏭️  Keeping scientific name (genus commonly used in horticulture)\n`);
                    results.kept.push({
                        file: filename,
                        scientific: plant.scientificName,
                        reason: 'genus commonly used'
                    });
                } else {
                    console.log(`\n`);
                    results.notFound.push({
                        file: filename,
                        scientific: plant.scientificName
                    });
                }
            }
        } catch (err) {
            console.log(`   ⚠️  Error searching: ${err.message}\n`);
            results.errors.push({
                file: filename,
                scientific: plant.scientificName,
                error: err.message
            });
        }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Common names found and updated: ${results.found.length}`);
    console.log(`⏭️  Kept scientific names (common in hobby): ${results.kept.length}`);
    console.log(`❌ No common name found: ${results.notFound.length}`);
    console.log(`⚠️  Errors: ${results.errors.length}`);
    
    if (results.found.length > 0) {
        console.log('\n✅ UPDATED PLANTS:');
        results.found.forEach(r => {
            console.log(`   ${r.file}`);
            console.log(`      ${r.scientific} → "${r.common}" (from ${r.source})`);
        });
    }
    
    if (results.notFound.length > 0) {
        console.log('\n❌ NO COMMON NAME FOUND:');
        results.notFound.slice(0, 20).forEach(r => {
            console.log(`   ${r.file}: ${r.scientific}`);
        });
        if (results.notFound.length > 20) {
            console.log(`   ... and ${results.notFound.length - 20} more`);
        }
    }
    
    if (results.errors.length > 0) {
        console.log('\n⚠️  ERRORS:');
        results.errors.slice(0, 10).forEach(r => {
            console.log(`   ${r.file}: ${r.error}`);
        });
    }
    
    console.log('\n✅ Processing complete!\n');
}

processPlants().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

