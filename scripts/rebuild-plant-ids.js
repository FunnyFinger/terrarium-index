#!/usr/bin/env node
/**
 * Rebuild plant IDs to be sequential (1, 2, 3, ...) in sorted order.
 * Sort order: scientificName, then name (case-insensitive).
 * Run: node scripts/rebuild-plant-ids.js
 * Then run: node scripts/build-plants-bundle.js (or it runs automatically).
 */
const fs = require('fs');
const path = require('path');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const INDEX_PATH = path.join(MERGED_DIR, 'index.json');
const VERSION_PATH = path.join(MERGED_DIR, 'version.json');
const BUNDLE_PATH = path.join(MERGED_DIR, 'bundle.json');

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
        if (!fs.existsSync(filePath)) {
            failed++;
            continue;
        }
        try {
            const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            plant._file = file;
            plants.push(plant);
        } catch (err) {
            failed++;
            if (failed <= 5) console.warn('Skip', file, err.message);
        }
    }

    const scientific = (p) => (p.scientificName || '').trim().toLowerCase();
    const name = (p) => (p.name || '').trim().toLowerCase();
    plants.sort((a, b) => {
        const sc = scientific(a).localeCompare(scientific(b));
        if (sc !== 0) return sc;
        return name(a).localeCompare(name(b));
    });

    let nextId = 1;
    const idMap = new Map();
    for (const plant of plants) {
        const oldId = plant.id;
        plant.id = nextId;
        idMap.set(oldId, nextId);
        nextId++;
    }

    for (const plant of plants) {
        const file = plant._file;
        delete plant._file;
        const filePath = path.join(MERGED_DIR, file);
        try {
            fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        } catch (err) {
            console.error('Error writing', file, err.message);
        }
    }

    const version = (() => {
        try {
            const raw = fs.readFileSync(VERSION_PATH, 'utf8');
            return ((JSON.parse(raw).version || 0) + 1);
        } catch (_) {
            return 1;
        }
    })();
    fs.writeFileSync(VERSION_PATH, JSON.stringify({ version }, null, 0));
    const bundlePlants = plants.map((p) => ({ ...p }));
    fs.writeFileSync(BUNDLE_PATH, JSON.stringify({ version, plants: bundlePlants }, null, 0));

    console.log('✅ Reassigned sequential IDs 1–' + plants.length + ' (sorted by scientific name, then name)');
    console.log('✅ Wrote all plant files, version.json and bundle.json');
    if (failed > 0) console.warn('⚠️ Skipped', failed, 'file(s)');
}

main();
