const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'taxonomy-vernacular-names.json');
const GBIF_API_BASE = 'https://api.gbif.org/v1';
const DELAY_MS = 300; // Delay between API calls to be respectful

// Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get GBIF taxon key from name and rank
async function getGBIFTaxonKey(name, rank) {
  try {
    const rankMap = {
      'kingdom': 'KINGDOM',
      'phylum': 'PHYLUM',
      'class': 'CLASS',
      'order': 'ORDER',
      'family': 'FAMILY',
      'genus': 'GENUS',
      'species': 'SPECIES'
    };
    
    const gbifRank = rankMap[rank];
    if (!gbifRank) return null;
    
    // Use GBIF species/match API
    const matchUrl = `${GBIF_API_BASE}/species/match?name=${encodeURIComponent(name)}&rank=${gbifRank}`;
    const response = await axios.get(matchUrl, { timeout: 10000 });
    
    if (response.status === 200) {
      const data = response.data;
      if (data.matchType && data.matchType !== 'NONE' && data.usageKey) {
        // Use acceptedUsageKey if available (for synonyms)
        return data.acceptedUsageKey || data.usageKey;
      }
      
      // If match failed, try search endpoint
      const searchUrl = `${GBIF_API_BASE}/species/search?q=${encodeURIComponent(name)}&rank=${gbifRank}&limit=1`;
      const searchResponse = await axios.get(searchUrl, { timeout: 10000 });
      
      if (searchResponse.status === 200) {
        const searchData = searchResponse.data;
        if (searchData.results && searchData.results.length > 0) {
          const result = searchData.results[0];
          return result.acceptedUsageKey || result.key;
        }
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Get English vernacular name from GBIF API
async function getColVernacularName(name, rank) {
  try {
    // First, get the GBIF taxon key
    const taxonKey = await getGBIFTaxonKey(name, rank);
    if (!taxonKey) {
      return null;
    }
    
    // Fetch vernacular names from GBIF
    const vernacularUrl = `${GBIF_API_BASE}/species/${taxonKey}/vernacularNames`;
    const response = await axios.get(vernacularUrl, { timeout: 10000 });
    
    if (response.status === 200 && response.data && response.data.results && Array.isArray(response.data.results)) {
      const vernacularNames = response.data.results;
      
      // Filter for English names
      const englishNames = vernacularNames.filter(v => {
        const lang = (v.language || '').toLowerCase();
        return lang === 'eng' || lang === 'en' || lang === 'english';
      });
      
      if (englishNames.length > 0) {
        const vernacularName = englishNames[0].vernacularName;
        if (vernacularName && typeof vernacularName === 'string') {
          return vernacularName.trim();
        }
      }
      
      // If no English name, try any vernacular name
      if (vernacularNames.length > 0) {
        const vernacularName = vernacularNames[0].vernacularName;
        if (vernacularName && typeof vernacularName === 'string') {
          return vernacularName.trim();
        }
      }
    }
    
    return null;
  } catch (error) {
    // Silently fail - not all taxa have vernacular names
    return null;
  }
}

// Collect all unique taxonomic names from plant files
function collectTaxonomicNames() {
  const taxonomicNames = {
    kingdom: new Set(),
    phylum: new Set(),
    class: new Set(),
    order: new Set(),
    family: new Set(),
    genus: new Set(),
    species: new Set()
  };
  
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  
  console.log(`📚 Reading ${files.length} plant files...`);
  
  files.forEach(file => {
    try {
      const filePath = path.join(PLANTS_DIR, file);
      const plantData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (plantData.taxonomy) {
        const taxonomy = plantData.taxonomy;
        if (taxonomy.kingdom) taxonomicNames.kingdom.add(taxonomy.kingdom);
        if (taxonomy.phylum) taxonomicNames.phylum.add(taxonomy.phylum);
        if (taxonomy.class) taxonomicNames.class.add(taxonomy.class);
        if (taxonomy.order) taxonomicNames.order.add(taxonomy.order);
        if (taxonomy.family) taxonomicNames.family.add(taxonomy.family);
        if (taxonomy.genus) taxonomicNames.genus.add(taxonomy.genus);
        if (taxonomy.species) taxonomicNames.species.add(taxonomy.species);
      }
    } catch (error) {
      console.warn(`Error reading ${file}:`, error.message);
    }
  });
  
  // Convert Sets to Arrays and sort
  return {
    kingdom: Array.from(taxonomicNames.kingdom).sort(),
    phylum: Array.from(taxonomicNames.phylum).sort(),
    class: Array.from(taxonomicNames.class).sort(),
    order: Array.from(taxonomicNames.order).sort(),
    family: Array.from(taxonomicNames.family).sort(),
    genus: Array.from(taxonomicNames.genus).sort(),
    species: Array.from(taxonomicNames.species).sort()
  };
}

// Main function to fetch and store vernacular names
async function fetchVernacularNames() {
  console.log('🌿 Starting vernacular name fetching from GBIF...\n');
  
  // Load existing data if it exists
  let existingData = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      console.log('📖 Loaded existing vernacular names data\n');
    } catch (error) {
      console.warn('Could not load existing data, starting fresh\n');
    }
  }
  
  // Collect all unique taxonomic names
  const taxonomicNames = collectTaxonomicNames();
  
  // Initialize output structure
  const vernacularNames = {
    kingdom: existingData.kingdom || {},
    phylum: existingData.phylum || {},
    class: existingData.class || {},
    order: existingData.order || {},
    family: existingData.family || {},
    genus: existingData.genus || {},
    species: existingData.species || {}
  };
  
  // Process each rank
  const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
  
  for (const rank of ranks) {
    const names = taxonomicNames[rank];
    console.log(`\n📋 Processing ${rank.toUpperCase()} (${names.length} unique names)...`);
    
    let processed = 0;
    let found = 0;
    let notFound = 0;
    
    for (const name of names) {
      // Skip if we already have it
      if (vernacularNames[rank][name]) {
        processed++;
        found++;
        continue;
      }
      
      // Skip "Unknown" and empty names
      if (!name || name === 'Unknown' || name.trim() === '') {
        processed++;
        continue;
      }
      
      try {
        // Debug: log what we're searching for
        if (processed === 0 || processed % 20 === 0) {
          console.log(`  🔍 Searching for: ${name} (${rank})...`);
        }
        
        const vernacularName = await getColVernacularName(name, rank);
        
        if (vernacularName) {
          vernacularNames[rank][name] = vernacularName;
          found++;
          console.log(`  ✅ ${name} → ${vernacularName}`);
        } else {
          notFound++;
          // Only log not found for first few to avoid spam
          if (notFound <= 5 || notFound % 50 === 0) {
            console.log(`  ⚠️  ${name} → (not found)`);
          }
        }
        
        processed++;
        
        // Save progress periodically (every 10 names)
        if (processed % 10 === 0) {
          fs.writeFileSync(OUTPUT_FILE, JSON.stringify(vernacularNames, null, 2) + '\n', 'utf8');
        }
        
        // Be respectful to the API
        if (processed < names.length) {
          await sleep(DELAY_MS);
        }
      } catch (error) {
        console.error(`  ❌ Error fetching ${name}:`, error.message);
        processed++;
        notFound++;
        
        // Still wait to be respectful
        if (processed < names.length) {
          await sleep(DELAY_MS);
        }
      }
    }
    
    console.log(`\n  📊 ${rank.toUpperCase()}: ${found} found, ${notFound} not found, ${processed} total`);
  }
  
  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(vernacularNames, null, 2) + '\n', 'utf8');
  
  console.log(`\n✅ Complete! Vernacular names saved to ${OUTPUT_FILE}`);
  
  // Print summary
  console.log('\n📊 Summary:');
  ranks.forEach(rank => {
    const count = Object.keys(vernacularNames[rank]).length;
    console.log(`  ${rank}: ${count} vernacular names`);
  });
}

// Test function to check API response structure
async function testAPI() {
  console.log('🧪 Testing GBIF API with known taxa...\n');
  
  const testCases = [
    { name: 'Plantae', rank: 'kingdom' },
    { name: 'Bromeliaceae', rank: 'family' },
    { name: 'Tillandsia', rank: 'genus' }
  ];
  
  for (const test of testCases) {
    console.log(`\nTesting: ${test.name} (${test.rank})`);
    try {
      const key = await getGBIFTaxonKey(test.name, test.rank);
      console.log(`  GBIF Key: ${key}`);
      
      if (key) {
        const vernacularUrl = `${GBIF_API_BASE}/species/${key}/vernacularNames`;
        const response = await axios.get(vernacularUrl, { timeout: 10000 });
        
        if (response.status === 200) {
          console.log(`  Vernacular names: ${JSON.stringify(response.data, null, 2).substring(0, 500)}`);
        }
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Response:', error.response.status, error.response.data);
      }
    }
    
    await sleep(500);
  }
}

// Run the script
if (require.main === module) {
  // Check if test mode
  if (process.argv.includes('--test')) {
    testAPI().catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
  } else {
    fetchVernacularNames().catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
  }
}

module.exports = { fetchVernacularNames, getColVernacularName, getGBIFTaxonKey, testAPI };

