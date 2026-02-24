#!/usr/bin/env node
/**
 * Output the next sequential plant ID (max existing ID + 1).
 * Use this when creating a new plant file so IDs stay sequential.
 * Run: node scripts/get-next-plant-id.js
 */
const fs = require('fs');
const path = require('path');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const INDEX_PATH = path.join(MERGED_DIR, 'index.json');

const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
const files = index.plants || [];
let maxId = 0;
for (const file of files) {
    const filePath = path.join(MERGED_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    try {
        const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const n = plant.id;
        if (typeof n === 'number' && n > maxId) maxId = n;
    } catch (_) {}
}
console.log(maxId + 1);
