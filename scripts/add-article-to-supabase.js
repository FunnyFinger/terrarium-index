#!/usr/bin/env node
/**
 * Add one article to Supabase articles table.
 * Usage: node scripts/add-article-to-supabase.js data/new-article-life-inside-a-terrarium.json
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');

function getConfig() {
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    '';
  if (!url || !key) {
    try {
      const content = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
      const urlMatch = content.match(/SUPABASE_URL\s*=\s*[^'"]*['"](https:\/\/[^'"]+)['"]/);
      const keyMatch = content.match(/SUPABASE_ANON_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/) ||
        content.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*[^'"]*['"]([^'"]+)['"]/);
      if (urlMatch) url = urlMatch[1].trim();
      if (!key && keyMatch) key = keyMatch[1].trim();
    } catch (e) { /* ignore */ }
  }
  return { url: url.replace(/\/$/, ''), key: key.trim() };
}

function request(method, baseUrl, key, pathname, body) {
  const u = new URL(baseUrl.replace(/\/$/, '') + pathname);
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
          reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node scripts/add-article-to-supabase.js <article.json>');
    process.exit(1);
  }
  const articlePath = path.resolve(process.cwd(), fileArg);
  const article = JSON.parse(fs.readFileSync(articlePath, 'utf8'));
  if (!article.slug || !article.title) {
    console.error('Article JSON must include slug and title');
    process.exit(1);
  }

  const { url, key } = getConfig();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or API key');
    process.exit(1);
  }

  let id = article.id;
  if (id == null) {
    const rows = await request('GET', url, key, '/rest/v1/articles?select=id&order=id.desc&limit=1');
    const max = (rows && rows[0] && rows[0].id != null) ? Number(rows[0].id) : 70000;
    id = Math.max(70001, max + 1);
    article.id = id;
  }

  const existing = await request('GET', url, key, '/rest/v1/articles?slug=eq.' + encodeURIComponent(article.slug) + '&select=id,slug&limit=1');
  if (existing && existing.length) {
    console.log('Article already exists:', existing[0].slug, '(id', existing[0].id + ')');
    process.exit(0);
  }

  const payload = {
    id: Number(article.id),
    slug: String(article.slug),
    data: article,
    updated_at: new Date().toISOString()
  };

  const result = await request('POST', url, key, '/rest/v1/articles', payload);
  console.log('Created article:', article.slug, '(id', article.id + ')');
  if (result && result[0]) console.log(JSON.stringify(result[0], null, 2));
}

main().catch(function (err) {
  console.error(err.message || err);
  process.exit(1);
});
