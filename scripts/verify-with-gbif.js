// Verify Scientific Names using GBIF API
// https://www.gbif.org/species/search
// GBIF API: https://www.gbif.org/developer/species

const fs = require('fs');
const path = require('path');
const https = require('https');

const plantsDir = path.join(__dirname, '../data/plants');

// GBIF API endpoints
const GBIF_API_BASE = 'https://api.gbif.org/v1';

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', reject);
    });
}

async function searchGBIF(scientificName) {
    try {
        // Use species match endpoint - more accurate for scientific names
        const encoded = encodeURIComponent(scientificName);
        const url = `${GBIF_API_BASE}/species/match?name=${encoded}&kingdom=Plantae`;
        
        const result = await httpsGet(url);
        
        if (result && result.matchType !== 'NONE') {
            return {
                found: true,
                matchType: result.matchType,
                scientificName: result.scientificName,
                canonicalName: result.canonicalName,
                rank: result.rank,
                status: result.status,
                kingdom: result.kingdom,
                phylum: result.phylum,
                class: result.class,
                order: result.order,
                family: result.family,
                genus: result.genus,
                species: result.species,
                usageKey: result.usageKey,
                acceptedUsageKey: result.acceptedUsageKey,
                confidence: result.confidence
            };
        }
        
        return { found: false };
    } catch (err) {
        return { found: false, error: err.message };
    }
}

function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.json') && item !== 'index.json') {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

async function verifyWithGBIF() {
    console.log('🔍 Verifying scientific names with GBIF API...\n');
    console.log('API: https://api.gbif.org/v1/species\n');
    console.log('Web: https://www.gbif.org/species/search\n');
    console.log('='.repeat(80));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    const stats = {
        total: 0,
        exactMatch: 0,
        fuzzyMatch: 0,
        synonyms: 0,
        notFound: 0,
        errors: 0
    };
    
    const results = {
        exactMatches: [],
        fuzzyMatches: [],
        synonyms: [],
        notFound: []
    };
    
    console.log(`\nChecking ${plantFiles.length} plant entries with GBIF...\n`);
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            stats.total++;
            
            // Skip genus-level or unknown species
            if (plant.scientificName.includes(' sp') || 
                plant.scientificName.includes(' hybrid') ||
                !plant.scientificName.includes(' ')) {
                console.log(`⊘ Skipping: ${plant.scientificName} (genus/hybrid/sp.)`);
                stats.total--;
                continue;
            }
            
            // Query GBIF API
            const gbifResult = await searchGBIF(plant.scientificName);
            
            if (gbifResult.found) {
                const entry = {
                    file: filename,
                    plantName: plant.name,
                    inputName: plant.scientificName,
                    gbifName: gbifResult.scientificName,
                    canonicalName: gbifResult.canonicalName,
                    matchType: gbifResult.matchType,
                    rank: gbifResult.rank,
                    status: gbifResult.status,
                    family: gbifResult.family,
                    confidence: gbifResult.confidence,
                    usageKey: gbifResult.usageKey
                };
                
                if (gbifResult.matchType === 'EXACT') {
                    stats.exactMatch++;
                    results.exactMatches.push(entry);
                    console.log(`✓ ${plant.scientificName} - EXACT MATCH`);
                } else if (gbifResult.matchType === 'FUZZY') {
                    stats.fuzzyMatch++;
                    results.fuzzyMatches.push(entry);
                    console.log(`~ ${plant.scientificName} → ${gbifResult.canonicalName} (FUZZY)`);
                } else if (gbifResult.status === 'SYNONYM') {
                    stats.synonyms++;
                    results.synonyms.push(entry);
                    console.log(`⟳ ${plant.scientificName} (SYNONYM - accepted name available)`);
                }
            } else {
                stats.notFound++;
                results.notFound.push({
                    file: filename,
                    plantName: plant.name,
                    scientificName: plant.scientificName
                });
                console.log(`✗ ${plant.scientificName} - NOT FOUND`);
            }
            
            // Rate limiting - GBIF allows ~1000/min, so 200ms is safe
            await new Promise(r => setTimeout(r, 200));
            
            // Progress indicator
            if (stats.total % 25 === 0) {
                console.log(`\nProgress: ${stats.total}/${plantFiles.length} checked...\n`);
            }
            
        } catch (err) {
            stats.errors++;
            console.error(`Error processing ${path.basename(filePath)}:`, err.message);
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 GBIF VERIFICATION RESULTS:\n');
    console.log(`   Total checked: ${stats.total}`);
    console.log(`   ✅ Exact matches: ${stats.exactMatch}`);
    console.log(`   ~ Fuzzy matches: ${stats.fuzzyMatch}`);
    console.log(`   ⟳ Synonyms: ${stats.synonyms}`);
    console.log(`   ✗ Not found: ${stats.notFound}`);
    console.log(`   ❌ Errors: ${stats.errors}\n`);
    
    if (results.fuzzyMatches.length > 0) {
        console.log('~ FUZZY MATCHES (check if update needed):\n');
        results.fuzzyMatches.slice(0, 15).forEach(item => {
            console.log(`   ${item.file}`);
            console.log(`   Input: ${item.inputName}`);
            console.log(`   GBIF:  ${item.gbifName} (confidence: ${item.confidence}%)`);
            console.log(`   Family: ${item.family}\n`);
        });
        if (results.fuzzyMatches.length > 15) {
            console.log(`   ... and ${results.fuzzyMatches.length - 15} more\n`);
        }
    }
    
    if (results.synonyms.length > 0) {
        console.log('⟳ SYNONYMS (accepted names available):\n');
        results.synonyms.slice(0, 15).forEach(item => {
            console.log(`   ${item.file}: ${item.inputName}`);
            console.log(`   Status: ${item.status}\n`);
        });
        if (results.synonyms.length > 15) {
            console.log(`   ... and ${results.synonyms.length - 15} more\n`);
        }
    }
    
    if (results.notFound.length > 0) {
        console.log('✗ NOT FOUND IN GBIF:\n');
        results.notFound.slice(0, 20).forEach(item => {
            console.log(`   ${item.file}: "${item.scientificName}"`);
        });
        if (results.notFound.length > 20) {
            console.log(`   ... and ${results.notFound.length - 20} more\n`);
        }
    }
    
    // Save report
    const reportPath = path.join(__dirname, 'gbif-verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`✅ Full report saved to: ${reportPath}\n`);
    console.log('Source: https://www.gbif.org/species/search\n');
}

verifyWithGBIF().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

