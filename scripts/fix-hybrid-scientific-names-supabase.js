#!/usr/bin/env node
/**
 * Fix hybrid scientific names in Supabase to the convention:
 * - Interspecific (same genus): "Genus Species1 × Species2" (no repeated genus in second parent).
 * - Intergeneric (different genera): "Genus1 Species1 × Genus2 Species2" (full names).
 *
 * Usage: node scripts/fix-hybrid-scientific-names-supabase.js [--dry-run]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const path = require('path');
const https = require('https');
const { formatHybridScientificName } = require('./lib/format-hybrid-scientific-name.js');

const ROOT = path.resolve(__dirname, '..');

function getConfig() {
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) {
    try {
      const fs = require('fs');
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
  const dryRun = process.argv.includes('--dry-run');
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env vars or update js/config.js.');
    process.exit(1);
  }
  const base = url + '/rest/v1';
  const rows = await request('GET', base, key, '/plants_catalog?select=id,data&order=id.asc');
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No plants in catalog.');
    return;
  }
  let updated = 0;
  for (const row of rows) {
    const plant = { ...(row.data || {}), id: row.id };
    const corrected = formatHybridScientificName(plant);
    if (corrected && corrected !== (plant.scientificName || '').trim()) {
      console.log('id', plant.id, ':', (plant.scientificName || '').trim(), '→', corrected);
      if (!dryRun) {
        const data = { ...plant, scientificName: corrected };
        await request('PATCH', base, key, '/plants_catalog?id=eq.' + plant.id, { data });
        updated++;
      }
    }
  }
  if (dryRun) {
    console.log('Dry run: no changes written. Run without --dry-run to apply.');
  } else {
    console.log('Updated', updated, 'plant(s).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
