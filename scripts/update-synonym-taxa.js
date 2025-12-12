/**
 * Update Synonym Taxa to Accepted Names
 * 
 * This script checks all plants and updates any synonym taxon names
 * (kingdom, phylum, class, order, family, genus) to their accepted names
 * according to GBIF.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// GBIF API rate limiting - wait between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get taxon key from GBIF by name and rank
 */
async function getTaxonKey(name, rank) {
    try {
        const rankMap = {
            'kingdom': 'KINGDOM',
            'phylum': 'PHYLUM',
            'class': 'CLASS',
            'order': 'ORDER',
            'family': 'FAMILY',
            'genus': 'GENUS',
            'species': 'SPECIES'
        };
        
        const gbifRank = rankMap[rank];
        if (!gbifRank) return null;
        
        // Use name matching API to find the taxon
        let response = await axios.get(`https://api.gbif.org/v1/species/match`, {
            params: { name, rank: gbifRank }
        });
        let data = response.data;
        
        // If multiple equal matches, try with kingdom filter (Plantae) to narrow it down
        if (data.matchType === 'NONE' && data.note && data.note.includes('Multiple equal matches')) {
            await delay(200); // Rate limiting
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
async function getAcceptedName(name, rank) {
    try {
        const taxonKey = await getTaxonKey(name, rank);
        if (!taxonKey) {
            return { isSynonym: false, acceptedName: null, taxonKey: null };
        }
        
        await delay(200); // Rate limiting
        
        // Get taxon info to check if it's a synonym
        try {
            const response = await axios.get(`https://api.gbif.org/v1/species/${taxonKey}`);
            const taxonInfo = response.data;
            
            // Check if it's a synonym
            if (taxonInfo.status === 'SYNONYM' && taxonInfo.acceptedUsageKey) {
                // Get the accepted taxon info
                await delay(200); // Rate limiting
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
            // If taxon info fetch fails, continue to check match result
        }
        
        // Also check the match result for acceptedUsageKey
        await delay(200); // Rate limiting
        const matchResponse = await axios.get(`https://api.gbif.org/v1/species/match`, {
            params: { name, rank: getGbifRank(rank) }
        });
        const matchData = matchResponse.data;
        
        if (matchData.status === 'SYNONYM' && matchData.acceptedUsageKey) {
            await delay(200); // Rate limiting
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
    return rankMap[rank] || rank;
}

/**
 * Load all plants from the plants-merged directory
 */
async function loadAllPlants() {
    const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
    const indexFile = path.join(plantsDir, 'index.json');
    
    try {
        const indexData = fs.readFileSync(indexFile, 'utf-8');
        const index = JSON.parse(indexData);
        
        const plants = [];
        const filesToLoad = index.plants || [];
        
        for (const filename of filesToLoad) {
            try {
                const filePath = path.join(plantsDir, filename);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const plant = JSON.parse(content);
                    plant._filename = filename;
                    plant._filePath = filePath;
                    plants.push(plant);
                }
            } catch (err) {
                console.warn(`Failed to load ${filename}:`, err.message);
            }
        }
        
        return plants;
    } catch (err) {
        console.error('Failed to load plants:', err);
        return [];
    }
}

/**
 * Update a plant file with accepted taxon names
 */
async function updatePlantTaxonomy(plant) {
    if (!plant.taxonomy) {
        return { updated: false, changes: [] };
    }
    
    const changes = [];
    const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus'];
    
    for (const rank of ranks) {
        const currentName = plant.taxonomy[rank];
        if (!currentName) continue;
        
        try {
            console.log(`  Checking ${rank}: ${currentName}...`);
            const result = await getAcceptedName(currentName, rank);
            
            if (result.isSynonym && result.acceptedName && result.acceptedName !== currentName) {
                console.log(`    ✓ Found synonym: ${currentName} → ${result.acceptedName}`);
                plant.taxonomy[rank] = result.acceptedName;
                changes.push({
                    rank,
                    old: currentName,
                    new: result.acceptedName
                });
            }
            
            await delay(300); // Rate limiting between checks
        } catch (error) {
            console.warn(`    Error checking ${rank} ${currentName}:`, error.message);
        }
    }
    
    if (changes.length > 0) {
        // Write updated plant file
        const updatedContent = JSON.stringify(plant, null, 2) + '\n';
        fs.writeFileSync(plant._filePath, updatedContent, 'utf8');
        return { updated: true, changes };
    }
    
    return { updated: false, changes: [] };
}

/**
 * Main function
 */
async function main() {
    console.log('Loading all plants...');
    const plants = await loadAllPlants();
    console.log(`Loaded ${plants.length} plants\n`);
    
    const results = {
        total: plants.length,
        updated: 0,
        unchanged: 0,
        errors: 0,
        changes: []
    };
    
    for (let i = 0; i < plants.length; i++) {
        const plant = plants[i];
        console.log(`[${i + 1}/${plants.length}] Processing: ${plant.scientificName || plant.name}`);
        
        try {
            const result = await updatePlantTaxonomy(plant);
            
            if (result.updated) {
                results.updated++;
                results.changes.push({
                    plant: plant.scientificName || plant.name,
                    file: plant._filename,
                    changes: result.changes
                });
                console.log(`  ✓ Updated with ${result.changes.length} changes\n`);
            } else {
                results.unchanged++;
                console.log(`  - No changes needed\n`);
            }
        } catch (error) {
            results.errors++;
            console.error(`  ✗ Error: ${error.message}\n`);
        }
        
        // Rate limiting - wait a bit between plants
        if (i < plants.length - 1) {
            await delay(500);
        }
    }
    
    // Print summary
    console.log('\n=== Summary ===');
    console.log(`Total plants: ${results.total}`);
    console.log(`Updated: ${results.updated}`);
    console.log(`Unchanged: ${results.unchanged}`);
    console.log(`Errors: ${results.errors}`);
    
    // Save changes report
    if (results.changes.length > 0) {
        const reportPath = path.join(__dirname, 'synonym-updates-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(results.changes, null, 2), 'utf8');
        console.log(`\nChanges report saved to: ${reportPath}`);
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { getAcceptedName, updatePlantTaxonomy };

