#!/usr/bin/env node
/**
 * Upload all equipment/supplies images from images/supplies/equipment-<id>/
 * to Supabase Storage bucket vivarium-assets under supplies/equipment-<id>/.
 *
 * Usage: node scripts/upload-equipment-images-to-supabase.js
 *
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from js/config.js or env.
 * Requires bucket "vivarium-assets" to exist and allow uploads.
 *
 * After a successful run: ensure equipment catalog (Supabase or data/equipment.json)
 * uses full Supabase URLs or paths like supplies/equipment-50001/1.jpg so the app
 * can resolve them to the bucket (same pattern as plants).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const SUPPLIES_IMG_DIR = path.join(ROOT, 'images', 'supplies');
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

function getConfig() {
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    try {
      const configPath = path.join(ROOT, 'js', 'config.js');
      const content = fs.readFileSync(configPath, 'utf8');
      const urlMatch = content.match(/SUPABASE_URL\s*=\s*[^'"]*['"](https:\/\/[^'"]+)['"]/);
      const keyMatch = content.match(/SUPABASE_ANON_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/) ||
        content.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/);
      if (urlMatch) url = urlMatch[1].trim();
      if (keyMatch) key = keyMatch[1].trim();
    } catch (e) { /* ignore */ }
  }
  url = (url || '').toString().trim().replace(/\/$/, '');
  key = (key || '').toString().trim();
  return { url, key };
}

function uploadFile(baseUrl, key, objectPath, fileBuffer, contentType) {
  const pathPart = 'storage/v1/object/vivarium-assets/' + objectPath.replace(/^\//, '');
  const fullUrl = baseUrl + '/' + pathPart;
  const u = new URL(fullUrl);
  const opts = {
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': Buffer.byteLength(fileBuffer),
      'x-upsert': 'true'
    },
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode });
        } else {
          reject(new Error(res.statusCode + ' ' + (res.statusMessage || '') + ' ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function run() {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set in js/config.js or env.');
    process.exit(1);
  }

  if (!fs.existsSync(SUPPLIES_IMG_DIR)) {
    console.error('Not found:', SUPPLIES_IMG_DIR);
    process.exit(1);
  }

  const dirs = fs.readdirSync(SUPPLIES_IMG_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('equipment-'))
    .map(d => d.name)
    .sort();

  let totalFiles = 0;
  let uploaded = 0;
  let failed = 0;

  for (const folderName of dirs) {
    const dirPath = path.join(SUPPLIES_IMG_DIR, folderName);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && IMAGE_EXT.test(e.name))
      .map(e => e.name)
      .sort();

    for (const file of files) {
      totalFiles++;
      const objectPath = 'supplies/' + folderName + '/' + file;
      const filePath = path.join(dirPath, file);
      const ext = path.extname(file).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';

      try {
        const buf = fs.readFileSync(filePath);
        await uploadFile(url, key, objectPath, buf, contentType);
        uploaded++;
        console.log('[OK]', objectPath);
      } catch (err) {
        failed++;
        console.error('[FAIL]', objectPath, err.message);
      }
    }
  }

  console.log('\nDone. Total files:', totalFiles, 'Uploaded:', uploaded, 'Failed:', failed);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
