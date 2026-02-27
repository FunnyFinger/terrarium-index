/**
 * One-time (or repeatable) migration of equipment.json into Supabase equipment_catalog.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=your_publishable_or_service_key node scripts/migrate-equipment-catalog-to-supabase.js
 *
 * Notes:
 * - Ids come from data/equipment.json (50001+).
 * - We store the full item under data jsonb; image paths stay as-is (e.g. images/supplies/...).
 * - NODE_TLS_REJECT_UNAUTHORIZED=0 is set automatically so HTTPS to Supabase works from environments with strict TLS (e.g. corporate proxy).
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
      const configPath = path.join(ROOT, 'js', 'config.js');
      const content = fs.readFileSync(configPath, 'utf8');
      // Match window.SUPABASE_URL = ... || 'https://...' or SUPABASE_URL = '...'
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

function loadEquipmentJson() {
  const eqPath = path.join(ROOT, 'data', 'equipment.json');
  const raw = fs.readFileSync(eqPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.equipment)) return parsed.equipment;
  return [];
}

async function main() {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env vars or update js/config.js.');
    process.exit(1);
  }
  const base = url + '/rest/v1';
  console.log('Migrating equipment catalog to Supabase from:', url);

  const items = loadEquipmentJson();
  console.log('Found', items.length, 'equipment items in data/equipment.json');
  if (!items.length) return;

  // Upsert each item into equipment_catalog
  let ok = 0;
  for (const item of items) {
    if (!item || item.id == null) continue;
    const id = Number(item.id);
    if (!Number.isFinite(id)) continue;
    const row = { id, data: item };
    try {
      await request('POST', base, key, '/equipment_catalog', [row], 'resolution=merge-duplicates,return=representation');
      ok++;
      if (ok % 50 === 0) console.log('Upserted', ok, 'items...');
    } catch (e) {
      let msg = (e && e.message) ? e.message : String(e);
      if (e && e.cause) msg += ' (cause: ' + (e.cause.message || e.cause.code || e.cause) + ')';
      if (e && e.errors) msg += ' [' + e.errors.map((x) => x.message || x.code || x).join('; ') + ']';
      console.warn('Failed to upsert equipment id', id, '-', msg);
    }
  }
  console.log('Done. Upserted', ok, 'equipment items into equipment_catalog.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

