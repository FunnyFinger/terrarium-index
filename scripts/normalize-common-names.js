const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Common name mappings for plants that only have scientific names
const COMMON_NAME_MAP = {
  'Tillandsia stricta': 'Stricta Air Plant',
  'Tillandsia pruinosa': 'Fuzzy Air Plant',
  'Tillandsia leiboldiana': 'Leiboldiana Air Plant',
  'Tillandsia juncea': 'Rush-leaved Air Plant',
  'Tillandsia flabellata': 'Flabellata Air Plant',
  'Tillandsia capitata': 'Capitata Air Plant',
  'Tillandsia bulbosa': 'Bulbosa Air Plant',
  'Tillandsia melanocrater': 'Melanocrater Air Plant',
  'Tillandsia abdita': 'Abdita Air Plant',
  'Tillandsia andreana': 'Andreana Air Plant',
  'Tillandsia streptophylla': 'Streptophylla Air Plant',
  'Tillandsia seleriana': 'Seleriana Air Plant',
  'Tillandsia juncifolia': 'Juncifolia Air Plant',
  'Vriesea gigantea': 'Giant Vriesea',
  'Wallisia cyanea': 'Blue Flowered Bromeliad',
  'Racinea dyeriana': 'Dyeriana Air Plant',
  'Hemionitis doryopteris': 'Digit Fern',
  'Dicksonia antarctica': 'Tree Fern',
  'Microsorum thailandicum': 'Blue Oil Fern',
  'Elaphoglossum peltatum': 'Peltatum Fern'
};

function extractCommonName(name, scientificName) {
  if (!name || !name.trim()) return name;
  
  let cleaned = String(name).trim();
  const sciName = String(scientificName || '').trim();
  
  // Pattern 1: "Scientific Name | Common Name" - extract the part after |
  if (cleaned.includes('|')) {
    const parts = cleaned.split('|').map(p => p.trim());
    // Usually the common name is after the |
    if (parts.length === 2) {
      // Check if first part is the scientific name
      const firstPart = parts[0].toLowerCase();
      const sciLower = sciName.toLowerCase();
      
      // If first part matches scientific name, use second part
      if (firstPart === sciLower || firstPart.includes(sciLower) || sciLower.includes(firstPart)) {
        return parts[1];
      }
      // Otherwise, prefer the part that's shorter and doesn't look like a scientific name
      const firstIsScientific = /^[A-Z][a-z]+ [a-z]+/.test(parts[0]);
      const secondIsScientific = /^[A-Z][a-z]+ [a-z]+/.test(parts[1]);
      
      if (firstIsScientific && !secondIsScientific) {
        return parts[1];
      } else if (!firstIsScientific && secondIsScientific) {
        return parts[0];
      } else {
        // Use the shorter, more descriptive one
        return parts[1].length < parts[0].length ? parts[1] : parts[0];
      }
    }
  }
  
  // Pattern 2: Name is the same as scientific name - try to find common name
  if (cleaned.toLowerCase() === sciName.toLowerCase()) {
    if (COMMON_NAME_MAP[sciName]) {
      return COMMON_NAME_MAP[sciName];
    }
    // If it's a genus-only name, add a generic descriptor
    if (/^[A-Z][a-z]+$/.test(cleaned)) {
      // Keep as is if it's a well-known genus like "Hoya", "Begonia"
      return cleaned;
    }
    // For full scientific names, try to extract or create common name
    const genus = sciName.split(' ')[0];
    const specificEpithet = sciName.split(' ')[1];
    if (specificEpithet) {
      // Try mapping
      if (COMMON_NAME_MAP[sciName]) {
        return COMMON_NAME_MAP[sciName];
      }
    }
  }
  
  // Pattern 3: Name starts with scientific name followed by common name
  // e.g., "Microsorum thailandicum | Blue Oil Fern" - already handled above
  
  // Pattern 4: Name contains scientific name but has more text
  // e.g., "Tillandsia stricta" when there's no common name
  if (cleaned.toLowerCase().startsWith(sciName.toLowerCase()) && cleaned.length > sciName.length) {
    // Extract everything after the scientific name
    const remainder = cleaned.substring(sciName.length).trim();
    if (remainder.startsWith('|') || remainder.startsWith('-')) {
      return remainder.substring(1).trim();
    }
  }
  
  // Pattern 5: Check if name matches scientific name exactly (capitalization may differ)
  const nameWords = cleaned.split(' ').map(w => w.toLowerCase());
  const sciWords = sciName.split(' ').map(w => w.toLowerCase());
  if (nameWords.length >= 2 && sciWords.length >= 2 &&
      nameWords[0] === sciWords[0] && nameWords[1] === sciWords[1]) {
    // Name is the scientific name, try to get common name
    if (COMMON_NAME_MAP[sciName]) {
      return COMMON_NAME_MAP[sciName];
    }
    // Create a readable name from the specific epithet
    const epithet = sciWords[1];
    const genus = sciWords[0];
    // Capitalize first letter of genus
    const genusCap = genus.charAt(0).toUpperCase() + genus.slice(1);
    return `${genusCap} ${epithet}`;
  }
  
  // If no changes needed, return as-is
  return cleaned;
}

function normalizePlant(plant) {
  const normalized = { ...plant };
  
  const originalName = plant.name || '';
  const scientificName = plant.scientificName || '';
  
  const normalizedName = extractCommonName(originalName, scientificName);
  
  // Only update if changed
  if (normalizedName !== originalName && normalizedName) {
    normalized.name = normalizedName;
  }
  
  return normalized;
}

function main() {
  console.log('📝 Normalizing common names...\n');
  
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
      const normalized = normalizePlant(plantData);
      
      // Check if name changed
      if (normalized.name !== plantData.name) {
        const original = JSON.stringify(plantData, null, 2);
        const updatedStr = JSON.stringify(normalized, null, 2);
        
        fs.writeFileSync(filePath, updatedStr + '\n', 'utf8');
        updated++;
        console.log(`✅ Updated: "${plantData.name}" → "${normalized.name}"`);
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
  console.log(`\n✨ Common name normalization complete!`);
}

if (require.main === module) {
  main();
}

