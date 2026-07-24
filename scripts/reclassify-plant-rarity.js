#!/usr/bin/env node
/**
 * Reclassify all plants_catalog rarity values (horticultural trade rarity).
 * Canonical: common | uncommon | rare | very-rare
 *
 * Usage:
 *   node scripts/reclassify-plant-rarity.js --dry-run
 *   node scripts/reclassify-plant-rarity.js
 *   node scripts/reclassify-plant-rarity.js --sql-only
 *
 * Writes:
 *   data/rarity-reclassification-report.json
 *   data/update-plant-rarities.sql  (run in Supabase SQL Editor if PATCH fails under RLS)
 *
 * Set SUPABASE_SERVICE_ROLE_KEY to apply via API.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { normalizeRarity } = require('./lib/normalize-rarity.js');
const { assessHorticulturalRarity } = require('./lib/assess-horticultural-rarity.js');

const ROOT = path.resolve(__dirname, '..');
const PLANTS_DIR = path.join(ROOT, 'data', 'plants-merged');

function getConfig() {
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  let usedServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    try {
      const content = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
      const urlMatch = content.match(/SUPABASE_URL\s*=\s*[^'"]*['"](https:\/\/[^'"]+)['"]/);
      const keyMatch = content.match(/SUPABASE_ANON_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/);
      if (urlMatch) url = urlMatch[1].trim();
      if (!key && keyMatch) key = keyMatch[1].trim();
    } catch (e) { /* ignore */ }
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    usedServiceRole = true;
  }
  return {
    url: (url || '').replace(/\/$/, ''),
    key: (key || '').trim(),
    usedServiceRole
  };
}

function request(method, baseUrl, key, pathname, body) {
  const fullUrl = baseUrl.replace(/\/$/, '') + '/' + pathname.replace(/^\//, '');
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
      Prefer: 'return=representation'
    }
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
          reject(new Error((res.statusCode || '') + ' ' + data.slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function updateLocalMerged(id, rarity) {
  if (!fs.existsSync(PLANTS_DIR)) return false;
  const files = fs.readdirSync(PLANTS_DIR).filter((f) => f.endsWith('.json') && f !== 'bundle.json' && f !== 'index.json');
  for (const file of files) {
    const fp = path.join(PLANTS_DIR, file);
    let plant;
    try { plant = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }
    if (Number(plant.id) !== Number(id)) continue;
    if (normalizeRarity(plant.rarity) === rarity) return false;
    plant.rarity = rarity;
    fs.writeFileSync(fp, JSON.stringify(plant, null, 2) + '\n', 'utf8');
    return true;
  }
  return false;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sqlOnly = process.argv.includes('--sql-only');
  const { url, key, usedServiceRole } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or key.');
    process.exit(1);
  }

  const base = url + '/rest/v1';
  const rows = await request('GET', base, key, '/plants_catalog?select=id,data&order=id.asc');
  if (!Array.isArray(rows) || !rows.length) {
    console.log('No plants found.');
    return;
  }

  const changes = [];
  const unchanged = [];
  const countsNew = { common: 0, uncommon: 0, rare: 0, 'very-rare': 0 };
  const countsOld = {};

  for (const row of rows) {
    const plant = { ...(row.data || {}), id: row.id };
    const oldR = normalizeRarity(plant.rarity) || String(plant.rarity || '(missing)');
    countsOld[oldR] = (countsOld[oldR] || 0) + 1;
    const { rarity, reason } = assessHorticulturalRarity(plant);
    countsNew[rarity] = (countsNew[rarity] || 0) + 1;
    const entry = {
      id: row.id,
      name: plant.name,
      scientificName: plant.scientificName,
      from: plant.rarity || null,
      to: rarity,
      reason
    };
    if (normalizeRarity(plant.rarity) !== rarity) changes.push(entry);
    else unchanged.push(entry);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    changed: changes.length,
    unchanged: unchanged.length,
    countsBefore: countsOld,
    countsAfter: countsNew,
    changes
  };
  fs.writeFileSync(
    path.join(ROOT, 'data', 'rarity-reclassification-report.json'),
    JSON.stringify(report, null, 2) + '\n',
    'utf8'
  );

  const valueRows = changes.map((c) => `  (${c.id}, '${sqlEscape(c.to)}')`).join(',\n');
  const sql = `-- Bulk update plant rarity (horticultural trade rarity)
-- Canonical values: common | uncommon | rare | very-rare
-- Generated: ${report.generatedAt}
-- Changes: ${changes.length} of ${rows.length}

UPDATE public.plants_catalog AS p
SET data = jsonb_set(COALESCE(p.data, '{}'::jsonb), '{rarity}', to_jsonb(v.rarity), true)
FROM (VALUES
${valueRows}
) AS v(id, rarity)
WHERE p.id = v.id;
`;
  fs.writeFileSync(path.join(ROOT, 'data', 'update-plant-rarities.sql'), sql, 'utf8');

  console.log('Total:', rows.length);
  console.log('Would change:', changes.length);
  console.log('Before:', countsOld);
  console.log('After:', countsNew);
  console.log('Report: data/rarity-reclassification-report.json');
  console.log('SQL:    data/update-plant-rarities.sql');

  if (dryRun || sqlOnly) {
    console.log(dryRun ? 'Dry run — no writes.' : 'SQL only — no API writes.');
    return;
  }

  if (!usedServiceRole) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY not set — API PATCH will likely fail under RLS.');
    console.warn('Run data/update-plant-rarities.sql in the Supabase SQL Editor.');
  }

  let updated = 0;
  let failed = 0;
  for (const c of changes) {
    const row = rows.find((r) => r.id === c.id);
    const data = { ...(row.data || {}), id: c.id, rarity: c.to };
    try {
      await request('PATCH', base, key, '/plants_catalog?id=eq.' + c.id, { data });
      updated++;
      updateLocalMerged(c.id, c.to);
    } catch (e) {
      failed++;
      if (failed <= 3) console.error('PATCH failed id', c.id, e.message);
    }
  }

  // Also normalize local files that match even if API failed
  for (const c of changes) updateLocalMerged(c.id, c.to);

  console.log('API updated:', updated, 'failed:', failed);
  if (failed > 0) {
    console.log('Apply SQL fallback: data/update-plant-rarities.sql');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
