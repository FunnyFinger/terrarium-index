/**
 * Pull data and images from Supabase into the repo so the local site has a backup.
 * Supabase is the single source of truth; run this when you want to sync locally.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=your_key node scripts/sync-from-supabase.js
 * Or set the same env vars in .env and run: node scripts/sync-from-supabase.js
 *
 * Does:
 * 1. Fetches inventory, custom_equipment, custom_vivariums from Supabase
 * 2. Downloads all image URLs (from Storage or any http(s) URL) into images/plants/, images/supplies/, images/vivariums/
 * 3. Writes data/backup/inventory.json, custom_equipment.json, custom_vivariums.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'data', 'backup');
const IMAGES_DIR = path.join(ROOT, 'images');

function getConfig() {
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) {
    try {
      const configPath = path.join(ROOT, 'js', 'config.js');
      const content = fs.readFileSync(configPath, 'utf8');
      const urlMatch = content.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
      const keyMatch = content.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/) ||
        content.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*['"]([^'"]+)['"]/);
      if (urlMatch) url = urlMatch[1].trim();
      if (keyMatch) key = keyMatch[1].trim();
    } catch (e) { /* ignore */ }
  }
  url = (url || '').toString().trim().replace(/\/$/, '');
  key = (key || '').toString().trim();
  return { url, key };
}

function request(baseUrl, key, pathname) {
  const url = new URL(pathname, baseUrl + '/');
  const isHttps = url.protocol === 'https:';
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Accept': 'application/json'
      }
    };
    (isHttps ? https : http).get(url.toString(), opts, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(res.statusCode + ' ' + res.statusMessage));
        return;
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body || '[]'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    (isHttps ? https : http).get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(res.statusCode + ' for ' + url));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isHttpUrl(s) {
  return typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://'));
}

function localPathForInventory(plantId, index, url) {
  const id = Number(plantId);
  const base = path.basename(url.split('?')[0]) || `image-${index}.jpg`;
  if (id >= 60001) return path.join('vivariums', 'vivarium-' + id, base);
  if (id >= 50001) return path.join('supplies', 'equipment-' + id, base);
  return path.join('plants', String(id), base);
}

function localPathForEquipment(id, index, url) {
  const base = path.basename(url.split('?')[0]) || `image-${index}.jpg`;
  return path.join('supplies', 'equipment-' + id, base);
}

function localPathForVivarium(id, index, url) {
  const base = path.basename(url.split('?')[0]) || `image-${index}.jpg`;
  return path.join('vivariums', 'vivarium-' + id, base);
}

async function downloadImages(entries) {
  let done = 0;
  let skipped = 0;
  for (const { url, localRel } of entries) {
    const fullPath = path.join(IMAGES_DIR, localRel);
    if (fs.existsSync(fullPath)) {
      skipped++;
      continue;
    }
    try {
      ensureDir(path.dirname(fullPath));
      const buf = await downloadFile(url);
      fs.writeFileSync(fullPath, buf);
      done++;
      process.stdout.write('\r Downloaded ' + done + ' new, ' + skipped + ' skipped (existing)');
    } catch (e) {
      console.warn('\n Skip failed: ' + url + ' - ' + e.message);
    }
  }
  if (done + skipped > 0) process.stdout.write('\r');
  return { downloaded: done, skipped };
}

function collectInventoryImages(rows) {
  const entries = [];
  for (const row of rows || []) {
    const plantId = row.plant_id;
    const data = row.data || {};
    const urls = [];
    if (data.imageUrl && isHttpUrl(data.imageUrl)) urls.push(data.imageUrl);
    if (Array.isArray(data.images)) data.images.forEach(u => { if (isHttpUrl(u)) urls.push(u); });
    urls.forEach((url, i) => {
      entries.push({ url, localRel: localPathForInventory(plantId, i, url) });
    });
  }
  return entries;
}

function collectEquipmentImages(rows) {
  const entries = [];
  for (const row of rows || []) {
    const id = row.id;
    const data = row.data || {};
    const urls = [];
    if (data.imageUrl && isHttpUrl(data.imageUrl)) urls.push(data.imageUrl);
    if (Array.isArray(data.images)) data.images.forEach(u => { if (isHttpUrl(u)) urls.push(u); });
    urls.forEach((url, i) => {
      entries.push({ url, localRel: localPathForEquipment(id, i, url) });
    });
  }
  return entries;
}

function collectVivariumImages(rows) {
  const entries = [];
  for (const row of rows || []) {
    const id = row.id;
    const data = row.data || {};
    const urls = [];
    if (data.imageUrl && isHttpUrl(data.imageUrl)) urls.push(data.imageUrl);
    if (Array.isArray(data.images)) data.images.forEach(u => { if (isHttpUrl(u)) urls.push(u); });
    urls.forEach((url, i) => {
      entries.push({ url, localRel: localPathForVivarium(id, i, url) });
    });
  }
  return entries;
}

async function main() {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env vars or put them in js/config.js.');
    process.exit(1);
  }
  const base = url + '/rest/v1';
  console.log('Syncing from Supabase:', url);

  const [inventory, customEquipment, customVivariums] = await Promise.all([
    request(base, key, '/inventory?select=plant_id,data'),
    request(base, key, '/custom_equipment?select=id,data&order=id.asc'),
    request(base, key, '/custom_vivariums?select=id,data&order=id.asc')
  ]);

  ensureDir(BACKUP_DIR);
  fs.writeFileSync(path.join(BACKUP_DIR, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(BACKUP_DIR, 'custom_equipment.json'), JSON.stringify(customEquipment, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(BACKUP_DIR, 'custom_vivariums.json'), JSON.stringify(customVivariums, null, 2) + '\n', 'utf8');
  console.log('Wrote data/backup/inventory.json, custom_equipment.json, custom_vivariums.json');

  const allImages = []
    .concat(collectInventoryImages(inventory))
    .concat(collectEquipmentImages(customEquipment))
    .concat(collectVivariumImages(customVivariums));
  const uniq = new Map();
  allImages.forEach(e => { uniq.set(e.url + '|' + e.localRel, e); });
  const list = [...uniq.values()];
  console.log('Image URLs to sync:', list.length);
  const { downloaded, skipped } = await downloadImages(list);
  console.log('Images: ' + downloaded + ' downloaded, ' + skipped + ' already present.');

  console.log('Done. Local backup is in data/backup/ and images/.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
