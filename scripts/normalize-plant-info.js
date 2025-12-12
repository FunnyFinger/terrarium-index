const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Standardization functions for each field
function normalizeDifficulty(value) {
  if (!value) return null;
  const v = String(value).trim();
  const lower = v.toLowerCase();
  
  if (lower.includes('very easy') || lower.includes('extremely easy')) return 'Very Easy';
  if (lower.includes('easy to moderate') || lower.includes('easy-moderate')) return 'Easy to Moderate';
  if (lower.includes('easy')) return 'Easy';
  if (lower.includes('moderate to difficult') || lower.includes('moderate-difficult')) return 'Moderate to Difficult';
  if (lower.includes('moderate')) return 'Moderate';
  if (lower.includes('difficult') || lower.includes('hard') || lower.includes('challenging')) return 'Difficult';
  if (lower.includes('very difficult') || lower.includes('very hard')) return 'Very Difficult';
  
  return v; // Return as-is if no match
}

function normalizeLight(value) {
  if (!value) return null;
  const v = String(value).trim();
  const lower = v.toLowerCase();
  
  // Remove redundant words
  let normalized = v;
  
  // Standardize common patterns
  if (lower.includes('full sun') || lower.includes('direct sun')) return 'Full Sun';
  if (lower.includes('bright direct') || lower.includes('bright, direct')) return 'Bright Direct';
  if (lower.includes('bright indirect') || lower.includes('bright, indirect')) return 'Bright Indirect';
  if (lower.includes('bright') && lower.includes('indirect')) return 'Bright Indirect';
  if (lower.includes('medium to bright') || lower.includes('medium-bright')) return 'Medium to Bright';
  if (lower.includes('moderate to bright') || lower.includes('moderate-bright')) return 'Moderate to Bright';
  if (lower.includes('moderate to high')) return 'Moderate to High';
  if (lower.includes('low to moderate') || lower.includes('low-moderate')) return 'Low to Moderate';
  if (lower.includes('low to bright')) return 'Low to Bright';
  if (lower.includes('low to medium')) return 'Low to Medium';
  if (lower.includes('shade') || lower.includes('low')) return 'Low';
  if (lower.includes('medium')) return 'Medium';
  if (lower.includes('high')) return 'High';
  if (lower.includes('bright')) return 'Bright';
  if (lower.includes('moderate')) return 'Moderate';
  
  return normalized;
}

function normalizeHumidity(value) {
  if (!value) return null;
  const v = String(value).trim();
  const lower = v.toLowerCase();
  
  if (lower === 'submerged' || lower.includes('fully aquatic')) return 'Submerged';
  if (lower === 'floating') return 'Floating';
  if (lower.includes('very high') || lower.includes('70-90') || lower.includes('80-100')) return 'Very High (70-90%)';
  if (lower.includes('high') && (lower.includes('60-80') || lower.includes('70-80'))) return 'High (60-80%)';
  if (lower.includes('high')) return 'High (60-80%)';
  if (lower.includes('moderate to high') || lower.includes('50-70')) return 'Moderate to High (50-70%)';
  if (lower.includes('moderate')) return 'Moderate (50-60%)';
  if (lower.includes('low') || lower.includes('40-50')) return 'Low (40-50%)';
  
  // Extract percentage if present
  const percentMatch = v.match(/(\d+)[-–](\d+)%/);
  if (percentMatch) {
    const min = parseInt(percentMatch[1]);
    const max = parseInt(percentMatch[2]);
    if (min >= 70) return `Very High (${min}-${max}%)`;
    if (min >= 60) return `High (${min}-${max}%)`;
    if (min >= 50) return `Moderate to High (${min}-${max}%)`;
    return `Moderate (${min}-${max}%)`;
  }
  
  return v;
}

function normalizeTemperature(value) {
  if (!value) return null;
  const v = String(value).trim();
  
  // Remove extra text like "(minimum 15°C)"
  const cleaned = v.replace(/\s*\([^)]*\)/g, '').trim();
  
  // Extract range pattern
  const rangeMatch = cleaned.match(/(\d+)[-–](\d+)°C/);
  if (rangeMatch) {
    return `${rangeMatch[1]}-${rangeMatch[2]}°C`;
  }
  
  // Handle Fahrenheit (shouldn't exist after SI conversion, but just in case)
  const fMatch = cleaned.match(/(\d+)[-–](\d+)°F/);
  if (fMatch) {
    const minC = Math.round((parseInt(fMatch[1]) - 32) * 5/9);
    const maxC = Math.round((parseInt(fMatch[2]) - 32) * 5/9);
    return `${minC}-${maxC}°C`;
  }
  
  return cleaned;
}

function normalizeWatering(value) {
  if (!value) return null;
  const v = String(value).trim();
  const lower = v.toLowerCase();
  
  if (lower.includes('fully aquatic') || lower === 'aquatic') return 'Fully aquatic';
  if (lower.includes('submerged')) return 'Fully aquatic';
  if (lower.includes('floating')) return 'Floating';
  if (lower.includes('semi-aquatic')) return 'Semi-aquatic';
  if (lower.includes('keep soil consistently moist') || lower.includes('keep moist')) return 'Keep soil consistently moist';
  if (lower.includes('keep soil moist') || lower.includes('soil moist')) return 'Keep soil moist';
  if (lower.includes('water when') || lower.includes('water when slightly')) return 'Water when slightly dry';
  if (lower.includes('let dry') || lower.includes('dry between')) return 'Let soil dry between waterings';
  if (lower.includes('drought tolerant') || lower.includes('dry conditions')) return 'Drought tolerant';
  if (lower.includes('mist') && lower.includes('regular')) return 'Mist regularly';
  if (lower.includes('minimal watering')) return 'Minimal watering';
  
  // Keep concise versions as-is, shorten long ones
  if (v.length > 40) {
    // Extract key phrase
    if (lower.includes('moist')) return 'Keep soil moist';
    if (lower.includes('dry')) return 'Let soil dry between waterings';
    if (lower.includes('water')) return 'Water regularly';
  }
  
  return v;
}

function normalizeSubstrate(value) {
  if (!value) return null;
  const v = String(value).trim();
  const lower = v.toLowerCase();
  
  // Shorten verbose descriptions
  if (lower.includes('well-draining') && lower.includes('potting mix')) return 'Well-draining mix';
  if (lower.includes('well-draining')) return 'Well-draining mix';
  if (lower.includes('moisture-retentive') && lower.includes('rich')) return 'Rich, moisture-retentive';
  if (lower.includes('moisture-retentive')) return 'Moisture-retentive mix';
  if (lower.includes('nutrient-rich')) return 'Nutrient-rich substrate';
  if (lower.includes('nutrient-rich substrate preferred')) return 'Nutrient-rich substrate';
  if (lower.includes('no substrate') || lower.includes('free-floating')) return 'No substrate needed';
  if (lower.includes('fine substrate')) return 'Fine substrate';
  if (lower.includes('epiphytic') || lower.includes('mounted')) return 'Epiphytic/mounted';
  if (lower.includes('aerated') && lower.includes('well-draining')) return 'Well-draining, aerated mix';
  if (lower.includes('rich') && lower.includes('soil')) return 'Rich soil';
  
  // Keep short ones
  if (v.length <= 30) return v;
  
  // Shorten long ones to key phrase
  if (lower.includes('draining')) return 'Well-draining mix';
  if (lower.includes('rich')) return 'Rich substrate';
  if (lower.includes('soil')) return 'Potting soil';
  
  return v;
}

function normalizeSize(value) {
  if (!value) return null;
  const v = String(value).trim();
  
  // Remove redundant parenthetical conversions like "(61 cm)" when already in cm
  let cleaned = v.replace(/\s*\([^)]*cm[^)]*\)/gi, '').trim();
  
  // Remove "Up to", "Can reach", etc. and just show the range
  cleaned = cleaned.replace(/^(up to|can reach|can grow to|grows to|approximately|approx\.?|about)\s*/i, '').trim();
  
  // Extract dimensions - prefer range format
  const rangeMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(cm|m)/i);
  if (rangeMatch) {
    const unit = rangeMatch[3].toLowerCase() === 'm' ? 'm' : 'cm';
    return `${rangeMatch[1]}-${rangeMatch[2]} ${unit}`;
  }
  
  // Single number with unit
  const singleMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(cm|m)/i);
  if (singleMatch) {
    const unit = singleMatch[2].toLowerCase() === 'm' ? 'm' : 'cm';
    // If it's a single number, try to add context
    if (cleaned.toLowerCase().includes('tall') || cleaned.toLowerCase().includes('height')) {
      return `${singleMatch[1]} ${unit} tall`;
    }
    if (cleaned.toLowerCase().includes('wide') || cleaned.toLowerCase().includes('width')) {
      return `${singleMatch[1]} ${unit} wide`;
    }
    return `${singleMatch[1]} ${unit}`;
  }
  
  // Remove verbose descriptions, keep just measurements
  if (cleaned.length > 50) {
    // Try to extract just the measurement part
    const measureMatch = cleaned.match(/(\d+[-\s]?\d*\s*(?:cm|m|tall|wide))/i);
    if (measureMatch) return measureMatch[1].trim();
  }
  
  return cleaned;
}

function normalizeGrowthRate(value) {
  if (!value) return null;
  const v = String(value).trim();
  const lower = v.toLowerCase();
  
  if (lower.includes('very fast') || lower.includes('extremely fast')) return 'Very Fast';
  if (lower.includes('fast to moderate') || lower === 'fast-moderate') return 'Fast to Moderate';
  if (lower.includes('fast')) return 'Fast';
  if (lower.includes('moderate to fast') || lower === 'moderate-fast') return 'Moderate to Fast';
  if (lower.includes('moderate to slow') || lower === 'moderate-slow') return 'Moderate to Slow';
  if (lower.includes('moderate')) return 'Moderate';
  if (lower.includes('slow to moderate') || lower === 'slow-moderate') return 'Slow to Moderate';
  if (lower.includes('slow')) return 'Slow';
  if (lower.includes('very slow')) return 'Very Slow';
  
  return v;
}

function normalizePlant(plant) {
  const normalized = { ...plant };
  
  normalized.difficulty = normalizeDifficulty(plant.difficulty);
  normalized.lightRequirements = normalizeLight(plant.lightRequirements);
  normalized.humidity = normalizeHumidity(plant.humidity);
  normalized.temperature = normalizeTemperature(plant.temperature);
  normalized.watering = normalizeWatering(plant.watering);
  normalized.substrate = normalizeSubstrate(plant.substrate);
  normalized.size = normalizeSize(plant.size);
  normalized.growthRate = normalizeGrowthRate(plant.growthRate);
  
  return normalized;
}

function main() {
  console.log('🔧 Normalizing plant information fields...\n');
  
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
      
      // Check if anything changed
      const original = JSON.stringify(plantData, null, 2);
      const updatedStr = JSON.stringify(normalized, null, 2);
      
      if (original !== updatedStr) {
        fs.writeFileSync(filePath, updatedStr + '\n', 'utf8');
        updated++;
        console.log(`✅ Updated: ${plantData.name || file}`);
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
  console.log(`\n✨ Normalization complete!`);
}

if (require.main === module) {
  main();
}

