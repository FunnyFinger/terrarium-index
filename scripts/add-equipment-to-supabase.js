#!/usr/bin/env node
/**
 * Add one new supply/equipment item to Supabase equipment_catalog.
 *
 * Usage:
 *   node scripts/add-equipment-to-supabase.js path/to/item.json
 *   npm run add-equipment-to-supabase -- path/to/item.json
 *
 * Do not set id — script assigns next id (>= 50001).
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');

function getConfig() {
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) {
    try {
      const content = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
      const urlMatch = content.match(/SUPABASE_URL\s*=\s*[^'"]*['"](https:\/\/[^'"]+)['"]/);
      const keyMatch = content.match(/SUPABASE_ANON_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/) ||
        content.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/);
      if (urlMatch) url = urlMatch[1].trim();
      if (keyMatch) key = keyMatch[1].trim();
    } catch (e) { /* ignore */ }
  }
  return {
    url: (url || '').toString().trim().replace(/\/$/, ''),
    key: (key || '').toString().trim()
  };
}

function request(method, baseUrl, key, pathname, body, prefer) {
  const pathPart = pathname.replace(/^\//, '');
  const fullUrl = baseUrl.replace(/\/$/, '') + '/' + pathPart;
  const u = new URL(fullUrl);
  const payload = body != null ? JSON.stringify(body) : null;
  const opts = {
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation'
    },
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : []); }
          catch { resolve([]); }
        } else {
          reject(new Error((res.statusCode || '') + ' ' + (res.statusMessage || '') + ' ' + data));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function normalizeItem(data) {
  const item = typeof data === 'object' && data !== null ? { ...data } : {};
  if (!item.name) item.name = 'Untitled supply';
  if (!item.description) item.description = '';
  if (!item.category) item.category = 'decoration';
  if (!Array.isArray(item.images)) item.images = [];
  if (!item.imageUrl) item.imageUrl = item.images[0] || '';
  if (item.price === undefined) item.price = null;
  if (item.size === undefined) item.size = '';
  if (item.unit === undefined) item.unit = '';
  delete item.id;
  return item;
}

async function main() {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
    process.exit(1);
  }

  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node add-equipment-to-supabase.js <item.json>');
    process.exit(1);
  }
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error('File not found:', absPath);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }

  const base = url + '/rest/v1';
  const item = normalizeItem(data);

  let nextId = 50001;
  try {
    const rows = await request('GET', base, key, '/equipment_catalog?select=id&order=id.desc&limit=1');
    if (Array.isArray(rows) && rows.length > 0 && rows[0].id != null) {
      nextId = Math.max(50001, Number(rows[0].id) + 1);
    }
  } catch (e) {
    console.warn('Could not get max id, using 50001:', e.message);
  }

  item.id = nextId;
  const row = { id: nextId, data: item };

  try {
    await request('POST', base, key, '/equipment_catalog', [row], 'resolution=merge-duplicates,return=representation');
    console.log('Added equipment to Supabase:', item.name, '(id:', nextId, ')');
    console.log(JSON.stringify({ id: nextId, name: item.name, category: item.category, price: item.price }));
  } catch (e) {
    console.error('Failed to add equipment:', e.message);
    process.exit(1);
  }

  // Keep local equipment.json in sync when present
  try {
    const eqPath = path.join(ROOT, 'data', 'equipment.json');
    if (fs.existsSync(eqPath)) {
      const raw = JSON.parse(fs.readFileSync(eqPath, 'utf8'));
      const list = Array.isArray(raw) ? raw : (raw.items || raw.equipment || []);
      if (!list.some((x) => Number(x.id) === nextId)) {
        list.push(item);
        fs.writeFileSync(eqPath, JSON.stringify(list, null, 2) + '\n', 'utf8');
        console.log('Also appended to data/equipment.json');
      }
    }
  } catch (e) {
    console.warn('Could not update data/equipment.json:', e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
