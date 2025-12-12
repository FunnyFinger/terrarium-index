const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const imagesDir = path.join(__dirname, '..', 'images');

/**
 * Convert scientific name to slug (matching folder naming convention)
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

// Get all plant JSON files
const jsonFiles = fs.readdirSync(plantsDir)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .sort();

// Get all image folders
const imageFolders = fs.readdirSync(imagesDir)
    .filter(f => {
        const fullPath = path.join(imagesDir, f);
        return fs.statSync(fullPath).isDirectory();
    })
    .sort();

console.log(`🔍 Scanning ${jsonFiles.length} plants and ${imageFolders.length} image folders...\n`);

// Build map: scientificNameSlug -> plant info
const plantMap = new Map();
const issues = [];
const renames = [];

jsonFiles.forEach(jsonFile => {
    try {
        const filePath = path.join(plantsDir, jsonFile);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (!content.scientificName) {
            return; // Skip plants without scientific names
        }
        
        const slug = scientificNameToSlug(content.scientificName);
        if (!slug) {
            return;
        }
        
        plantMap.set(slug, {
            file: jsonFile,
            name: content.name,
            scientificName: content.scientificName,
            slug: slug
        });
    } catch (err) {
        console.error(`❌ Error reading ${jsonFile}:`, err.message);
    }
});

// Check each image folder
imageFolders.forEach(folderName => {
    // Normalize folder name (strip any number prefix and lowercase for comparison)
    const normalizedFolder = folderName.replace(/^\d{5}-/, '').toLowerCase();
    
    // Find matching plant slug (case-insensitive)
    const matchingSlug = Array.from(plantMap.keys()).find(slug => slug.toLowerCase() === normalizedFolder);
    
    if (matchingSlug) {
        // Folder matches - check if it needs renaming (has prefix or wrong case)
        const expectedFolder = matchingSlug; // Use exact slug from plantMap
        const currentFolderNoPrefix = folderName.replace(/^\d{5}-/, '');
        
        if (folderName !== expectedFolder && currentFolderNoPrefix !== expectedFolder) {
            if (folderName.replace(/^\d{5}-/, '').toLowerCase() === expectedFolder.toLowerCase()) {
                // Case mismatch
                issues.push({
                    type: 'case_mismatch',
                    folder: folderName,
                    expected: expectedFolder,
                    plant: plantMap.get(matchingSlug)
                });
            } else {
                // Has prefix
                issues.push({
                    type: 'has_prefix',
                    folder: folderName,
                    expected: expectedFolder,
                    plant: plantMap.get(matchingSlug)
                });
            }
        }
    } else {
        // Folder doesn't match any plant - check if it's a close match
        let closestMatch = null;
        let closestSlug = null;
        
        // Try to find a plant that might match (e.g., "hoya-waymaniae-kipandi" -> "hoya-waymaniae")
        for (const [slug, plant] of plantMap.entries()) {
            const slugLower = slug.toLowerCase();
            if (normalizedFolder.startsWith(slugLower + '-') || normalizedFolder === slugLower) {
                closestMatch = plant;
                closestSlug = slug;
                break;
            }
        }
        
        if (closestMatch) {
            issues.push({
                type: 'mismatch',
                folder: folderName,
                expected: closestSlug,
                plant: closestMatch
            });
        } else {
            issues.push({
                type: 'orphan',
                folder: folderName,
                expected: null,
                plant: null
            });
        }
    }
});

// Report issues
console.log(`📊 Found ${issues.length} issues:\n`);

const prefixIssues = issues.filter(i => i.type === 'has_prefix');
const caseIssues = issues.filter(i => i.type === 'case_mismatch');
const mismatchIssues = issues.filter(i => i.type === 'mismatch');
const orphanIssues = issues.filter(i => i.type === 'orphan');

if (prefixIssues.length > 0) {
    console.log(`🔢 Folders with number prefixes (${prefixIssues.length}):`);
    prefixIssues.forEach(issue => {
        console.log(`   ${issue.folder} → should be ${issue.expected} (${issue.plant.name})`);
        renames.push({
            from: issue.folder,
            to: issue.expected,
            type: 'prefix'
        });
    });
    console.log('');
}

if (caseIssues.length > 0) {
    console.log(`🔤 Folders with case mismatches (${caseIssues.length}):`);
    caseIssues.forEach(issue => {
        console.log(`   ${issue.folder} → should be ${issue.expected} (${issue.plant.name})`);
        renames.push({
            from: issue.folder,
            to: issue.expected,
            type: 'case'
        });
    });
    console.log('');
}

if (mismatchIssues.length > 0) {
    console.log(`⚠️  Folders that don't match scientific names (${mismatchIssues.length}):`);
    mismatchIssues.forEach(issue => {
        console.log(`   ${issue.folder} → should be ${issue.expected} (${issue.plant.name} - ${issue.plant.scientificName})`);
        renames.push({
            from: issue.folder,
            to: issue.expected,
            type: 'mismatch'
        });
    });
    console.log('');
}

if (orphanIssues.length > 0) {
    console.log(`❓ Orphan folders (no matching plant found) (${orphanIssues.length}):`);
    orphanIssues.forEach(issue => {
        console.log(`   ${issue.folder}`);
    });
    console.log('');
}

// Perform renames
if (renames.length > 0) {
    console.log(`\n🔧 Fixing ${renames.length} folder name issues...\n`);
    
    let renamedCount = 0;
    let errorCount = 0;
    
    renames.forEach(({ from, to, type }) => {
        const fromPath = path.join(imagesDir, from);
        const toPath = path.join(imagesDir, to);
        
        try {
            // Check if target already exists
            if (fs.existsSync(toPath)) {
                // On case-insensitive file systems, this might be the same folder
                // Check if they're actually different
                const fromStat = fs.statSync(fromPath);
                const toStat = fs.statSync(toPath);
                
                // If they're the same folder (same inode on Unix, or same path on Windows)
                if (fromPath.toLowerCase() === toPath.toLowerCase()) {
                    console.log(`ℹ️  ${from} is already the correct case (case-insensitive file system)`);
                    // Still rename files inside if needed
                } else {
                    console.error(`⚠️  Cannot rename ${from} → ${to}: Target folder already exists`);
                    errorCount++;
                    return;
                }
            }
            
            // For case-only renames on case-insensitive systems, use temporary name
            if (type === 'case' && from.toLowerCase() === to.toLowerCase()) {
                const tempPath = path.join(imagesDir, `__temp_${Date.now()}_${from}`);
                fs.renameSync(fromPath, tempPath);
                fs.renameSync(tempPath, toPath);
                console.log(`✅ Renamed folder (case fix): ${from} → ${to}`);
            } else {
                // Regular rename
                fs.renameSync(fromPath, toPath);
                console.log(`✅ Renamed folder: ${from} → ${to}`);
            }
            renamedCount++;
            
            // Rename image files inside the folder
            const files = fs.readdirSync(toPath);
            files.forEach(file => {
                if (file.startsWith(from) && /\.(jpg|jpeg|png|gif|webp)$/i.test(file)) {
                    const newFileName = file.replace(new RegExp(`^${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), to);
                    const oldFilePath = path.join(toPath, file);
                    const newFilePath = path.join(toPath, newFileName);
                    
                    if (oldFilePath !== newFilePath) {
                        fs.renameSync(oldFilePath, newFilePath);
                        console.log(`   📄 Renamed file: ${file} → ${newFileName}`);
                    }
                }
            });
            
        } catch (err) {
            console.error(`❌ Error renaming ${from}:`, err.message);
            errorCount++;
        }
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`   Folders renamed: ${renamedCount}`);
    console.log(`   Errors: ${errorCount}`);
} else {
    console.log(`\n✅ No issues found! All folders match their plant scientific names.`);
}

// Check for missing folders (plants that should have folders but don't)
console.log(`\n🔍 Checking for plants without image folders...\n`);
const missingFolders = [];
for (const [slug, plant] of plantMap.entries()) {
    const folderExists = imageFolders.some(f => {
        const normalized = f.replace(/^\d{5}-/, '');
        return normalized === slug;
    });
    
    if (!folderExists) {
        missingFolders.push(plant);
    }
}

if (missingFolders.length > 0) {
    console.log(`📋 Plants without image folders (${missingFolders.length}):`);
    missingFolders.slice(0, 20).forEach(plant => {
        console.log(`   ${plant.name} (${plant.scientificName}) → expected folder: ${plant.slug}`);
    });
    if (missingFolders.length > 20) {
        console.log(`   ... and ${missingFolders.length - 20} more`);
    }
} else {
    console.log(`✅ All plants have corresponding image folders (or don't need them yet).`);
}

