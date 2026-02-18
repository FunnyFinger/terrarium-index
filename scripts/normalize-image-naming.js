#!/usr/bin/env node
/**
 * Normalize image naming in images/<folder>:
 * - Convention: folder-name-1.jpg, folder-name-2.jpg, ... and thumb.jpg
 * - Ensures every folder has at least one image ending with -1 (renumbers if needed)
 * Run: node scripts/normalize-image-naming.js
 */

const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'images');

function getNumberedImages(folderPath, folderName) {
    const files = fs.readdirSync(folderPath);
    const extRe = /\.(jpg|jpeg|png|webp)$/i;
    const prefix = folderName + '-';
    const numbered = [];
    for (const f of files) {
        if (!extRe.test(f)) continue;
        if (f === 'thumb.jpg' || f === 'thumb.jpeg') continue;
        const base = path.basename(f, path.extname(f));
        if (base !== folderName && !base.startsWith(prefix)) continue;
        const m = base.match(/-(\d+)$/);
        if (m) {
            const n = parseInt(m[1], 10);
            numbered.push({ name: f, num: n, ext: path.extname(f) });
        }
    }
    return numbered.sort((a, b) => a.num - b.num);
}

function main() {
    if (!fs.existsSync(IMAGES_DIR)) {
        console.error('images/ directory not found');
        process.exit(1);
    }

    const dirs = fs.readdirSync(IMAGES_DIR)
        .filter(f => fs.statSync(path.join(IMAGES_DIR, f)).isDirectory());

    let fixed = 0;
    for (const folder of dirs) {
        const folderPath = path.join(IMAGES_DIR, folder);
        const numbered = getNumberedImages(folderPath, folder);
        if (numbered.length === 0) continue;

        const hasOne = numbered.some(n => n.num === 1);
        if (hasOne) continue;

        // Renumber so we get 1, 2, 3, ... (first image becomes -1). Do from highest to lowest to avoid overwrite.
        const ext = numbered[0].ext;
        const renames = numbered.map((n, i) => ({
            from: path.join(folderPath, n.name),
            toName: `${folder}-${i + 1}${ext}`,
            fromName: n.name
        })).filter(r => r.fromName !== r.toName);

        if (renames.length === 0) continue;

        // Move all to temp names first
        const tempFiles = [];
        for (const r of renames) {
            const temp = path.join(folderPath, '_ren_' + r.fromName);
            if (fs.existsSync(r.from)) {
                fs.renameSync(r.from, temp);
                tempFiles.push({ temp, toName: r.toName });
            }
        }
        for (const { temp, toName } of tempFiles) {
            const to = path.join(folderPath, toName);
            if (fs.existsSync(temp)) {
                fs.renameSync(temp, to);
                console.log('  ', folder, path.basename(temp).replace(/^_ren_/, ''), '->', toName);
            }
        }
        fixed++;
        console.log('Fixed:', folder);
    }

    console.log('\nDone. Folders normalized:', fixed);
}

main();
