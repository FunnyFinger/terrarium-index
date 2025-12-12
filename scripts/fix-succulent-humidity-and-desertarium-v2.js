// Fix ONLY true desert-adapted succulent and cactus plants
const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// TRUE desert-adapted succulent/cactus genera (exclude tropical epiphytes)
const TRUE_DESERT_SUCCULENTS = [
    'echeveria', 'haworthia', 'aloe', 'crassula', 'sedum', 'agave', 'mammillaria',
    'echinocactus', 'opuntia', 'adromischus', 'sansevieria', 'dracaena',
    'adenium', 'alluaudia', 'albuca', 'lithops', 'pleiospilos', 'euphorbia',
    'senecio rowleyanus', 'portulacaria', 'pachypodium', 'kroenleinia'
];

// Succulents that can tolerate moderate humidity but still prefer low (40-50%)
const MODERATE_TOLERANT_SUCCULENTS = [
    'crassula', 'sedum', 'aeonium', 'kalanchoe'
];

// EXCLUDE these - they are NOT desert plants (tropical/epiphytic)
const EXCLUDE_FROM_DESERTARIUM = [
    'hoya', 'pilea', 'begonia', 'peperomia', 'rhipsalis', 'epiphytic', 'tropical'
];

function isTrueDesertSucculent(plant) {
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    const category = (plant.category || []).map(c => c.toLowerCase());
    const plantType = (plant.plantType || '').toLowerCase();
    const description = (plant.description || '').toLowerCase();
    
    // Exclude tropical/epiphytic plants
    if (EXCLUDE_FROM_DESERTARIUM.some(exclude => 
        name.includes(exclude) || 
        scientific.includes(exclude) ||
        description.includes(exclude)
    )) {
        return false;
    }
    
    // Check if it's a true desert succulent
    const isDesertSucculent = TRUE_DESERT_SUCCULENTS.some(genus => 
        scientific.includes(genus) || name.includes(genus)
    );
    
    // Must be in succulent/cactus category AND be a true desert type
    const hasSucculentCategory = category.includes('succulent') || 
                                category.includes('cactus') ||
                                plantType === 'succulent' ||
                                plantType === 'cactus';
    
    return isDesertSucculent && hasSucculentCategory;
}

function determineCorrectHumidity(plant) {
    const scientific = (plant.scientificName || '').toLowerCase();
    const name = (plant.name || '').toLowerCase();
    
    // Check if it's a moderate-tolerant succulent
    const isModerateTolerant = MODERATE_TOLERANT_SUCCULENTS.some(genus =>
        scientific.includes(genus) || name.includes(genus)
    );
    
    // Most succulents prefer low humidity (30-50%)
    if (isModerateTolerant) {
        return 'Low to Moderate (30-50%)';
    }
    
    return 'Low (30-50%)';
}

function fixSucculentPlants() {
    const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json'));
    let fixed = 0;
    const changes = [];
    const skipped = [];

    files.forEach(file => {
        const filePath = path.join(PLANTS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Only process TRUE desert succulents
        if (!isTrueDesertSucculent(data)) {
            // Check if it was incorrectly changed before
            const humidity = String(data.humidity || '').toLowerCase();
            const isLowHumidity = humidity.includes('low (30-50%)');
            const name = (data.name || '').toLowerCase();
            const scientific = (data.scientificName || '').toLowerCase();
            
            // If it's a tropical plant but has low humidity, it was incorrectly changed
            if (isLowHumidity && (
                name.includes('hoya') || 
                name.includes('pilea') || 
                name.includes('begonia') ||
                name.includes('peperomia') ||
                scientific.includes('hoya') ||
                scientific.includes('pilea') ||
                scientific.includes('begonia') ||
                scientific.includes('peperomia')
            )) {
                skipped.push({
                    file,
                    name: data.name,
                    reason: 'Tropical plant incorrectly changed - needs reverting'
                });
            }
            return;
        }
        
        const humidity = String(data.humidity || '').toLowerCase();
        const hasHighHumidity = humidity.includes('high') || 
                               humidity.includes('60%') || 
                               humidity.includes('70%') || 
                               humidity.includes('80%') || 
                               humidity.includes('90%');
        
        const hasModerateHigh = humidity.includes('moderate') && 
                               (humidity.includes('50%') || humidity.includes('60%'));
        
        let changed = false;
        const change = {
            file,
            name: data.name,
            scientificName: data.scientificName,
            oldHumidity: data.humidity,
            oldVivariumType: [...(data.vivariumType || [])],
            newHumidity: null,
            newVivariumType: null
        };
        
        // Fix humidity if it's too high
        if (hasHighHumidity || (hasModerateHigh && !humidity.includes('low'))) {
            const correctHumidity = determineCorrectHumidity(data);
            data.humidity = correctHumidity;
            change.newHumidity = correctHumidity;
            changed = true;
        }
        
        // Fix vivariumType - ensure Deserterium is included
        if (!data.vivariumType) {
            data.vivariumType = [];
        }
        
        const hasDesertarium = data.vivariumType.includes('Deserterium');
        const hasTerrarium = data.vivariumType.includes('Terrarium');
        
        // Add Deserterium if missing
        if (!hasDesertarium) {
            data.vivariumType.push('Deserterium');
            changed = true;
        }
        
        // Ensure House plant is included
        if (!data.vivariumType.includes('House plant')) {
            data.vivariumType.push('House plant');
            changed = true;
        }
        
        // Remove Terrarium (succulents don't belong in high-humidity terrariums)
        if (hasTerrarium) {
            data.vivariumType = data.vivariumType.filter(t => t !== 'Terrarium');
            changed = true;
        }
        
        if (changed) {
            change.newVivariumType = [...data.vivariumType];
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
            changes.push(change);
            fixed++;
        }
    });

    console.log(`\nFixed ${fixed} true desert succulent/cactus plants:\n`);
    changes.forEach(change => {
        console.log(`- ${change.file}: ${change.name} (${change.scientificName})`);
        if (change.newHumidity) {
            console.log(`  Humidity: ${change.oldHumidity} → ${change.newHumidity}`);
        }
        if (change.newVivariumType) {
            console.log(`  VivariumType: [${change.oldVivariumType.join(', ')}] → [${change.newVivariumType.join(', ')}]`);
        }
        console.log('');
    });

    if (skipped.length > 0) {
        console.log(`\n⚠️  Found ${skipped.length} tropical plants that were incorrectly changed and need reverting:\n`);
        skipped.forEach(item => {
            console.log(`- ${item.file}: ${item.name} - ${item.reason}`);
        });
    }

    return { fixed, skipped };
}

const result = fixSucculentPlants();
console.log(`\n✅ Fixed ${result.fixed} plants`);
if (result.skipped.length > 0) {
    console.log(`⚠️  ${result.skipped.length} plants need to be reverted (tropical plants incorrectly changed)`);
}

