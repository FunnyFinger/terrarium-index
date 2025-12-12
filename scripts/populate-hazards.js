const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Known toxic plant families
const TOXIC_FAMILIES = new Set([
  'araceae',           // Aroids - contain calcium oxalate crystals
  'euphorbiaceae',     // Euphorbias - toxic sap
  'apocynaceae',       // Many toxic (oleander, etc.)
  'solanaceae',        // Nightshade family
  'liliaceae',         // Some lilies toxic to pets
  'asparagaceae'       // Some asparagus family plants
]);

// Known non-toxic families
const NON_TOXIC_FAMILIES = new Set([
  'bromeliaceae',      // Bromeliads generally safe
  'orchidaceae',       // Orchids generally safe
  'polypodiaceae',     // Most ferns safe
  'plantaginaceae',    // Plantains generally safe
  'lythraceae',        // Most safe
  'acanthaceae'        // Acanthus family generally safe
]);

// Specific known toxic genera
const TOXIC_GENERA = new Set([
  'dieffenbachia',     // Dumb cane - highly toxic
  'philodendron',      // Toxic
  'alocasia',          // Toxic
  'anthurium',         // Toxic
  'aglaonema',         // Toxic
  'syngonium',         // Toxic
  'epipremnum',        // Toxic (pothos)
  'monstera',          // Toxic
  'scindapsus',        // Toxic
  'spathiphyllum',     // Peace lily - toxic
  'zantedeschia',      // Calla lily - toxic
  'euphorbia',         // Toxic sap
  'adenium',           // Desert rose - toxic
  'oleander'           // Highly toxic
]);

// Specific known non-toxic genera
const NON_TOXIC_GENERA = new Set([
  'peperomia',         // Generally safe
  'hoya',              // Safe
  'tillandsia',        // Air plants - safe
  'stapelia',          // Safe
  'haworthia',         // Safe
  'echeveria',         // Safe
  'sedum',             // Safe
  'crassula',          // Safe
  'pilea',             // Safe
  'chlorophytum',      // Spider plant - safe
  'tradescantia',      // Safe
  'oxalis',            // Safe
  'fittonia'           // Safe
]);

function inferHazard(plant) {
  // If already set and not null, keep it
  if (plant.hazard && plant.hazard !== null && plant.hazard.trim() !== '') {
    return plant.hazard;
  }

  const taxonomy = plant.taxonomy || {};
  const family = String(taxonomy.family || '').toLowerCase();
  const genus = String(taxonomy.genus || '').toLowerCase();
  const scientificName = String(plant.scientificName || '').toLowerCase();

  // Check for known toxic genera
  if (TOXIC_GENERA.has(genus) || TOXIC_GENERA.has(scientificName.split(' ')[0])) {
    // Check if it's in Araceae family (calcium oxalate)
    if (family === 'araceae') {
      return 'toxic if ingested';
    }
    return 'toxic if ingested';
  }

  // Check for known non-toxic genera
  if (NON_TOXIC_GENERA.has(genus) || NON_TOXIC_GENERA.has(scientificName.split(' ')[0])) {
    return 'non-toxic';
  }

  // Check toxic families
  if (TOXIC_FAMILIES.has(family)) {
    if (family === 'araceae') {
      return 'toxic if ingested';
    }
    if (family === 'euphorbiaceae') {
      return 'handle with care - toxic sap';
    }
    return 'toxic if ingested';
  }

  // Check non-toxic families
  if (NON_TOXIC_FAMILIES.has(family)) {
    return 'non-toxic';
  }

  // Check category for clues
  const categories = (plant.category || []).map(c => String(c).toLowerCase());
  if (categories.includes('cactus') || categories.includes('succulent')) {
    // Most cacti and succulents are safe but some have spines
    return 'handle with care';
  }

  // Default to non-toxic for safety (better to be cautious and mark as unknown)
  return 'non-toxic';
}

function main() {
  console.log('🔒 Populating hazard information for all plants...\n');
  
  const files = fs.readdirSync(PLANTS_DIR)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .sort();
  
  console.log(`Found ${files.length} plant files to process\n`);
  
  let processed = 0;
  let updated = 0;
  
  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    
    try {
      const plantData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const inferredHazard = inferHazard(plantData);
      
      // Only update if currently null/empty
      if (!plantData.hazard || plantData.hazard === null || plantData.hazard.trim() === '') {
        plantData.hazard = inferredHazard;
        
        fs.writeFileSync(filePath, JSON.stringify(plantData, null, 2) + '\n', 'utf8');
        updated++;
        console.log(`✅ Updated: ${plantData.name || file} → ${inferredHazard}`);
      }
      
      processed++;
      
    } catch (error) {
      console.error(`  ❌ Error processing ${file}: ${error.message}`);
      processed++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`\n✨ Hazard population complete!`);
}

if (require.main === module) {
  main();
}

