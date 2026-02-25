/**
 * Local dev server that writes localStorage-backed edits to the repo (data/overrides/)
 * so that when you push, the hosted site shows the same data.
 * Run: node scripts/sync-server.js
 * Then open http://localhost:3131 (or the port shown). Use the site; saves sync to repo.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.SYNC_PORT || '3131', 10);
const ROOT = path.resolve(__dirname, '..');
const OVERRIDES_DIR = path.join(ROOT, 'data', 'overrides');

function ensureOverridesDir() {
    if (!fs.existsSync(OVERRIDES_DIR)) {
        fs.mkdirSync(OVERRIDES_DIR, { recursive: true });
    }
}

function writeJsonFile(filePath, data) {
    ensureOverridesDir();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
};

function serveFile(filePath, res) {
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const method = req.method;

    // CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API: ping (detect sync server)
    if (url === '/api/ping' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, sync: true }));
        return;
    }

    // API: sync – write overrides to repo
    if (url === '/api/sync' && method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                if (data.equipment != null && Array.isArray(data.equipment)) {
                    writeJsonFile(path.join(OVERRIDES_DIR, 'equipment.json'), data.equipment);
                }
                if (data.plantEdits != null && typeof data.plantEdits === 'object') {
                    writeJsonFile(path.join(OVERRIDES_DIR, 'plant-edits.json'), data.plantEdits);
                }
                if (data.vivariumEdits != null || data.customVivariums != null) {
                    const existing = { edits: {}, custom: [] };
                    try {
                        const p = path.join(OVERRIDES_DIR, 'vivarium-overrides.json');
                        if (fs.existsSync(p)) {
                            const raw = fs.readFileSync(p, 'utf8');
                            const o = JSON.parse(raw);
                            if (o.edits) existing.edits = o.edits;
                            if (Array.isArray(o.custom)) existing.custom = o.custom;
                        }
                    } catch (e) { /* ignore */ }
                    if (data.vivariumEdits != null && typeof data.vivariumEdits === 'object') {
                        existing.edits = data.vivariumEdits;
                    }
                    if (data.customVivariums != null && Array.isArray(data.customVivariums)) {
                        existing.custom = data.customVivariums;
                    }
                    writeJsonFile(path.join(OVERRIDES_DIR, 'vivarium-overrides.json'), existing);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: String(e.message) }));
            }
        });
        return;
    }

    // Static files
    let filePath = path.join(ROOT, url === '/' ? 'index.html' : url.replace(/^\//, ''));
    if (!path.relative(ROOT, filePath).startsWith('..') && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        serveFile(filePath, res);
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log('Sync server: http://localhost:' + PORT);
    console.log('Use this URL when editing; changes will be written to data/overrides/ and will appear on the hosted site after you push.');
});
