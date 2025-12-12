// Comprehensive fix for Araflora plants:
// 1. Fix mismatched images
// 2. Correct scientific names
// 3. Remove "additional" tag and properly categorize
// 4. Add "house plant" tag for large plants

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Extract plant name from image URL to verify match
 */
function getPlantNameFromImageUrl(imageUrl, plantName) {
    if (!imageUrl) return false;
    
    // Get filename from URL
    const filename = imageUrl.split('/').pop().toLowerCase();
    const plantNameLower = plantName.toLowerCase().replace(/\s+/g, '-');
    const plantNameWords = plantNameLower.split('-');
    
    // Check if image filename contains plant name parts
    for (const word of plantNameWords) {
        if (word.length > 3 && filename.includes(word)) {
            return true;
        }
    }
    
    // Check scientific name if available
    return false;
}

/**
 * Find correct image (one that matches plant name)
 */
function findCorrectImage(images, plantName, scientificName) {
    if (!images || images.length === 0) return '';
    
    const nameParts = plantName.toLowerCase().split(/\s+/);
    const scientificParts = (scientificName || '').toLowerCase().split(/\s+/);
    
    // First, try to find image with plant name in filename
    for (const img of images) {
        const filename = img.toLowerCase().split('/').pop();
        
        // Check if filename contains plant name parts
        for (const part of nameParts) {
            if (part.length > 4 && filename.includes(part.replace(/'/g, ''))) {
                return img;
            }
        }
        
        // Check scientific name
        for (const part of scientificParts) {
            if (part.length > 4 && filename.includes(part)) {
                return img;
            }
        }
    }
    
    // If no match, check if first image looks wrong (contains other plant names)
    const firstImg = images[0].toLowerCase();
    const commonOtherPlants = ['billbergia', 'tillandsia', 'dioscorea', 'utricularia', 'begonia', 'adiantum'];
    
    for (const otherPlant of commonOtherPlants) {
        if (firstImg.includes(otherPlant) && !plantName.toLowerCase().includes(otherPlant)) {
            // First image is wrong, try second
            if (images.length > 1) {
                return images[1];
            }
            return '';
        }
    }
    
    // Default: return first image that doesn't look obviously wrong
    for (const img of images) {
        const filename = img.toLowerCase();
        let looksWrong = false;
        for (const otherPlant of commonOtherPlants) {
            if (filename.includes(otherPlant) && !plantName.toLowerCase().includes(otherPlant)) {
                looksWrong = true;
                break;
            }
        }
        if (!looksWrong) {
            return img;
        }
    }
    
    return images[0]; // Fallback
}

/**
 * Extract better scientific name from description
 */
function extractScientificNameFromDescription(name, description) {
    if (!description) return null;
    
    // Look for scientific name patterns in description
    const patterns = [
        /([A-Z][a-z]+\s+[a-z]+(?:\s+var\.\s+[a-z]+)?(?:\s+['"][\w\s-]+['"])?)/,
        /([A-Z][a-z]+\s+[a-z]+(?:\s+ssp\.\s+[a-z]+)?)/,
        /([A-Z][a-z]+\s+x\s+[a-z]+)/,
        /([A-Z][a-z]+\s+[a-z]+\s+[a-z]+)/
    ];
    
    for (const pattern of patterns) {
        const match = description.match(pattern);
        if (match && match[1]) {
            const scientific = match[1].trim();
            // Make sure it's not just the common name
            if (scientific.length > 5 && !name.toLowerCase().includes(scientific.toLowerCase().split(' ')[0])) {
                return scientific;
            }
        }
    }
    
    return null;
}

/**
 * Determine proper category tags
 */
function determineProperTags(plant) {
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    const desc = (plant.description || '').toLowerCase();
    const size = (plant.size || 'varies').toLowerCase();
    
    const tags = new Set();
    const vivariumTypes = new Set();
    
    // Size indicators for house plants (too large for enclosed)
    const largeIndicators = [
        'large', 'xl', 'xxl', 'giant', 'meter', 'metre', 'tall', 'tree', 
        'reaches', 'grows up to', 'maximum', 'can reach', 'two meters', '1 meter'
    ];
    
    const isLargePlant = largeIndicators.some(ind => 
        size.includes(ind) || desc.includes(ind) || name.includes(ind)
    );
    
    // Specific categorizations
    if (name.includes('pitcher') || name.includes('sundew') || name.includes('flytrap') ||
        scientific.includes('drosera') || scientific.includes('nepenthes') ||
        scientific.includes('sarracenia') || scientific.includes('utricularia') ||
        scientific.includes('cephalotus') || scientific.includes('pinguicula') ||
        scientific.includes('darlingtonia') || scientific.includes('heliamphora')) {
        tags.add('carnivorous');
        tags.add('vivarium');
        if (!isLargePlant) vivariumTypes.add('Closed Terrarium');
    } else if (name.includes('orchid') || scientific.match(/\b(phalaenopsis|dendrobium|masdevallia|pleurothallis|bulbophyllum|aerangis|promenaea|scaphosepalum|encyclia)\b/)) {
        tags.add('orchids');
        tags.add('vivarium');
        if (!isLargePlant) {
            vivariumTypes.add('Closed Terrarium');
            vivariumTypes.add('Aerarium');
        }
    } else if (name.includes('fern') || scientific.match(/\b(adiantum|asplenium|pteris|nephrolepis|actiniopteris|aglaomorpha|doryopteris|cyclosorus|con iogramme)\b/)) {
        tags.add('ferns');
        tags.add('vivarium');
        if (!isLargePlant) vivariumTypes.add('Closed Terrarium');
    } else if (name.includes('tillandsia') || name.includes('air plant') || scientific.includes('tillandsia')) {
        tags.add('air-plants');
        tags.add('vivarium');
        vivariumTypes.add('Open Terrarium');
        vivariumTypes.add('Aerarium');
    } else if (name.includes('aquarium') || desc.includes('aquatic') || desc.includes('submerged')) {
        tags.add('aquarium');
        tags.add('vivarium');
        vivariumTypes.add('Paludarium');
    } else if (name.includes('moss') || scientific.includes('moss') || scientific.includes('sphagnum')) {
        tags.add('mosses');
        tags.add('vivarium');
        vivariumTypes.add('Closed Terrarium');
        vivariumTypes.add('Paludarium');
    } else if (name.includes('cactus') || name.includes('cacti') || name.includes('succulent') ||
               scientific.includes('mammillaria') || scientific.includes('echinocactus') ||
               scientific.includes('crassula') || scientific.includes('echeveria') ||
               scientific.includes('sedum') || scientific.includes('aloe') ||
               scientific.includes('haworthia') || scientific.includes('lithops') ||
               scientific.includes('adenium') || scientific.includes('agave') ||
               scientific.includes('euphorbia') || scientific.includes('adromischus') ||
               scientific.includes('aeonium') || scientific.includes('alluaudia')) {
        tags.add('succulents');
        tags.add('vivarium');
        vivariumTypes.add('Desertarium');
        vivariumTypes.add('Open Terrarium');
    } else if (name.includes('begonia') || scientific.includes('begonia')) {
        tags.add('tropical');
        tags.add('vivarium');
        if (!isLargePlant) vivariumTypes.add('Closed Terrarium');
    } else if (name.includes('alocasia') || name.includes('anthurium') || name.includes('aglaonema') ||
               name.includes('philodendron') || name.includes('monstera') || name.includes('alocasia') ||
               scientific.includes('alocasia') || scientific.includes('anthurium') || scientific.includes('aglaonema')) {
        tags.add('tropical');
        tags.add('vivarium');
        if (!isLargePlant) vivariumTypes.add('Closed Terrarium');
    } else {
        // Default classification
        tags.add('tropical');
        tags.add('vivarium');
        if (!isLargePlant) vivariumTypes.add('Closed Terrarium');
    }
    
    // Add "house plant" tag if too large for enclosed environments
    if (isLargePlant || desc.includes('large') && !desc.includes('small') && !desc.includes('mini')) {
        tags.add('house-plant');
        // Remove vivarium/terrarium tags for very large plants
        if (desc.includes('meter') || desc.includes('metre') || name.includes('giant') || name.includes('xxl')) {
            tags.delete('vivarium');
            vivariumTypes.clear();
        }
    }
    
    // Always add vivarium as parent if it's not a house plant only
    if (!tags.has('house-plant') || tags.size > 1) {
        tags.add('vivarium');
    }
    
    return {
        tags: Array.from(tags),
        vivariumTypes: Array.from(vivariumTypes)
    };
}

/**
 * Fix a single plant
 */
async function fixPlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        let updated = false;
        
        // 1. Fix images - ensure first image matches plant
        if (plant.images && plant.images.length > 0) {
            const correctImage = findCorrectImage(plant.images, plant.name, plant.scientificName);
            if (correctImage && correctImage !== plant.imageUrl) {
                plant.imageUrl = correctImage;
                // Reorder images to put correct one first
                const reordered = [correctImage];
                plant.images.forEach(img => {
                    if (img !== correctImage) reordered.push(img);
                });
                plant.images = reordered;
                updated = true;
            }
        }
        
        // 2. Fix scientific name from description if it looks wrong
        if (plant.description) {
            const extractedScientific = extractScientificNameFromDescription(plant.name, plant.description);
            if (extractedScientific && 
                plant.scientificName && 
                plant.scientificName.toLowerCase() !== extractedScientific.toLowerCase() &&
                extractedScientific.length > plant.scientificName.length) {
                // Only update if extracted is more complete
                plant.scientificName = extractedScientific;
                updated = true;
            } else if (!plant.scientificName || plant.scientificName === plant.name || plant.scientificName.length < 5) {
                // Try to extract if missing or too short
                const newScientific = extractScientificNameFromDescription(plant.name, plant.description);
                if (newScientific) {
                    plant.scientificName = newScientific;
                    updated = true;
                }
            }
        }
        
        // 3. Fix tags - remove "additional", add proper categories
        if (plant.type && plant.type.includes('additional')) {
            const { tags, vivariumTypes } = determineProperTags(plant);
            plant.type = tags;
            if (vivariumTypes.length > 0) {
                plant.vivariumType = vivariumTypes;
            } else {
                plant.vivariumType = [];
            }
            updated = true;
        }
        
        // 4. Update size if it's just "Varies"
        if (plant.size === 'Varies' && plant.description) {
            const sizeMatch = plant.description.match(/(\d+\s*[-–]\s*\d+\s*cm|up to \d+\s*cm|maximum \d+\s*cm|\d+\s*cm (tall|high|wide))/i);
            if (sizeMatch) {
                plant.size = sizeMatch[1];
                updated = true;
            }
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
    console.log('🔧 Fixing Araflora Plants...\n');
    console.log('Fixing:');
    console.log('  1. Mismatched images');
    console.log('  2. Incorrect scientific names');
    console.log('  3. Removing "additional" tag, proper categorization');
    console.log('  4. Adding "house-plant" tag for large plants\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents'];
    
    let totalFixed = 0;
    let totalProcessed = 0;
    
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            console.log(`\n📂 ${category} (${plantFiles.length} plants)`);
            
            for (const file of plantFiles) {
                const filePath = path.join(categoryDir, file);
                const result = await fixPlant(filePath);
                totalProcessed++;
                
                if (result.fixed) {
                    totalFixed++;
                    console.log(`  ✅ Fixed: ${result.plant}`);
                }
            }
        } catch (error) {
            console.log(`  ⚠️  Category ${category} not found or error: ${error.message}`);
        }
    }
    
    console.log(`\n\n✅ Fix complete!`);
    console.log(`   Processed: ${totalProcessed} plants`);
    console.log(`   Fixed: ${totalFixed} plants`);
    console.log(`\n💡 Next: Update CSS for house-plant tag`);
}

main().catch(console.error);

