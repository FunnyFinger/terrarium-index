const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const imagesDir = path.join(__dirname, '..', 'images');

// Get all JSON files
const jsonFiles = fs.readdirSync(plantsDir).filter(f => f.endsWith('.json'));

// Get all image folders
const imageFolders = fs.readdirSync(imagesDir).filter(f => {
    const fullPath = path.join(imagesDir, f);
    return fs.statSync(fullPath).isDirectory();
});

console.log(`Fixing image paths in ${jsonFiles.length} plant files...\n`);

let fixedCount = 0;
const fixes = [];

jsonFiles.forEach(jsonFile => {
    const filePath = path.join(plantsDir, jsonFile);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!content.scientificName) return;
    
    // Convert scientific name to folder name format (lowercase, spaces to hyphens)
    const scientificNameSlug = content.scientificName.toLowerCase().replace(/\s+/g, '-');
    
    // Find matching folder
    const matchingFolder = imageFolders.find(f => {
        // Exact match
        if (f === scientificNameSlug) return true;
        // Match by removing common suffixes/variations
        const folderBase = f.split('-').slice(0, 2).join('-');
        const nameBase = scientificNameSlug.split('-').slice(0, 2).join('-');
        return folderBase === nameBase;
    });
    
    if (matchingFolder) {
        // Check if current path is wrong
        const needsFix = !content.imageUrl || !content.imageUrl.includes(matchingFolder);
        
        if (needsFix) {
            // Get all images in the folder
            const folderPath = path.join(imagesDir, matchingFolder);
            const imageFiles = fs.readdirSync(folderPath)
                .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
                .sort()
                .map(f => `images/${matchingFolder}/${f}`);
            
            if (imageFiles.length > 0) {
                content.imageUrl = imageFiles[0];
                content.images = imageFiles;
                
                fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
                
                fixes.push({
                    file: jsonFile,
                    plant: content.name,
                    scientificName: content.scientificName,
                    oldPath: content.imageUrl || 'none',
                    newPath: imageFiles[0],
                    imageCount: imageFiles.length
                });
                
                fixedCount++;
            }
        }
    }
});

console.log(`✅ Fixed ${fixedCount} files:\n`);

fixes.forEach(fix => {
    console.log(`✓ ${fix.plant} (${fix.scientificName})`);
    console.log(`  ${fix.file}`);
    console.log(`  Old: ${fix.oldPath}`);
    console.log(`  New: ${fix.newPath} (${fix.imageCount} images)`);
    console.log('');
});

console.log(`\n📊 Summary: Fixed ${fixedCount} files`);

