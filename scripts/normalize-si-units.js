const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLANTS_DIR = path.join(ROOT, 'data', 'plants-merged');

function toFixedSmart(value, decimalsIfNeeded = 1) {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(decimalsIfNeeded);
}

function fToC(n) {
  return (n - 32) * (5 / 9);
}

function inToCm(n) {
  return n * 2.54;
}

function ftToCm(n) {
  return n * 30.48;
}

function galToL(n) {
  return n * 3.78541;
}

function lbToKg(n) {
  return n * 0.45359237;
}

function ozToG(n) {
  return n * 28.349523125;
}

// Convert a temperature range like "65-75°F" or "65°F - 75°F" or mixed "65–75 F"
function convertFahrenheit(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;

  // Range with unit once at end: 65-75°F or 65 – 75 F
  out = out.replace(/(\b\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*°?\s*(F|f|°F)/g, (_, a, b) => {
    const c1 = fToC(parseFloat(a));
    const c2 = fToC(parseFloat(b));
    return `${Math.round(c1)}-${Math.round(c2)}°C`;
  });

  // Each number has unit: 65°F - 75°F or 65 °F – 75 °F
  out = out.replace(/(\b\d+(?:\.\d+)?)\s*°?\s*(F|f)\s*[–-]\s*(\d+(?:\.\d+)?)\s*°?\s*(F|f)\b/g, (_, a, _f1, b) => {
    const c1 = fToC(parseFloat(a));
    const c2 = fToC(parseFloat(b));
    return `${Math.round(c1)}-${Math.round(c2)}°C`;
  });

  // Single Fahrenheit value: 70°F
  out = out.replace(/(\b\d+(?:\.\d+)?)\s*°?\s*(F|f)\b/g, (_, n) => {
    const c = fToC(parseFloat(n));
    return `${Math.round(c)}°C`;
  });

  return out;
}

// Convert lengths and volumes/weights to SI within text
function convertImperialInText(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;

  // Feet and inches combined: e.g., 2 ft 3 in, 2' 3", 2ft 3in
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|\")\b/gi, (_, ft, inch) => {
    const cm = ftToCm(parseFloat(ft)) + inToCm(parseFloat(inch));
    return `${Math.round(cm)} cm`;
  });

  // Feet only: 2 ft, 2'
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\b/gi, (_, ft) => {
    const cm = ftToCm(parseFloat(ft));
    if (cm >= 100) return `${toFixedSmart(cm / 100)} m`;
    return `${Math.round(cm)} cm`;
  });

  // Inches with unit words: 3 in, 3 inch, 3 inches
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*(?:in|inch|inches)\b/gi, (_, inch) => {
    const cm = inToCm(parseFloat(inch));
    return `${toFixedSmart(cm)} cm`;
  });

  // Inches quotation mark: 3" or 3‑inch (hyphenated)
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*\"\b/g, (_, inch) => {
    const cm = inToCm(parseFloat(inch));
    return `${toFixedSmart(cm)} cm`;
  });
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*[-\u2011\u2013\u2014]?\s*inch\b/gi, (_, inch) => {
    const cm = inToCm(parseFloat(inch));
    return `${toFixedSmart(cm)} cm`;
  });

  // Gallons to liters
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*(?:gal|gallon|gallons)\b/gi, (_, n) => {
    const l = galToL(parseFloat(n));
    return `${toFixedSmart(l)} L`;
  });

  // Pounds to kg
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/gi, (_, n) => {
    const kg = lbToKg(parseFloat(n));
    return `${toFixedSmart(kg)} kg`;
  });

  // Ounces to grams
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/gi, (_, n) => {
    const g = ozToG(parseFloat(n));
    return `${Math.round(g)} g`;
  });

  return out;
}

function normalizeFieldValue(value) {
  if (typeof value === 'string') {
    let v = value;
    v = convertFahrenheit(v);
    v = convertImperialInText(v);
    return v;
  }
  if (Array.isArray(value)) {
    return value.map(v => (typeof v === 'string' ? normalizeFieldValue(v) : v));
  }
  return value;
}

function normalizePlant(plant) {
  const copy = { ...plant };
  // Target likely fields where free text units appear
  const fields = [
    'size',
    'temperature',
    'watering',
    'substrate',
    'description',
    'humidity',
    'lightRequirements',
    'growthRate'
  ];
  for (const f of fields) {
    if (copy[f] !== undefined) copy[f] = normalizeFieldValue(copy[f]);
  }
  if (copy.careTips) copy.careTips = normalizeFieldValue(copy.careTips);
  return copy;
}

function main() {
  const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
  let changed = 0;
  for (const file of files) {
    const p = path.join(PLANTS_DIR, file);
    try {
      const original = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(original);
      const normalized = normalizePlant(data);
      const newStr = JSON.stringify(normalized, null, 2) + '\n';
      if (newStr !== original) {
        fs.writeFileSync(p, newStr, 'utf8');
        changed++;
        console.log(`✅ Updated units: ${file}`);
      }
    } catch (e) {
      console.error(`❌ Failed on ${file}: ${e.message}`);
    }
  }
  console.log(`\nDone. Files changed: ${changed}`);
}

if (require.main === module) {
  main();
}


