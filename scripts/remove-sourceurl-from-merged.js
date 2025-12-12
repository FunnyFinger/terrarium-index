// Remove the sourceUrl field from every JSON in data/plants-merged
const fs = require('fs').promises;
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'plants-merged');

async function main() {
  console.log('🗑️ Removing sourceUrl from merged plants...');
  const files = (await fs.readdir(DIR)).filter(f => f.endsWith('.json') && f !== 'index.json');
  let changed = 0;
  for (const f of files) {
    const p = path.join(DIR, f);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const j = JSON.parse(raw);
      if ('sourceUrl' in j) {
        delete j.sourceUrl;
        await fs.writeFile(p, JSON.stringify(j, null, 2), 'utf8');
        changed++;
      }
    } catch (_) {}
  }
  console.log(`✅ Done. Updated ${changed} files.`);
}

if (require.main === module) {
  main().catch(err => { console.error('❌ Removal failed:', err); process.exit(1); });
}

module.exports = { main };
