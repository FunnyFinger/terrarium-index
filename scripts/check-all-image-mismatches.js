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

console.log(`Checking ${jsonFiles.length} plant files against ${imageFolders.length} image folders...\n`);

const issues = [];

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

function checkImageFileExists(imagePath) {
    const fullPath = path.join(__dirname, '..', imagePath);
    return fs.existsSync(fullPath);
}

jsonFiles.forEach(jsonFile => {
    const filePath = path.join(plantsDir, jsonFile);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const plantIssues = [];
    
    // Check imageUrl
    if (content.imageUrl && content.imageUrl.startsWith('images/')) {
        const imagePathMatch = content.imageUrl.match(/images\/([^\/]+)\/(.+)$/);
        if (imagePathMatch) {
            const jsonFolderName = imagePathMatch[1];
            const fileName = imagePathMatch[2];
            const folderExists = imageFolders.includes(jsonFolderName);
            const fileExists = checkImageFileExists(content.imageUrl);
            
            if (!folderExists || !fileExists) {
                const matchingFolder = findMatchingFolder(jsonFolderName, content.scientificName);
                
                if (matchingFolder && matchingFolder !== jsonFolderName) {
                    // Check if file exists in correct folder
                    const correctPath = `images/${matchingFolder}/${fileName}`;
                    const correctFileExists = checkImageFileExists(correctPath);
                    
                    // Also try with normalized filename
                    let normalizedFileName = fileName;
                    if (fileName.match(/^[A-Z]/)) {
                        normalizedFileName = fileName.charAt(0).toLowerCase() + fileName.slice(1);
                    }
                    const normalizedPath = `images/${matchingFolder}/${normalizedFileName}`;
                    const normalizedExists = checkImageFileExists(normalizedPath);
                    
                    plantIssues.push({
                        type: 'imageUrl',
                        jsonPath: content.imageUrl,
                        folderMismatch: !folderExists,
                        fileMissing: !fileExists,
                        actualFolder: jsonFolderName,
                        correctFolder: matchingFolder,
                        correctPath: correctFileExists ? correctPath : (normalizedExists ? normalizedPath : null),
                        fileName: fileName
                    });
                } else if (!folderExists) {
                    plantIssues.push({
                        type: 'imageUrl',
                        jsonPath: content.imageUrl,
                        folderMismatch: true,
                        fileMissing: true,
                        actualFolder: jsonFolderName,
                        correctFolder: null,
                        correctPath: null,
                        fileName: fileName
                    });
                } else if (!fileExists) {
                    plantIssues.push({
                        type: 'imageUrl',
                        jsonPath: content.imageUrl,
                        folderMismatch: false,
                        fileMissing: true,
                        actualFolder: jsonFolderName,
                        correctFolder: jsonFolderName,
                        correctPath: null,
                        fileName: fileName
                    });
                }
            }
        }
    }
    
    // Check images array
    if (content.images && Array.isArray(content.images)) {
        content.images.forEach((imgPath, idx) => {
            if (!imgPath || !imgPath.startsWith('images/')) return;
            
            const imagePathMatch = imgPath.match(/images\/([^\/]+)\/(.+)$/);
            if (imagePathMatch) {
                const jsonFolderName = imagePathMatch[1];
                const fileName = imagePathMatch[2];
                const folderExists = imageFolders.includes(jsonFolderName);
                const fileExists = checkImageFileExists(imgPath);
                
                if (!folderExists || !fileExists) {
                    const matchingFolder = findMatchingFolder(jsonFolderName, content.scientificName);
                    
                    if (matchingFolder && matchingFolder !== jsonFolderName) {
                        const correctPath = `images/${matchingFolder}/${fileName}`;
                        const correctFileExists = checkImageFileExists(correctPath);
                        
                        let normalizedFileName = fileName;
                        if (fileName.match(/^[A-Z]/)) {
                            normalizedFileName = fileName.charAt(0).toLowerCase() + fileName.slice(1);
                        }
                        const normalizedPath = `images/${matchingFolder}/${normalizedFileName}`;
                        const normalizedExists = checkImageFileExists(normalizedPath);
                        
                        plantIssues.push({
                            type: 'images',
                            index: idx,
                            jsonPath: imgPath,
                            folderMismatch: !folderExists,
                            fileMissing: !fileExists,
                            actualFolder: jsonFolderName,
                            correctFolder: matchingFolder,
                            correctPath: correctFileExists ? correctPath : (normalizedExists ? normalizedPath : null),
                            fileName: fileName
                        });
                    } else if (!folderExists) {
                        plantIssues.push({
                            type: 'images',
                            index: idx,
                            jsonPath: imgPath,
                            folderMismatch: true,
                            fileMissing: true,
                            actualFolder: jsonFolderName,
                            correctFolder: null,
                            correctPath: null,
                            fileName: fileName
                        });
                    } else if (!fileExists) {
                        plantIssues.push({
                            type: 'images',
                            index: idx,
                            jsonPath: imgPath,
                            folderMismatch: false,
                            fileMissing: true,
                            actualFolder: jsonFolderName,
                            correctFolder: jsonFolderName,
                            correctPath: null,
                            fileName: fileName
                        });
                    }
                }
            }
        });
    }
    
    // Check for inconsistencies between imageUrl and images array
    if (content.imageUrl && content.images && content.images.length > 0) {
        const imageUrlFolder = content.imageUrl.match(/images\/([^\/]+)\//)?.[1];
        const imagesFolders = content.images.map(img => img.match(/images\/([^\/]+)\//)?.[1]).filter(Boolean);
        const uniqueFolders = [...new Set(imagesFolders)];
        
        if (imageUrlFolder && uniqueFolders.length > 0) {
            const allFoldersMatch = uniqueFolders.every(f => f.toLowerCase() === imageUrlFolder.toLowerCase());
            if (!allFoldersMatch) {
                plantIssues.push({
                    type: 'inconsistency',
                    imageUrlFolder: imageUrlFolder,
                    imagesFolders: uniqueFolders,
                    message: 'imageUrl and images array use different folder names'
                });
            }
        }
    }
    
    if (plantIssues.length > 0) {
        issues.push({
            file: jsonFile,
            plant: content.name,
            scientificName: content.scientificName,
            issues: plantIssues
        });
    }
});

console.log(`Found ${issues.length} files with issues:\n`);

issues.forEach(issue => {
    console.log(`❌ ${issue.plant} (${issue.scientificName})`);
    console.log(`   File: ${issue.file}`);
    issue.issues.forEach(i => {
        if (i.type === 'inconsistency') {
            console.log(`   ⚠️  ${i.type}: ${i.message}`);
            console.log(`      imageUrl folder: ${i.imageUrlFolder}`);
            console.log(`      images folders: ${i.imagesFolders.join(', ')}`);
        } else {
            const typeLabel = i.type === 'imageUrl' ? 'imageUrl' : `images[${i.index}]`;
            console.log(`   ⚠️  ${typeLabel}: ${i.jsonPath}`);
            if (i.folderMismatch) {
                console.log(`      Folder mismatch: "${i.actualFolder}" → should be "${i.correctFolder || 'NOT FOUND'}"`);
            }
            if (i.fileMissing) {
                console.log(`      File missing: ${i.fileName}`);
            }
            if (i.correctPath) {
                console.log(`      ✅ Correct path exists: ${i.correctPath}`);
            }
        }
    });
    console.log('');
});

// Summary
const folderMismatches = issues.filter(i => i.issues.some(iss => iss.folderMismatch)).length;
const fileMissing = issues.filter(i => i.issues.some(iss => iss.fileMissing)).length;
const inconsistencies = issues.filter(i => i.issues.some(iss => iss.type === 'inconsistency')).length;

console.log(`\n📊 Summary:`);
console.log(`   Total files with issues: ${issues.length}`);
console.log(`   Folder name mismatches: ${folderMismatches}`);
console.log(`   Missing image files: ${fileMissing}`);
console.log(`   Inconsistencies: ${inconsistencies}`);
console.log(`   Total files checked: ${jsonFiles.length}`);

