// Rename files in data/plants-merged to a consistent sequential format
// Format: 00001-slug.json (5-digit, zero-padded), sorted by id (asc) then name

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function slugify(text) {
  return (text || 'plant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function pad(n) {
  return String(n).padStart(5, '0');
}

function shortHash(s) {
  return crypto.createHash('md5').update(s).digest('hex').slice(0, 6);
}

async function main() {
  console.log('🔤 Renaming files in data/plants-merged to a consistent sequence...');
  const files = (await fs.readdir(MERGED_DIR)).filter(f => f.endsWith('.json') && f !== 'index.json');
  const items = [];

  for (const f of files) {
    const p = path.join(MERGED_DIR, f);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const plant = JSON.parse(raw);
      const id = Number.isFinite(plant.id) ? plant.id : null;
      const name = plant.name || plant.scientificName || f.replace(/\.json$/, '');
      items.push({ file: f, path: p, plant, id, name });
    } catch (_) {
      // skip unreadable
    }
  }

  // Sort by id (nulls last), then by name
  items.sort((a, b) => {
    const ai = a.id; const bi = b.id;
    if (Number.isFinite(ai) && Number.isFinite(bi)) {
      if (ai !== bi) return ai - bi;
    } else if (Number.isFinite(ai)) {
      return -1;
    } else if (Number.isFinite(bi)) {
      return 1;
    }
    const an = (a.name || '').toLowerCase();
    const bn = (b.name || '').toLowerCase();
    return an.localeCompare(bn);
  });

  // Build new names and rename
  const used = new Set();
  const newFiles = [];
  let index = 1;

  for (const it of items) {
    const baseSlug = slugify(it.name);
    let target = `${pad(index)}-${baseSlug}.json`;
    if (used.has(target)) {
      target = `${pad(index)}-${baseSlug}-${shortHash(it.file)}.json`;
    }
    used.add(target);

    const oldPath = path.join(MERGED_DIR, it.file);
    const newPath = path.join(MERGED_DIR, target);

    if (it.file !== target) {
      try {
        await fs.rename(oldPath, newPath);
      } catch (e) {
        // If cross-device or name collision, write-copy-delete fallback
        const content = await fs.readFile(oldPath);
        await fs.writeFile(newPath, content);
        await fs.unlink(oldPath);
      }
    }
    newFiles.push(target);
    index++;
  }

  // Rebuild index.json
  const indexObj = { count: newFiles.length, plants: newFiles };
  await fs.writeFile(path.join(MERGED_DIR, 'index.json'), JSON.stringify(indexObj, null, 2), 'utf8');

  console.log(`✅ Renamed ${newFiles.length} files. Example first 5: `);
  console.log(newFiles.slice(0, 5));
}

if (require.main === module) {
  main().catch(err => { console.error('❌ Rename failed:', err); process.exit(1); });
}

module.exports = { main };
