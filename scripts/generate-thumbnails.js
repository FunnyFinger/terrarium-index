/**
 * Generate 60x60 thumbnails (thumb.jpg) for all plants
 * Uses the main image (first image in gallery) from each plant
 * Thumbnails are saved as images/[plant-folder]/thumb.jpg
 */

const fs = require('fs').promises;
const path = require('path');

// Check if sharp is available, otherwise use jimp
let sharp = null;
let jimp = null;

try {
    sharp = require('sharp');
    console.log('✅ Using sharp for image processing');
} catch (e) {
    try {
        jimp = require('jimp');
        console.log('✅ Using jimp for image processing');
    } catch (e2) {
        console.error('❌ Error: Neither sharp nor jimp is installed.');
        console.error('Please install one: npm install sharp (recommended) or npm install jimp');
        process.exit(1);
    }
}

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const IMAGES_DIR = path.join(__dirname, '..', 'images');
const THUMB_SIZE = 60;

// Convert scientific name to slug (matching folder naming convention)
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

// Get main image path for a plant
// The main image is the first image in the images array (set by user in gallery)
async function getMainImagePath(plant) {
    const folderName = scientificNameToSlug(plant.scientificName);
    if (!folderName) return null;
    
    const plantImageDir = path.join(IMAGES_DIR, folderName);
    
    // Priority 1: Check if there's a localStorage backup file (if user has set main images)
    const localStorageBackupPath = path.join(__dirname, '..', 'localStorage-backup.json');
    try {
        const backupData = await fs.readFile(localStorageBackupPath, 'utf-8');
        const backup = JSON.parse(backupData);
        const plantKey = `plant_${plant.id}_images`;
        const imageUrlKey = `plant_${plant.id}_imageUrl`;
        
        if (backup[imageUrlKey]) {
            const backupPath = path.join(__dirname, '..', backup[imageUrlKey]);
            try {
                await fs.access(backupPath);
                return backup[imageUrlKey];
            } catch (e) {
                // File doesn't exist, continue
            }
        }
        if (backup[plantKey]) {
            const savedImages = typeof backup[plantKey] === 'string' 
                ? JSON.parse(backup[plantKey]) 
                : backup[plantKey];
            if (Array.isArray(savedImages) && savedImages.length > 0) {
                const firstImage = savedImages[0];
                const backupPath = path.join(__dirname, '..', firstImage);
                try {
                    await fs.access(backupPath);
                    return firstImage;
                } catch (e) {
                    // File doesn't exist, continue
                }
            }
        }
    } catch (error) {
        // No backup file or can't read it - continue
    }
    
    // Priority 2: Use plant.imageUrl if available and file exists
    if (plant.imageUrl) {
        const imagePath = path.join(__dirname, '..', plant.imageUrl);
        try {
            await fs.access(imagePath);
            return plant.imageUrl;
        } catch (e) {
            // File doesn't exist, continue
        }
    }
    
    // Priority 3: Use first image in images array if file exists
    if (plant.images && Array.isArray(plant.images) && plant.images.length > 0) {
        const firstImage = plant.images[0];
        const imagePath = path.join(__dirname, '..', firstImage);
        try {
            await fs.access(imagePath);
            return firstImage;
        } catch (e) {
            // File doesn't exist, continue
        }
    }
    
    // Priority 4: Check for actual image files in the folder (use first one found)
    try {
        const files = await fs.readdir(plantImageDir);
        const imageFiles = files
            .filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) && f !== 'thumb.jpg';
            })
            .sort((a, b) => {
                // Sort by number if present (e.g., plant-1.jpg, plant-2.jpg)
                const numA = parseInt(a.match(/-(\d+)\./)?.[1] || '0');
                const numB = parseInt(b.match(/-(\d+)\./)?.[1] || '0');
                if (numA !== numB) return numA - numB;
                return a.localeCompare(b);
            });
        
        if (imageFiles.length > 0) {
            return `images/${folderName}/${imageFiles[0]}`;
        }
    } catch (error) {
        // Folder doesn't exist or can't read it
    }
    
    return null;
}

// Generate thumbnail using sharp
async function generateThumbnailSharp(sourcePath, outputPath) {
    try {
        await sharp(sourcePath)
            .resize(THUMB_SIZE, THUMB_SIZE, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 85 })
            .toFile(outputPath);
        return true;
    } catch (error) {
        console.error(`  ❌ Error generating thumbnail with sharp: ${error.message}`);
        return false;
    }
}

// Generate thumbnail using jimp
async function generateThumbnailJimp(sourcePath, outputPath) {
    try {
        const image = await jimp.read(sourcePath);
        await image
            .cover(THUMB_SIZE, THUMB_SIZE)
            .quality(85)
            .write(outputPath);
        return true;
    } catch (error) {
        console.error(`  ❌ Error generating thumbnail with jimp: ${error.message}`);
        return false;
    }
}

// Generate thumbnail for a plant
async function generateThumbnailForPlant(plant) {
    const folderName = scientificNameToSlug(plant.scientificName);
    if (!folderName) {
        console.log(`  ⚠️  No valid scientific name for ${plant.name}`);
        return { success: false, reason: 'no-scientific-name' };
    }
    
    // Get main image path
    const mainImagePath = await getMainImagePath(plant);
    if (!mainImagePath) {
        console.log(`  ⚠️  No main image found for ${plant.name}`);
        return { success: false, reason: 'no-main-image' };
    }
    
    // Resolve full paths
    const sourcePath = path.join(__dirname, '..', mainImagePath);
    const plantImageDir = path.join(IMAGES_DIR, folderName);
    const thumbPath = path.join(plantImageDir, 'thumb.jpg');
    
    // Check if source image exists
    try {
        await fs.access(sourcePath);
    } catch (error) {
        console.log(`  ⚠️  Source image not found: ${mainImagePath}`);
        return { success: false, reason: 'source-not-found' };
    }
    
    // Check if thumbnail already exists and is up to date
    try {
        const sourceStats = await fs.stat(sourcePath);
        const thumbStats = await fs.stat(thumbPath);
        
        // Check thumbnail dimensions to ensure it matches current size requirement
        const thumbMetadata = await sharp(thumbPath).metadata();
        const isCorrectSize = thumbMetadata.width === THUMB_SIZE && thumbMetadata.height === THUMB_SIZE;
        
        // If thumbnail is newer than source AND correct size, skip regeneration
        if (thumbStats.mtime >= sourceStats.mtime && isCorrectSize) {
            console.log(`  ✓ Thumbnail already up to date for ${plant.name}`);
            return { success: true, reason: 'already-up-to-date' };
        } else if (!isCorrectSize) {
            console.log(`  🔄 Regenerating thumbnail (size mismatch: ${thumbMetadata.width}x${thumbMetadata.height} → ${THUMB_SIZE}x${THUMB_SIZE})`);
        }
    } catch (error) {
        // Thumbnail doesn't exist or can't be accessed - will create it
    }
    
    // Ensure plant image directory exists
    try {
        await fs.mkdir(plantImageDir, { recursive: true });
    } catch (error) {
        console.error(`  ❌ Error creating directory: ${error.message}`);
        return { success: false, reason: 'directory-error' };
    }
    
    // Generate thumbnail
    let success = false;
    if (sharp) {
        success = await generateThumbnailSharp(sourcePath, thumbPath);
    } else if (jimp) {
        success = await generateThumbnailJimp(sourcePath, thumbPath);
    }
    
    if (success) {
        console.log(`  ✅ Generated thumbnail: ${thumbPath}`);
        return { success: true, reason: 'generated' };
    } else {
        return { success: false, reason: 'generation-failed' };
    }
}

// Main function
async function main() {
    console.log('🖼️  Generating thumbnails for all plants...\n');
    
    // Load plant index
    const indexPath = path.join(PLANTS_DIR, 'index.json');
    let plantFiles = [];
    
    try {
        const indexData = await fs.readFile(indexPath, 'utf-8');
        const index = JSON.parse(indexData);
        plantFiles = index.plants || index.files || [];
    } catch (error) {
        console.error('❌ Error reading index.json:', error.message);
        // Fallback: read directory
        const files = await fs.readdir(PLANTS_DIR);
        plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
    }
    
    console.log(`📋 Found ${plantFiles.length} plant files\n`);
    
    const stats = {
        total: plantFiles.length,
        generated: 0,
        upToDate: 0,
        skipped: 0,
        errors: 0
    };
    
    // Process each plant
    for (let i = 0; i < plantFiles.length; i++) {
        const file = plantFiles[i];
        const filePath = path.join(PLANTS_DIR, file);
        
        try {
            const plantData = await fs.readFile(filePath, 'utf-8');
            const plant = JSON.parse(plantData);
            
            console.log(`[${i + 1}/${plantFiles.length}] ${plant.name || plant.scientificName || file}`);
            
            const result = await generateThumbnailForPlant(plant);
            
            if (result.success) {
                if (result.reason === 'generated') {
                    stats.generated++;
                } else if (result.reason === 'already-up-to-date') {
                    stats.upToDate++;
                }
            } else {
                stats.skipped++;
                if (result.reason === 'generation-failed') {
                    stats.errors++;
                }
            }
        } catch (error) {
            console.error(`  ❌ Error processing ${file}: ${error.message}`);
            stats.errors++;
            stats.skipped++;
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`  Total plants: ${stats.total}`);
    console.log(`  ✅ Generated: ${stats.generated}`);
    console.log(`  ✓ Up to date: ${stats.upToDate}`);
    console.log(`  ⚠️  Skipped: ${stats.skipped}`);
    console.log(`  ❌ Errors: ${stats.errors}`);
    console.log('='.repeat(50));
}

// Run the script
main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

