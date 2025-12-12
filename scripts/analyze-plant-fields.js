const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

async function analyzeFields() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
        
        const allFields = new Set();
        const fieldTypes = new Map();
        const fieldCounts = new Map();
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            // Collect all fields
            function collectFields(obj, prefix = '') {
                for (const [key, value] of Object.entries(obj)) {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    allFields.add(fullKey);
                    
                    // Track field types
                    const type = Array.isArray(value) ? 'array' : 
                                value === null ? 'null' : 
                                typeof value;
                    
                    if (!fieldTypes.has(fullKey)) {
                        fieldTypes.set(fullKey, new Set());
                    }
                    fieldTypes.get(fullKey).add(type);
                    
                    // Count occurrences
                    fieldCounts.set(fullKey, (fieldCounts.get(fullKey) || 0) + 1);
                    
                    // Recursively process nested objects
                    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        collectFields(value, fullKey);
                    }
                }
            }
            
            collectFields(plant);
        }
        
        // Sort fields by occurrence count (most common first)
        const sortedFields = Array.from(allFields).sort((a, b) => {
            return fieldCounts.get(b) - fieldCounts.get(a);
        });
        
        console.log(`\n📊 Found ${sortedFields.length} unique fields across ${jsonFiles.length} plant files\n`);
        console.log('Field occurrence counts:');
        sortedFields.forEach(field => {
            const count = fieldCounts.get(field);
            const types = Array.from(fieldTypes.get(field)).join(', ');
            const percentage = ((count / jsonFiles.length) * 100).toFixed(1);
            console.log(`  ${field}: ${count}/${jsonFiles.length} (${percentage}%) [types: ${types}]`);
        });
        
        // Find fields that are in ALL files
        const commonFields = sortedFields.filter(f => fieldCounts.get(f) === jsonFiles.length);
        console.log(`\n✅ Fields present in ALL files (${commonFields.length}):`);
        commonFields.forEach(field => console.log(`  - ${field}`));
        
        // Find fields missing in some files
        const missingFields = sortedFields.filter(f => fieldCounts.get(f) < jsonFiles.length);
        console.log(`\n⚠️  Fields missing in some files (${missingFields.length}):`);
        missingFields.forEach(field => {
            const count = fieldCounts.get(field);
            const missing = jsonFiles.length - count;
            console.log(`  - ${field}: missing in ${missing} files`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

analyzeFields();

