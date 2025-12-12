const fs = require('fs');
const path = require('path');

console.log('=== ESSENTIAL FILES FOR RUNNING THE SITE ===\n');

const essentialFiles = [
  // Core HTML/CSS/JS
  'index.html',
  'definitions.html',
  'styles.css',
  'script.js',
  
  // Data files
  'data.js',
  'data/plant-loader.js',
  'data/plant-data-loader.js',
  'data/plants-merged/index.json',
  'data/rarity-cache.json',
  
  // Config
  'package.json',
  
  // Images (directory)
  'images/',
  
  // Favicons
  'favicon.png',
  'favicon.svg',
  'favicon.ico',
];

const optionalFiles = {
  'Documentation': [
    '*.md files (all markdown documentation)',
    'README files',
  ],
  'Scripts': [
    'scripts/ directory (development/maintenance scripts)',
  ],
  'Temporary/Test files': [
    'temp-selection.html',
    'test-*.js files',
    'download-images.js',
    'download-images.ps1',
    '*.ps1 files (PowerShell scripts)',
  ],
  'Data processing': [
    'data/size-updates/ directory',
    'data/plant-loader.js (if using data.js instead)',
  ],
  'Node modules': [
    'node_modules/ (can be regenerated with npm install)',
  ],
};

console.log('ESSENTIAL FILES (Required to run the site):');
console.log('==========================================\n');
essentialFiles.forEach(file => {
  const exists = checkExists(file);
  const status = exists ? '✓' : '✗';
  console.log(`${status} ${file}`);
});

console.log('\n\nOPTIONAL FILES (Can be removed):');
console.log('================================\n');
Object.entries(optionalFiles).forEach(([category, files]) => {
  console.log(`${category}:`);
  files.forEach(file => console.log(`  - ${file}`));
  console.log('');
});

// Count files
const rootDir = path.join(__dirname, '..');
const allFiles = fs.readdirSync(rootDir);
const mdFiles = allFiles.filter(f => f.endsWith('.md'));
const testFiles = allFiles.filter(f => f.startsWith('test-') || f.includes('test'));
const psFiles = allFiles.filter(f => f.endsWith('.ps1'));

console.log('\n=== FILE COUNTS ===');
console.log(`Total .md documentation files: ${mdFiles.length}`);
console.log(`Total test files: ${testFiles.length}`);
console.log(`Total PowerShell scripts: ${psFiles.length}`);

// Check size-updates directory
const sizeUpdatesDir = path.join(rootDir, 'data', 'size-updates');
if (fs.existsSync(sizeUpdatesDir)) {
  const sizeUpdateFiles = fs.readdirSync(sizeUpdatesDir);
  console.log(`Total size-update files: ${sizeUpdateFiles.length}`);
}

// Check scripts directory
const scriptsDir = path.join(rootDir, 'scripts');
if (fs.existsSync(scriptsDir)) {
  const scriptFiles = fs.readdirSync(scriptsDir);
  console.log(`Total script files: ${scriptFiles.length}`);
}

function checkExists(file) {
  const fullPath = path.join(rootDir, file);
  if (file.endsWith('/')) {
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  }
  return fs.existsSync(fullPath);
}

