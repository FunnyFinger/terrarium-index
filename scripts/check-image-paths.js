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

console.log(`Checking ${jsonFiles.length} plant files against ${imageFolders.length} image folders...\n`);

const issues = [];

jsonFiles.forEach(jsonFile => {
    const filePath = path.join(plantsDir, jsonFile);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (content.imageUrl) {
        // Extract folder name from imageUrl (e.g., "images/vesicularia-montagnei/vesicularia-montagnei-1.jpg" -> "vesicularia-montagnei")
        const imagePathMatch = content.imageUrl.match(/images\/([^\/]+)\//);
        if (imagePathMatch) {
            const jsonFolderName = imagePathMatch[1];
            const folderExists = imageFolders.includes(jsonFolderName);
            
            if (!folderExists) {
                // Try to find matching folder by scientific name
                const scientificName = content.scientificName?.toLowerCase().replace(/\s+/g, '-');
                const matchingFolder = imageFolders.find(f => f === scientificName || f.includes(scientificName?.split('-')[0]));
                
                issues.push({
                    file: jsonFile,
                    plant: content.name,
                    scientificName: content.scientificName,
                    jsonPath: jsonFolderName,
                    folderExists: false,
                    suggestedFolder: matchingFolder || null,
                    imageUrl: content.imageUrl
                });
            }
        }
    }
    
    // Also check images array
    if (content.images && Array.isArray(content.images)) {
        content.images.forEach(imgPath => {
            const imagePathMatch = imgPath.match(/images\/([^\/]+)\//);
            if (imagePathMatch) {
                const jsonFolderName = imagePathMatch[1];
                const folderExists = imageFolders.includes(jsonFolderName);
                
                if (!folderExists && !issues.find(i => i.file === jsonFile && i.jsonPath === jsonFolderName)) {
                    const scientificName = content.scientificName?.toLowerCase().replace(/\s+/g, '-');
                    const matchingFolder = imageFolders.find(f => f === scientificName || f.includes(scientificName?.split('-')[0]));
                    
                    issues.push({
                        file: jsonFile,
                        plant: content.name,
                        scientificName: content.scientificName,
                        jsonPath: jsonFolderName,
                        folderExists: false,
                        suggestedFolder: matchingFolder || null,
                        imageUrl: imgPath
                    });
                }
            }
        });
    }
});

console.log(`Found ${issues.length} issues:\n`);

issues.forEach(issue => {
    console.log(`❌ ${issue.plant} (${issue.scientificName})`);
    console.log(`   File: ${issue.file}`);
    console.log(`   JSON path: images/${issue.jsonPath}/`);
    console.log(`   Suggested: ${issue.suggestedFolder ? `images/${issue.suggestedFolder}/` : 'NO MATCH FOUND'}`);
    console.log(`   Current imageUrl: ${issue.imageUrl}`);
    console.log('');
});

// Summary
const uniqueIssues = [...new Set(issues.map(i => i.file))];
console.log(`\n📊 Summary: ${uniqueIssues.length} unique files with issues out of ${jsonFiles.length} total files`);

