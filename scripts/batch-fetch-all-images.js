// Automated Batch Image Fetcher for All Plants
// Fetches high-quality, validated images for all plants and updates JSON files
// No manual work required!

const fs = require('fs').promises;
const path = require('path');
const fetchImagesScript = require('./fetch-images-local-ai.js');

const BATCH_CONFIG = {
    // Process in batches to avoid overwhelming the system
    batchSize: 5, // Process 5 plants at a time
    delayBetweenBatches: 5000, // 5 seconds between batches
    delayBetweenPlants: 2000, // 2 seconds between individual plants
    
    // Resume from last position if interrupted
    resumeFile: path.join(__dirname, '..', '.image-fetch-progress.json'),
    
    // Only fetch if images are missing or below threshold
    minImagesRequired: 1, // Minimum images per plant
    forceRefresh: process.argv.includes('--force'), // Force re-fetch all
    
    // Skip plants that already have enough good images
    skipIfHasImages: !process.argv.includes('--force')
};

/**
 * Load all plants from the merged directory
 */
async function loadAllPlants() {
    const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
    const indexFile = path.join(plantsDir, 'index.json');
    
    try {
        const indexData = await fs.readFile(indexFile, 'utf-8');
        const index = JSON.parse(indexData);
        
        const plants = [];
        const filesToLoad = index.files && index.files.length > 0 ? index.files : null;
        
        // If index is empty, load all JSON files directly
        if (!filesToLoad) {
            const allFiles = await fs.readdir(plantsDir);
            const jsonFiles = allFiles.filter(f => f.endsWith('.json') && f !== 'index.json').sort();
            for (const filename of jsonFiles) {
                try {
                    const filePath = path.join(plantsDir, filename);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const plant = JSON.parse(content);
                    plants.push(plant);
                } catch (err) {
                    console.warn(`⚠️  Failed to load ${filename}: ${err.message}`);
                }
            }
        } else {
            // Use index files
            for (const filename of index.files || []) {
                try {
                    const filePath = path.join(plantsDir, filename);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const plant = JSON.parse(content);
                    plants.push(plant);
                } catch (err) {
                    console.warn(`⚠️  Failed to load ${filename}: ${err.message}`);
                }
            }
        }
        
        return plants;
    } catch (err) {
        console.error(`❌ Failed to load plants: ${err.message}`);
        return [];
    }
}

/**
 * Check if plant already has enough images
 */
async function hasEnoughImages(plant) {
    if (!BATCH_CONFIG.skipIfHasImages) return false;
    
    const imagesDir = path.join(__dirname, '..', 'images');
    const scientificSlug = scientificNameToSlug(plant.scientificName);
    
    if (!scientificSlug) return false;
    
    const plantFolder = path.join(imagesDir, scientificSlug);
    
    try {
        const files = await fs.readdir(plantFolder);
        const imageFiles = files.filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        });
        
        return imageFiles.length >= BATCH_CONFIG.minImagesRequired;
    } catch {
        return false;
    }
}

/**
 * Convert scientific name to folder slug
 */
function scientificNameToSlug(scientificName) {
    if (!scientificName) return null;
    return scientificName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[×x]/g, 'x')
        .replace(/[^a-z0-9\-x]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Update plant JSON file with correct image paths
 */
async function updatePlantJson(plant) {
    const scientificSlug = scientificNameToSlug(plant.scientificName);
    if (!scientificSlug) return;
    
    const imagesDir = path.join(__dirname, '..', 'images', scientificSlug);
    
    try {
        const files = await fs.readdir(imagesDir);
        const imageFiles = files
            .filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
            })
            .sort()
            .map(f => `images/${scientificSlug}/${f}`);
        
        if (imageFiles.length === 0) return;
        
        // Find the JSON file
        const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
        const indexFile = path.join(plantsDir, 'index.json');
        const indexData = await fs.readFile(indexFile, 'utf-8');
        const index = JSON.parse(indexData);
        
        // Find matching file
        const matchingFile = index.files.find(f => {
            const filePath = path.join(plantsDir, f);
            try {
                const content = require('fs').readFileSync(filePath, 'utf-8');
                const p = JSON.parse(content);
                return p.id === plant.id || 
                       p.scientificName === plant.scientificName ||
                       p.name === plant.name;
            } catch {
                return false;
            }
        });
        
        if (!matchingFile) {
            console.warn(`  ⚠️  Could not find JSON file for ${plant.name}`);
            return;
        }
        
        const jsonPath = path.join(plantsDir, matchingFile);
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const plantData = JSON.parse(jsonContent);
        
        // Update image paths
        plantData.imageUrl = imageFiles[0];
        plantData.images = imageFiles;
        
        // Write back
        await fs.writeFile(jsonPath, JSON.stringify(plantData, null, 2) + '\n');
        console.log(`  ✅ Updated JSON: ${imageFiles.length} images`);
        
    } catch (err) {
        console.warn(`  ⚠️  Failed to update JSON for ${plant.name}: ${err.message}`);
    }
}

/**
 * Load progress from last run
 */
async function loadProgress() {
    try {
        const content = await fs.readFile(BATCH_CONFIG.resumeFile, 'utf-8');
        return JSON.parse(content);
    } catch {
        return { processed: [], failed: [], lastIndex: 0 };
    }
}

/**
 * Save progress
 */
async function saveProgress(progress) {
    await fs.writeFile(BATCH_CONFIG.resumeFile, JSON.stringify(progress, null, 2));
}

/**
 * Main batch processing function
 */
async function processAllPlants() {
    console.log('🚀 Automated Batch Image Fetcher');
    console.log('================================\n');
    
    // Check Ollama is running
    console.log('📋 Checking Ollama setup...');
    try {
        const axios = require('axios');
        await axios.get('http://localhost:11434/api/tags');
        console.log('✅ Ollama is running\n');
    } catch (err) {
        console.error('❌ Ollama not available. Please start Ollama first.');
        console.error('   Run: ollama serve');
        process.exit(1);
    }
    
    // Load plants
    console.log('\n📦 Loading plants...');
    const allPlants = await loadAllPlants();
    console.log(`✅ Loaded ${allPlants.length} plants\n`);
    
    // Load progress
    const progress = await loadProgress();
    const processedIds = new Set(progress.processed || []);
    const failedIds = new Set(progress.failed || []);
    
    // Filter plants to process
    let plantsToProcess = allPlants;
    
    if (!BATCH_CONFIG.forceRefresh) {
        // Skip already processed
        plantsToProcess = allPlants.filter(p => !processedIds.has(p.id));
        
        // Skip plants with enough images
        const needsImages = [];
        for (const plant of plantsToProcess) {
            const hasEnough = await hasEnoughImages(plant);
            if (!hasEnough) {
                needsImages.push(plant);
            } else {
                console.log(`⏭️  Skipping ${plant.name} - already has images`);
            }
        }
        plantsToProcess = needsImages;
    }
    
    // Limit to first 5 plants for testing
    const limit = parseInt(process.env.TEST_LIMIT) || 0;
    if (limit > 0) {
        plantsToProcess = plantsToProcess.slice(0, limit);
        console.log(`\n🧪 TEST MODE: Processing first ${limit} plants only\n`);
    }
    
    console.log(`\n🎯 Processing ${plantsToProcess.length} plants\n`);
    console.log(`📊 Settings:`);
    console.log(`   - Batch size: ${BATCH_CONFIG.batchSize}`);
    console.log(`   - Delay between batches: ${BATCH_CONFIG.delayBetweenBatches}ms`);
    console.log(`   - Min images required: ${BATCH_CONFIG.minImagesRequired}`);
    console.log(`   - Force refresh: ${BATCH_CONFIG.forceRefresh ? 'Yes' : 'No'}\n`);
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    
    // Process in batches
    for (let i = 0; i < plantsToProcess.length; i += BATCH_CONFIG.batchSize) {
        const batch = plantsToProcess.slice(i, i + BATCH_CONFIG.batchSize);
        const batchNum = Math.floor(i / BATCH_CONFIG.batchSize) + 1;
        const totalBatches = Math.ceil(plantsToProcess.length / BATCH_CONFIG.batchSize);
        
        console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} plants)`);
        console.log('─'.repeat(50));
        
        for (const plant of batch) {
            try {
                console.log(`\n🌱 ${plant.name} (${plant.scientificName})`);
                
                // Fetch images using the existing function
                const imageCount = await fetchImagesScript.fetchImagesForPlant(plant);
                
                if (imageCount > 0) {
                    // Update JSON file
                    await updatePlantJson(plant);
                    successCount++;
                    processedIds.add(plant.id);
                    failedIds.delete(plant.id);
                    console.log(`✅ Success: ${imageCount} images`);
                } else {
                    failCount++;
                    failedIds.add(plant.id);
                    console.log(`❌ Failed: No images found`);
                }
                
                // Save progress after each plant
                await saveProgress({
                    processed: Array.from(processedIds),
                    failed: Array.from(failedIds),
                    lastIndex: i + batch.indexOf(plant)
                });
                
                // Delay between plants
                if (batch.indexOf(plant) < batch.length - 1) {
                    await new Promise(r => setTimeout(r, BATCH_CONFIG.delayBetweenPlants));
                }
                
            } catch (err) {
                console.error(`❌ Error processing ${plant.name}: ${err.message}`);
                failCount++;
                failedIds.add(plant.id);
            }
        }
        
        // Delay between batches
        if (i + BATCH_CONFIG.batchSize < plantsToProcess.length) {
            console.log(`\n⏳ Waiting ${BATCH_CONFIG.delayBetweenBatches / 1000}s before next batch...`);
            await new Promise(r => setTimeout(r, BATCH_CONFIG.delayBetweenBatches));
        }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Success: ${successCount} plants`);
    console.log(`❌ Failed: ${failCount} plants`);
    console.log(`⏭️  Skipped: ${skipCount} plants`);
    console.log(`📦 Total processed: ${successCount + failCount} plants`);
    console.log(`\n💰 Cost: $0 (all processing done locally!)`);
    
    // Clean up progress file if done
    if (plantsToProcess.length === 0 || (successCount + failCount) === plantsToProcess.length) {
        await fs.unlink(BATCH_CONFIG.resumeFile).catch(() => {});
        console.log('\n✅ Progress file cleaned up');
    }
}

// Run if called directly
if (require.main === module) {
    processAllPlants().catch(err => {
        console.error('❌ Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { processAllPlants, updatePlantJson };

