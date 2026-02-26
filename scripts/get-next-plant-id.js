#!/usr/bin/env node
/**
 * Output the first available plant ID (smallest integer >= 1 not used by any plant).
 * Use this when creating a new plant so deleted plants' IDs get reused and there are no gaps.
 * Run: node scripts/get-next-plant-id.js
 */
const fs = require('fs');
const path = require('path');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const INDEX_PATH = path.join(MERGED_DIR, 'index.json');

const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
const files = index.plants || [];
const usedIds = new Set();
for (const file of files) {
    const filePath = path.join(MERGED_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    try {
        const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const n = plant.id;
        if (typeof n === 'number' && n >= 1) usedIds.add(n);
    } catch (_) {}
}
let k = 1;
while (usedIds.has(k)) k++;
console.log(k);
