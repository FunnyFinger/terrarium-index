// Keep only species-ranked entries in data/plants-merged using GBIF match
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const DELAY_MS = 900;

function delay(ms){return new Promise(r=>setTimeout(r,ms));}

function getJson(url){
  return new Promise((resolve)=>{
    https.get(url, { headers: { 'User-Agent': 'Terrarium Index Bot/1.0' }}, (res)=>{
      let data='';
      res.on('data', d=>data+=d);
      res.on('end', ()=>{ try{ resolve(JSON.parse(data)); }catch{ resolve(null);} });
    }).on('error', ()=>resolve(null));
  });
}

function isSpeciesMatch(res){
  if (!res) return false;
  // GBIF species/match returns rank and/or acceptedUsage info
  const rank = (res.rank || '').toUpperCase();
  if (rank === 'SPECIES') return true;
  if (res.acceptedUsage && (res.acceptedUsage.rank||'').toUpperCase() === 'SPECIES') return true;
  if (res.usage && (res.usage.rank||'').toUpperCase() === 'SPECIES') return true;
  // Sometimes it provides classification; check last taxon rank
  if (Array.isArray(res.classification) && res.classification.length){
    const last = res.classification[res.classification.length-1];
    if ((last.rank||'').toUpperCase() === 'SPECIES') return true;
  }
  return false;
}

async function main(){
  console.log('🔎 Filtering to species-ranked entries (GBIF)...');
  const files = (await fs.readdir(DIR)).filter(f=>f.endsWith('.json') && f!=='index.json');
  let scanned=0, removed=0, kept=0, unknown=0;

  for (const f of files){
    const p = path.join(DIR,f);
    try{
      const raw = await fs.readFile(p,'utf8');
      const j = JSON.parse(raw);
      const sci = (j.scientificName||'').trim();
      // If missing or clearly not a binomial, drop it
      if (!sci || sci.split(/\s+/).length < 2){
        await fs.unlink(p); removed++; continue;
      }
      const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(sci)}`;
      const res = await getJson(url);
      await delay(DELAY_MS);
      if (isSpeciesMatch(res)) { kept++; }
      else { await fs.unlink(p); removed++; }
      scanned++;
    }catch{
      try{ await fs.unlink(p); removed++; }catch{}
    }
  }

  // Rebuild index
  const remaining = (await fs.readdir(DIR)).filter(x=>x.endsWith('.json') && x!=='index.json').sort();
  const indexObj = { count: remaining.length, plants: remaining };
  await fs.writeFile(path.join(DIR,'index.json'), JSON.stringify(indexObj, null, 2), 'utf8');

  console.log(`✅ Done. Kept: ${kept}, Removed: ${removed}, Scanned: ${scanned}`);
}

if (require.main === module){
  main().catch(err=>{ console.error('❌ Species filter failed:', err); process.exit(1); });
}

module.exports = { main };
