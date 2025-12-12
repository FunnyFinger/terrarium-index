const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');

// Get all JSON files (excluding index.json)
const jsonFiles = fs.readdirSync(plantsDir)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .sort();

console.log(`🧹 Removing imageUrl and images fields from ${jsonFiles.length} JSON files...\n`);

let cleanedCount = 0;
let skippedCount = 0;
let errorCount = 0;

jsonFiles.forEach(jsonFile => {
    const filePath = path.join(plantsDir, jsonFile);
    
    try {
        // Read JSON file
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const originalContent = JSON.stringify(content, null, 2);
        
        // Check if imageUrl or images fields exist
        const hadImageUrl = 'imageUrl' in content;
        const hadImages = 'images' in content;
        
        if (!hadImageUrl && !hadImages) {
            skippedCount++;
            return; // No changes needed
        }
        
        // Remove imageUrl and images fields
        delete content.imageUrl;
        delete content.images;
        
        // Write cleaned JSON back
        const cleanedContent = JSON.stringify(content, null, 2) + '\n';
        fs.writeFileSync(filePath, cleanedContent, 'utf8');
        
        cleanedCount++;
        const changes = [];
        if (hadImageUrl) changes.push('imageUrl');
        if (hadImages) changes.push('images');
        console.log(`✅ ${jsonFile}: Removed ${changes.join(' and ')}`);
        
    } catch (err) {
        errorCount++;
        console.error(`❌ Error processing ${jsonFile}:`, err.message);
    }
});

console.log(`\n📊 Summary:`);
console.log(`   Cleaned: ${cleanedCount} files`);
console.log(`   Skipped (no image fields): ${skippedCount} files`);
console.log(`   Errors: ${errorCount} files`);
console.log(`   Total: ${jsonFiles.length} files`);

if (cleanedCount > 0) {
    console.log(`\n✨ All imageUrl and images fields have been removed from JSON files!`);
    console.log(`   Images are now automatically discovered from folders based on scientific names.`);
}

