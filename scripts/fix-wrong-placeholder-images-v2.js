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

console.log(`Removing wrong placeholder images from plants without their own images...\n`);

function normalizeFolderName(name) {
    return name.toLowerCase().replace(/^\d{5}-/, '');
}

function plantHasOwnImages(plant) {
    const scientificSlug = plant.scientificName?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!scientificSlug) return false;
    
    return imageFolders.some(f => {
        const normalized = normalizeFolderName(f);
        return normalized === scientificSlug || normalized.includes(scientificSlug.split('-')[0]);
    });
}

const wrongPlaceholders = [
    'images/alocasia-boyceana/alocasia-boyceana-1.jpg',
    'images/alocasia-boyceana/alocasia-boyceana-2.jpg',
    'images/alocasia-boyceana/alocasia-boyceana-3.jpg'
];

let fixedCount = 0;

jsonFiles.forEach(jsonFile => {
    const filePath = path.join(plantsDir, jsonFile);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let needsUpdate = false;
    
    // Skip Alocasia boyceana itself - it should keep its images
    if (content.scientificName === 'Alocasia boyceana') {
        return;
    }
    
    const hasOwnImages = plantHasOwnImages(content);
    
    // Check imageUrl
    if (content.imageUrl && wrongPlaceholders.includes(content.imageUrl)) {
        if (!hasOwnImages) {
            content.imageUrl = '';
            needsUpdate = true;
        }
    }
    
    // Check images array
    if (content.images && Array.isArray(content.images)) {
        const originalLength = content.images.length;
        
        // Remove wrong placeholders
        content.images = content.images.filter(img => !wrongPlaceholders.includes(img));
        
        // If plant doesn't have own images, also remove any non-existent image paths
        if (!hasOwnImages) {
            content.images = content.images.filter(img => {
                if (!img || !img.startsWith('images/')) return false;
                const fullPath = path.join(__dirname, '..', img);
                return fs.existsSync(fullPath);
            });
        }
        
        if (content.images.length !== originalLength) {
            needsUpdate = true;
        }
        
        // If imageUrl was removed and images array has valid images, set imageUrl to first
        if (!content.imageUrl && content.images.length > 0) {
            content.imageUrl = content.images[0];
            needsUpdate = true;
        }
    }
    
    if (needsUpdate) {
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
        fixedCount++;
        console.log(`✅ Fixed: ${content.name} (${jsonFile})`);
    }
});

console.log(`\n📊 Summary:`);
console.log(`   Fixed: ${fixedCount} files`);
console.log(`   Total checked: ${jsonFiles.length} files`);

