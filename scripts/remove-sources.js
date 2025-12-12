const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

/**
 * Remove source citations and URLs from description text
 */
function removeSources(text) {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text;
  
  // Remove "Source: http://..." or "Source: https://..." patterns
  cleaned = cleaned.replace(/\s*Source:\s*https?:\/\/[^\s]+/gi, '');
  
  // Remove standalone URLs at the end
  cleaned = cleaned.replace(/\s*https?:\/\/[^\s]+/g, '');
  
  // Remove "Source: " followed by any text at the end of the description
  cleaned = cleaned.replace(/\s*Source:\s*[^\n]+/gi, '');
  
  // Remove patterns like "Source: Wikipedia" or "Source: en.wikipedia.org/wiki/..."
  cleaned = cleaned.replace(/\s*Source:\s*[^\n.]+/gi, '');
  
  // Clean up extra whitespace
  cleaned = cleaned.trim();
  
  // Remove trailing periods/spaces that might be left
  cleaned = cleaned.replace(/\.+$/, '');
  
  return cleaned.trim();
}

/**
 * Process all plant files
 */
function removeSourcesFromFiles() {
  console.log('🧹 Removing sources from descriptions...\n');
  
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
      const originalDescription = plantData.description || '';
      
      if (originalDescription) {
        const cleanedDescription = removeSources(originalDescription);
        
        if (cleanedDescription !== originalDescription) {
          plantData.description = cleanedDescription;
          
          // Save updated file
          fs.writeFileSync(filePath, JSON.stringify(plantData, null, 2) + '\n', 'utf8');
          
          console.log(`✅ Cleaned: ${plantData.name || file}`);
          updated++;
        }
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
  console.log(`\n✨ Source removal complete!`);
}

// Run the script
removeSourcesFromFiles();

