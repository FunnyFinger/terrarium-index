const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Get taxonomy key for comparison
function getTaxonomyKey(taxonomy) {
  if (!taxonomy || typeof taxonomy !== 'object') return null;
  
  return [
    taxonomy.kingdom || '',
    taxonomy.phylum || '',
    taxonomy.class || '',
    taxonomy.order || '',
    taxonomy.family || '',
    taxonomy.genus || '',
    taxonomy.species || ''
  ].join('|').toLowerCase().trim();
}

// Get scientific name key (fallback if taxonomy is missing)
function getScientificNameKey(scientificName) {
  if (!scientificName) return null;
  return scientificName.toLowerCase().trim();
}

function findDuplicates() {
  console.log('🔍 Analyzing plants for duplicates based on taxonomy...\n');
  
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const taxonomyMap = new Map();
  const scientificNameMap = new Map();
  const plants = [];
  
  // First pass: collect all plants
  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const plant = JSON.parse(content);
    
    plants.push({
      file,
      plant,
      taxonomyKey: getTaxonomyKey(plant.taxonomy),
      scientificNameKey: getScientificNameKey(plant.scientificName)
    });
  }
  
  // Group by taxonomy
  for (const { file, plant, taxonomyKey, scientificNameKey } of plants) {
    if (taxonomyKey && taxonomyKey !== '||||||') {
      if (!taxonomyMap.has(taxonomyKey)) {
        taxonomyMap.set(taxonomyKey, []);
      }
      taxonomyMap.get(taxonomyKey).push({ file, plant, taxonomyKey, scientificNameKey });
    }
    
    // Also track by scientific name as fallback
    if (scientificNameKey) {
      if (!scientificNameMap.has(scientificNameKey)) {
        scientificNameMap.set(scientificNameKey, []);
      }
      scientificNameMap.get(scientificNameKey).push({ file, plant, taxonomyKey, scientificNameKey });
    }
  }
  
  // Find duplicates
  const duplicatesByTaxonomy = [];
  const duplicatesByScientificName = [];
  
  taxonomyMap.forEach((group, key) => {
    if (group.length > 1) {
      duplicatesByTaxonomy.push({
        taxonomyKey: key,
        taxonomy: group[0].plant.taxonomy,
        plants: group
      });
    }
  });
  
  scientificNameMap.forEach((group, key) => {
    if (group.length > 1) {
      // Check if this is already covered by taxonomy duplicates
      const taxonomyKey = group[0].taxonomyKey;
      const alreadyFound = duplicatesByTaxonomy.some(d => 
        d.plants.some(p => p.file === group[0].file)
      );
      
      if (!alreadyFound) {
        duplicatesByScientificName.push({
          scientificName: key,
          plants: group
        });
      }
    }
  });
  
  // Report findings
  console.log(`📊 Total plants analyzed: ${files.length}\n`);
  console.log(`🔴 Duplicates by taxonomy (same species): ${duplicatesByTaxonomy.length} groups\n`);
  
  if (duplicatesByTaxonomy.length > 0) {
    console.log('Taxonomy-based duplicates:');
    duplicatesByTaxonomy.forEach((dup, idx) => {
      console.log(`\n${idx + 1}. ${dup.taxonomy.genus} ${dup.taxonomy.species || 'sp.'}`);
      console.log(`   Taxonomy: ${dup.taxonomyKey}`);
      console.log(`   Found in ${dup.plants.length} files:`);
      dup.plants.forEach(({ file, plant }) => {
        console.log(`   - ${file}`);
        console.log(`     Name: ${plant.name}`);
        console.log(`     Scientific: ${plant.scientificName || 'N/A'}`);
        console.log(`     ID: ${plant.id || 'N/A'}`);
      });
    });
  }
  
  if (duplicatesByScientificName.length > 0) {
    console.log(`\n\n🟡 Potential duplicates by scientific name: ${duplicatesByScientificName.length} groups\n`);
    duplicatesByScientificName.forEach((dup, idx) => {
      console.log(`\n${idx + 1}. Scientific Name: ${dup.scientificName}`);
      console.log(`   Found in ${dup.plants.length} files:`);
      dup.plants.forEach(({ file, plant }) => {
        console.log(`   - ${file}`);
        console.log(`     Name: ${plant.name}`);
        console.log(`     Taxonomy: ${getTaxonomyKey(plant.taxonomy) || 'Incomplete'}`);
      });
    });
  }
  
  return {
    duplicatesByTaxonomy,
    duplicatesByScientificName,
    totalFiles: files.length
  };
}

const results = findDuplicates();
console.log(`\n\n✅ Analysis complete!`);
console.log(`Found ${results.duplicatesByTaxonomy.length} duplicate groups by taxonomy`);
console.log(`Found ${results.duplicatesByScientificName.length} potential duplicate groups by scientific name`);

