const fs = require('fs').promises;
const path = require('path');

/**
 * Fix Begonia rex image folder and file names to match standard convention
 */
async function fixBegoniaRexImages() {
    const imagesDir = path.join(__dirname, '..', 'images');
    const oldFolder = 'Begonia-rex';
    const newFolder = 'begonia-rex';
    const oldFolderPath = path.join(imagesDir, oldFolder);
    const newFolderPath = path.join(imagesDir, newFolder);
    
    try {
        // Check if old folder exists
        await fs.access(oldFolderPath);
        console.log(`✅ Found folder: ${oldFolder}`);
        
        // Check if new folder already exists
        let folderExists = false;
        try {
            await fs.access(newFolderPath);
            folderExists = true;
            console.log(`⚠️  Folder ${newFolder} already exists`);
        } catch {
            // Folder doesn't exist, we can rename
        }
        
        if (!folderExists) {
            // Rename folder to lowercase
            await fs.rename(oldFolderPath, newFolderPath);
            console.log(`✅ Renamed folder: ${oldFolder} → ${newFolder}`);
        }
        
        // Rename files in the folder
        const files = await fs.readdir(newFolderPath);
        const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
        
        console.log(`\n📁 Renaming files in ${newFolder}...`);
        
        for (const file of imageFiles) {
            const oldFilePath = path.join(newFolderPath, file);
            
            // Extract number from filename (e.g., "00174-begonia-1.jpg" → "1")
            const numberMatch = file.match(/-(\d+)\./);
            if (numberMatch) {
                const number = numberMatch[1];
                const ext = path.extname(file);
                const newFileName = `begonia-rex-${number}${ext}`;
                const newFilePath = path.join(newFolderPath, newFileName);
                
                // Check if new filename already exists
                try {
                    await fs.access(newFilePath);
                    console.log(`  ⏭️  Skipping ${file} (${newFileName} already exists)`);
                } catch {
                    await fs.rename(oldFilePath, newFilePath);
                    console.log(`  ✅ ${file} → ${newFileName}`);
                }
            } else {
                console.log(`  ⚠️  Could not extract number from ${file}, skipping`);
            }
        }
        
        console.log(`\n✅ Done! Begonia rex images are now using standard naming convention.`);
        console.log(`   Folder: ${newFolder}`);
        console.log(`   Files: begonia-rex-1.jpg, begonia-rex-2.jpg, begonia-rex-3.jpg`);
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`❌ Folder ${oldFolder} not found. Images may have already been renamed.`);
        } else {
            console.error(`❌ Error: ${error.message}`);
        }
    }
}

// Run the script
if (require.main === module) {
    fixBegoniaRexImages().catch(console.error);
}

module.exports = { fixBegoniaRexImages };

