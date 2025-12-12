const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log('🧹 Cleaning up optional files...\n');

let removedCount = 0;
let removedSize = 0;

function removeFile(filePath, reason) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const size = stats.size;
      fs.unlinkSync(filePath);
      removedCount++;
      removedSize += size;
      console.log(`✓ Removed: ${path.relative(rootDir, filePath)} (${reason})`);
      return true;
    }
  } catch (error) {
    console.error(`✗ Error removing ${filePath}:`, error.message);
  }
  return false;
}

function removeDir(dirPath, reason) {
  try {
    if (fs.existsSync(dirPath)) {
      const stats = fs.statSync(dirPath);
      // Calculate directory size
      let dirSize = 0;
      function calculateSize(dir) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            calculateSize(filePath);
          } else {
            dirSize += stat.size;
          }
        });
      }
      calculateSize(dirPath);
      
      fs.rmSync(dirPath, { recursive: true, force: true });
      removedCount++;
      removedSize += dirSize;
      console.log(`✓ Removed directory: ${path.relative(rootDir, dirPath)} (${reason})`);
      return true;
    }
  } catch (error) {
    console.error(`✗ Error removing ${dirPath}:`, error.message);
  }
  return false;
}

// Remove documentation files (.md) from root
console.log('📚 Removing documentation files...');
const rootFiles = fs.readdirSync(rootDir);
rootFiles.forEach(file => {
  if (file.endsWith('.md') && file !== 'ESSENTIAL-FILES-GUIDE.md') {
    removeFile(path.join(rootDir, file), 'documentation');
  }
});

// Remove test files
console.log('\n🧪 Removing test files...');
const testFiles = [
  'test-first-5-plants.js',
  'test-pexels-api.js',
  'test-pexels-direct.js',
  'test-pixabay-api.js',
  'temp-selection.html'
];

testFiles.forEach(file => {
  removeFile(path.join(rootDir, file), 'test/temp file');
});

// Remove data processing/historical files
console.log('\n📊 Removing historical data processing files...');
const sizeUpdatesDir = path.join(rootDir, 'data', 'size-updates');
if (fs.existsSync(sizeUpdatesDir)) {
  removeDir(sizeUpdatesDir, 'historical processing data');
}

// Remove download scripts (not needed for development)
console.log('\n📥 Removing download utility scripts...');
const downloadFiles = [
  'download-images.js',
  'download-images.ps1'
];

downloadFiles.forEach(file => {
  removeFile(path.join(rootDir, file), 'download utility');
});

// Format size
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

console.log('\n✅ Cleanup complete!');
console.log(`   Files/directories removed: ${removedCount}`);
console.log(`   Space freed: ${formatBytes(removedSize)}`);

console.log('\n📝 Note: Development scripts, node_modules, and essential files were kept.');

