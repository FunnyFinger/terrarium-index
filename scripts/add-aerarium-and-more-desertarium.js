// Script to add Aerarium category to air plants and add more desertarium plants
const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

// Air plants that go in aerariums
const aerariumPlants = [
    'brachycaulos', 'caput-medusae', 'ionantha-air-plant', 'spanish-moss',
    'tillandsia-air-plant-mini', 'xerographica'
];

// New desertarium plants to add
const newDesertariumPlants = [
    {
        "id": 113,
        "name": "Echinocactus (Mini)",
        "scientificName": "Echinocactus spp. (Miniature)",
        "type": ["terrarium"],
        "imageUrl": "",
        "images": [],
        "colorVariants": ["Green", "Yellow-spined"],
        "difficulty": "Easy",
        "lightRequirements": "Bright Light to Full Sun",
        "humidity": "Very Low (20-40%)",
        "temperature": "18-30°C",
        "watering": "Water sparingly, allow soil to dry completely between waterings",
        "substrate": "Well-draining cactus mix with sand and perlite",
        "size": "5-15 cm tall",
        "growthRate": "Very Slow",
        "description": "Miniature barrel cacti perfect for desertariums. Slow-growing and extremely drought-tolerant.",
        "careTips": [
            "Very low water needs",
            "Requires bright, direct light",
            "Excellent drainage is essential",
            "Susceptible to rot if overwatered"
        ],
        "compatibility": "Perfect for desertarium setups",
        "geographicOrigin": "North America (Mexico, southwestern USA)",
        "toxicity": "Non-toxic",
        "poisonHazard": "None (spines can cause physical injury)",
        "allergiesPotential": "Low",
        "additionalInfo": {
            "propagation": "Seeds or offsets",
            "flowering": "Yellow flowers on mature plants",
            "specialNotes": "Handle with care due to sharp spines"
        },
        "classification": ["Succulent"],
        "terrariumType": ["Desertarium", "Open Terrarium"],
        "taxonomy": {
            "kingdom": "Plantae",
            "genus": "Echinocactus"
        }
    },
    {
        "id": 114,
        "name": "Mammillaria (Mini)",
        "scientificName": "Mammillaria spp. (Miniature)",
        "type": ["terrarium"],
        "imageUrl": "",
        "images": [],
        "colorVariants": ["Green", "Various"],
        "difficulty": "Easy",
        "lightRequirements": "Bright Light to Full Sun",
        "humidity": "Very Low (20-40%)",
        "temperature": "18-30°C",
        "watering": "Water sparingly, allow to dry completely",
        "substrate": "Well-draining cactus mix",
        "size": "3-10 cm tall",
        "growthRate": "Slow",
        "description": "Small clustering cacti with attractive flowers. Many miniature varieties available.",
        "careTips": [
            "Low water requirements",
            "Prefers bright light",
            "Can form clusters",
            "Easy to care for"
        ],
        "compatibility": "Ideal for small desertariums",
        "geographicOrigin": "Americas (Mexico, Central America, Caribbean)",
        "toxicity": "Non-toxic",
        "poisonHazard": "None (spines can cause physical injury)",
        "allergiesPotential": "Low",
        "additionalInfo": {
            "propagation": "Offsets or seeds",
            "flowering": "Ring of colorful flowers around top",
            "specialNotes": "Very popular mini cactus genus"
        },
        "classification": ["Succulent"],
        "terrariumType": ["Desertarium", "Open Terrarium"],
        "taxonomy": {
            "kingdom": "Plantae",
            "genus": "Mammillaria"
        }
    },
    {
        "id": 115,
        "name": "Opuntia (Mini)",
        "scientificName": "Opuntia microdasys",
        "type": ["terrarium"],
        "imageUrl": "",
        "images": [],
        "colorVariants": ["Green", "Golden", "Red-tinted"],
        "difficulty": "Easy",
        "lightRequirements": "Bright Light to Full Sun",
        "humidity": "Low (30-50%)",
        "temperature": "18-30°C",
        "watering": "Water sparingly, let soil dry completely",
        "substrate": "Well-draining cactus mix",
        "size": "10-20 cm tall",
        "growthRate": "Moderate",
        "description": "Miniature prickly pear with soft-looking but sharp glochids. Various color forms available.",
        "careTips": [
            "Handle carefully - glochids are very irritating",
            "Needs bright light",
            "Low water needs",
            "Can grow quite wide"
        ],
        "compatibility": "Good for larger desertariums",
        "geographicOrigin": "Americas",
        "toxicity": "Non-toxic (fruits are edible)",
        "poisonHazard": "None (glochids cause skin irritation)",
        "allergiesPotential": "Low (glochids may cause reactions)",
        "additionalInfo": {
            "propagation": "Pads or seeds",
            "flowering": "Yellow or pink flowers",
            "specialNotes": "⚠️ Glochids are very irritating - handle with tongs"
        },
        "classification": ["Succulent"],
        "terrariumType": ["Desertarium", "Open Terrarium"],
        "taxonomy": {
            "kingdom": "Plantae",
            "genus": "Opuntia"
        }
    },
    {
        "id": 116,
        "name": "Adenium (Desert Rose Mini)",
        "scientificName": "Adenium obesum (Miniature)",
        "type": ["terrarium"],
        "imageUrl": "",
        "images": [],
        "colorVariants": ["Various flower colors"],
        "difficulty": "Moderate",
        "lightRequirements": "Bright Light to Full Sun",
        "humidity": "Low to Moderate (30-60%)",
        "temperature": "20-35°C",
        "watering": "Water when soil is dry, reduce in winter",
        "substrate": "Well-draining mix with sand",
        "size": "15-30 cm tall",
        "growthRate": "Slow",
        "description": "Miniature desert rose with beautiful flowers and swollen caudex. Requires careful watering.",
        "careTips": [
            "Don't overwater - will rot easily",
            "Needs bright light",
            "Can go dormant in winter",
            "Beautiful caudex forms over time"
        ],
        "compatibility": "Best for dedicated desertarium setups",
        "geographicOrigin": "East Africa, Arabian Peninsula",
        "toxicity": "Toxic",
        "poisonHazard": "Mild to Moderate",
        "allergiesPotential": "Low",
        "additionalInfo": {
            "propagation": "Seeds or cuttings",
            "flowering": "Pink, red, white, or variegated flowers",
            "specialNotes": "⚠️ Toxic sap - handle with care"
        },
        "classification": ["Succulent"],
        "terrariumType": ["Desertarium", "Open Terrarium"],
        "taxonomy": {
            "kingdom": "Plantae",
            "genus": "Adenium"
        }
    },
    {
        "id": 117,
        "name": "Pleiospilos (Split Rock)",
        "scientificName": "Pleiospilos nelii",
        "type": ["terrarium"],
        "imageUrl": "",
        "images": [],
        "colorVariants": ["Green-gray", "Red-tinted"],
        "difficulty": "Moderate to Hard",
        "lightRequirements": "Bright Light to Full Sun",
        "humidity": "Very Low (20-30%)",
        "temperature": "18-27°C",
        "watering": "Water very sparingly, mainly in fall",
        "substrate": "Very well-draining mineral mix",
        "size": "3-5 cm tall",
        "growthRate": "Very Slow",
        "description": "Mimicry succulent that looks like split rocks. Requires very specific watering schedule.",
        "careTips": [
            "Water only during specific seasons",
            "Requires very well-draining soil",
            "Don't water when splitting",
            "Needs bright light"
        ],
        "compatibility": "Best for dedicated succulent setups",
        "geographicOrigin": "South Africa",
        "toxicity": "Non-toxic",
        "poisonHazard": "None",
        "allergiesPotential": "Low",
        "additionalInfo": {
            "propagation": "Seeds or division",
            "flowering": "Large daisy-like flowers",
            "specialNotes": "⚠️ Requires very specific care - not for beginners"
        },
        "classification": ["Succulent"],
        "terrariumType": ["Desertarium", "Open Terrarium"],
        "taxonomy": {
            "kingdom": "Plantae",
            "genus": "Pleiospilos"
        }
    }
];

async function updateAirPlants() {
    console.log('🌿 Adding Aerarium category to air plants\n');
    
    const airPlantsDir = path.join(PLANTS_DIR, 'air-plants');
    const indexPath = path.join(airPlantsDir, 'index.json');
    
    try {
        const indexContent = await fs.readFile(indexPath, 'utf8');
        const index = JSON.parse(indexContent);
        
        let updatedCount = 0;
        
        for (const plantFile of index.plants || []) {
            const plantPath = path.join(airPlantsDir, plantFile);
            const plantName = plantFile.replace('.json', '');
            
            if (aerariumPlants.includes(plantName)) {
                try {
                    const plantContent = await fs.readFile(plantPath, 'utf8');
                    const plant = JSON.parse(plantContent);
                    
                    if (!plant.terrariumType) {
                        plant.terrariumType = [];
                    }
                    if (!plant.terrariumType.includes('Aerarium')) {
                        plant.terrariumType.push('Aerarium');
                        await fs.writeFile(plantPath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
                        console.log(`  ✅ Updated ${plant.name}: ${plant.terrariumType.join(', ')}`);
                        updatedCount++;
                    }
                } catch (err) {
                    console.error(`  ❌ Error processing ${plantFile}: ${err.message}`);
                }
            }
        }
        
        console.log(`\n✅ Updated ${updatedCount} air plants with Aerarium category`);
    } catch (err) {
        console.error(`❌ Error reading air-plants index: ${err.message}`);
    }
}

async function addDesertariumPlants() {
    console.log('\n🌵 Adding new desertarium plants\n');
    
    const succulentsDir = path.join(PLANTS_DIR, 'succulents');
    const indexPath = path.join(succulentsDir, 'index.json');
    
    try {
        const indexContent = await fs.readFile(indexPath, 'utf8');
        const index = JSON.parse(indexContent);
        
        let addedCount = 0;
        
        for (const newPlant of newDesertariumPlants) {
            const plantFileName = newPlant.name.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[()]/g, '')
                .replace(/mini/g, 'mini')
                .replace(/,/g, '') + '.json';
            
            const plantPath = path.join(succulentsDir, plantFileName);
            
            // Check if already exists
            try {
                await fs.access(plantPath);
                console.log(`  ⏭️  ${newPlant.name} already exists, skipping`);
                continue;
            } catch {
                // File doesn't exist, create it
            }
            
            await fs.writeFile(plantPath, JSON.stringify(newPlant, null, 2) + '\n', 'utf8');
            
            // Add to index
            if (!index.plants.includes(plantFileName)) {
                index.plants.push(plantFileName);
                index.count = index.plants.length;
            }
            
            console.log(`  ✅ Added ${newPlant.name}`);
            addedCount++;
        }
        
        // Update index.json
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
        
        console.log(`\n✅ Added ${addedCount} new desertarium plants`);
    } catch (err) {
        console.error(`❌ Error adding desertarium plants: ${err.message}`);
    }
}

async function main() {
    await updateAirPlants();
    await addDesertariumPlants();
    console.log('\n✅ Complete!');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { updateAirPlants, addDesertariumPlants };

