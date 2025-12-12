const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants-merged');
const resultsDir = path.join(__dirname, '../data/size-updates');
const progressFile = path.join(resultsDir, 'progress.json');
const resultsFile = path.join(resultsDir, 'size-updates-results.json');

// Ensure results directory exists
if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
}

// Get all plant files
function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

// Check if plant is a flowering plant
function isFloweringPlant(plant) {
    const plantType = (plant.plantType || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    const floweringPeriod = (plant.floweringPeriod || '').toLowerCase();
    
    // Carnivorous plants are typically flowering plants
    if (plantType === 'carnivorous plant' || plantType.includes('carnivorous')) return true;
    if (plantType === 'flowering plant') return true;
    if (category.includes('flowering')) return true;
    if (category.includes('carnivorous')) return true;
    if (floweringPeriod && !floweringPeriod.includes('does not flower') && !floweringPeriod.includes('non-flowering')) return true;
    
    return false;
}

// Parse current size
function parseSize(sizeStr) {
    if (!sizeStr) return null;
    
    const size = sizeStr.toLowerCase();
    let minSize = null;
    let maxSize = null;
    
    if (size.includes('cm')) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            minSize = parseFloat(numbers[0]);
            maxSize = numbers.length > 1 ? parseFloat(numbers[1]) : minSize;
        }
    }
    
    if (size.includes('m') && !size.includes('cm')) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            const minM = parseFloat(numbers[0]);
            const maxM = numbers.length > 1 ? parseFloat(numbers[1]) : minM;
            minSize = minM * 100;
            maxSize = maxM * 100;
        }
    }
    
    return { min: minSize, max: maxSize };
}

// Generate search query
function generateSearchQuery(plant, isFlowering) {
    const scientificName = plant.scientificName || '';
    const commonName = plant.name || '';
    
    if (isFlowering) {
        return `${scientificName} ${commonName} size when first flowers mature height cm`;
    } else {
        return `${scientificName} ${commonName} juvenile size mature height cm`;
    }
}

// Load progress
function loadProgress() {
    if (fs.existsSync(progressFile)) {
        return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    }
    return {
        processed: [],
        currentBatch: 0,
        totalBatches: 0
    };
}

// Save progress
function saveProgress(progress) {
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), 'utf8');
}

// Load results
function loadResults() {
    if (fs.existsSync(resultsFile)) {
        return JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    }
    return [];
}

// Save results
function saveResults(results) {
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2), 'utf8');
}

// Update plant size
function updatePlantSize(filePath, minSize, maxSize) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const oldSize = plant.size;
        const newSize = `${minSize}-${maxSize} cm`;
        plant.size = newSize;
        
        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        
        return {
            success: true,
            file: path.basename(filePath),
            name: plant.name,
            scientificName: plant.scientificName,
            old: oldSize,
            new: newSize
        };
    } catch (error) {
        return {
            success: false,
            file: path.basename(filePath),
            error: error.message
        };
    }
}

// Process batch
function processBatch(batchNumber, batchSize = 10) {
    const files = getAllPlantFiles(plantsDir);
    const progress = loadProgress();
    const results = loadResults();
    
    const totalBatches = Math.ceil(files.length / batchSize);
    const startIndex = batchNumber * batchSize;
    const endIndex = Math.min(startIndex + batchSize, files.length);
    const batch = files.slice(startIndex, endIndex);
    
    console.log(`\n📦 Processing Batch ${batchNumber + 1}/${totalBatches}`);
    console.log(`   Plants ${startIndex + 1}-${endIndex} of ${files.length}`);
    console.log('='.repeat(80));
    
    const batchResults = [];
    
    for (const filePath of batch) {
        const fileName = path.basename(filePath);
        
        // Skip if already processed
        if (progress.processed.includes(fileName)) {
            console.log(`⏭️  Skipped (already processed): ${fileName}`);
            continue;
        }
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            const isFlowering = isFloweringPlant(plant);
            const currentSize = parseSize(plant.size);
            const searchQuery = generateSearchQuery(plant, isFlowering);
            
            const plantInfo = {
                file: fileName,
                name: plant.name,
                scientificName: plant.scientificName,
                isFlowering: isFlowering,
                currentSize: plant.size,
                searchQuery: searchQuery,
                needsUpdate: true
            };
            
            batchResults.push(plantInfo);
            
            console.log(`\n🔍 ${plant.name} (${plant.scientificName})`);
            console.log(`   Type: ${isFlowering ? 'Flowering Plant' : 'Non-Flowering'}`);
            console.log(`   Current: ${plant.size}`);
            console.log(`   Search: "${searchQuery}"`);
            
        } catch (error) {
            console.error(`❌ Error processing ${fileName}:`, error.message);
            batchResults.push({
                file: fileName,
                error: error.message
            });
        }
    }
    
    // Save batch results
    const batchFile = path.join(resultsDir, `batch-${batchNumber + 1}.json`);
    fs.writeFileSync(batchFile, JSON.stringify(batchResults, null, 2), 'utf8');
    
    console.log(`\n✅ Batch ${batchNumber + 1} saved to: ${batchFile}`);
    console.log(`   Use web search to find sizes, then update batch-${batchNumber + 1}-results.json`);
    
    return batchResults;
}

// Apply updates from results file
function applyUpdates(batchNumber) {
    const resultsFile = path.join(resultsDir, `batch-${batchNumber + 1}-results.json`);
    
    if (!fs.existsSync(resultsFile)) {
        console.error(`❌ Results file not found: ${resultsFile}`);
        console.log(`   Create this file with format:`);
        console.log(`   [`);
        console.log(`     { "file": "plant.json", "minSize": 5, "maxSize": 180 },`);
        console.log(`     ...`);
        console.log(`   ]`);
        return;
    }
    
    const updates = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    const progress = loadProgress();
    const allResults = loadResults();
    
    console.log(`\n📝 Applying updates from batch ${batchNumber + 1}...`);
    
    const applied = [];
    
    for (const update of updates) {
        const filePath = path.join(plantsDir, update.file);
        
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${update.file}`);
            continue;
        }
        
        const result = updatePlantSize(filePath, update.minSize, update.maxSize);
        
        if (result.success) {
            console.log(`✅ ${result.name}: ${result.old} → ${result.new}`);
            progress.processed.push(update.file);
            allResults.push({
                ...result,
                batch: batchNumber + 1,
                timestamp: new Date().toISOString()
            });
            applied.push(result);
        } else {
            console.error(`❌ ${update.file}: ${result.error}`);
        }
    }
    
    saveProgress(progress);
    saveResults(allResults);
    
    console.log(`\n✅ Applied ${applied.length} updates`);
    console.log(`   Progress saved: ${progress.processed.length} plants processed`);
    
    return applied;
}

// Main CLI
const args = process.argv.slice(2);
const command = args[0];
const batchNum = args[1] ? parseInt(args[1]) - 1 : 0;
const batchSize = args[2] ? parseInt(args[2]) : 10;

if (command === 'process') {
    processBatch(batchNum, batchSize);
} else if (command === 'apply') {
    applyUpdates(batchNum);
} else if (command === 'status') {
    const progress = loadProgress();
    const files = getAllPlantFiles(plantsDir);
    console.log(`\n📊 Status:`);
    console.log(`   Total plants: ${files.length}`);
    console.log(`   Processed: ${progress.processed.length}`);
    console.log(`   Remaining: ${files.length - progress.processed.length}`);
    console.log(`   Progress: ${((progress.processed.length / files.length) * 100).toFixed(1)}%`);
} else {
    console.log(`
Usage:
  node batch-update-sizes-web.js <command> [batch-number] [batch-size]

Commands:
  process [batch] [size]  - Process a batch of plants (generate search queries)
  apply [batch]           - Apply updates from batch results file
  status                  - Show processing status

Examples:
  node batch-update-sizes-web.js process 1 10    # Process batch 1 with 10 plants
  node batch-update-sizes-web.js apply 1        # Apply updates from batch 1
  node batch-update-sizes-web.js status         # Show status

Workflow:
  1. Run: process 1 10 (generates batch-1.json with search queries)
  2. Use web search to find sizes for each plant
  3. Create batch-1-results.json with updates
  4. Run: apply 1 (applies the updates)
  5. Repeat for next batch
    `);
}

