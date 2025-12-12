// Localize images for merged plants: create subfolder per plant under images/, download remote images, and rewrite paths
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const MERGED_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const IMAGES_DIR = path.join(__dirname, '..', 'images');
const MAX_PER_PLANT = 3; // cap to avoid huge downloads
const DELAY_MS = 400;

function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

function slugify(text){
  return String(text||'plant').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
}

function isRemote(u){ return /^https?:\/\//i.test(String(u||'')); }

function getExtFromUrl(u){
  const q = String(u).split('?')[0];
  const m = q.match(/\.(jpg|jpeg|png|webp|gif)$/i);
  return m ? (m[1].toLowerCase()==='jpeg'?'jpg':m[1].toLowerCase()) : 'jpg';
}

function download(url, toPath){
  return new Promise((resolve,reject)=>{
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent':'Terrarium Index Bot/1.0' }}, (res)=>{
      if (res.statusCode && [301,302,307,308].includes(res.statusCode)){
        const loc = res.headers.location; if (loc) return download(loc, toPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200){ return reject(new Error(`HTTP ${res.statusCode}`)); }
      const ws = fssync.createWriteStream(toPath);
      res.pipe(ws);
      ws.on('finish', ()=>{ ws.close(); resolve(); });
      ws.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureDir(dir){ await fs.mkdir(dir, { recursive: true }); }

async function processOne(file){
  const filePath = path.join(MERGED_DIR, file);
  const raw = await fs.readFile(filePath, 'utf8');
  const plant = JSON.parse(raw);

  const baseSlug = slugify(plant.name || plant.scientificName || file.replace(/\.json$/,''));
  // Use scientific name slug or plant name slug without number prefix
  // Strip number prefix if present in the slug
  const folderName = baseSlug.replace(/^\d{5}-/, '');
  const targetDir = path.join(IMAGES_DIR, folderName);
  await ensureDir(targetDir);

  const inputs = [];
  if (plant.imageUrl) inputs.push(plant.imageUrl);
  if (Array.isArray(plant.images)) inputs.push(...plant.images);

  const seen = new Set();
  const localPaths = [];

  let idx = 1;
  for (const src of inputs){
    if (!src || seen.has(src)) continue;
    seen.add(src);
    if (localPaths.length >= MAX_PER_PLANT) break;

    if (isRemote(src)){
      const ext = getExtFromUrl(src);
      const filename = `${String(idx).padStart(2,'0')}.${ext}`;
      const toPath = path.join(targetDir, filename);
      try{
        await download(src, toPath);
        localPaths.push(`images/${folderName}/${filename}`);
        idx++;
        await delay(DELAY_MS);
      }catch{
        // skip failed downloads
      }
    } else {
      // Already local path; move/copy into target folder if not there
      const srcPath = path.join(__dirname, '..', src.replace(/^\/*/, ''));
      const ext = path.extname(srcPath) || '.jpg';
      const filename = `${String(idx).padStart(2,'0')}${ext}`;
      const toPath = path.join(targetDir, filename);
      try{
        if (fssync.existsSync(srcPath)){
          await fs.copyFile(srcPath, toPath);
          localPaths.push(`images/${folderName}/${filename}`);
          idx++;
        }
      }catch{}
    }
  }

  // If nothing collected, leave as-is
  if (localPaths.length === 0) return { updated:false };

  plant.images = localPaths;
  plant.imageUrl = localPaths[0];

  await fs.writeFile(filePath, JSON.stringify(plant, null, 2), 'utf8');
  return { updated:true, folder: folderName, count: localPaths.length };
}

async function main(){
  console.log('🖼️ Localizing merged images into images/<plant>/ folders...');
  await ensureDir(IMAGES_DIR);
  const files = (await fs.readdir(MERGED_DIR)).filter(f=>f.endsWith('.json') && f!=='index.json');
  let updated=0, processed=0;
  for (const f of files){
    try{
      const res = await processOne(f);
      if (res.updated) updated++;
      processed++;
    }catch{}
  }
  console.log(`✅ Done. Processed: ${processed}, Updated: ${updated}`);
}

if (require.main === module){
  main().catch(err=>{ console.error('❌ Localize failed:', err); process.exit(1); });
}

module.exports = { main };
