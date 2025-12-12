// Fix succulent and cactus plants: correct humidity values and desertarium assignments
const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Succulent/cactus genera that should have LOW humidity (30-50%) and be suitable for desertarium
const DESERTARIUM_SUCCULENTS = [
    'echeveria', 'haworthia', 'aloe', 'crassula', 'sedum', 'agave', 'mammillaria',
    'echinocactus', 'opuntia', 'adromischus', 'aeonium', 'sansevieria', 'dracaena',
    'adenium', 'alluaudia', 'albuca', 'lithops', 'pleiospilos', 'euphorbia',
    'rhipsalis', 'senecio', 'kalanchoe', 'portulacaria', 'pachypodium'
];

// Succulents that can tolerate moderate humidity but still prefer low (40-50%)
const MODERATE_TOLERANT_SUCCULENTS = [
    'crassula', 'sedum', 'aeonium', 'kalanchoe'
];

function isSucculentOrCactus(plant) {
    const name = (plant.name || '').toLowerCase();
    const scientific = (plant.scientificName || '').toLowerCase();
    const category = (plant.category || []).map(c => c.toLowerCase());
    const plantType = (plant.plantType || '').toLowerCase();
    
    return category.includes('succulent') || 
           category.includes('cactus') ||
           plantType === 'succulent' ||
           plantType === 'cactus' ||
           DESERTARIUM_SUCCULENTS.some(genus => 
               scientific.includes(genus) || name.includes(genus)
           );
}

function determineCorrectHumidity(plant) {
    const scientific = (plant.scientificName || '').toLowerCase();
    const name = (plant.name || '').toLowerCase();
    
    // Check if it's a moderate-tolerant succulent
    const isModerateTolerant = MODERATE_TOLERANT_SUCCULENTS.some(genus =>
        scientific.includes(genus) || name.includes(genus)
    );
    
    // Most succulents prefer low humidity (30-50%)
    // Some can tolerate moderate (40-50%) but still prefer low
    if (isModerateTolerant) {
        return 'Low to Moderate (30-50%)';
    }
    
    return 'Low (30-50%)';
}

function fixSucculentPlants() {
    const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json'));
    let fixed = 0;
    const changes = [];

    files.forEach(file => {
        const filePath = path.join(PLANTS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (!isSucculentOrCactus(data)) {
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
        
        // Fix vivariumType
        const hasDesertarium = data.vivariumType && data.vivariumType.includes('Deserterium');
        const hasTerrarium = data.vivariumType && data.vivariumType.includes('Terrarium');
        
        // Succulents should have Deserterium (unless they truly need high humidity)
        // But if they have high humidity requirement, they shouldn't have Deserterium
        if (hasHighHumidity && hasDesertarium) {
            // Remove Deserterium if humidity is high
            data.vivariumType = data.vivariumType.filter(t => t !== 'Deserterium');
            if (data.vivariumType.length === 0) {
                data.vivariumType.push('House plant');
            }
            change.newVivariumType = [...data.vivariumType];
            changed = true;
        } else if (!hasHighHumidity && !hasDesertarium) {
            // Add Deserterium if it's a true succulent without high humidity
            if (!data.vivariumType) {
                data.vivariumType = [];
            }
            if (!data.vivariumType.includes('Deserterium')) {
                data.vivariumType.push('Deserterium');
            }
            // Also ensure House plant is included
            if (!data.vivariumType.includes('House plant')) {
                data.vivariumType.push('House plant');
            }
            // Remove Terrarium if it's there (succulents don't belong in high-humidity terrariums)
            data.vivariumType = data.vivariumType.filter(t => t !== 'Terrarium');
            change.newVivariumType = [...data.vivariumType];
            changed = true;
        }
        
        if (changed) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
            changes.push(change);
            fixed++;
        }
    });

    console.log(`\nFixed ${fixed} succulent/cactus plants:\n`);
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

    return fixed;
}

fixSucculentPlants();

