// Verify and Update Scientific Names using Catalogue of Life API
// https://www.catalogueoflife.org/tools/api

const fs = require('fs');
const path = require('path');
const https = require('https');

const plantsDir = path.join(__dirname, '../data/plants');

// Catalogue of Life API endpoint (dataset 3 = latest COL release)
const COL_API_BASE = 'https://api.catalogueoflife.org';
const COL_DATASET = '3'; // Latest release

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

async function searchCOL(scientificName) {
    try {
        const encoded = encodeURIComponent(scientificName);
        const url = `${COL_API_BASE}/dataset/${COL_DATASET}/nameusage/search?q=${encoded}&limit=3`;
        
        const result = await httpsGet(url);
        
        if (result && result.result && result.result.length > 0) {
            // Get the best match (usually first result)
            const match = result.result[0];
            
            return {
                found: true,
                name: match.usage?.name || match.name,
                status: match.usage?.status || match.status,
                rank: match.usage?.rank || match.rank,
                acceptedName: match.accepted?.name || match.usage?.name || match.name,
                classification: {
                    kingdom: match.classification?.kingdom,
                    phylum: match.classification?.phylum,
                    class: match.classification?.class,
                    order: match.classification?.order,
                    family: match.classification?.family,
                    genus: match.classification?.genus
                }
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

async function verifyAndUpdate() {
    console.log('🔍 Verifying scientific names with Catalogue of Life API...\n');
    console.log('API: https://api.catalogueoflife.org\n');
    console.log('='.repeat(80));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    const stats = {
        total: 0,
        verified: 0,
        synonymsUpdated: 0,
        notFound: 0,
        errors: 0
    };
    
    const updates = [];
    const notFound = [];
    
    console.log(`\nProcessing ${plantFiles.length} plant entries...\n`);
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            stats.total++;
            
            // Query COL API
            const colResult = await searchCOL(plant.scientificName);
            
            if (colResult.found) {
                if (colResult.status === 'synonym' && colResult.acceptedName !== plant.scientificName) {
                    // Update to accepted name
                    updates.push({
                        file: filename,
                        oldName: plant.scientificName,
                        newName: colResult.acceptedName,
                        rank: colResult.rank
                    });
                    
                    plant.scientificName = colResult.acceptedName;
                    fs.writeFileSync(filePath, JSON.stringify(plant, null, 2), 'utf-8');
                    stats.synonymsUpdated++;
                    
                    console.log(`✓ Updated: ${filename}`);
                    console.log(`  ${updates[updates.length - 1].oldName} → ${colResult.acceptedName}\n`);
                } else {
                    stats.verified++;
                }
            } else {
                stats.notFound++;
                notFound.push({
                    file: filename,
                    name: plant.name,
                    scientific: plant.scientificName
                });
            }
            
            // Rate limiting
            await new Promise(r => setTimeout(r, 200));
            
            // Progress indicator
            if (stats.total % 25 === 0) {
                console.log(`Progress: ${stats.total}/${plantFiles.length} (${Math.round(stats.total/plantFiles.length*100)}%)...`);
            }
            
        } catch (err) {
            stats.errors++;
            console.error(`Error processing ${path.basename(filePath)}:`, err.message);
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 FINAL RESULTS:\n');
    console.log(`   Total processed: ${stats.total}`);
    console.log(`   ✅ Verified (accepted names): ${stats.verified}`);
    console.log(`   🔄 Synonyms updated to accepted names: ${stats.synonymsUpdated}`);
    console.log(`   ⚠️  Not found in COL: ${stats.notFound}`);
    console.log(`   ❌ Errors: ${stats.errors}\n`);
    
    if (updates.length > 0) {
        console.log('📝 UPDATES APPLIED:\n');
        updates.forEach((update, idx) => {
            console.log(`${idx + 1}. ${update.file}`);
            console.log(`   Old: ${update.oldName}`);
            console.log(`   New: ${update.newName} (${update.rank})\n`);
        });
    }
    
    if (notFound.length > 0) {
        console.log('⚠️  NOT FOUND IN COL (may be cultivars, hybrids, or rare species):\n');
        notFound.slice(0, 30).forEach(item => {
            console.log(`   ${item.file}: "${item.scientific}"`);
        });
        if (notFound.length > 30) {
            console.log(`   ... and ${notFound.length - 30} more\n`);
        }
    }
    
    console.log('\n✅ Catalogue of Life verification complete!\n');
    console.log('Source: https://www.catalogueoflife.org/tools/api\n');
}

verifyAndUpdate().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

