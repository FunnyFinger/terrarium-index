// Remove remote image URLs and keep only local image paths in data/plants-merged
const fs = require('fs').promises;
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function isRemote(u){ return /^https?:\/\//i.test(String(u||'')); }
function isLocal(u){ return !!u && !isRemote(u); }

async function main(){
  console.log('🧹 Removing remote image URLs from merged files...');
  const files = (await fs.readdir(DIR)).filter(f=>f.endsWith('.json') && f!=='index.json');
  let changed=0, processed=0;
  for (const f of files){
    const p = path.join(DIR, f);
    try{
      const raw = await fs.readFile(p, 'utf8');
      const j = JSON.parse(raw);

      const images = Array.isArray(j.images) ? j.images.filter(isLocal) : [];
      const imageUrlLocal = isLocal(j.imageUrl) ? j.imageUrl : (images[0] || undefined);

      // Apply changes
      j.images = images;
      if (imageUrlLocal) j.imageUrl = imageUrlLocal; else delete j.imageUrl;

      const out = JSON.stringify(j, null, 2);
      if (out !== raw){
        await fs.writeFile(p, out, 'utf8');
        changed++;
      }
      processed++;
    }catch{}
  }
  console.log(`✅ Done. Processed: ${processed}, Updated: ${changed}`);
}

if (require.main === module){
  main().catch(err=>{ console.error('❌ Remove remote URLs failed:', err); process.exit(1); });
}

module.exports = { main };
