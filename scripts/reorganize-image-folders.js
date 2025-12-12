// Script to reorganize image folders to use scientific names
// and delete folders that don't match any plant

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const IMAGES_DIR = path.join(__dirname, '..', 'images');

/**
 * Convert scientific name to folder name (slug)
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
 * Load all plants
 */
async function loadAllPlants() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
        
        const plants = [];
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(PLANTS_DIR, file);
                const content = await fs.readFile(filePath, 'utf8');
                const plant = JSON.parse(content);
                if (plant.scientificName && plant.id) {
                    plants.push(plant);
                }
            } catch (err) {
                console.warn(`  ⚠️ Skipping ${file}: ${err.message}`);
            }
        }
        
        return plants.sort((a, b) => (a.id || 0) - (b.id || 0));
    } catch (err) {
        console.error(`Error loading plants: ${err.message}`);
        return [];
    }
}

/**
 * Get existing image folders
 */
async function getExistingFolders() {
    try {
        const entries = await fs.readdir(IMAGES_DIR, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
    } catch (err) {
        console.error(`Error reading images directory: ${err.message}`);
        return [];
    }
}

/**
 * Check if folder has images and return count
 */
async function folderHasImages(folderPath) {
    try {
        const entries = await fs.readdir(folderPath, { withFileTypes: true });
        const imageFiles = entries
            .filter(entry => entry.isFile())
            .map(entry => entry.name)
            .filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
            });
        return imageFiles.length;
    } catch (err) {
        return 0;
    }
}

/**
 * Main reorganization function
 */
async function reorganizeFolders() {
    console.log('🔄 Reorganizing image folders to use scientific names...\n');
    
    // Load all plants
    console.log('📚 Loading plants...');
    const plants = await loadAllPlants();
    console.log(`✅ Loaded ${plants.length} plants\n`);
    
    // Create mapping: scientific name slug -> plant
    const plantMap = new Map();
    const idToPlant = new Map();
    
    for (const plant of plants) {
        const slug = scientificNameToSlug(plant.scientificName);
        if (slug) {
            // Handle duplicates by appending ID
            const key = plantMap.has(slug) ? `${slug}-${plant.id}` : slug;
            plantMap.set(key, plant);
            idToPlant.set(plant.id, plant);
        }
    }
    
    console.log(`📋 Created mapping for ${plantMap.size} unique scientific names\n`);
    
    // Get existing folders
    console.log('📁 Scanning existing image folders...');
    const existingFolders = await getExistingFolders();
    console.log(`✅ Found ${existingFolders.length} existing folders\n`);
    
    // Create mapping of old folder names to new folder names
    const folderRenames = new Map();
    const foldersToDelete = [];
    const processedPlants = new Set();
    
    console.log('🔍 Analyzing folders...\n');
    
    for (const oldFolder of existingFolders) {
        const oldFolderPath = path.join(IMAGES_DIR, oldFolder);
        const imageCount = await folderHasImages(oldFolderPath);
        
        if (imageCount === 0) {
            console.log(`  🗑️  Empty folder: ${oldFolder} (will be deleted)`);
            foldersToDelete.push(oldFolder);
            continue;
        }
        
        console.log(`  📁 ${oldFolder} (${imageCount} images)`);
        
        // Try to match folder to plant
        // Method 1: Check if folder name contains plant ID
        const idMatch = oldFolder.match(/^(\d{5})-/);
        let matchedPlant = null;
        
        if (idMatch) {
            const plantId = parseInt(idMatch[1]);
            matchedPlant = idToPlant.get(plantId);
        }
        
        // Method 2: Try to find by name matching
        if (!matchedPlant) {
            const folderNameLower = oldFolder.toLowerCase().replace(/^\d{5}-/, '');
            for (const [key, plant] of plantMap.entries()) {
                const plantNameLower = plant.name?.toLowerCase() || '';
                const scientificLower = scientificNameToSlug(plant.scientificName) || '';
                
                if (folderNameLower.includes(plantNameLower.replace(/[^a-z0-9]+/g, '-')) ||
                    folderNameLower.includes(scientificLower) ||
                    scientificLower.includes(folderNameLower)) {
                    matchedPlant = plant;
                    break;
                }
            }
        }
        
        if (matchedPlant) {
            const newSlug = scientificNameToSlug(matchedPlant.scientificName);
            if (newSlug) {
                // Handle duplicates
                const newFolder = plantMap.has(newSlug) && 
                                 plantMap.get(newSlug).id !== matchedPlant.id
                    ? `${newSlug}-${matchedPlant.id}`
                    : newSlug;
                
                if (oldFolder !== newFolder) {
                    folderRenames.set(oldFolder, newFolder);
                    processedPlants.add(matchedPlant.id);
                    console.log(`  ✅ ${oldFolder} → ${newFolder} (${matchedPlant.scientificName})`);
                } else {
                    processedPlants.add(matchedPlant.id);
                    console.log(`  ✓ ${oldFolder} (already correct - ${matchedPlant.scientificName})`);
                }
            } else {
                console.log(`  ⚠️  ${oldFolder} (matched plant but no scientific name)`);
                foldersToDelete.push(oldFolder);
            }
        } else {
            console.log(`  ❌ ${oldFolder} (no matching plant - will be deleted)`);
            foldersToDelete.push(oldFolder);
        }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`  ✅ Folders to rename: ${folderRenames.size}`);
    console.log(`  🗑️  Folders to delete: ${foldersToDelete.length}`);
    console.log(`  🌱 Plants matched: ${processedPlants.size}/${plants.length}\n`);
    
    // Ask for confirmation (in automated mode, we'll proceed)
    console.log('🔄 Starting reorganization...\n');
    
    // Rename folders
    let renameCount = 0;
    for (const [oldFolder, newFolder] of folderRenames.entries()) {
        try {
            const oldPath = path.join(IMAGES_DIR, oldFolder);
            const newPath = path.join(IMAGES_DIR, newFolder);
            
            // Check if new folder already exists
            try {
                await fs.access(newPath);
                console.log(`  ⚠️  Skipping ${oldFolder} → ${newFolder} (destination exists, merging...)`);
                // Merge: move files from old to new
                const files = await fs.readdir(oldPath);
                for (const file of files) {
                    const srcPath = path.join(oldPath, file);
                    const destPath = path.join(newPath, file);
                    try {
                        await fs.access(destPath);
                        // File exists, skip
                    } catch {
                        await fs.rename(srcPath, destPath);
                    }
                }
                await fs.rmdir(oldPath);
            } catch {
                // New folder doesn't exist, rename
                await fs.rename(oldPath, newPath);
            }
            
            renameCount++;
            console.log(`  ✅ Renamed: ${oldFolder} → ${newFolder}`);
        } catch (err) {
            console.error(`  ❌ Error renaming ${oldFolder}: ${err.message}`);
        }
    }
    
    // Delete folders
    let deleteCount = 0;
    for (const folder of foldersToDelete) {
        try {
            const folderPath = path.join(IMAGES_DIR, folder);
            await fs.rmdir(folderPath, { recursive: true });
            deleteCount++;
            console.log(`  🗑️  Deleted: ${folder}`);
        } catch (err) {
            console.error(`  ❌ Error deleting ${folder}: ${err.message}`);
        }
    }
    
    console.log(`\n✅ Reorganization complete!`);
    console.log(`  ✅ Renamed: ${renameCount} folders`);
    console.log(`  🗑️  Deleted: ${deleteCount} folders`);
    console.log(`  📁 Total plants with images: ${processedPlants.size}`);
}

// Run if called directly
if (require.main === module) {
    reorganizeFolders().catch(console.error);
}

module.exports = { reorganizeFolders, scientificNameToSlug };

