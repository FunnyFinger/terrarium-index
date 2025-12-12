const fs = require('fs');
const path = require('path');
const axios = require('axios');

const INPUT_FILE = path.join(__dirname, '..', 'data', 'taxonomy-vernacular-names.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'taxonomy-vernacular-names.json');
const GBIF_API_BASE = 'https://api.gbif.org/v1';
const DELAY_MS = 300;

// Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if a string contains non-English characters or is clearly non-English
function isNonEnglish(text) {
  if (!text || typeof text !== 'string') return false;
  
  // Check for non-Latin scripts (Japanese, Chinese, Korean, etc.)
  const nonLatinScripts = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uAC00-\uD7AF\u0400-\u04FF]/;
  if (nonLatinScripts.test(text)) return true;
  
  // Check for common non-English patterns
  const nonEnglishPatterns = [
    /ordenen$/,  // Danish/Norwegian "order"
    /familien$/, // Danish/Norwegian "family"
    /släktet$/,  // Swedish "genus"
    /slekta$/,   // Norwegian "genus"
    /mossor$/,   // Swedish/Norwegian "mosses"
    /moseslekta$/, // Norwegian
    /begonia$/,  // Swedish/Danish
    /tillandsia$/, // Swedish
    /vriesea$/,  // Swedish
    /filodendro/, // Portuguese/Spanish
    /antúrio/,   // Portuguese
    /flor-de-cera/, // Portuguese
    /planta-zebra/, // Portuguese
    /rabo-de-lagartixa/, // Portuguese
    /cacto-bola/, // Portuguese
    /espada-larga/, // Portuguese
    /costela-de-adão/, // Portuguese
    /piléia/,     // Portuguese
    /jibóia/,     // Portuguese
    /bromélia/,   // Portuguese
    /cipó-milhomens/, // Portuguese
    /trefliksranka/, // Swedish
    /flikranka/,  // Swedish
    /mossranka/,  // Swedish
    /fönstermonstera/, // Swedish
    /glödmasdevallia/, // Swedish
    /sallatsmossa/, // Swedish
    /skär tätört/, // Swedish
    /rödluva/,    // Swedish
    /ampelfackla/, // Swedish
    /bandblad/,   // Swedish
    /dvärgvattenkalla/, // Swedish
    /amazonsvalting/, // Swedish
    /doftbegonia/, // Swedish
    /forellbegonia/, // Swedish
    /prickbegonia/, // Swedish
    /palmbegonia/, // Swedish
    /kihokoro/,   // Swedish
    /smalaxtillandsia/, // Swedish
    /prakttillandsia/, // Swedish
    /pyramidtillandsia/, // Swedish
    /jättevriesea/, // Swedish
    /Cératophyllales/, // French
    /Actinioptéride/, // French
    /Aéonium/,    // French
    /Aldrovande/, // French
    /Davallie/,   // French
    /Céropégie/,  // French
    /Hémionitide/, // French
    /Médinille/,  // French
    /Monstère/,   // French
    /Platycérion/, // French
    /Néphrolépidacées/, // French
    /Adiante réniforme/, // French
    /Anthure magnifique/, // French
    /Arbre Pieuvre/, // French
    /Bulbophylle/, // French
    /Columnée/,   // French
    /Hypœste/,    // French
    /Plante aluminium/, // French
    /Algenfarn/,  // German
    /langes Pfeilblatt/, // German
    /Blaues Alpen-Fettkraut/, // German
    /Bubiköpfchen/, // German
    /lechuguilla/, // Spanish
    /Rabo de León/, // Spanish
    /Rabo de león cenizo/, // Spanish
    /Kris'-plant/, // Spanish
    /Sigin wouj/, // Spanish
    /Miyaibo/,    // Spanish
    /Bejuco De Lira/, // Spanish
    /Jozé/,       // Spanish
    /Bwa kouy/,   // Spanish
    /tai wan yin xian lan/, // Chinese
    /hua lian xi xin/, // Chinese
    /펠리오나무속/, // Korean
  ];
  
  for (const pattern of nonEnglishPatterns) {
    if (pattern.test(text)) return true;
  }
  
  // Check for abbreviations that look wrong
  if (text.includes("'s") && text.length < 10) {
    // Like "Asco's" or "Basidio's" - these are abbreviations, not proper names
    if (text.match(/^[A-Z][a-z]+'s$/)) return true;
  }
  
  // Check for incomplete names (like "And Allies", "Tracheophytes", "Plants" as generic)
  const genericNames = ['Tracheophytes', 'Plants', 'And Allies'];
  if (genericNames.includes(text)) return true;
  
  return false;
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
    
    const matchUrl = `${GBIF_API_BASE}/species/match?name=${encodeURIComponent(name)}&rank=${gbifRank}`;
    const response = await axios.get(matchUrl, { timeout: 10000 });
    
    if (response.status === 200) {
      const data = response.data;
      if (data.matchType && data.matchType !== 'NONE' && data.usageKey) {
        return data.acceptedUsageKey || data.usageKey;
      }
      
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

// Manual fallback mappings for common cases where GBIF doesn't have English names
const manualFallbacks = {
  'Ascomycota': 'Sac Fungi',
  'Basidiomycota': 'Club Fungi',
  'Tracheophyta': 'Vascular Plants',
  'Agaricomycetes': 'Mushroom-forming Fungi',
  'Polytrichopsida': 'Hair-cap Mosses',
  'Sphagnopsida': 'Peat Mosses',
  'Ceratophyllales': 'Hornwort Order',
  'Cladophorales': 'Cladophorales',
  'Gracilariales': 'Gracilariales',
  'Lecanorales': 'Lecanorales',
  'Polypodiales': 'Polypodiales',
  'Zingiberales': 'Ginger Order',
  'Cladophoraceae': 'Cladophoraceae',
  'Gracilariaceae': 'Gracilariaceae',
  'Halymeniaceae': 'Halymeniaceae',
  'Mycenaceae': 'Mycena Family',
  'Nephrolepidaceae': 'Sword Fern Family',
  'Pottiaceae': 'Pottia Family',
  'Actiniopteris': 'Actiniopteris',
  'Aeonium': 'Aeonium',
  'Aldrovanda': 'Waterwheel Plant',
  'Anubias': 'Anubias',
  'Asarum': 'Wild Ginger',
  'Astilboides': 'Astilboides',
  'Bulbophyllum': 'Bulbophyllum',
  'Callisia': 'Roseling',
  'Ceropegia': 'Ceropegia',
  'Columnea': 'Columnea',
  'Cryptanthus': 'Earth Star',
  'Davallia': 'Hare\'s-foot Fern',
  'Elodea': 'Waterweed',
  'Fittonia': 'Nerve Plant',
  'Goeppertia': 'Goeppertia',
  'Halymenia': 'Halymenia',
  'Hemionitis': 'Hemionitis',
  'Hypnum': 'Hypnum Moss',
  'Hypoestes': 'Polka Dot Plant',
  'Limnobium': 'Spongeplant',
  'Macrocentrum': 'Macrocentrum',
  'Medinilla': 'Medinilla',
  'Monstera': 'Monstera',
  'Pellionia': 'Pellionia',
  'Platycerium': 'Staghorn Fern',
  'Pogonatum': 'Pogonatum',
  'Riccardia': 'Riccardia',
  'Soleirolia': 'Baby\'s Tears',
  'Syntrichia': 'Syntrichia',
  'Taxiphyllum': 'Taxiphyllum',
  'Vriesea': 'Vriesea',
  'Wallisia': 'Wallisia',
  'Hygrophila': 'Hygrophila',
  'Streptocarpus': 'Cape Primrose',
  'Achimenes erecta': 'Magic Flower',
  'Actiniopteris australis': 'Actiniopteris',
  'Actiniopteris radiata': 'Actiniopteris',
  'Adiantum reniforme': 'Reniform Maidenhair',
  'Aeschynanthus speciosus': 'Lipstick Plant',
  'Agave lophantha': 'Thorncrest Century Plant',
  'Agave stricta': 'Hedgehog Agave',
  'Agave titanota': 'Titanota Agave',
  'Alluaudia procera': 'Madagascar Ocotillo',
  'Alocasia longiloba': 'Alocasia',
  'Alocasia sanderiana': 'Kris Plant',
  'Anoectochilus formosanus': 'Jewel Orchid',
  'Anthurium crystallinum': 'Crystal Anthurium',
  'Anthurium hookeri': 'Bird\'s Nest Anthurium',
  'Anthurium magnificum': 'Magnificent Anthurium',
  'Anthurium pentaphyllum': 'Anthurium',
  'Anthurium scherzerianum': 'Flamingo Flower',
  'Aristolochia fimbriata': 'Fringed Dutchman\'s Pipe',
  'Asarum splendens': 'Chinese Wild Ginger',
  'Azolla filiculoides': 'Water Fern',
  'Begonia albopicta': 'Spotted Begonia',
  'Begonia conchifolia': 'Shell Begonia',
  'Begonia convolvulacea': 'Morning Glory Begonia',
  'Begonia dregei': 'Grape Leaf Begonia',
  'Begonia elaeagnifolia': 'Begonia',
  'Begonia luxurians': 'Palm Leaf Begonia',
  'Begonia maculata': 'Polka Dot Begonia',
  'Catopsis morreniana': 'Catopsis',
  'Cissus discolor': 'Rex Begonia Vine',
  'Cryptanthus bivittatus': 'Earth Star',
  'Cryptocoryne parva': 'Dwarf Water Trumpet',
  'Dracaena masoniana': 'Dracaena',
  'Echinodorus amazonicus': 'Amazon Sword',
  'Haworthia attenuata': 'Zebra Plant',
  'Haworthia cooperi': 'Cooper\'s Haworthia',
  'Hoya albiflora': 'Wax Plant',
  'Hoya archboldiana': 'Wax Plant',
  'Hoya blashernaezii': 'Wax Plant',
  'Hoya burtoniae': 'Wax Plant',
  'Hoya linearis': 'Wax Plant',
  'Hoya waymaniae': 'Wax Plant',
  'Kroenleinia grusonii': 'Golden Barrel Cactus',
  'Marcgravia umbellata': 'Shingle Plant',
  'Masdevallia veitchiana': 'Veitch\'s Masdevallia',
  'Monosolenium tenerum': 'Monosolenium',
  'Monstera obliqua': 'Monstera',
  'Monstera subpinnata': 'Monstera',
  'Philodendron gloriosum': 'Glorious Philodendron',
  'Philodendron holtonianum': 'Philodendron',
  'Philodendron polypodioides': 'Philodendron',
  'Philodendron sodiroi': 'Silver Leaf Philodendron',
  'Philodendron squamiferum': 'Philodendron',
  'Pilea cadierei': 'Aluminum Plant',
  'Pilea peperomioides': 'Chinese Money Plant',
  'Pinguicula leptoceras': 'Alpine Butterwort',
  'Pinguicula moranensis': 'Butterwort',
  'Scindapsus pictus': 'Satin Pothos',
  'Selaginella moellendorffii': 'Selaginella',
  'Tillandsia duratii': 'Tillandsia',
  'Tillandsia leiboldiana': 'Tillandsia',
  'Tillandsia xerographica': 'Xerographica Air Plant',
  'Vriesea gigantea': 'Giant Vriesea'
};

// Get English vernacular name from GBIF API
async function getEnglishVernacularName(name, rank) {
  // Check manual fallbacks first
  if (manualFallbacks[name]) {
    return manualFallbacks[name];
  }
  
  try {
    const taxonKey = await getGBIFTaxonKey(name, rank);
    if (!taxonKey) {
      return null;
    }
    
    const vernacularUrl = `${GBIF_API_BASE}/species/${taxonKey}/vernacularNames`;
    const response = await axios.get(vernacularUrl, { timeout: 10000 });
    
    if (response.status === 200 && response.data && response.data.results && Array.isArray(response.data.results)) {
      const vernacularNames = response.data.results;
      
      // Filter for English names only
      const englishNames = vernacularNames.filter(v => {
        const lang = (v.language || '').toLowerCase();
        return lang === 'eng' || lang === 'en' || lang === 'english';
      });
      
      if (englishNames.length > 0) {
        // Prefer names without country codes (more general)
        const generalNames = englishNames.filter(v => !v.country);
        if (generalNames.length > 0) {
          return generalNames[0].vernacularName.trim();
        }
        return englishNames[0].vernacularName.trim();
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Main function to fix non-English names
async function fixNonEnglishNames() {
  console.log('🔍 Reviewing and fixing non-English vernacular names...\n');
  
  // Load existing data
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('❌ Input file not found:', INPUT_FILE);
    return;
  }
  
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
  
  let totalChecked = 0;
  let totalFixed = 0;
  let totalNotFound = 0;
  
  for (const rank of ranks) {
    if (!data[rank]) continue;
    
    console.log(`\n📋 Processing ${rank.toUpperCase()}...`);
    const names = Object.keys(data[rank]);
    
    for (const name of names) {
      const currentName = data[rank][name];
      
      // Check if it's non-English
      if (isNonEnglish(currentName)) {
        totalChecked++;
        console.log(`  ⚠️  Non-English found: ${name} → "${currentName}"`);
        
        // Try to get English name from GBIF
        try {
          const englishName = await getEnglishVernacularName(name, rank);
          
          if (englishName && englishName !== currentName) {
            data[rank][name] = englishName;
            totalFixed++;
            console.log(`  ✅ Fixed: ${name} → "${englishName}"`);
          } else {
            totalNotFound++;
            console.log(`  ❌ No English name found for: ${name}`);
            // Keep the original for now, but mark it
          }
          
          await sleep(DELAY_MS);
        } catch (error) {
          console.error(`  ❌ Error fetching English name for ${name}:`, error.message);
          totalNotFound++;
        }
      }
    }
  }
  
  // Save updated data
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  
  console.log(`\n✅ Complete!`);
  console.log(`  📊 Checked: ${totalChecked} non-English names`);
  console.log(`  ✅ Fixed: ${totalFixed} names`);
  console.log(`  ❌ Not found: ${totalNotFound} names`);
  console.log(`  💾 Saved to: ${OUTPUT_FILE}`);
}

// Run the script
if (require.main === module) {
  fixNonEnglishNames().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fixNonEnglishNames, isNonEnglish, getEnglishVernacularName };

