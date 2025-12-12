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
let newHtml = `                            <!-- Phylum-level filters (evolutionarily ancient groups) -->`;
uniqueEntries.forEach(entry => {
  if (entry.value === 'Fern' || entry.value === 'Moss') {
    newHtml += `\n                            <label class="checkbox-label">\n                                <input type="checkbox" class="filter-checkbox" data-filter="classification" value="${entry.value}">\n                                <span>${entry.displayName}</span>\n                            </label>`;
  }
});

newHtml += `\n                            \n                            <!-- Genus-level filters (sorted alphabetically) -->`;
uniqueEntries.forEach(entry => {
  if (entry.value !== 'Fern' && entry.value !== 'Moss') {
    newHtml += `\n                            <label class="checkbox-label">\n                                <input type="checkbox" class="filter-checkbox" data-filter="classification" value="${entry.value}">\n                                <span>${entry.displayName}</span>\n                            </label>`;
  }
});

console.log('Generated HTML for replacement');
console.log(`Total: ${uniqueEntries.length} entries`);
console.log(`Duplicates found: ${duplicates.length}`);

// Write to file for easy copy-paste
fs.writeFileSync(path.join(__dirname, 'sorted-classification.html'), newHtml, 'utf8');
console.log('\n✅ Sorted HTML written to scripts/sorted-classification.html');

