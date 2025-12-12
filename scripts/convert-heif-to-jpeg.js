/**
 * Convert HEIF/HEIC images to JPEG format
 * Handles images that couldn't be processed by the thumbnail generator
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const IMAGES_DIR = path.join(__dirname, '..', 'images');

// Check if file is HEIF format by reading metadata
async function isHeifFormat(filePath) {
    try {
        const metadata = await sharp(filePath).metadata();
        // HEIF files often have format 'heif' or might be detected differently
        // Also check if sharp can't process it (will throw error)
        return metadata.format === 'heif' || metadata.format === 'heic';
    } catch (error) {
        // If sharp can't read it, it might be HEIF
        if (error.message.includes('heif') || error.message.includes('HEIF') || 
            error.message.includes('Unsupported') || error.message.includes('Bitstream not supported')) {
            return true;
        }
        return false;
    }
}

// Convert HEIF to JPEG
async function convertHeifToJpeg(sourcePath, outputPath) {
    // If source and output are the same, use a temporary file
    const isSameFile = path.resolve(sourcePath) === path.resolve(outputPath);
    const tempPath = isSameFile ? outputPath + '.tmp.jpg' : outputPath;
    
    try {
        // Try to convert using sharp
        // Sharp should handle HEIF if libvips is compiled with HEIF support
        await sharp(sourcePath)
            .jpeg({ quality: 90 })
            .toFile(tempPath);
        
        // If we used a temp file, replace the original
        if (isSameFile) {
            await fs.unlink(sourcePath); // Delete original HEIF
            await fs.rename(tempPath, outputPath); // Rename temp to final
        }
        
        return true;
    } catch (error) {
        // Clean up temp file if it exists
        if (isSameFile) {
            try {
                await fs.unlink(tempPath);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        
        console.error(`  ❌ Error converting with sharp: ${error.message}`);
        
        // If sharp fails, the system might not have HEIF support
        // Try using ImageMagick if available
        try {
            const { execSync } = require('child_process');
            const magickCommand = `magick convert "${sourcePath}" "${tempPath}"`;
            execSync(magickCommand, { stdio: 'inherit' });
            
            // If we used a temp file, replace the original
            if (isSameFile) {
                await fs.unlink(sourcePath); // Delete original HEIF
                await fs.rename(tempPath, outputPath); // Rename temp to final
            }
            
            return true;
        } catch (magickError) {
            console.error(`  ⚠️  ImageMagick also failed or not installed.`);
            console.error(`  💡 Manual conversion options:`);
            console.error(`     1. Install ImageMagick: https://imagemagick.org/script/download.php`);
            console.error(`     2. Use command: magick convert "${sourcePath}" "${outputPath}"`);
            console.error(`     3. Use an online converter (e.g., cloudconvert.com)`);
            console.error(`     4. Open in image editor and save as JPEG`);
            
            return false;
        }
    }
}

// Find and convert HEIF images in a directory
async function convertHeifInDirectory(dirPath) {
    try {
        const files = await fs.readdir(dirPath);
        const imageFiles = files.filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ['.heic', '.heif', '.jpg', '.jpeg'].includes(ext);
        });
        
        const conversions = [];
        
        for (const file of imageFiles) {
            const filePath = path.join(dirPath, file);
            
            try {
                // Check if it's HEIF format
                const isHeif = await isHeifFormat(filePath);
                
                if (isHeif) {
                    // Determine output filename
                    const ext = path.extname(file);
                    const baseName = path.basename(file, ext);
                    const outputPath = path.join(dirPath, `${baseName}.jpg`);
                    
                    console.log(`  🔄 Converting: ${file} → ${baseName}.jpg`);
                    
                    const success = await convertHeifToJpeg(filePath, outputPath);
                    
                    if (success) {
                        conversions.push({ source: file, output: `${baseName}.jpg`, success: true });
                        console.log(`  ✅ Converted: ${file} → ${baseName}.jpg`);
                        
                        // Optionally remove original HEIF file
                        // Uncomment the next line if you want to delete originals
                        // await fs.unlink(filePath);
                    } else {
                        conversions.push({ source: file, output: `${baseName}.jpg`, success: false });
                    }
                }
            } catch (error) {
                // Skip files that can't be checked
                console.warn(`  ⚠️  Could not check ${file}: ${error.message}`);
            }
        }
        
        return conversions;
    } catch (error) {
        console.error(`  ❌ Error reading directory: ${error.message}`);
        return [];
    }
}

// Main function
async function main() {
    console.log('🔄 Converting HEIF/HEIC images to JPEG...\n');
    
    // Find the two problematic plants from the error messages
    const problematicPlants = [
        'begonia-schmidtiana',
        'ceropegia-woodii'
    ];
    
    let totalConverted = 0;
    let totalFailed = 0;
    
    // Process problematic plants first
    for (const plantFolder of problematicPlants) {
        const plantDir = path.join(IMAGES_DIR, plantFolder);
        
        try {
            await fs.access(plantDir);
            console.log(`\n📁 Processing: ${plantFolder}`);
            
            const conversions = await convertHeifInDirectory(plantDir);
            
            for (const conv of conversions) {
                if (conv.success) {
                    totalConverted++;
                } else {
                    totalFailed++;
                }
            }
        } catch (error) {
            console.log(`  ⚠️  Directory not found: ${plantFolder}`);
        }
    }
    
    // Optionally: scan all plant directories for HEIF files
    console.log('\n🔍 Scanning all plant directories for HEIF files...');
    
    try {
        const plantDirs = await fs.readdir(IMAGES_DIR);
        
        for (const plantDir of plantDirs) {
            const dirPath = path.join(IMAGES_DIR, plantDir);
            
            try {
                const stat = await fs.stat(dirPath);
                if (stat.isDirectory() && !problematicPlants.includes(plantDir)) {
                    const conversions = await convertHeifInDirectory(dirPath);
                    
                    for (const conv of conversions) {
                        if (conv.success) {
                            totalConverted++;
                            console.log(`  ✅ Found and converted HEIF in ${plantDir}`);
                        } else {
                            totalFailed++;
                        }
                    }
                }
            } catch (error) {
                // Skip files that aren't directories
            }
        }
    } catch (error) {
        console.error(`❌ Error scanning directories: ${error.message}`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`  ✅ Converted: ${totalConverted}`);
    console.log(`  ❌ Failed: ${totalFailed}`);
    console.log('='.repeat(50));
    
    if (totalFailed > 0) {
        console.log('\n💡 For failed conversions, you may need to:');
        console.log('   1. Install ImageMagick: https://imagemagick.org/script/download.php');
        console.log('   2. Use command: magick convert input.heic output.jpg');
        console.log('   3. Or use an online converter');
    }
}

// Run the script
main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

