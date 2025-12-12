// Verify Scientific Names using Catalogue of Life API
// https://www.catalogueoflife.org/tools/api

const fs = require('fs');
const path = require('path');
const https = require('https');

const plantsDir = path.join(__dirname, '../data/plants');

// Catalogue of Life API endpoint
const COL_API_BASE = 'https://api.catalogueoflife.org';

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
        const url = `${COL_API_BASE}/dataset/3/nameusage/search?q=${encoded}&limit=5`;
        
        const result = await httpsGet(url);
        
        if (result && result.result && result.result.length > 0) {
            // Return the first match
            return result.result[0];
        }
        
        return null;
    } catch (err) {
        console.error(`Error searching COL for "${scientificName}":`, err.message);
        return null;
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

async function verifyWithCOL() {
    console.log('🔍 Verifying scientific names with Catalogue of Life API...\n');
    console.log('Using: https://www.catalogueoflife.org/tools/api\n');
    console.log('='.repeat(80));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    const results = {
        verified: [],
        notFound: [],
        synonyms: [],
        errors: []
    };
    
    let processed = 0;
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            // Skip if scientific name is obviously placeholder
            if (!plant.scientificName || plant.scientificName.includes(' ')) {
                // Search COL
                console.log(`Checking: ${plant.scientificName}...`);
                
                const colResult = await searchCOL(plant.scientificName);
                
                if (colResult) {
                    const acceptedName = colResult.usage?.name || colResult.name;
                    const status = colResult.usage?.status || colResult.status;
                    const rank = colResult.usage?.rank || colResult.rank;
                    
                    if (status === 'accepted') {
                        results.verified.push({
                            file: filename,
                            name: plant.name,
                            scientific: plant.scientificName,
                            colName: acceptedName,
                            rank: rank,
                            status: 'VERIFIED ✅'
                        });
                    } else if (status === 'synonym') {
                        results.synonyms.push({
                            file: filename,
                            name: plant.name,
                            scientific: plant.scientificName,
                            acceptedName: acceptedName,
                            rank: rank,
                            status: 'SYNONYM - update recommended'
                        });
                    } else {
                        results.verified.push({
                            file: filename,
                            name: plant.name,
                            scientific: plant.scientificName,
                            colName: acceptedName,
                            rank: rank,
                            status: status
                        });
                    }
                } else {
                    results.notFound.push({
                        file: filename,
                        name: plant.name,
                        scientific: plant.scientificName,
                        status: 'NOT FOUND in COL'
                    });
                }
                
                // Rate limiting - wait 100ms between requests
                await new Promise(r => setTimeout(r, 100));
            }
            
            processed++;
            if (processed % 50 === 0) {
                console.log(`Progress: ${processed}/${plantFiles.length} files checked...`);
            }
            
            // Limit to first 50 for testing
            if (processed >= 50) {
                console.log('\n⚠️  Limited to first 50 entries for testing.');
                console.log('Run with full dataset by removing the limit.\n');
                break;
            }
            
        } catch (err) {
            results.errors.push({
                file: path.basename(filePath),
                error: err.message
            });
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 VERIFICATION RESULTS:\n');
    console.log(`   Total checked: ${processed}`);
    console.log(`   ✅ Verified: ${results.verified.length}`);
    console.log(`   🔄 Synonyms (need update): ${results.synonyms.length}`);
    console.log(`   ⚠️  Not found in COL: ${results.notFound.length}`);
    console.log(`   ❌ Errors: ${results.errors.length}\n`);
    
    if (results.synonyms.length > 0) {
        console.log('🔄 SYNONYMS - UPDATE RECOMMENDED:\n');
        results.synonyms.forEach(item => {
            console.log(`   ${item.file}`);
            console.log(`   Current: ${item.scientific}`);
            console.log(`   Accepted: ${item.acceptedName}`);
            console.log(`   Rank: ${item.rank}\n`);
        });
    }
    
    if (results.notFound.length > 0) {
        console.log('⚠️  NOT FOUND IN COL (may be rare or need manual check):\n');
        results.notFound.slice(0, 20).forEach(item => {
            console.log(`   ${item.file}: "${item.scientific}"`);
        });
        if (results.notFound.length > 20) {
            console.log(`   ... and ${results.notFound.length - 20} more\n`);
        }
    }
    
    // Save full report
    const reportPath = path.join(__dirname, 'col-verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n✅ Full report saved to: ${reportPath}\n`);
    
    return results;
}

verifyWithCOL().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

