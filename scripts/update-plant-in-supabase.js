#!/usr/bin/env node
/**
 * Update one plant in Supabase plants_catalog by id or by scientificName.
 * Usage:
 *   node scripts/update-plant-in-supabase.js --by-name "Aglaonema commutatum" --to-cultivar "Tom Pride"
 *   node scripts/update-plant-in-supabase.js --id 32 --scientificName "Aglaonema commutatum 'Tom Pride'" --name "Aglaonema commutatum 'Tom Pride' (Chinese Evergreen)"
 *
 * When using --by-name and --to-cultivar, finds the plant with that scientificName with the smallest id
 * (assumed to be the "original" entry) and updates it to the cultivar name.
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
  const args = process.argv.slice(2);
  const byNameIdx = args.indexOf('--by-name');
  const toCultivarIdx = args.indexOf('--to-cultivar');
  const idIdx = args.indexOf('--id');
  const scientificNameIdx = args.indexOf('--scientificName');
  const nameIdx = args.indexOf('--name');

  if (byNameIdx !== -1 && toCultivarIdx !== -1) {
    const baseName = args[byNameIdx + 1];
    const cultivarName = args[toCultivarIdx + 1];
    if (!baseName || !cultivarName) {
      console.error('Usage: node update-plant-in-supabase.js --by-name "Aglaonema commutatum" --to-cultivar "Tom Pride"');
      process.exit(1);
    }
    const scientificNameNew = baseName + " '"+ cultivarName + "'";
    const nameNew = scientificNameNew + ' (Chinese Evergreen)';

    const rows = await request('GET', base, key, '/plants_catalog?select=id,data&order=id.asc');
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error('No plants in catalog.');
      process.exit(1);
    }
    const matches = rows.filter(r => (r.data && (r.data.scientificName || '').trim()) === baseName.trim());
    if (matches.length === 0) {
      console.error('No plant found with scientificName:', baseName);
      process.exit(1);
    }
    const target = matches[0];
    const id = target.id;
    const data = { ...target.data, id, scientificName: scientificNameNew, name: nameNew };
    await request('PATCH', base, key, '/plants_catalog?id=eq.' + id, { data }, 'return=representation');
    console.log('Updated plant id', id, 'to', scientificNameNew);
    return;
  }

  if (idIdx !== -1) {
    const id = args[idIdx + 1];
    if (!id) {
      console.error('--id requires a value');
      process.exit(1);
    }
    const rows = await request('GET', base, key, '/plants_catalog?id=eq.' + id + '&select=id,data');
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error('Plant not found:', id);
      process.exit(1);
    }
    const target = rows[0];
    const data = { ...target.data, id: target.id };
    if (scientificNameIdx !== -1 && args[scientificNameIdx + 1]) data.scientificName = args[scientificNameIdx + 1];
    if (nameIdx !== -1 && args[nameIdx + 1]) data.name = args[nameIdx + 1];
    await request('PATCH', base, key, '/plants_catalog?id=eq.' + id, { data }, 'return=representation');
    console.log('Updated plant id', id);
    return;
  }

  console.error('Usage:');
  console.error('  node scripts/update-plant-in-supabase.js --by-name "Aglaonema commutatum" --to-cultivar "Tom Pride"');
  console.error('  node scripts/update-plant-in-supabase.js --id <id> [--scientificName "..." ] [--name "..."]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
