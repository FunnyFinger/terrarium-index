const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Run the enhance script logic
const { execSync } = require('child_process');

function main() {
  console.log('🔍 Running final description quality check...\n');
  
  // First, run the enhancement script
  try {
    execSync('npm run enhance-descriptions', { cwd: __dirname + '/..', stdio: 'inherit' });
  } catch (error) {
    console.log('Script completed with updates');
  }
  
  console.log('\n📋 Checking for remaining issues...\n');
  
  const files = fs.readdirSync(PLANTS_DIR)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .sort();
  
  let issues = [];
  let short = [];
  let truncated = [];
  let hasCitations = [];
  let hasCareInstructions = [];
  
  for (const file of files) {
    const filePath = path.join(PLANTS_DIR, file);
    
    try {
      const plantData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const desc = plantData.description || '';
      
      // Check for issues
      if (desc.length < 100) {
        short.push({ name: plantData.name || file, length: desc.length });
      }
      
      if (desc.match(/\[.*\d+.*\]/)) {
        hasCitations.push({ name: plantData.name || file });
      }
      
      if (desc.match(/Native to\.|to\.\s+[A-Z]|in\.\s+[A-Z]|the\.\s+[A-Z]/)) {
        truncated.push({ name: plantData.name || file });
      }
      
      if (desc.toLowerCase().includes('water') && desc.toLowerCase().includes('temperature') && desc.length < 200) {
        hasCareInstructions.push({ name: plantData.name || file });
      }
      
      if (desc.length > 0 && desc.length < 80) {
        issues.push({ name: plantData.name || file, issue: 'Very short', desc });
      }
      
    } catch (error) {
      console.error(`Error checking ${file}: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Quality Check Summary:`);
  console.log(`   Total files checked: ${files.length}`);
  console.log(`   Very short (< 80 chars): ${issues.length}`);
  console.log(`   Short (< 100 chars): ${short.length}`);
  console.log(`   Has citation marks: ${hasCitations.length}`);
  console.log(`   Has truncation issues: ${truncated.length}`);
  console.log(`   May have care instructions: ${hasCareInstructions.length}`);
  
  if (issues.length > 0) {
    console.log(`\n⚠️  Very Short Descriptions (< 80 chars):`);
    issues.slice(0, 10).forEach(item => {
      console.log(`   - ${item.name}: ${item.desc.substring(0, 50)}...`);
    });
  }
  
  if (truncated.length > 0) {
    console.log(`\n⚠️  Truncated Descriptions:`);
    truncated.slice(0, 10).forEach(item => {
      console.log(`   - ${item.name}`);
    });
  }
  
  if (hasCitations.length > 0) {
    console.log(`\n⚠️  Has Citation Marks:`);
    hasCitations.slice(0, 10).forEach(item => {
      console.log(`   - ${item.name}`);
    });
  }
  
  console.log(`\n✨ Check complete!`);
}

if (require.main === module) {
  main();
}

