// Fix plants with high humidity that incorrectly have "Deserterium" in vivariumType
const fs = require('fs');
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

function fixDesertariumTypes() {
    const files = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json'));
    let fixed = 0;
    const issues = [];

    files.forEach(file => {
        const filePath = path.join(PLANTS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        const humidity = String(data.humidity || '').toLowerCase();
        const hasHighHumidity = humidity.includes('high') || 
                               humidity.includes('very high') || 
                               humidity.includes('60%') || 
                               humidity.includes('70%') || 
                               humidity.includes('80%') || 
                               humidity.includes('90%');
        
        const hasDesertarium = data.vivariumType && data.vivariumType.includes('Deserterium');
        
        if (hasHighHumidity && hasDesertarium) {
            issues.push({
                file,
                name: data.name,
                humidity: data.humidity,
                currentTypes: data.vivariumType
            });
            
            // Remove Deserterium from vivariumType
            data.vivariumType = data.vivariumType.filter(t => t !== 'Deserterium');
            
            // Ensure at least Terrarium or House plant remains
            if (data.vivariumType.length === 0) {
                data.vivariumType.push('Terrarium');
            }
            
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
            fixed++;
        }
    });

    console.log(`\nFixed ${fixed} plants with high humidity that incorrectly had Deserterium:\n`);
    issues.forEach(issue => {
        console.log(`- ${issue.file}: ${issue.name}`);
        console.log(`  Humidity: ${issue.humidity}`);
        console.log(`  Removed Deserterium from: ${issue.currentTypes.join(', ')}`);
        console.log(`  New types: ${JSON.parse(fs.readFileSync(path.join(PLANTS_DIR, issue.file), 'utf8')).vivariumType.join(', ')}\n`);
    });

    return fixed;
}

fixDesertariumTypes();

