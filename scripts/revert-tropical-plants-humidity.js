// Revert tropical plants that were incorrectly changed to low humidity
const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

const TROPICAL_PLANTS_TO_REVERT = [
    { file: '00015-hoya.json', name: 'Hoya waymaniae', correctHumidity: 'High (60-80%)' },
    { file: '00020-aluminum-plant.json', name: 'Aluminum Plant', correctHumidity: 'High (60-80%)' },
    { file: '00299-begonia-foliosa-var-miniata.json', name: 'Begonia foliosa', correctHumidity: 'High (60-80%)' },
    { file: '00317-hoya-burtoniae.json', name: 'Hoya burtoniae', correctHumidity: 'High (60-80%)' },
    { file: '00321-hoya-calycina-stargazer.json', name: 'Hoya calycina', correctHumidity: 'High (60-80%)' },
    { file: '00442-peperomia-tetraphylla-hope.json', name: 'Peperomia tetraphylla', correctHumidity: 'High (60-80%)' }
];

function revertTropicalPlants() {
    let reverted = 0;
    
    TROPICAL_PLANTS_TO_REVERT.forEach(plantInfo => {
        const filePath = path.join(PLANTS_DIR, plantInfo.file);
        
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  File not found: ${plantInfo.file}`);
            return;
        }
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const oldHumidity = data.humidity;
        
        // Revert humidity
        data.humidity = plantInfo.correctHumidity;
        
        // Ensure vivariumType is correct (should NOT have Deserterium)
        if (!data.vivariumType) {
            data.vivariumType = [];
        }
        
        // Remove Deserterium if present
        if (data.vivariumType.includes('Deserterium')) {
            data.vivariumType = data.vivariumType.filter(t => t !== 'Deserterium');
        }
        
        // Ensure Terrarium and/or House plant are included
        if (!data.vivariumType.includes('Terrarium') && !data.vivariumType.includes('House plant')) {
            data.vivariumType.push('Terrarium');
            data.vivariumType.push('House plant');
        }
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        
        console.log(`✅ Reverted ${plantInfo.file}: ${plantInfo.name}`);
        console.log(`   Humidity: ${oldHumidity} → ${data.humidity}`);
        console.log(`   VivariumType: [${data.vivariumType.join(', ')}]`);
        console.log('');
        
        reverted++;
    });
    
    return reverted;
}

const reverted = revertTropicalPlants();
console.log(`\n✅ Reverted ${reverted} tropical plants back to correct high humidity requirements`);

