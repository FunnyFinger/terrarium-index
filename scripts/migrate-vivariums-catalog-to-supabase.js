/**
 * One-time (or repeatable) migration of vivariums catalog into Supabase vivariums_catalog.
 * Reads from data/vivariums.json.
 *
 * Usage: npm run migrate-vivariums-catalog
 * Or: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/migrate-vivariums-catalog-to-supabase.js
 *
 * NODE_TLS_REJECT_UNAUTHORIZED=0 is set automatically for strict TLS environments.
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

function loadVivariumsJson() {
  const p = path.join(ROOT, 'data', 'vivariums.json');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
  if (parsed.vivariums && Array.isArray(parsed.vivariums)) return parsed.vivariums;
  return [];
}

async function main() {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env vars or update js/config.js.');
    process.exit(1);
  }
  const base = url + '/rest/v1';
  const items = loadVivariumsJson();
  console.log('Migrating vivariums catalog to Supabase from:', url);
  console.log('Found', items.length, 'vivarium items in data/vivariums.json');
  if (!items.length) {
    console.log('Nothing to migrate.');
    return;
  }

  let ok = 0;
  for (const item of items) {
    if (!item || item.id == null) continue;
    const id = Number(item.id);
    if (!Number.isFinite(id)) continue;
    const row = { id, data: item };
    try {
      await request('POST', base, key, '/vivariums_catalog', [row], 'resolution=merge-duplicates,return=representation');
      ok++;
    } catch (e) {
      let msg = (e && e.message) ? e.message : String(e);
      if (e && e.cause) msg += ' (cause: ' + (e.cause.message || e.cause.code || e.cause) + ')';
      if (e && e.errors) msg += ' [' + e.errors.map((x) => x.message || x.code || x).join('; ') + ']';
      console.warn('Failed to upsert vivarium id', id, '-', msg);
    }
  }
  console.log('Done. Upserted', ok, 'vivariums into vivariums_catalog.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
