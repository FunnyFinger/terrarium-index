const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const imagesDir = path.join(__dirname, '..', 'images');

const jsonFiles = fs.readdirSync(plantsDir).filter(f => f.endsWith('.json') && f !== 'index.json');
const imageFolders = fs.readdirSync(imagesDir).filter(f => {
    const fullPath = path.join(imagesDir, f);
    return fs.statSync(fullPath).isDirectory();
});

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
    
    // Skip Alocasia boyceana itself
    if (content.scientificName === 'Alocasia boyceana') {
        return;
    }
    
    const hasOwnImages = plantHasOwnImages(content);
    
    // Remove wrong placeholder from imageUrl (always remove if it's a wrong placeholder)
    if (content.imageUrl && wrongPlaceholders.includes(content.imageUrl)) {
        // Only keep it if this IS Alocasia boyceana (already skipped above)
        // For all other plants, remove wrong placeholder
        content.imageUrl = '';
        needsUpdate = true;
    }
    
    // Remove wrong placeholders from images array
    if (content.images && Array.isArray(content.images)) {
        const originalLength = content.images.length;
        content.images = content.images.filter(img => !wrongPlaceholders.includes(img));
        
        if (content.images.length !== originalLength) {
            needsUpdate = true;
        }
        
        // If imageUrl was cleared but images array has valid images, set imageUrl to first
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

