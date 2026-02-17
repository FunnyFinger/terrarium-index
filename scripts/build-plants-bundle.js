#!/usr/bin/env node
/**
 * Build a single plants bundle from data/plants-merged/*.json for faster loading.
 * Run: node scripts/build-plants-bundle.js
 * Output: data/plants-merged/bundle.json, data/plants-merged/version.json
 * The frontend plant-loader.js will fetch bundle.json?v=<version> (one request instead of 405).
 */
const fs = require('fs');
const path = require('path');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const INDEX_PATH = path.join(MERGED_DIR, 'index.json');
const VERSION_PATH = path.join(MERGED_DIR, 'version.json');
const BUNDLE_PATH = path.join(MERGED_DIR, 'bundle.json');

function getNextVersion() {
    try {
        const raw = fs.readFileSync(VERSION_PATH, 'utf8');
        const obj = JSON.parse(raw);
        return (obj.version || 0) + 1;
    } catch (_) {
        return 1;
    }
}

function main() {
    if (!fs.existsSync(INDEX_PATH)) {
        console.error('Missing data/plants-merged/index.json');
        process.exit(1);
    }

    const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    const files = index.plants || [];
    if (files.length === 0) {
        console.error('index.json has no plants list');
        process.exit(1);
    }

    const plants = [];
    let failed = 0;
    for (const file of files) {
        const filePath = path.join(MERGED_DIR, file);
        try {
            const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            plants.push(plant);
        } catch (err) {
            failed++;
            if (failed <= 5) console.warn('Skip', file, err.message);
        }
    }

    plants.sort((a, b) => (a.id || 0) - (b.id || 0));
    const version = getNextVersion();

    fs.writeFileSync(VERSION_PATH, JSON.stringify({ version }, null, 0));
    fs.writeFileSync(BUNDLE_PATH, JSON.stringify({ version, plants }, null, 0));

    console.log(`✅ Wrote bundle.json (${plants.length} plants) and version.json (version ${version})`);
    if (failed > 0) console.warn(`⚠️ Skipped ${failed} files`);
}

main();
