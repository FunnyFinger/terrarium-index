/**
 * generate-preview-images.js
 *
 * For every existing image in images/plants/, images/supplies/, and images/vivariums/:
 *   1. Copies the original to slug-N-full.jpg  (full resolution, for fullscreen view)
 *   2. Resizes the original to max 480px        (the display version, replaces slug-N.jpg)
 *
 * Files already processed (a -full.jpg sibling already exists) are skipped.
 * Files that are already ≤ 480px on both sides are copied to -full.jpg but not resized.
 *
 * Usage:  node scripts/generate-preview-images.js
 *         node scripts/generate-preview-images.js --dry-run   (preview only, no writes)
 */

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const DRY_RUN   = process.argv.includes('--dry-run');
const MAX_DIM   = 480;
const ROOT      = path.join(__dirname, '..');
const IMAGE_DIRS = [
    path.join(ROOT, 'images', 'plants'),
    path.join(ROOT, 'images', 'supplies'),
    path.join(ROOT, 'images', 'vivariums'),
];

// Matches image files that are NOT already -full variants and NOT thumb.jpg
const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;
const FULL_RE  = /-full\.(jpe?g|png|gif|webp)$/i;
const THUMB_RE = /^thumb\.(jpe?g|png|gif|webp)$/i;

// Derive the -full path from any image path (plants or supplies naming)
// e.g. acalypha-hispida-1.jpg → acalypha-hispida-1-full.jpg
//      1.jpg → 1-full.jpg
function toFullPath(imgPath) {
    return imgPath.replace(/(\d+)(\.[a-z]+)$/i, '$1-full$2');
}

async function collectImages(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const sub = fs.readdirSync(fullPath);
            for (const file of sub) {
                if (
                    IMAGE_RE.test(file) &&
                    !FULL_RE.test(file) &&
                    !THUMB_RE.test(file)
                ) {
                    results.push(path.join(fullPath, file));
                }
            }
        } else if (
            entry.isFile() &&
            IMAGE_RE.test(entry.name) &&
            !FULL_RE.test(entry.name) &&
            !THUMB_RE.test(entry.name)
        ) {
            results.push(fullPath);
        }
    }
    return results;
}

async function processImage(imgPath) {
    const fullPath = toFullPath(imgPath);
    const fullExists = fs.existsSync(fullPath);

    // Read file into a Buffer so sharp never holds a file-system handle (avoids Windows EPERM/UNKNOWN on write)
    const imgBuffer = fs.readFileSync(imgPath);
    const { width: dispW, height: dispH } = await sharp(imgBuffer).metadata();
    const alreadySmall = dispW <= MAX_DIM && dispH <= MAX_DIM;

    // If -full.jpg exists and display version is already ≤ 480px → fully done
    if (fullExists && alreadySmall) return 'skipped';

    const needsResize = !alreadySmall;

    if (DRY_RUN) {
        const tag = needsResize ? `resize ${dispW}×${dispH} → ≤${MAX_DIM}px` : `copy (already ≤${MAX_DIM}px)`;
        console.log(`  [dry] ${path.basename(imgPath)}  ${tag}`);
        return 'dry';
    }

    // 1. Copy original → -full.jpg (skip if already exists)
    if (!fullExists) fs.copyFileSync(imgPath, fullPath);

    // 2. Create display version (resize or keep original if already small)
    if (needsResize) {
        const scale   = MAX_DIM / Math.max(dispW, dispH);
        const newW    = Math.round(dispW * scale);
        const newH    = Math.round(dispH * scale);
        const srcBuf  = fs.readFileSync(fullPath);   // read full-res copy into buffer
        const resized = await sharp(srcBuf).resize(newW, newH).jpeg({ quality: 92 }).toBuffer();
        fs.writeFileSync(imgPath, resized);           // overwrite display file — no handle conflict
        return 'resized';
    }

    // Already small enough — -full.jpg copy is the only thing needed
    return 'copied';
}

async function main() {
    if (DRY_RUN) console.log('🔍 Dry-run mode — no files will be written.\n');

    let total = 0, resized = 0, copied = 0, skipped = 0, errors = 0;

    for (const dir of IMAGE_DIRS) {
        const images = await collectImages(dir);
        if (images.length === 0) continue;

        const label = path.relative(ROOT, dir);
        console.log(`\n📁 ${label}  (${images.length} images)`);

        for (const imgPath of images) {
            total++;
            const rel = path.relative(ROOT, imgPath);
            try {
                const result = await processImage(imgPath);
                if (result === 'resized') {
                    resized++;
                    console.log(`  ✅ resized  ${rel}`);
                } else if (result === 'copied') {
                    copied++;
                    console.log(`  📋 copied   ${rel}`);
                } else if (result === 'skipped') {
                    skipped++;
                }
            } catch (err) {
                errors++;
                console.error(`  ❌ error    ${rel}: ${err.message}`);
            }
        }
    }

    console.log('\n─────────────────────────────────');
    console.log(`Total images found : ${total}`);
    console.log(`Resized (>480px)   : ${resized}`);
    console.log(`Copied  (≤480px)   : ${copied}`);
    console.log(`Skipped (done)     : ${skipped}`);
    if (errors) console.log(`Errors             : ${errors}`);
    console.log('─────────────────────────────────');
    if (!DRY_RUN && (resized + copied) > 0) {
        console.log('\n✅ Done. Commit the updated images/ folder to deploy.');
    }
}

main().catch(err => { console.error(err); process.exit(1); });
