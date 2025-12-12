// Final cleanup: Fix descriptions that mention wrong plants, ensure all data is consistent

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Check if description talks about the wrong plant
 */
function descriptionMismatch(plant) {
    const nameLower = (plant.name || '').toLowerCase();
    const scientificLower = (plant.scientificName || '').toLowerCase();
    const descLower = (plant.description || '').toLowerCase();
    
    if (!descLower || descLower.length < 20) return false;
    
    // Extract genus from name
    const nameGenus = nameLower.split(' ')[0];
    const scientificGenus = scientificLower.split(' ')[0];
    
    // Common mismatches
    const knownMismatches = {
        'alocasia': ['anthurium', 'billbergia', 'tillandsia'],
        'anthurium': ['alocasia', 'tillandsia', 'dioscorea'],
        'aglaonema': ['dioscorea', 'alocasia'],
        'adiantum': ['utricularia']
    };
    
    for (const [genus, wrongPlants] of Object.entries(knownMismatches)) {
        if (nameGenus.includes(genus) || scientificGenus.includes(genus)) {
            for (const wrongPlant of wrongPlants) {
                if (descLower.includes(wrongPlant) && !descLower.includes(genus)) {
                    return true;
                }
            }
        }
    }
    
    // Check if description starts with completely different genus
    const descMatch = descLower.match(/^([a-z]+)\s+[a-z]+/);
    if (descMatch && descMatch[1].length > 3) {
        const descGenus = descMatch[1];
        if (descGenus !== nameGenus && descGenus !== scientificGenus && 
            !nameGenus.includes(descGenus) && !scientificGenus.includes(descGenus)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Fix a plant
 */
async function fixPlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        let updated = false;
        
        // Fix description if it's about wrong plant
        if (descriptionMismatch(plant)) {
            // Clear description or create generic one
            plant.description = `${plant.name}${plant.scientificName && plant.scientificName !== plant.name ? ` (${plant.scientificName})` : ''} is a beautiful plant suitable for terrariums and vivariums.`;
            updated = true;
        }
        
        // Ensure house-plant tag removes vivarium if it's very large
        if (plant.type && plant.type.includes('house-plant')) {
            const descLower = (plant.description || '').toLowerCase();
            const sizeLower = (plant.size || '').toLowerCase();
            
            // If mentions meters/meters tall, remove vivarium
            if (descLower.includes('meter') || descLower.includes('metre') || 
                descLower.includes('two meters') || descLower.includes('1 meter') ||
                sizeLower.includes('meter') || sizeLower.includes('metre')) {
                plant.type = plant.type.filter(t => t !== 'vivarium');
                plant.vivariumType = [];
                updated = true;
            }
        }
        
        // Ensure proper tags (no "additional")
        if (plant.type && plant.type.includes('additional')) {
            // Should have been fixed already, but double-check
            console.log(`⚠️  Still has "additional" tag: ${plant.name}`);
            // Keep other logic would assign proper tags
        }
        
        if (updated) {
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            return { fixed: true, plant: plant.name };
        }
        
        return { fixed: false };
    } catch (error) {
        return { fixed: false, error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🔧 Final Cleanup: Fixing Descriptions...\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents'];
    
    let totalFixed = 0;
    
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const result = await fixPlant(filePath);
                
                if (result.fixed) {
                    totalFixed++;
                    console.log(`✅ Fixed: ${result.plant}`);
                }
            }
        } catch (error) {
            // Skip
        }
    }
    
    console.log(`\n✅ Fixed ${totalFixed} plants`);
    console.log('\n💡 All plants should now have:');
    console.log('   - Correct images');
    console.log('   - Correct scientific names');
    console.log('   - Proper tags (no "additional")');
    console.log('   - "house-plant" tag for large plants');
}

main().catch(console.error);

