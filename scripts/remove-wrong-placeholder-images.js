const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const imagesDir = path.join(__dirname, '..', 'images');

// Get all JSON files
const jsonFiles = fs.readdirSync(plantsDir).filter(f => f.endsWith('.json') && f !== 'index.json');

// Get all image folders
const imageFolders = fs.readdirSync(imagesDir).filter(f => {
    const fullPath = path.join(imagesDir, f);
    return fs.statSync(fullPath).isDirectory();
});

console.log(`Checking for wrong placeholder images...\n`);

let fixedCount = 0;
const wrongPlaceholders = [
    'images/alocasia-boyceana/alocasia-boyceana-1.jpg',
    'images/alocasia-boyceana/alocasia-boyceana-2.jpg',
    'images/alocasia-boyceana/alocasia-boyceana-3.jpg'
];

jsonFiles.forEach(jsonFile => {
    const filePath = path.join(plantsDir, jsonFile);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let needsUpdate = false;
    
    // Check if imageUrl is a wrong placeholder
    if (content.imageUrl && wrongPlaceholders.includes(content.imageUrl)) {
        // Check if this plant actually has its own image folder
        const scientificSlug = content.scientificName?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const hasOwnFolder = imageFolders.some(f => {
            const normalized = f.toLowerCase().replace(/^\d{5}-/, '');
            return normalized === scientificSlug || normalized.includes(scientificSlug?.split('-')[0]);
        });
        
        if (!hasOwnFolder) {
            // This plant doesn't have its own images, remove the wrong placeholder
            content.imageUrl = '';
            needsUpdate = true;
        }
    }
    
    // Check images array for wrong placeholders
    if (content.images && Array.isArray(content.images)) {
        const scientificSlug = content.scientificName?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const hasOwnFolder = imageFolders.some(f => {
            const normalized = f.toLowerCase().replace(/^\d{5}-/, '');
            return normalized === scientificSlug || normalized.includes(scientificSlug?.split('-')[0]);
        });
        
        if (!hasOwnFolder) {
            // Remove all wrong placeholder images
            const originalLength = content.images.length;
            content.images = content.images.filter(img => !wrongPlaceholders.includes(img));
            
            // Also remove any images that don't exist
            content.images = content.images.filter(img => {
                if (!img || !img.startsWith('images/')) return false;
                const fullPath = path.join(__dirname, '..', img);
                return fs.existsSync(fullPath);
            });
            
            if (content.images.length !== originalLength) {
                needsUpdate = true;
            }
            
            // If imageUrl was removed and images array is empty, clear imageUrl
            if (!content.imageUrl && content.images.length > 0) {
                content.imageUrl = content.images[0];
            } else if (!content.imageUrl) {
                content.imageUrl = '';
            }
        } else {
            // Plant has its own folder, but might have wrong placeholders mixed in
            const originalLength = content.images.length;
            content.images = content.images.filter(img => !wrongPlaceholders.includes(img));
            
            if (content.images.length !== originalLength) {
                needsUpdate = true;
            }
        }
    }
    
    if (needsUpdate) {
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
        fixedCount++;
        console.log(`✅ Fixed: ${content.name} (${jsonFile})`);
        console.log(`   Removed wrong placeholder images`);
    }
});

console.log(`\n📊 Summary:`);
console.log(`   Fixed: ${fixedCount} files`);
console.log(`   Total checked: ${jsonFiles.length} files`);

