const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
const imagesDir = path.join(__dirname, '..', 'images');

function slugify(name) {
    if (!name) return null;
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function getImagesForSlug(slug) {
    if (!slug) return [];
    const folder = path.join(imagesDir, slug);
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        return [];
    }

    return fs.readdirSync(folder)
        .filter((file) => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
        .map((file) => {
            const match = file.match(/-(\d+)\.(jpg|jpeg|png|gif|webp)$/i);
            const number = match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
            return { file, number };
        })
        .sort((a, b) => {
            if (a.number === b.number) {
                return a.file.localeCompare(b.file);
            }
            return a.number - b.number;
        })
        .map(({ file }) => `images/${slug}/${file}`);
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
}

const plantFiles = fs.readdirSync(plantsDir).filter((file) => file.endsWith('.json'));

console.log(`🔄 Syncing image references for ${plantFiles.length} plants...\n`);

let updated = 0;
const updates = [];

plantFiles.forEach((file) => {
    const filePath = path.join(plantsDir, file);
    const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const slug = slugify(plant.scientificName || plant.name);
    const actualImages = getImagesForSlug(slug);

    const currentImages = Array.isArray(plant.images) ? plant.images : [];
    const currentMain = plant.imageUrl || null;
    const desiredMain = actualImages.length > 0 ? actualImages[0] : null;

    const needsUpdate = !arraysEqual(currentImages, actualImages) || currentMain !== desiredMain;

    if (needsUpdate) {
        plant.images = actualImages;
        plant.imageUrl = desiredMain;

        fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        updated++;

        updates.push({
            file,
            name: plant.name,
            scientificName: plant.scientificName,
            imageCount: actualImages.length
        });
    }
});

if (updates.length === 0) {
    console.log('✅ All plants already reference the correct images.');
} else {
    updates.forEach((update) => {
        console.log(`✓ ${update.name || update.file}`);
        if (update.scientificName) {
            console.log(`  Scientific name: ${update.scientificName}`);
        }
        console.log(`  Updated images: ${update.imageCount}`);
        console.log(`  File: ${update.file}`);
        console.log('');
    });

    console.log(`📊 Summary: Updated ${updated} plant files.`);
    console.log('👉 Run `node scripts/sync-images-with-data.js` again whenever you add/remove plant images.');
}

