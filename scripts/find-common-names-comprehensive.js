// Comprehensive Common Name Finder
// Scans all plants where name matches scientific name (exact or partial) and researches common names

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
    /popularly known as ([^,\.]+)/i,
    /vernacular name[:\s]+([^,\.]+)/i
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
    'Cyathea', 'Dicksonia', 'Anathallis', 'Dendrochillum',
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
    // Try Wikipedia first
    try {
        const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(scientificName.replace(/\s+/g, '_'))}`;
        const wikiResponse = await axios.get(wikiUrl, { timeout: 8000 });
        
        if (wikiResponse.data && wikiResponse.data.extract) {
            const extract = wikiResponse.data.extract;
            // Look for common name patterns in Wikipedia extract
            const patterns = [
                /commonly known as ([^,\.]+)/i,
                /also called ([^,\.]+)/i,
                /known as ([^,\.]+)/i,
                /common name[:\s]+([^,\.]+)/i
            ];
            
            for (const pattern of patterns) {
                const match = extract.match(pattern);
                if (match && match[1]) {
                    let commonName = match[1].trim();
                    // Clean and validate
                    if (commonName.length > 2 && commonName.length < 50) {
                        commonName = commonName.split(',')[0].trim();
                        commonName = commonName.split('(')[0].trim();
                        // Capitalize
                        const words = commonName.split(/\s+/);
                        commonName = words.map(word => {
                            if (word.length === 0) return word;
                            if (/^[A-Z][a-z]+/.test(word)) return word;
                            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                        }).join(' ');
                        
                        // Validate it's not the scientific name
                        const genus = scientificName.split(' ')[0];
                        if (commonName.toLowerCase() !== scientificName.toLowerCase() &&
                            commonName.toLowerCase() !== genus.toLowerCase()) {
                            return commonName;
                        }
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
                limit: 5
            },
            timeout: 8000
        });
        
        if (gbifResponse.data && gbifResponse.data.results && gbifResponse.data.results.length > 0) {
            // Get the accepted species
            const accepted = gbifResponse.data.results.find(r => r.taxonomicStatus === 'ACCEPTED') || gbifResponse.data.results[0];
            const speciesKey = accepted.acceptedUsageKey || accepted.key;
            
            if (speciesKey) {
                // Get vernacular names
                const vernacularUrl = `https://api.gbif.org/v1/species/${speciesKey}/vernacularNames`;
                const vernacularResponse = await axios.get(vernacularUrl, { timeout: 8000 });
                
                if (vernacularResponse.data && vernacularResponse.data.results && vernacularResponse.data.results.length > 0) {
                    // Prefer English names
                    const englishNames = vernacularResponse.data.results.filter(v => v.language === 'eng' || v.language === 'en');
                    if (englishNames.length > 0) {
                        const name = englishNames[0].vernacularName;
                        // Capitalize properly
                        const words = name.split(/\s+/);
                        return words.map(word => {
                            if (word.length === 0) return word;
                            if (/^[A-Z][a-z]+/.test(word)) return word;
                            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                        }).join(' ');
                    }
                    // Otherwise use first one
                    const name = vernacularResponse.data.results[0].vernacularName;
                    const words = name.split(/\s+/);
                    return words.map(word => {
                        if (word.length === 0) return word;
                        if (/^[A-Z][a-z]+/.test(word)) return word;
                        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    }).join(' ');
                }
            }
        }
    } catch (err) {
        // GBIF not available
    }
    
    // Try web search via DuckDuckGo instant answer (if available)
    try {
        const searchQuery = `${scientificName} common name`;
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1&skip_disambig=1`;
        const ddgResponse = await axios.get(ddgUrl, { timeout: 5000 });
        
        if (ddgResponse.data && ddgResponse.data.AbstractText) {
            const abstract = ddgResponse.data.AbstractText;
            const patterns = [
                /commonly known as ([^,\.]+)/i,
                /also called ([^,\.]+)/i,
                /known as ([^,\.]+)/i
            ];
            
            for (const pattern of patterns) {
                const match = abstract.match(pattern);
                if (match && match[1]) {
                    let commonName = match[1].trim();
                    if (commonName.length > 2 && commonName.length < 50) {
                        commonName = commonName.split(',')[0].trim();
                        const genus = scientificName.split(' ')[0];
                        if (commonName.toLowerCase() !== scientificName.toLowerCase() &&
                            commonName.toLowerCase() !== genus.toLowerCase()) {
                            const words = commonName.split(/\s+/);
                            return words.map(word => {
                                if (word.length === 0) return word;
                                if (/^[A-Z][a-z]+/.test(word)) return word;
                                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                            }).join(' ');
                        }
                    }
                }
            }
        }
    } catch (err) {
        // DuckDuckGo not available
    }
    
    return null;
}

function nameMatchesScientific(name, scientificName) {
    if (!name || !scientificName) return false;
    
    const nameLower = name.toLowerCase().trim();
    const scientificLower = scientificName.toLowerCase().trim();
    
    // Exact match
    if (nameLower === scientificLower) {
        return { match: true, type: 'exact' };
    }
    
    // Name is just the genus
    const genus = scientificLower.split(' ')[0];
    if (nameLower === genus) {
        return { match: true, type: 'genus_only' };
    }
    
    // Name contains scientific name or vice versa
    if (nameLower.includes(scientificLower) || scientificLower.includes(nameLower)) {
        return { match: true, type: 'partial' };
    }
    
    // Check if name is part of scientific name (e.g., "Begonia" when scientific is "Begonia rex")
    const scientificWords = scientificLower.split(/\s+/);
    if (scientificWords.includes(nameLower)) {
        return { match: true, type: 'word_match' };
    }
    
    return { match: false };
}

function shouldKeepScientificName(scientificName) {
    const genus = scientificName.split(' ')[0];
    return SCIENTIFIC_NAME_IS_COMMON.includes(genus);
}

async function processPlants() {
    console.log('🔍 Scanning all plants for entries where name matches scientific name...\n');
    
    const plantFiles = getAllPlantFiles(PLANTS_DIR);
    const candidates = [];
    const results = {
        found: [],
        kept: [],
        notFound: [],
        errors: []
    };
    
    // First pass: identify candidates
    console.log('📋 First pass: Identifying candidates...');
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            
            if (!plant.name || !plant.scientificName) continue;
            
            const matchResult = nameMatchesScientific(plant.name, plant.scientificName);
            if (matchResult.match) {
                candidates.push({
                    file: filePath,
                    plant: plant,
                    filename: path.basename(filePath),
                    matchType: matchResult.type
                });
            }
        } catch (err) {
            results.errors.push({ file: path.basename(filePath), error: err.message });
        }
    }
    
    console.log(`Found ${candidates.length} plants where name matches scientific name\n`);
    console.log('🔍 Processing and searching for common names...\n');
    
    // Second pass: try to find common names
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const { plant, file, filename, matchType } = candidate;
        
        console.log(`[${i + 1}/${candidates.length}] ${filename}`);
        console.log(`   Current name: "${plant.name}"`);
        console.log(`   Scientific: ${plant.scientificName}`);
        console.log(`   Match type: ${matchType}`);
        
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
                    source: 'description',
                    oldName: candidate.plant.name
                });
                console.log(`   ✅ Updated: "${candidate.plant.name}" → "${commonName}"\n`);
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
                        source: 'web',
                        oldName: candidate.plant.name
                    });
                    console.log(`   ✅ Updated: "${candidate.plant.name}" → "${commonName}"\n`);
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
            console.log(`      "${r.oldName}" → "${r.common}"`);
            console.log(`      Scientific: ${r.scientific} (from ${r.source})`);
        });
    }
    
    if (results.notFound.length > 0) {
        console.log('\n❌ NO COMMON NAME FOUND:');
        results.notFound.slice(0, 30).forEach(r => {
            console.log(`   ${r.file}: ${r.scientific}`);
        });
        if (results.notFound.length > 30) {
            console.log(`   ... and ${results.notFound.length - 30} more`);
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

