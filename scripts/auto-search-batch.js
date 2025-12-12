// Helper script to automate web searches for a batch
// This can be used with browser automation or web search APIs

const fs = require('fs');
const path = require('path');

const resultsDir = path.join(__dirname, '../data/size-updates');

// Load batch file
function loadBatch(batchNumber) {
    const batchFile = path.join(resultsDir, `batch-${batchNumber}.json`);
    if (!fs.existsSync(batchFile)) {
        console.error(`Batch file not found: ${batchFile}`);
        return null;
    }
    return JSON.parse(fs.readFileSync(batchFile, 'utf8'));
}

// Process search results and create results file
// This function takes search results and extracts min/max sizes
function processSearchResults(batchNumber, searchResults) {
    const batch = loadBatch(batchNumber);
    if (!batch) return;
    
    const updates = [];
    
    for (let i = 0; i < batch.length; i++) {
        const plant = batch[i];
        const result = searchResults[i];
        
        if (!result || !result.minSize || !result.maxSize) {
            console.warn(`⚠️  Missing data for ${plant.name}, skipping`);
            continue;
        }
        
        updates.push({
            file: plant.file,
            minSize: result.minSize,
            maxSize: result.maxSize
        });
    }
    
    // Save results
    const resultsFile = path.join(resultsDir, `batch-${batchNumber}-results.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(updates, null, 2), 'utf8');
    
    console.log(`✅ Created ${resultsFile} with ${updates.length} updates`);
    return updates;
}

// Example: Manual results entry
// Use this format when manually entering search results
function createResultsFromManualEntry(batchNumber, entries) {
    // entries format: [{ file: "plant.json", minSize: 5, maxSize: 180 }, ...]
    const resultsFile = path.join(resultsDir, `batch-${batchNumber}-results.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(entries, null, 2), 'utf8');
    console.log(`✅ Created ${resultsFile}`);
}

// Export for use
module.exports = {
    loadBatch,
    processSearchResults,
    createResultsFromManualEntry
};

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const batchNum = args[1];
    
    if (command === 'template') {
        const batch = loadBatch(batchNum);
        if (batch) {
            console.log('\n📝 Template for batch-' + batchNum + '-results.json:\n');
            console.log('[');
            batch.forEach((plant, i) => {
                console.log(`  {`);
                console.log(`    "file": "${plant.file}",`);
                console.log(`    "minSize": 0,  // ${plant.isFlowering ? 'Size when first flowers' : 'Juvenile size'} (cm)`);
                console.log(`    "maxSize": 0   // Mature size (cm)`);
                console.log(`  }${i < batch.length - 1 ? ',' : ''}`);
            });
            console.log(']');
        }
    } else {
        console.log('Usage: node auto-search-batch.js template <batch-number>');
        console.log('Example: node auto-search-batch.js template 1');
    }
}

