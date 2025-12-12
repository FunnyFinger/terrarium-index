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

// Score a plant for completeness (higher score = more complete)
function scorePlantCompleteness(plant) {
  let score = 0;
  
  if (plant.name) score += 1;
  if (plant.scientificName) score += 1;
  if (plant.description && plant.description.length > 50) score += 2;
  if (plant.careTips && plant.careTips.length > 0) score += plant.careTips.length;
  if (plant.images && plant.images.length > 0) score += plant.images.length;
  if (plant.category && plant.category.length > 0) score += plant.category.length;
  if (plant.lightRequirements) score += 1;
  if (plant.humidity) score += 1;
  if (plant.temperature) score += 1;
  if (plant.watering) score += 1;
  if (plant.substrate) score += 1;
  if (plant.size) score += 1;
  if (plant.growthRate) score += 1;
  if (plant.taxonomy && Object.keys(plant.taxonomy).length >= 7) score += 2;
  
  return score;
}

// Merge two plants, keeping the best data from both
function mergePlants(primary, secondary) {
  const merged = { ...primary };
  
  // Merge images (unique)
  const allImages = new Set();
  if (primary.images) primary.images.forEach(img => allImages.add(img));
  if (secondary.images) secondary.images.forEach(img => allImages.add(img));
  if (primary.imageUrl) allImages.add(primary.imageUrl);
  if (secondary.imageUrl) allImages.add(secondary.imageUrl);
  merged.images = Array.from(allImages);
  if (merged.images.length > 0 && !merged.imageUrl) {
    merged.imageUrl = merged.images[0];
  }
  
  // Merge care tips (unique)
  const allTips = new Set();
  if (primary.careTips) primary.careTips.forEach(tip => allTips.add(tip.trim()));
  if (secondary.careTips) secondary.careTips.forEach(tip => allTips.add(tip.trim()));
  merged.careTips = Array.from(allTips);
  
  // Merge categories (unique)
  const allCategories = new Set();
  if (primary.category) primary.category.forEach(cat => allCategories.add(cat));
  if (secondary.category) secondary.category.forEach(cat => allCategories.add(cat));
  merged.category = Array.from(allCategories);
  
  // Merge vivarium types (unique)
  const allVivariumTypes = new Set();
  if (primary.vivariumType) primary.vivariumType.forEach(vt => allVivariumTypes.add(vt));
  if (secondary.vivariumType) secondary.vivariumType.forEach(vt => allVivariumTypes.add(vt));
  merged.vivariumType = Array.from(allVivariumTypes);
  
  // Use longer/better description
  if (secondary.description && 
      (!primary.description || secondary.description.length > primary.description.length)) {
    merged.description = secondary.description;
  }
  
  // Use more specific name if available
  if (secondary.name && secondary.name.length > primary.name.length) {
    merged.name = secondary.name;
  }
  
  // Use more complete scientific name
  if (secondary.scientificName && 
      (!primary.scientificName || secondary.scientificName.length > primary.scientificName.length)) {
    merged.scientificName = secondary.scientificName;
  }
  
  // Keep the primary ID (keep the first one)
  merged.id = primary.id;
  
  return merged;
}

function mergeDuplicates() {
  console.log('🔍 Finding and merging duplicate plants...\n');
  
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const taxonomyMap = new Map();
  const plants = [];
  
  // First pass: collect all plants
  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const plant = JSON.parse(content);
    
    const taxonomyKey = getTaxonomyKey(plant.taxonomy);
    if (taxonomyKey && taxonomyKey !== '||||||') {
      if (!taxonomyMap.has(taxonomyKey)) {
        taxonomyMap.set(taxonomyKey, []);
      }
      taxonomyMap.get(taxonomyKey).push({ file, plant, score: scorePlantCompleteness(plant) });
    }
  }
  
  // Find duplicates and merge
  const duplicatesToMerge = [];
  const filesToDelete = [];
  let totalMerged = 0;
  
  taxonomyMap.forEach((group, taxonomyKey) => {
    if (group.length > 1) {
      // Sort by score (highest first) to keep the best one
      group.sort((a, b) => b.score - a.score);
      
      const primary = group[0];
      const duplicates = group.slice(1);
      
      // Merge all duplicates into the primary
      let mergedPlant = primary.plant;
      for (const dup of duplicates) {
        mergedPlant = mergePlants(mergedPlant, dup.plant);
        filesToDelete.push(dup.file);
        totalMerged++;
      }
      
      // Save the merged plant
      duplicatesToMerge.push({
        file: primary.file,
        plant: mergedPlant,
        taxonomy: primary.plant.taxonomy,
        duplicates: duplicates.map(d => d.file)
      });
    }
  });
  
  // Save merged plants
  console.log(`📝 Merging ${duplicatesToMerge.length} duplicate groups...\n`);
  for (const { file, plant } of duplicatesToMerge) {
    const filePath = path.join(PLANTS_DIR, file);
    fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
  }
  
  // Delete duplicate files
  console.log(`🗑️  Deleting ${filesToDelete.length} duplicate files...\n`);
  let deletedCount = 0;
  for (const file of filesToDelete) {
    const filePath = path.join(PLANTS_DIR, file);
    try {
      fs.unlinkSync(filePath);
      deletedCount++;
    } catch (err) {
      console.error(`Error deleting ${file}: ${err.message}`);
    }
  }
  
  console.log(`\n✅ Merge complete!`);
  console.log(`   - Merged ${duplicatesToMerge.length} groups`);
  console.log(`   - Deleted ${deletedCount} duplicate files`);
  console.log(`   - Total plants removed: ${totalMerged}`);
  
  // Show summary of merges
  if (duplicatesToMerge.length > 0 && duplicatesToMerge.length <= 20) {
    console.log(`\n📋 Merge summary:`);
    duplicatesToMerge.forEach(({ file, plant, duplicates }) => {
      console.log(`\n   ${plant.taxonomy.genus} ${plant.taxonomy.species || 'sp.'}`);
      console.log(`   Kept: ${file}`);
      console.log(`   Merged from: ${duplicates.join(', ')}`);
    });
  }
}

mergeDuplicates();

