const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLANTS_DIR = path.join(ROOT, 'data', 'plants-merged');

// Standardized categories - must match categorize-plant-details-refined.js
// Using common names instead of scientific terms
const VALID_CATEGORIES = {
  plantType: ['flowering-plant', 'conifer', 'fern', 'spikemoss', 'moss', 'liverwort', 'algae', 'fungus'],
  growthPattern: ['upright-columnar', 'upright-bushy', 'upright-single-stem', 'vining-climbing', 
                  'vining-trailing', 'rosette', 'clumping', 'carpeting', 'spreading', 'pendent'],
  growthHabit: ['ground-dwelling', 'tree-dwelling', 'rock-dwelling', 'fully-aquatic', 
               'emergent-aquatic', 'semi-aquatic', 'semi-epiphytic'],
  hazard: ['non-toxic', 'toxic-if-ingested', 'handle-with-care'],
  rarity: ['common', 'uncommon', 'rare', 'very-rare'],
  floweringPeriod: ['seasonal', 'year-round', 'irregular', 'does-not-flower', 'does-not-flower-in-cultivation'],
  co2: ['not-required', 'beneficial', 'recommended', 'required']
};

function validatePlant(plant, filename) {
  const errors = [];
  const warnings = [];
  
  for (const [field, validValues] of Object.entries(VALID_CATEGORIES)) {
    const value = plant[field];
    
    if (value && typeof value === 'string') {
      if (!validValues.includes(value)) {
        errors.push(`${field}: "${value}" is not a valid category. Valid options: ${validValues.join(', ')}`);
      }
    } else if (value) {
      warnings.push(`${field}: value is not a string: ${typeof value}`);
    }
  }
  
  return { errors, warnings };
}

function validateAllPlants() {
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const allErrors = [];
  const allWarnings = [];
  let validCount = 0;
  
  console.log(`Validating ${files.length} plant files...\n`);
  
  for (const file of files) {
    try {
      const filePath = path.join(PLANTS_DIR, file);
      const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const { errors, warnings } = validatePlant(plant, file);
      
      if (errors.length > 0) {
        allErrors.push({ file, errors });
      }
      if (warnings.length > 0) {
        allWarnings.push({ file, warnings });
      }
      if (errors.length === 0 && warnings.length === 0) {
        validCount++;
      }
    } catch (error) {
      allErrors.push({ file, errors: [`Failed to parse: ${error.message}`] });
    }
  }
  
  console.log(`✅ ${validCount}/${files.length} plants have valid categories\n`);
  
  if (allErrors.length > 0) {
    console.log('=== ERRORS ===\n');
    for (const { file, errors } of allErrors) {
      console.log(`${file}:`);
      for (const error of errors) {
        console.log(`  ❌ ${error}`);
      }
      console.log('');
    }
  }
  
  if (allWarnings.length > 0) {
    console.log('=== WARNINGS ===\n');
    for (const { file, warnings } of allWarnings) {
      console.log(`${file}:`);
      for (const warning of warnings) {
        console.log(`  ⚠️  ${warning}`);
      }
      console.log('');
    }
  }
  
  if (allErrors.length === 0 && allWarnings.length === 0) {
    console.log('🎉 All plants have valid category values!');
  }
  
  return allErrors.length === 0;
}

// Run validation
const isValid = validateAllPlants();
process.exit(isValid ? 0 : 1);

