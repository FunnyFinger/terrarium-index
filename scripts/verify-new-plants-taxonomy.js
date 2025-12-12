/**
 * Verify and Update Taxonomy for Newly Added Plants
 * 
 * This script checks the 20 newly added plants (IDs 375-394) and verifies
 * that all taxonomic ranks use accepted names, not synonyms.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// GBIF API rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// List of newly added plants (IDs 375-394)
const NEW_PLANTS = [
    'selaginella-moellendorffii.json',
    'mentha-requienii.json',
    'scindapsus-pictus.json',
    'plectranthus-verticillatus.json',
    'biophytum-sensitivum.json',
    'pteris-cretica.json',
    'pogonatum-cirratum.json',
    'elatostema-pulchrum.json',
    'syngonium-rayi.json',
    'goeppertia-lietzei.json',
    'epiphyllum-pumilum.json',
    'columnea-gloriosa.json',
    'phalaenopsis-parishii.json',
    'cryptocoryne-parva.json',
    'dischidia-nummularia.json',
    'rhaphidophora-hayi.json',
    'cissus-discolor.json',
    'anubias-barteri.json',
    'labisia-pumila.json',
    'ardisia-japonica.json'
];

function getGbifRank(rank) {
    const rankMap = {
        'kingdom': 'KINGDOM',
        'phylum': 'PHYLUM',
        'class': 'CLASS',
        'order': 'ORDER',
        'family': 'FAMILY',
        'genus': 'GENUS',
        'species': 'SPECIES'
    };
    return rankMap[rank] || null;
}

/**
 * Get taxon key from GBIF by name and rank
 */
async function getTaxonKey(name, rank) {
    try {
        const gbifRank = getGbifRank(rank);
        if (!gbifRank) return null;
        
        let response = await axios.get(`https://api.gbif.org/v1/species/match`, {
            params: { name, rank: gbifRank }
        });
        let data = response.data;
        
        // If multiple equal matches, try with kingdom filter
        if (data.matchType === 'NONE' && data.note && data.note.includes('Multiple equal matches')) {
            await delay(200);
            response = await axios.get(`https://api.gbif.org/v1/species/match`, {
                params: { name, rank: gbifRank, kingdom: 'Plantae' }
            });
            data = response.data;
        }
        
        if (data.matchType && data.matchType !== 'NONE' && data.usageKey) {
            return data.usageKey;
        }
        
        return null;
    } catch (error) {
        console.warn(`Failed to get taxon key for ${rank} ${name}:`, error.message);
        return null;
    }
}

/**
 * Check if a taxon is a synonym and get the accepted name
 */
async function checkSynonym(name, rank) {
    try {
        const taxonKey = await getTaxonKey(name, rank);
        if (!taxonKey) {
            return { isSynonym: false, acceptedName: null, taxonKey: null };
        }
        
        await delay(200);
        
        // Get taxon info to check if it's a synonym
        try {
            const response = await axios.get(`https://api.gbif.org/v1/species/${taxonKey}`);
            const taxonInfo = response.data;
            
            // Check if it's a synonym
            if (taxonInfo.status === 'SYNONYM' && taxonInfo.acceptedUsageKey) {
                // Get the accepted taxon info
                await delay(200);
                const acceptedResponse = await axios.get(`https://api.gbif.org/v1/species/${taxonInfo.acceptedUsageKey}`);
                const acceptedInfo = acceptedResponse.data;
                return {
                    isSynonym: true,
                    acceptedName: acceptedInfo.canonicalName || acceptedInfo.scientificName,
                    taxonKey: taxonInfo.acceptedUsageKey,
                    originalKey: taxonKey
                };
            }
        } catch (error) {
            // If taxon info fetch fails, continue
        }
        
        // Also check the match result
        await delay(200);
        const matchResponse = await axios.get(`https://api.gbif.org/v1/species/match`, {
            params: { name, rank: getGbifRank(rank) }
        });
        const matchData = matchResponse.data;
        
        if (matchData.status === 'SYNONYM' && matchData.acceptedUsageKey) {
            await delay(200);
            const acceptedResponse = await axios.get(`https://api.gbif.org/v1/species/${matchData.acceptedUsageKey}`);
            const acceptedInfo = acceptedResponse.data;
            return {
                isSynonym: true,
                acceptedName: acceptedInfo.canonicalName || acceptedInfo.scientificName,
                taxonKey: matchData.acceptedUsageKey,
                originalKey: taxonKey
            };
        }
        
        return { isSynonym: false, acceptedName: null, taxonKey };
    } catch (error) {
        console.warn(`Error checking synonym for ${rank} ${name}:`, error.message);
        return { isSynonym: false, acceptedName: null, taxonKey: null };
    }
}

/**
 * Process a single plant file
 */
async function processPlantFile(fileName) {
    const filePath = path.join(PLANTS_DIR, fileName);
    
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${fileName}`);
        return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const plant = JSON.parse(content);
    
    console.log(`\nProcessing: ${plant.name} (${plant.scientificName})`);
    
    let updated = false;
    const changes = [];
    
    const ranksToCheck = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus'];
    
    for (const rank of ranksToCheck) {
        const currentName = plant.taxonomy[rank];
        if (!currentName) continue;
        
        console.log(`  Checking ${rank}: ${currentName}...`);
        const { isSynonym, acceptedName } = await checkSynonym(currentName, rank);
        
        if (isSynonym && acceptedName && acceptedName !== currentName) {
            console.log(`    ⚠️  SYNONYM FOUND: ${currentName} → ${acceptedName}`);
            plant.taxonomy[rank] = acceptedName;
            updated = true;
            changes.push({
                rank: rank,
                originalName: currentName,
                acceptedName: acceptedName
            });
        } else {
            console.log(`    ✓ Accepted name: ${currentName}`);
        }
        
        await delay(300); // Rate limiting between checks
    }
    
    if (updated) {
        // Write back to file
        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        console.log(`  ✅ Updated with ${changes.length} changes`);
        return { fileName, changes };
    } else {
        console.log(`  ✓ No changes needed`);
        return null;
    }
}

/**
 * Main function
 */
async function main() {
    console.log('Checking taxonomy for 20 newly added plants...\n');
    
    const results = [];
    
    for (const fileName of NEW_PLANTS) {
        const result = await processPlantFile(fileName);
        if (result) {
            results.push(result);
        }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Total plants checked: ${NEW_PLANTS.length}`);
    console.log(`Plants updated: ${results.length}`);
    console.log(`Plants unchanged: ${NEW_PLANTS.length - results.length}`);
    
    if (results.length > 0) {
        console.log('\n=== Changes Made ===');
        results.forEach(result => {
            console.log(`\n${result.fileName}:`);
            result.changes.forEach(change => {
                console.log(`  ${change.rank}: ${change.originalName} → ${change.acceptedName}`);
            });
        });
    } else {
        console.log('\n✅ All plants already use accepted taxonomic names!');
    }
}

// Run the script
main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});

