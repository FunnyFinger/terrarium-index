const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const imagesDir = path.join(__dirname, '..', 'images');

// Get all JSON files
const jsonFiles = fs.readdirSync(plantsDir).filter(f => f.endsWith('.json') && f !== 'index.json');

// Get all image folders (case-sensitive)
const imageFolders = fs.readdirSync(imagesDir).filter(f => {
    const fullPath = path.join(imagesDir, f);
    return fs.statSync(fullPath).isDirectory();
});

console.log(`Fixing image paths in ${jsonFiles.length} plant files...\n`);

function normalizeFolderName(name) {
    return name.toLowerCase().replace(/^\d{5}-/, '');
}

function findMatchingFolder(jsonFolderName, scientificName) {
    const normalizedJson = normalizeFolderName(jsonFolderName);
    
    // Exact match (case-insensitive)
    const exactMatch = imageFolders.find(f => f.toLowerCase() === jsonFolderName.toLowerCase());
    if (exactMatch) return exactMatch;
    
    // Normalized match
    const normalizedMatch = imageFolders.find(f => normalizeFolderName(f) === normalizedJson);
    if (normalizedMatch) return normalizedMatch;
    
    // Scientific name match
    if (scientificName) {
        const scientificSlug = scientificName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const scientificMatch = imageFolders.find(f => {
            const normalized = normalizeFolderName(f);
            return normalized === scientificSlug || normalized.includes(scientificSlug.split('-')[0]);
        });
        if (scientificMatch) return scientificMatch;
    }
    
    return null;
}

function getActualImageFiles(folderName) {
    const folderPath = path.join(imagesDir, folderName);
    if (!fs.existsSync(folderPath)) return [];
    
    const files = fs.readdirSync(folderPath)
        .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
        .sort()
        .map(f => `images/${folderName}/${f}`);
    
    return files;
}

let fixedCount = 0;
let skippedCount = 0;

jsonFiles.forEach(jsonFile => {
    const filePath = path.join(plantsDir, jsonFile);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let needsUpdate = false;
    
    // Fix imageUrl
    if (content.imageUrl && content.imageUrl.startsWith('images/')) {
        const imagePathMatch = content.imageUrl.match(/images\/([^\/]+)\/(.+)$/);
        if (imagePathMatch) {
            const jsonFolderName = imagePathMatch[1];
            const fileName = imagePathMatch[2];
            const matchingFolder = findMatchingFolder(jsonFolderName, content.scientificName);
            
            if (matchingFolder && matchingFolder !== jsonFolderName) {
                // Check if file exists in correct folder
                const actualFiles = getActualImageFiles(matchingFolder);
                if (actualFiles.length > 0) {
                    // Try to find matching filename (case-insensitive)
                    const matchingFile = actualFiles.find(f => {
                        const fName = f.split('/').pop();
                        return fName.toLowerCase() === fileName.toLowerCase();
                    });
                    
                    if (matchingFile) {
                        content.imageUrl = matchingFile;
                        needsUpdate = true;
                    } else if (actualFiles[0]) {
                        // Use first file if exact match not found
                        content.imageUrl = actualFiles[0];
                        needsUpdate = true;
                    }
                }
            } else if (matchingFolder) {
                // Folder name matches, but check filename case
                const actualFiles = getActualImageFiles(matchingFolder);
                const matchingFile = actualFiles.find(f => {
                    const fName = f.split('/').pop();
                    return fName.toLowerCase() === fileName.toLowerCase();
                });
                
                if (matchingFile && matchingFile !== content.imageUrl) {
                    content.imageUrl = matchingFile;
                    needsUpdate = true;
                }
            }
        }
    }
    
    // Fix images array
    if (content.images && Array.isArray(content.images)) {
        const fixedImages = [];
        const usedPaths = new Set();
        
        content.images.forEach(imgPath => {
            if (!imgPath || !imgPath.startsWith('images/')) {
                if (imgPath) fixedImages.push(imgPath); // Keep non-image paths
                return;
            }
            
            const imagePathMatch = imgPath.match(/images\/([^\/]+)\/(.+)$/);
            if (imagePathMatch) {
                const jsonFolderName = imagePathMatch[1];
                const fileName = imagePathMatch[2];
                const matchingFolder = findMatchingFolder(jsonFolderName, content.scientificName);
                
                if (matchingFolder) {
                    const actualFiles = getActualImageFiles(matchingFolder);
                    const matchingFile = actualFiles.find(f => {
                        const fName = f.split('/').pop();
                        return fName.toLowerCase() === fileName.toLowerCase();
                    });
                    
                    if (matchingFile && !usedPaths.has(matchingFile)) {
                        fixedImages.push(matchingFile);
                        usedPaths.add(matchingFile);
                        if (matchingFile !== imgPath) needsUpdate = true;
                    } else if (matchingFile && usedPaths.has(matchingFile)) {
                        // Duplicate, skip
                        needsUpdate = true;
                    } else if (actualFiles.length > 0 && !usedPaths.has(actualFiles[0])) {
                        // Use first file if exact match not found
                        fixedImages.push(actualFiles[0]);
                        usedPaths.add(actualFiles[0]);
                        needsUpdate = true;
                    }
                } else {
                    // Folder not found, keep original (might be intentional)
                    if (!usedPaths.has(imgPath)) {
                        fixedImages.push(imgPath);
                        usedPaths.add(imgPath);
                    } else {
                        needsUpdate = true; // Remove duplicate
                    }
                }
            } else {
                fixedImages.push(imgPath);
            }
        });
        
        // Ensure imageUrl is in images array
        if (content.imageUrl && !fixedImages.includes(content.imageUrl)) {
            fixedImages.unshift(content.imageUrl);
            needsUpdate = true;
        }
        
        content.images = fixedImages;
    }
    
    if (needsUpdate) {
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
        fixedCount++;
        console.log(`✅ Fixed: ${content.name} (${jsonFile})`);
    } else {
        skippedCount++;
    }
});

console.log(`\n📊 Summary:`);
console.log(`   Fixed: ${fixedCount} files`);
console.log(`   Skipped (no changes needed): ${skippedCount} files`);
console.log(`   Total: ${jsonFiles.length} files`);

