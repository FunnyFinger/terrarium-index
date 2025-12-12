const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const indexFile = path.join(plantsDir, 'index.json');

/**
 * Convert scientific name to slug format (matching image folder naming)
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
 * Get all JSON files with their current names
 */
function getAllJsonFiles() {
    return fs.readdirSync(plantsDir)
        .filter(f => f.endsWith('.json') && f !== 'index.json')
        .sort();
}

console.log('🔄 Renaming JSON files to use scientific names...\n');

const jsonFiles = getAllJsonFiles();
const renameMap = [];
const conflicts = [];
const newFilenames = new Set();

// First pass: determine new filenames
jsonFiles.forEach(oldFilename => {
    const filePath = path.join(plantsDir, oldFilename);
    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const scientificName = content.scientificName || content.name;
        
        if (!scientificName) {
            console.warn(`⚠️  ${oldFilename}: No scientific name found, skipping`);
            return;
        }
        
        let newFilename = scientificNameToSlug(scientificName);
        
        if (!newFilename) {
            console.warn(`⚠️  ${oldFilename}: Could not create slug from "${scientificName}", skipping`);
            return;
        }
        
        // Add .json extension
        newFilename = `${newFilename}.json`;
        
        // Check for conflicts
        if (newFilenames.has(newFilename)) {
            // Handle conflict by adding a suffix
            let counter = 1;
            let uniqueFilename = newFilename.replace('.json', `-${counter}.json`);
            while (newFilenames.has(uniqueFilename)) {
                counter++;
                uniqueFilename = newFilename.replace('.json', `-${counter}.json`);
            }
            newFilename = uniqueFilename;
            conflicts.push({
                old: oldFilename,
                new: newFilename,
                scientificName: scientificName,
                reason: 'duplicate'
            });
        }
        
        newFilenames.add(newFilename);
        
        // Only rename if filename actually changed
        if (oldFilename !== newFilename) {
            renameMap.push({
                old: oldFilename,
                new: newFilename,
                scientificName: scientificName,
                id: content.id
            });
        }
    } catch (err) {
        console.error(`❌ Error reading ${oldFilename}:`, err.message);
    }
});

console.log(`📊 Found ${jsonFiles.length} JSON files`);
console.log(`   ${renameMap.length} files need renaming`);
console.log(`   ${conflicts.length} filename conflicts resolved\n`);

if (conflicts.length > 0) {
    console.log('⚠️  Filename conflicts (resolved with suffixes):');
    conflicts.forEach(c => {
        console.log(`   ${c.old} → ${c.new} (${c.scientificName})`);
    });
    console.log('');
}

// Ask for confirmation (in a real script, you might want to add a prompt)
// For now, proceed with renaming

let renamedCount = 0;
let errorCount = 0;

// Second pass: perform actual renaming
renameMap.forEach(({ old, new: newName, scientificName, id }) => {
    const oldPath = path.join(plantsDir, old);
    const newPath = path.join(plantsDir, newName);
    
    try {
        // Check if target already exists (shouldn't happen due to conflict resolution)
        if (fs.existsSync(newPath)) {
            console.error(`❌ ${old}: Target ${newName} already exists, skipping`);
            errorCount++;
            return;
        }
        
        // Rename file
        fs.renameSync(oldPath, newPath);
        renamedCount++;
        console.log(`✅ ${old} → ${newName} (${scientificName})`);
    } catch (err) {
        console.error(`❌ Error renaming ${old}:`, err.message);
        errorCount++;
    }
});

// Update index.json
console.log('\n🔄 Updating index.json...');
try {
    const indexContent = fs.readFileSync(indexFile, 'utf8');
    const index = JSON.parse(indexContent);
    
    // Update files array with new filenames
    const newFiles = getAllJsonFiles().sort();
    index.files = newFiles;
    index.count = newFiles.length;
    
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated index.json with ${newFiles.length} files`);
} catch (err) {
    console.error(`❌ Error updating index.json:`, err.message);
}

console.log(`\n📊 Summary:`);
console.log(`   Total files: ${jsonFiles.length}`);
console.log(`   Renamed: ${renamedCount}`);
console.log(`   Errors: ${errorCount}`);
console.log(`   Conflicts resolved: ${conflicts.length}`);

if (renamedCount > 0) {
    console.log(`\n✨ Renaming complete! All files now use scientific name slugs.`);
}
