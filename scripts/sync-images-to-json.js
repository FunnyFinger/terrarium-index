const fs = require('fs').promises;
const path = require('path');

/**
 * Convert scientific name to slug format (matches image folder naming)
 */
function scientificNameToSlug(scientificName) {
    if (!scientificName) return null;
    return scientificName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Get all image files from a directory
 */
async function getImageFiles(dirPath) {
    try {
        const files = await fs.readdir(dirPath);
        return files
            .filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
            })
            .sort((a, b) => {
                // Sort by number if present (e.g., plant-1.jpg, plant-2.jpg)
                const numA = parseInt(a.match(/-(\d+)\./)?.[1] || '0');
                const numB = parseInt(b.match(/-(\d+)\./)?.[1] || '0');
                if (numA !== numB) return numA - numB;
                return a.localeCompare(b);
            })
            .map(f => `images/${path.basename(dirPath)}/${f}`);
    } catch (error) {
        return [];
    }
}

/**
 * Find plant JSON file by scientific name
 */
async function findPlantJsonByScientificName(scientificName, plantsDir, indexData) {
    if (!scientificName) return null;
    
    const scientificSlug = scientificNameToSlug(scientificName);
    
    for (const fileName of indexData.files || []) {
        try {
            const filePath = path.join(plantsDir, fileName);
            const content = await fs.readFile(filePath, 'utf-8');
            const plant = JSON.parse(content);
            
            // Match by scientific name (exact or slug)
            const plantSlug = scientificNameToSlug(plant.scientificName);
            if (plantSlug === scientificSlug || plant.scientificName === scientificName) {
                return { filePath, plant, fileName };
            }
            
            // Also try matching folder name directly as scientific name
            if (plant.scientificName && scientificNameToSlug(plant.scientificName) === scientificSlug) {
                return { filePath, plant, fileName };
            }
        } catch (error) {
            // Skip invalid files
            continue;
        }
    }
    
    return null;
}

/**
 * Update plant JSON with correct image paths
 */
async function updatePlantJson(plantData, imagePaths, filePath) {
    if (imagePaths.length === 0) {
        console.log(`  ⚠️  No images found, skipping update`);
        return false;
    }
    
    // Update image paths
    plantData.imageUrl = imagePaths[0];
    plantData.images = imagePaths;
    
    // Write back to file
    await fs.writeFile(filePath, JSON.stringify(plantData, null, 2) + '\n', 'utf-8');
    return true;
}

/**
 * Main function to sync images to JSON files
 */
async function main() {
    const imagesDir = path.join(__dirname, '..', 'images');
    const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
    const indexFile = path.join(plantsDir, 'index.json');
    
    console.log('🔄 Syncing image paths to plant JSON files...\n');
    
    // Load index
    const indexContent = await fs.readFile(indexFile, 'utf-8');
    const indexData = JSON.parse(indexContent);
    
    // Handle both "files" and "plants" array formats
    const fileList = indexData.files || indexData.plants || [];
    console.log(`📋 Found ${fileList.length} plant JSON files\n`);
    
    // Get all image folders
    const imageFolders = await fs.readdir(imagesDir);
    const imageDirs = [];
    
    for (const folder of imageFolders) {
        const folderPath = path.join(imagesDir, folder);
        const stat = await fs.stat(folderPath);
        if (stat.isDirectory() && !folder.startsWith('.')) {
            imageDirs.push(folder);
        }
    }
    
    console.log(`📁 Found ${imageDirs.length} image folders\n`);
    
    let updated = 0;
    let skipped = 0;
    let notFound = 0;
    
    for (const imageFolder of imageDirs) {
        const imageFolderPath = path.join(imagesDir, imageFolder);
        const imageFiles = await getImageFiles(imageFolderPath);
        
        if (imageFiles.length === 0) {
            console.log(`⏭️  ${imageFolder}: No images found`);
            skipped++;
            continue;
        }
        
        // Try to find matching plant by scientific name slug
        // The folder name should match the scientific name slug
        // First try: folder name as scientific name
        let matchingPlant = null;
        
        // Search through all plants to find one with matching scientific name slug
        for (const fileName of fileList) {
            try {
                const filePath = path.join(plantsDir, fileName);
                const content = await fs.readFile(filePath, 'utf-8');
                const plant = JSON.parse(content);
                
                if (!plant.scientificName) continue;
                
                const plantSlug = scientificNameToSlug(plant.scientificName);
                if (plantSlug === imageFolder) {
                    matchingPlant = { filePath, plant, fileName };
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        // Debug: Show first few non-matches for troubleshooting
        if (!matchingPlant && imageFolder === 'ficus-pumila') {
            console.log(`   Debug: Looking for folder "ficus-pumila"`);
            let count = 0;
            for (const fileName of fileList) {
                if (count++ >= 5) break;
                try {
                    const filePath = path.join(plantsDir, fileName);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const plant = JSON.parse(content);
                    const plantSlug = scientificNameToSlug(plant.scientificName);
                    console.log(`   - ${plant.name}: "${plant.scientificName}" → slug: "${plantSlug}"`);
                } catch (e) {}
            }
        }
        
        if (!matchingPlant) {
            console.log(`❌ ${imageFolder}: No matching plant found (${imageFiles.length} images)`);
            notFound++;
            continue;
        }
        
        // Check if update is needed
        const currentImages = matchingPlant.plant.images || [];
        const needsUpdate = 
            currentImages.length !== imageFiles.length ||
            currentImages[0] !== imageFiles[0] ||
            !currentImages.every((img, idx) => img === imageFiles[idx]);
        
        if (needsUpdate) {
            await updatePlantJson(matchingPlant.plant, imageFiles, matchingPlant.filePath);
            console.log(`✅ ${imageFolder} → ${matchingPlant.plant.name} (${imageFiles.length} images)`);
            updated++;
        } else {
            console.log(`✓  ${imageFolder} → ${matchingPlant.plant.name} (already up to date)`);
            skipped++;
        }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Not found: ${notFound}`);
    console.log(`\n✨ Done!`);
}

// Run
main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});

