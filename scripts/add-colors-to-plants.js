const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

/**
 * Determine colors based on plant data
 */
function determineColors(plant) {
    const colors = [];
    
    // 1. Check for existing colorVariants field
    if (plant.colorVariants && Array.isArray(plant.colorVariants) && plant.colorVariants.length > 0) {
        return plant.colorVariants.join(', ');
    }
    
    // 2. Check if plant has "colorful" in category
    const category = Array.isArray(plant.category) ? plant.category : [];
    const isColorful = category.some(c => String(c).toLowerCase().includes('colorful'));
    
    // 3. Extract colors from name
    const name = (plant.name || '').toLowerCase();
    const nameColors = extractColorsFromText(name);
    
    // 4. Extract colors from description
    const description = (plant.description || '').toLowerCase();
    const descColors = extractColorsFromText(description);
    
    // 5. Check scientific name for color indicators
    const scientificName = (plant.scientificName || '').toLowerCase();
    const sciColors = extractColorsFromText(scientificName);
    
    // Combine all found colors
    const allColors = [...new Set([...nameColors, ...descColors, ...sciColors])];
    
    // If colorful category exists, add it
    if (isColorful && allColors.length === 0) {
        return 'Colorful (various colors)';
    }
    
    // Return combined colors or default
    if (allColors.length > 0) {
        return allColors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ');
    }
    
    // Default based on plant type
    if (plant.plantType) {
        const plantType = String(plant.plantType).toLowerCase();
        if (plantType.includes('moss')) {
            return 'Green';
        } else if (plantType.includes('fern')) {
            return 'Green';
        } else if (plantType.includes('algae')) {
            return 'Green, Red, Brown';
        }
    }
    
    // Default
    return 'Green';
}

/**
 * Extract color words from text
 */
function extractColorsFromText(text) {
    const colorMap = {
        'red': 'Red',
        'green': 'Green',
        'blue': 'Blue',
        'yellow': 'Yellow',
        'orange': 'Orange',
        'purple': 'Purple',
        'pink': 'Pink',
        'white': 'White',
        'black': 'Black',
        'silver': 'Silver',
        'gold': 'Gold',
        'golden': 'Gold',
        'bronze': 'Bronze',
        'brown': 'Brown',
        'variegated': 'Variegated',
        'multicolor': 'Multicolor',
        'multicolored': 'Multicolor',
        'tricolor': 'Tricolor',
        'rainbow': 'Rainbow',
        'crimson': 'Red',
        'scarlet': 'Red',
        'emerald': 'Green',
        'lime': 'Green',
        'turquoise': 'Blue',
        'navy': 'Blue',
        'violet': 'Purple',
        'lavender': 'Purple',
        'magenta': 'Pink',
        'coral': 'Orange',
        'peach': 'Orange',
        'ivory': 'White',
        'cream': 'White',
        'beige': 'Brown',
        'tan': 'Brown',
        'maroon': 'Red',
        'burgundy': 'Red',
        'teal': 'Blue',
        'cyan': 'Blue',
        'indigo': 'Purple',
        'amber': 'Yellow',
        'chartreuse': 'Green',
        'olive': 'Green',
        'sage': 'Green',
        'mint': 'Green',
        'jade': 'Green',
        'ruby': 'Red',
        'garnet': 'Red',
        'sapphire': 'Blue',
        'amethyst': 'Purple',
        'emerald': 'Green'
    };
    
    const foundColors = [];
    const lowerText = text.toLowerCase();
    
    for (const [key, color] of Object.entries(colorMap)) {
        if (lowerText.includes(key)) {
            if (!foundColors.includes(color)) {
                foundColors.push(color);
            }
        }
    }
    
    return foundColors;
}

/**
 * Process a single plant file
 */
async function processPlantFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        // Skip if colors already exists and is not empty
        if (plant.colors && plant.colors.trim() !== '') {
            return { skipped: true, name: plant.name };
        }
        
        // Determine colors
        plant.colors = determineColors(plant);
        
        // Write back to file
        await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        
        return { updated: true, name: plant.name, colors: plant.colors };
    } catch (error) {
        return { error: true, file: path.basename(filePath), message: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🎨 Adding colors to all plants...\n');
    
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
        
        console.log(`Found ${jsonFiles.length} plant files\n`);
        
        const results = {
            updated: [],
            skipped: [],
            errors: []
        };
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const result = await processPlantFile(filePath);
            
            if (result.error) {
                results.errors.push(result);
                console.error(`❌ Error processing ${result.file}: ${result.message}`);
            } else if (result.skipped) {
                results.skipped.push(result);
            } else if (result.updated) {
                results.updated.push(result);
                console.log(`✅ ${result.name}: ${result.colors}`);
            }
        }
        
        console.log(`\n📊 Summary:`);
        console.log(`   ✅ Updated: ${results.updated.length}`);
        console.log(`   ⏭️  Skipped (already had colors): ${results.skipped.length}`);
        console.log(`   ❌ Errors: ${results.errors.length}`);
        
        if (results.errors.length > 0) {
            console.log(`\n⚠️  Errors encountered:`);
            results.errors.forEach(err => {
                console.log(`   - ${err.file}: ${err.message}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { determineColors, processPlantFile };

