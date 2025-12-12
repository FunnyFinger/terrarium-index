const fs = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(HTML_FILE, 'utf8');

// Extract all classification checkboxes
const checkboxRegex = /<label class="checkbox-label">\s*<input type="checkbox" class="filter-checkbox" data-filter="classification" value="([^"]+)">\s*<span>([^<]+)<\/span>\s*<\/label>/g;

const entries = [];
let match;
while ((match = checkboxRegex.exec(html)) !== null) {
  entries.push({
    value: match[1],
    displayName: match[2],
    fullMatch: match[0]
  });
}

// Check for duplicates by value
const seen = new Set();
const duplicates = [];
const uniqueEntries = [];

entries.forEach(entry => {
  if (seen.has(entry.value)) {
    duplicates.push(entry);
  } else {
    seen.add(entry.value);
    uniqueEntries.push(entry);
  }
});

console.log(`Total entries: ${entries.length}`);
console.log(`Unique entries: ${uniqueEntries.length}`);
if (duplicates.length > 0) {
  console.log(`\n⚠️ Found ${duplicates.length} duplicates:`);
  duplicates.forEach(d => {
    console.log(`  - ${d.value}: "${d.displayName}"`);
  });
}

// Sort alphabetically by display name
uniqueEntries.sort((a, b) => {
  // Keep Fern and Moss at the top
  if (a.value === 'Fern') return -1;
  if (b.value === 'Fern') return 1;
  if (a.value === 'Moss') return -1;
  if (b.value === 'Moss') return 1;
  
  // Then sort alphabetically by display name
  return a.displayName.localeCompare(b.displayName);
});

// Generate HTML
console.log('\n📝 Sorted HTML output:\n');
console.log('<!-- Phylum-level filters (evolutionarily ancient groups) -->');
uniqueEntries.forEach(entry => {
  if (entry.value === 'Fern' || entry.value === 'Moss') {
    console.log(`<label class="checkbox-label">`);
    console.log(`    <input type="checkbox" class="filter-checkbox" data-filter="classification" value="${entry.value}">`);
    console.log(`    <span>${entry.displayName}</span>`);
    console.log(`</label>`);
  }
});

console.log('\n<!-- Genus-level filters (sorted alphabetically) -->');
uniqueEntries.forEach(entry => {
  if (entry.value !== 'Fern' && entry.value !== 'Moss') {
    console.log(`<label class="checkbox-label">`);
    console.log(`    <input type="checkbox" class="filter-checkbox" data-filter="classification" value="${entry.value}">`);
    console.log(`    <span>${entry.displayName}</span>`);
    console.log(`</label>`);
  }
});

// Also output as a function for easy replacement
console.log('\n\n✅ Deduplication and sorting complete!');

