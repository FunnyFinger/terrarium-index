// Fix plants that are incorrectly tagged as house-plant
// Mini/dwarf plants should NOT be house-plant
// Small plants (under 30cm) should NOT be house-plant

const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Check if plant should NOT be house-plant
 */
function shouldNotBeHousePlant(plant) {
    const name = (plant.name || '').toLowerCase();
    const size = (plant.size || '').toLowerCase();
    const desc = (plant.description || '').toLowerCase();
    
    // Mini/dwarf indicators
    if (name.includes('mini') || name.includes('dwarf') || name.includes('small')) {
        return true;
    }
    
    // Size indicators
    const sizeMatch = size.match(/(\d+)\s*[-–]\s*(\d+)\s*cm/i);
    if (sizeMatch) {
        const maxSize = parseInt(sizeMatch[2]);
        if (maxSize < 30) {
            return true;
        }
    }
    
    // Small size mentions
    if (size.includes('2-') || size.includes('3-') || size.includes('4-') ||
        size.includes('5-') || size.includes('10-') || size.includes('15-') ||
        size.includes('20-')) {
        const sizeNum = parseInt(size.match(/(\d+)/)?.[1] || '0');
        if (sizeNum < 30) {
            return true;
        }
    }
    
    // Check description for size hints
    if (desc.includes('small') && desc.includes('plant') && !desc.includes('large')) {
        const descSizeMatch = desc.match(/(\d+)\s*cm/i);
        if (descSizeMatch && parseInt(descSizeMatch[1]) < 30) {
            return true;
        }
    }
    
    return false;
}

/**
 * Determine correct tags for a plant
 */
function getCorrectTags(plant) {
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    const desc = (plant.description || '').toLowerCase();
    const size = (plant.size || '').toLowerCase();
    const humidity = (plant.humidity || '').toLowerCase();
    
    const tags = new Set();
    
    // Aquarium/Paludarium
    if (name.includes('aquarium') || desc.includes('aquatic') || 
        desc.includes('submerged') || name.includes('monte carlo') ||
        name.includes('rotala') || scientific.includes('utricularia')) {
        tags.add('aquarium');
        if (desc.includes('emersed') || desc.includes('semi-aquatic') || 
            name.includes('monte carlo') || name.includes('rotala')) {
            tags.add('paludarium');
        }
    }
    
    // Paludarium (semi-aquatic)
    if (desc.includes('paludarium') || desc.includes('semi-aquatic') ||
        (desc.includes('emersed') && desc.includes('submerged'))) {
        tags.add('paludarium');
        tags.add('terrarium');
    }
    
    // Desertarium
    if (humidity.includes('low') || humidity.includes('20%') || humidity.includes('30%') ||
        name.includes('cactus') || name.includes('succulent') ||
        scientific.includes('mammillaria') || scientific.includes('lithops') ||
        scientific.includes('haworthia') || scientific.includes('echeveria') ||
        scientific.includes('sedum') || scientific.includes('crassula')) {
        tags.add('desertarium');
    }
    
    // Aerarium
    if (name.includes('tillandsia') || name.includes('air plant') || 
        scientific.includes('tillandsia')) {
        tags.add('aerarium');
        tags.add('terrarium');
    }
    
    // House Plant (only if large)
    const shouldBeHousePlant = !shouldNotBeHousePlant(plant) && 
                                (size.includes('meter') || size.includes('metre') ||
                                 desc.includes('two meters') || desc.includes('1 meter') ||
                                 desc.includes('reaches') && desc.includes('meter') ||
                                 name.includes('large') && !name.includes('mini'));
    
    if (shouldBeHousePlant) {
        tags.add('house-plant');
    } else {
        // Default to terrarium for small plants
        if (tags.size === 0 || (!tags.has('aquarium') && !tags.has('desertarium'))) {
            tags.add('terrarium');
        }
    }
    
    return Array.from(tags).sort();
}

/**
 * Fix a plant
 */
async function fixPlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        let updated = false;
        
        // Check if it has house-plant but shouldn't
        if (plant.type && plant.type.includes('house-plant') && shouldNotBeHousePlant(plant)) {
            const correctTags = getCorrectTags(plant);
            plant.type = correctTags;
            
            // Update vivariumType
            const vivariumTypes = [];
            if (plant.type.includes('terrarium')) vivariumTypes.push('Closed Terrarium');
            if (plant.type.includes('paludarium')) vivariumTypes.push('Paludarium');
            if (plant.type.includes('aquarium')) vivariumTypes.push('Aquarium');
            if (plant.type.includes('desertarium')) vivariumTypes.push('Desertarium');
            if (plant.type.includes('aerarium')) vivariumTypes.push('Aerarium');
            plant.vivariumType = vivariumTypes;
            
            updated = true;
        }
        
        // Ensure no invalid tags
        const invalidTags = (plant.type || []).filter(t => 
            !['terrarium', 'paludarium', 'aquarium', 'desertarium', 'aerarium', 'house-plant'].includes(t)
        );
        
        if (invalidTags.length > 0) {
            const correctTags = getCorrectTags(plant);
            plant.type = correctTags;
            
            const vivariumTypes = [];
            if (plant.type.includes('terrarium')) vivariumTypes.push('Closed Terrarium');
            if (plant.type.includes('paludarium')) vivariumTypes.push('Paludarium');
            if (plant.type.includes('aquarium')) vivariumTypes.push('Aquarium');
            if (plant.type.includes('desertarium')) vivariumTypes.push('Desertarium');
            if (plant.type.includes('aerarium')) vivariumTypes.push('Aerarium');
            plant.vivariumType = plant.type.includes('house-plant') ? [] : vivariumTypes;
            
            updated = true;
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
    console.log('🔧 Fixing Mini Plants Incorrectly Tagged as House-Plant...\n');
    
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
}

main().catch(console.error);

