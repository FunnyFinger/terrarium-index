#!/usr/bin/env node
/**
 * Migrate plant temperatureRange / waterTemperatureRange to Celsius.
 * Legacy values used 0–100% with 0% = 0°C and 100% = 50°C.
 * Values that already look like °C are left unchanged.
 *
 * Usage:
 *   node scripts/migrate-temperature-range-to-celsius.js [--dry-run] [--local-only] [--supabase-only]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  normalizeTemperatureRangeToCelsius,
  temperatureRangeLooksLikeCelsius,
  roundTemp
} = require('./lib/temperature-scale.js');

const ROOT = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const localOnly = process.argv.includes('--local-only');
const supabaseOnly = process.argv.includes('--supabase-only');

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

function roundRange(range) {
  if (!range) return range;
  return {
    min: roundTemp(range.min, 1),
    max: roundTemp(range.max, 1),
    ideal: roundTemp(range.ideal, 1)
  };
}

function migrateRange(range) {
  if (!range || typeof range.min !== 'number' || typeof range.max !== 'number') {
    return { changed: false, range: range };
  }
  if (temperatureRangeLooksLikeCelsius(range)) {
    return { changed: false, range: range };
  }
  return { changed: true, range: roundRange(normalizeTemperatureRangeToCelsius(range)) };
}

function walkJsonFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJsonFiles(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
}

function migrateLocal() {
  const files = [];
  walkJsonFiles(path.join(ROOT, 'data'), files);
  let changedFiles = 0;
  let changedFields = 0;
  for (const file of files) {
    let plant;
    try { plant = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { continue; }
    if (!plant || typeof plant !== 'object') continue;
    let dirty = false;
    for (const key of ['temperatureRange', 'waterTemperatureRange']) {
      const result = migrateRange(plant[key]);
      if (result.changed) {
        plant[key] = result.range;
        dirty = true;
        changedFields++;
      }
    }
    if (dirty) {
      changedFiles++;
      if (!dryRun) fs.writeFileSync(file, JSON.stringify(plant, null, 2) + '\n');
    }
  }
  console.log(`Local JSON: ${changedFiles} files, ${changedFields} fields` + (dryRun ? ' (dry-run)' : ''));
}

async function migrateSupabase() {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing Supabase config; skipping remote migration.');
    return;
  }
  const base = url + '/rest/v1';
  const rows = await request('GET', base, key, 'plants_catalog?select=id,data&order=id.asc', null, 'return=representation');
  let updated = 0;
  for (const row of rows) {
    const data = row.data && typeof row.data === 'object' ? { ...row.data } : null;
    if (!data) continue;
    let dirty = false;
    for (const keyName of ['temperatureRange', 'waterTemperatureRange']) {
      const result = migrateRange(data[keyName]);
      if (result.changed) {
        data[keyName] = result.range;
        dirty = true;
      }
    }
    if (!dirty) continue;
    updated++;
    console.log(`  ${row.id}: temp`, JSON.stringify(data.temperatureRange), 'waterTemp', JSON.stringify(data.waterTemperatureRange));
    if (!dryRun) {
      await request('PATCH', base, key, `plants_catalog?id=eq.${encodeURIComponent(row.id)}`, { data }, 'return=minimal');
    }
  }
  console.log(`Supabase plants_catalog: ${updated} rows` + (dryRun ? ' (dry-run)' : ''));
}

async function main() {
  if (!supabaseOnly) migrateLocal();
  if (!localOnly) await migrateSupabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
