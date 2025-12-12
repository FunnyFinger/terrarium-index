// Fix BOM (Byte Order Mark) encoding issues in JSON files
const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');
const problemFiles = [
    '00002-creeping-fig.json',
    '00009-marimo-moss-ball.json',
    '00010-selaginella.json',
    '00011-pellionia.json',
    '00012-hypoestes.json'
];

async function fixBOMFile(fileName) {
    const filePath = path.join(PLANTS_DIR, fileName);
    try {
        // Read file as buffer to handle BOM
        const buffer = await fs.readFile(filePath);
        // Remove BOM if present (first 3 bytes: EF BB BF)
        let content = buffer.toString('utf8');
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }
        
        const plant = JSON.parse(content);
        
        // Add airCirculation if missing
        if (!plant.airCirculation) {
            const description = (plant.description || '').toLowerCase();
            const careTips = Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '';
            const combinedText = description + ' ' + careTips;
            const humidityStr = (plant.humidity || '').toLowerCase();
            
            let airCirculation = 'Moderate (Ventilated)';
            
            if (combinedText.includes('closed') || combinedText.includes('sealed') || combinedText.includes('self-contained')) {
                airCirculation = 'Minimal (Closed/Sealed)';
            } else if (combinedText.includes('semi-closed') || combinedText.includes('partially open')) {
                airCirculation = 'Low (Semi-closed)';
            } else if (combinedText.includes('ventilated') || combinedText.includes('air circulation')) {
                airCirculation = 'Moderate (Ventilated)';
            } else if (combinedText.includes('open') || combinedText.includes('well-ventilated') || combinedText.includes('good air flow')) {
                airCirculation = 'High (Open/Well-ventilated)';
            } else if (combinedText.includes('open air') || combinedText.includes('outdoor')) {
                airCirculation = 'Very High (Open air)';
            } else if (humidityStr.includes('very high') || humidityStr.includes('70-90') || humidityStr.includes('80-100')) {
                if (!humidityStr.includes('submerged')) {
                    airCirculation = 'Minimal (Closed/Sealed)';
                }
            } else if (humidityStr.includes('high') || humidityStr.includes('60-80')) {
                airCirculation = 'Low (Semi-closed)';
            } else if (humidityStr.includes('low') || humidityStr.includes('40-50') || humidityStr.includes('30-40')) {
                airCirculation = 'High (Open/Well-ventilated)';
            }
            
            plant.airCirculation = airCirculation;
        }
        
        // Write back without BOM
        await fs.writeFile(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
        console.log(`✓ Fixed ${fileName}: ${plant.airCirculation}`);
    } catch (error) {
        console.error(`✗ Error fixing ${fileName}:`, error.message);
    }
}

async function main() {
    for (const file of problemFiles) {
        await fixBOMFile(file);
    }
    console.log('\nDone!');
}

main();

