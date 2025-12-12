const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const GBIF_API_BASE = 'https://api.gbif.org/v1';
const DELAY_MS = 200; // Delay between API calls to be respectful

// Mapping from GBIF rank to our taxonomy field names
const RANK_MAP = {
  'KINGDOM': 'kingdom',
  'PHYLUM': 'phylum',
  'CLASS': 'class',
  'ORDER': 'order',
  'FAMILY': 'family',
  'GENUS': 'genus',
  'SPECIES': 'species'
};

/**
 * Search GBIF for a species name and get the taxonomy
 */
async function getGBIFTaxonomy(scientificName) {
  if (!scientificName || scientificName.trim() === '') {
    return null;
  }

  try {
    // Resolve to accepted usage via species/match when possible
    let speciesKey = null;
    try {
      const nameStr = scientificName.trim();
      const parts = nameStr.split(/\s+/);
      const genusParam = parts[0];
      const speciesParam = parts.length > 1 ? parts[1] : undefined;
      const matchParams = {
        name: nameStr,
        strict: false,
        rank: 'SPECIES',
        kingdom: 'Plantae'
      };
      if (genusParam) matchParams.genus = genusParam;
      if (speciesParam) matchParams.specificEpithet = speciesParam;

      const matchResp = await axios.get(`${GBIF_API_BASE}/species/match`, {
        params: matchParams,
        timeout: 10000
      });
      const m = matchResp.data || {};
      speciesKey = m.acceptedUsageKey || m.usageKey || m.speciesKey || m.key || null;
    } catch (_) {
      // ignore and use fallback search
    }

    if (!speciesKey) {
      const searchResponse = await axios.get(`${GBIF_API_BASE}/species/search`, {
        params: {
          q: scientificName.trim(),
          limit: 5
        },
        timeout: 10000
      });

      if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
        console.log(`  ⚠️  No results found for: ${scientificName}`);
        return null;
      }

      const results = searchResponse.data.results;
      const preferred = results.find(r => r.rank === 'SPECIES' && (r.taxonomicStatus === 'ACCEPTED' || r.status === 'ACCEPTED'))
        || results.find(r => r.rank === 'SPECIES')
        || results[0];
      speciesKey = preferred.acceptedUsageKey || preferred.key;
    }
    
    // Get the full taxonomy tree for this species
    const taxonomyResponse = await axios.get(`${GBIF_API_BASE}/species/${speciesKey}`, {
      timeout: 10000
    });

    const species = taxonomyResponse.data;
    
    // Extract taxonomy from the response
    const taxonomy = {};
    
    // Get taxonomy from the species object
    if (species.kingdom) taxonomy.kingdom = species.kingdom;
    if (species.phylum) taxonomy.phylum = species.phylum;
    if (species.class) taxonomy.class = species.class;
    if (species.order) taxonomy.order = species.order;
    if (species.family) taxonomy.family = species.family;
    if (species.genus) taxonomy.genus = species.genus;
    if (species.species) taxonomy.species = species.species;

    // Extract species from canonicalName if not already set
    if (!taxonomy.species && species.canonicalName) {
      const parts = species.canonicalName.trim().split(' ');
      if (parts.length >= 2) {
        taxonomy.species = parts[1];
      }
    }

    // If some ranks are missing, get from parent hierarchy
    try {
      const parentsResponse = await axios.get(`${GBIF_API_BASE}/species/${speciesKey}/parents`, {
        timeout: 10000
      });

      const parents = Array.isArray(parentsResponse.data) ? parentsResponse.data : [];
      
      // Traverse parents to fill missing ranks
      for (const parent of parents) {
        const rank = parent.rank?.toUpperCase();
        const name = parent.scientificName;

        if (!name) continue;

        if (rank === 'KINGDOM' && !taxonomy.kingdom) {
          taxonomy.kingdom = name;
        } else if (rank === 'PHYLUM' && !taxonomy.phylum) {
          taxonomy.phylum = name;
        } else if (rank === 'CLASS' && !taxonomy.class) {
          taxonomy.class = name;
        } else if (rank === 'ORDER' && !taxonomy.order) {
          taxonomy.order = name;
        } else if (rank === 'FAMILY' && !taxonomy.family) {
          taxonomy.family = name;
        } else if (rank === 'GENUS' && !taxonomy.genus) {
          taxonomy.genus = name;
        }
      }
    } catch (err) {
      // Ignore if parents endpoint fails
      // console.log(`  ⚠️  Could not fetch parent taxonomy: ${err.message}`);
    }

    // Ensure we have at least kingdom
    if (!taxonomy.kingdom) {
      taxonomy.kingdom = 'Plantae';
    }

    // Extract species from scientific name if still missing
    if (!taxonomy.species && scientificName) {
      const parts = scientificName.trim().split(' ');
      if (parts.length >= 2) {
        taxonomy.species = parts[1];
      }
    }

    return Object.keys(taxonomy).length > 0 ? taxonomy : null;

  } catch (error) {
    if (error.response) {
      console.log(`  ❌ API error for ${scientificName}: ${error.response.status} ${error.response.statusText}`);
    } else if (error.request) {
      console.log(`  ❌ Network error for ${scientificName}: No response from GBIF`);
    } else {
      console.log(`  ❌ Error for ${scientificName}: ${error.message}`);
    }
    return null;
  }
}

/**
 * Delay function to be respectful to GBIF API
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Process all plant files
 */
async function enrichAllTaxonomy() {
  console.log('🌿 Starting taxonomy enrichment from GBIF...\n');

  // Get all JSON files
  const files = fs.readdirSync(PLANTS_DIR)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .sort();

  console.log(`Found ${files.length} plant files to process\n`);

  let processed = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    
    try {
      const plantData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Skip if no scientific name
      if (!plantData.scientificName) {
        console.log(`⏭️  Skipping ${file}: No scientific name`);
        skipped++;
        continue;
      }

      console.log(`📖 Processing: ${plantData.name || file} (${plantData.scientificName})`);

      // Get taxonomy from GBIF
      const gbifTaxonomy = await getGBIFTaxonomy(plantData.scientificName);

      if (gbifTaxonomy) {
        // Merge with existing taxonomy, prefer GBIF data when available
        const existingTaxonomy = plantData.taxonomy || {};
        
        // Merge: prefer GBIF data, but keep existing if GBIF doesn't have it
        const mergedTaxonomy = {
          kingdom: gbifTaxonomy.kingdom || existingTaxonomy.kingdom || 'Plantae',
          phylum: gbifTaxonomy.phylum || existingTaxonomy.phylum || null,
          class: gbifTaxonomy.class || existingTaxonomy.class || null,
          order: gbifTaxonomy.order || existingTaxonomy.order || null,
          family: gbifTaxonomy.family || existingTaxonomy.family || null,
          genus: gbifTaxonomy.genus || existingTaxonomy.genus || null,
          species: gbifTaxonomy.species || existingTaxonomy.species || null
        };

        // Always update taxonomy to ensure completeness
        plantData.taxonomy = mergedTaxonomy;
        
        // Save updated file
        fs.writeFileSync(filePath, JSON.stringify(plantData, null, 2) + '\n', 'utf8');
        
        const ranks = Object.entries(mergedTaxonomy)
          .filter(([_, v]) => v)
          .map(([k]) => k)
          .join(', ');
        
        const allRanks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
        const missingRanks = allRanks.filter(rank => !mergedTaxonomy[rank]);
        
        if (missingRanks.length > 0) {
          console.log(`  ✅ Updated taxonomy: ${ranks} (missing: ${missingRanks.join(', ')})`);
        } else {
          console.log(`  ✅ Complete taxonomy: ${ranks}`);
        }
        
        updated++;
      } else {
        console.log(`  ⚠️  Could not fetch taxonomy from GBIF`);
        failed++;
      }

      processed++;

      // Be respectful to the API
      if (processed < files.length) {
        await sleep(DELAY_MS);
      }

    } catch (error) {
      console.error(`  ❌ Error processing ${file}: ${error.message}`);
      failed++;
      processed++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`\n✨ Taxonomy enrichment complete!`);
}

// Run the script
enrichAllTaxonomy().catch(console.error);

