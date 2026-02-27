/**
 * One-time migration: copy rows from custom_equipment → equipment_catalog
 * and custom_vivariums → vivariums_catalog so user-added items stay visible
 * after switching to catalog-only.
 *
 * Usage:
 *   node scripts/migrate-custom-to-catalog.js
 *   (reads SUPABASE_URL and SUPABASE_ANON_KEY from env or js/config.js)
 *
 * Or: npm run migrate-custom-to-catalog
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

async function main() {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env vars or update js/config.js.');
    process.exit(1);
  }
  const base = url + '/rest/v1';
  console.log('Migrating custom_equipment → equipment_catalog and custom_vivariums → vivariums_catalog');
  console.log('Supabase:', url);

  let customEq = [];
  let customViv = [];
  try {
    customEq = await request('GET', base, key, '/custom_equipment?select=id,data');
    if (!Array.isArray(customEq)) customEq = [];
  } catch (e) {
    console.warn('Could not fetch custom_equipment:', e.message);
  }
  try {
    customViv = await request('GET', base, key, '/custom_vivariums?select=id,data');
    if (!Array.isArray(customViv)) customViv = [];
  } catch (e) {
    console.warn('Could not fetch custom_vivariums:', e.message);
  }

  console.log('Found', customEq.length, 'rows in custom_equipment,', customViv.length, 'in custom_vivariums');

  let eqOk = 0;
  for (const r of customEq) {
    if (!r || r.id == null) continue;
    const id = Number(r.id);
    if (!Number.isFinite(id)) continue;
    const data = r.data && typeof r.data === 'object' ? r.data : { id, name: 'Custom item' };
    if (data.id == null) data.id = id;
    const row = { id, data };
    try {
      await request('POST', base, key, '/equipment_catalog', [row], 'resolution=merge-duplicates,return=representation');
      eqOk++;
    } catch (e) {
      console.warn('Failed to migrate equipment id', id, '-', e.message);
    }
  }
  console.log('Migrated', eqOk, 'equipment items to equipment_catalog.');

  let vivOk = 0;
  for (const r of customViv) {
    if (!r || r.id == null) continue;
    const id = Number(r.id);
    if (!Number.isFinite(id)) continue;
    const data = r.data && typeof r.data === 'object' ? r.data : { id, name: 'Custom vivarium' };
    if (data.id == null) data.id = id;
    const row = { id, data };
    try {
      await request('POST', base, key, '/vivariums_catalog', [row], 'resolution=merge-duplicates,return=representation');
      vivOk++;
    } catch (e) {
      console.warn('Failed to migrate vivarium id', id, '-', e.message);
    }
  }
  console.log('Migrated', vivOk, 'vivarium items to vivariums_catalog.');
  console.log('Done. You can keep or drop custom_equipment / custom_vivariums tables later.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
