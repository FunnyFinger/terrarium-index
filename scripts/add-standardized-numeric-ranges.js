// Script to add standardized numeric ranges to all plant files
// This standardizes plant data for easier comparison and organization

const fs = require('fs');
const path = require('path');

// Copy NUMERIC_SCALES from script.js
const NUMERIC_SCALES = {
    humidity: {
        'very-low': { min: 20, max: 35, ideal: 25 },
        'low': { min: 35, max: 50, ideal: 40 },
        'moderate': { min: 50, max: 70, ideal: 60 },
        'high': { min: 70, max: 90, ideal: 80 },
        'very-high': { min: 90, max: 100, ideal: 95 },
        'aquatic': { min: 100, max: 100, ideal: 100 }
    },
    light: {
        'very-low': { min: 0, max: 20, ideal: 10 },
        'low': { min: 20, max: 40, ideal: 30 },
        'moderate': { min: 40, max: 60, ideal: 50 },
        'bright': { min: 60, max: 80, ideal: 70 },
        'very-bright': { min: 80, max: 100, ideal: 90 }
    },
    airCirculation: {
        'minimal': { min: 0, max: 20, ideal: 10 },
        'low': { min: 20, max: 40, ideal: 30 },
        'moderate': { min: 40, max: 60, ideal: 50 },
        'high': { min: 60, max: 80, ideal: 70 },
        'very-high': { min: 80, max: 100, ideal: 90 }
    },
    waterNeeds: {
        'minimal': { min: 0, max: 20, ideal: 10 },
        'low': { min: 20, max: 40, ideal: 30 },
        'moderate': { min: 40, max: 60, ideal: 50 },
        'high': { min: 60, max: 80, ideal: 70 },
        'constant': { min: 80, max: 100, ideal: 90 }
    },
    waterCirculation: {
        'none': { min: 0, max: 10, ideal: 5 },
        'low': { min: 10, max: 30, ideal: 20 },
        'moderate': { min: 30, max: 60, ideal: 45 },
        'high': { min: 60, max: 80, ideal: 70 },
        'very-high': { min: 80, max: 100, ideal: 90 }
    }
};

// Simplified version of mapPlantToInputs to calculate standardized ranges
function calculateStandardizedRanges(plant) {
    const ranges = {};
    
    // Prepare combinedText for use throughout the function (needed for pH, water hardness, salinity, etc.)
    const combinedText = (plant.description || '').toLowerCase() + ' ' + (Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '');
    
    // Humidity mapping
    const humidityStr = (plant.humidity || '').toLowerCase();
    const humidityRangeMatch = humidityStr.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (humidityRangeMatch) {
        ranges.humidityRange = {
            min: parseInt(humidityRangeMatch[1]),
            max: parseInt(humidityRangeMatch[2]),
            ideal: Math.round((parseInt(humidityRangeMatch[1]) + parseInt(humidityRangeMatch[2])) / 2)
        };
    } else {
        let humidityKey = 'moderate';
        if (humidityStr.includes('very high') || humidityStr.includes('70-90') || humidityStr.includes('80-100') || humidityStr.includes('85-100')) {
            humidityKey = 'very-high';
        } else if (humidityStr.includes('high') || humidityStr.includes('60-80') || humidityStr.includes('70-80')) {
            humidityKey = 'high';
        } else if (humidityStr.includes('moderate') || humidityStr.includes('50-70') || humidityStr.includes('40-60')) {
            humidityKey = 'moderate';
        } else if (humidityStr.includes('low') || humidityStr.includes('40-50') || humidityStr.includes('30-40')) {
            humidityKey = 'low';
        } else if (humidityStr.includes('20-30') || humidityStr.includes('very low')) {
            humidityKey = 'very-low';
        } else if (humidityStr.includes('submerged') || humidityStr.includes('aquatic')) {
            humidityKey = 'aquatic';
        }
        ranges.humidityRange = NUMERIC_SCALES.humidity[humidityKey] || NUMERIC_SCALES.humidity.moderate;
    }
    
    // Light mapping
    const lightStr = (plant.lightRequirements || '').toLowerCase();
    let lightKey = 'moderate';
    if (lightStr.includes('very bright') || lightStr.includes('direct') || lightStr.includes('full sun')) {
        lightKey = 'very-bright';
    } else if (lightStr.includes('bright')) {
        lightKey = 'bright';
    } else if (lightStr.includes('moderate') || lightStr.includes('medium')) {
        lightKey = 'moderate';
    } else if (lightStr.includes('low') || lightStr.includes('shade')) {
        lightKey = 'low';
    } else if (lightStr.includes('very low') || lightStr.includes('deep shade')) {
        lightKey = 'very-low';
    }
    ranges.lightRange = NUMERIC_SCALES.light[lightKey] || NUMERIC_SCALES.light.moderate;
    
    // Air circulation mapping
    const airCircStr = (plant.airCirculation || '').toLowerCase();
    
    let airCircKey = null;
    if (airCircStr.includes('very high') || airCircStr.includes('very-high') || airCircStr.includes('open air') || airCircStr.includes('outdoor')) {
        airCircKey = 'very-high';
    } else if (airCircStr.includes('high') || airCircStr.includes('well-ventilated') || airCircStr.includes('good air flow')) {
        airCircKey = 'high';
    } else if (airCircStr.includes('moderate') || airCircStr.includes('ventilated') || airCircStr.includes('air circulation')) {
        airCircKey = 'moderate';
    } else if (airCircStr.includes('low') || airCircStr.includes('semi-closed') || airCircStr.includes('partially open')) {
        airCircKey = 'low';
    } else if (airCircStr.includes('minimal') || airCircStr.includes('closed') || airCircStr.includes('sealed') || airCircStr.includes('self-contained')) {
        airCircKey = 'minimal';
    }
    
    if (!airCircKey) {
        if (combinedText.includes('closed') || combinedText.includes('sealed') || combinedText.includes('self-contained')) {
            airCircKey = 'minimal';
        } else if (combinedText.includes('semi-closed') || combinedText.includes('partially open')) {
            airCircKey = 'low';
        } else if (combinedText.includes('ventilated') || combinedText.includes('air circulation')) {
            airCircKey = 'moderate';
        } else if (combinedText.includes('open') || combinedText.includes('well-ventilated') || combinedText.includes('good air flow')) {
            airCircKey = 'high';
        } else if (combinedText.includes('open air') || combinedText.includes('outdoor')) {
            airCircKey = 'very-high';
        } else {
            // Infer from humidity range
            const humidityMid = (ranges.humidityRange.min + ranges.humidityRange.max) / 2;
            if (humidityMid >= 90 && !humidityStr.includes('submerged')) {
                airCircKey = 'minimal';
            } else if (humidityMid >= 70) {
                airCircKey = 'low';
            } else if (humidityMid >= 50) {
                airCircKey = 'moderate';
            } else {
                airCircKey = 'high';
            }
        }
    }
    
    const baseRange = NUMERIC_SCALES.airCirculation[airCircKey] || NUMERIC_SCALES.airCirculation.moderate;
    ranges.airCirculationRange = {
        min: Math.max(0, baseRange.min - 10),
        max: Math.min(100, baseRange.max + 10),
        ideal: baseRange.ideal
    };
    
    // Substrate mapping
    const substrateStr = (plant.substrate || '').toLowerCase();
    const growthHabit = (plant.growthHabit || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    const nameStr = (plant.name || '').toLowerCase();
    const descriptionStr = (plant.description || '').toLowerCase();
    const scientificNameStr = (plant.scientificName || '').toLowerCase();
    
    const isAquatic = substrateStr.includes('aquatic') || 
                     growthHabit === 'aquatic' || 
                     category.includes('aquatic') || 
                     humidityStr.includes('submerged') ||
                     nameStr.includes('aquatic') ||
                     nameStr.includes('water') && (nameStr.includes('plant') || nameStr.includes('fern') || nameStr.includes('moss')) ||
                     descriptionStr.includes('fully aquatic') ||
                     descriptionStr.includes('submerged') ||
                     descriptionStr.includes('underwater') ||
                     descriptionStr.includes('aquarium plant') ||
                     scientificNameStr.includes('aquatic');
    
    if (isAquatic) {
        ranges.substrateType = 'aquatic';
    } else if (growthHabit === 'epiphytic' || substrateStr.includes('epiphytic') || category.includes('epiphytic') || category.includes('air-plant') || category.includes('bromeliad')) {
        ranges.substrateType = 'epiphytic';
    } else if (substrateStr.includes('dry') || substrateStr.includes('well-draining') || substrateStr.includes('sand') || category.includes('succulent') || category.includes('cactus')) {
        ranges.substrateType = 'dry';
    } else if (substrateStr.includes('wet') || substrateStr.includes('waterlogged') || substrateStr.includes('bog')) {
        ranges.substrateType = 'wet';
    } else {
        ranges.substrateType = 'moist';
    }
    
    // Water needs mapping
    const wateringStr = (plant.watering || '').toLowerCase();
    let waterNeedsKey = 'moderate';
    if (wateringStr.includes('semi-aquatic')) {
        waterNeedsKey = 'high';
    } else if (wateringStr.includes('constantly') || wateringStr.includes('always moist') || wateringStr.includes('always wet') || (ranges.substrateType === 'aquatic' && !wateringStr.includes('semi'))) {
        waterNeedsKey = 'constant';
    } else if (wateringStr.includes('frequently') || wateringStr.includes('keep moist') || wateringStr.includes('high')) {
        waterNeedsKey = 'high';
    } else if (wateringStr.includes('moderate') || wateringStr.includes('regular')) {
        waterNeedsKey = 'moderate';
    } else if (wateringStr.includes('infrequent') || wateringStr.includes('low')) {
        waterNeedsKey = 'low';
    } else if (wateringStr.includes('minimal') || wateringStr.includes('drought')) {
        waterNeedsKey = 'minimal';
    }
    ranges.waterNeedsRange = NUMERIC_SCALES.waterNeeds[waterNeedsKey] || NUMERIC_SCALES.waterNeeds.moderate;
    
    // Water circulation mapping (only for aquatic plants)
    if (ranges.substrateType === 'aquatic') {
        const waterCircStr = (plant.waterCirculation || '').toLowerCase();
        const combinedText = (plant.description || '').toLowerCase() + ' ' + (Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '');
        
        let waterCircKey = 'moderate';
        if (waterCircStr.includes('very high') || waterCircStr.includes('strong current') || waterCircStr.includes('fast flow') || combinedText.includes('strong current') || combinedText.includes('fast flow')) {
            waterCircKey = 'very-high';
        } else if (waterCircStr.includes('high') || waterCircStr.includes('good flow') || waterCircStr.includes('moderate current') || combinedText.includes('good flow') || combinedText.includes('moderate current')) {
            waterCircKey = 'high';
        } else if (waterCircStr.includes('moderate') || waterCircStr.includes('gentle flow') || combinedText.includes('gentle flow')) {
            waterCircKey = 'moderate';
        } else if (waterCircStr.includes('low') || waterCircStr.includes('still') || waterCircStr.includes('stagnant') || combinedText.includes('still water') || combinedText.includes('stagnant')) {
            waterCircKey = 'low';
        } else if (waterCircStr.includes('none') || waterCircStr.includes('no flow')) {
            waterCircKey = 'none';
        }
        ranges.waterCirculationRange = NUMERIC_SCALES.waterCirculation[waterCircKey] || NUMERIC_SCALES.waterCirculation.moderate;
    }
    
    // Special needs
    if (category.includes('carnivorous')) {
        ranges.specialNeeds = 'carnivorous';
    } else if (category.includes('epiphytic') || category.includes('air-plant')) {
        ranges.specialNeeds = 'epiphytic';
    } else if (category.includes('aquatic') || ranges.substrateType === 'aquatic') {
        ranges.specialNeeds = 'aquatic';
    } else if (category.includes('succulent') || category.includes('cactus')) {
        ranges.specialNeeds = 'succulent';
    } else if (category.includes('bromeliad')) {
        ranges.specialNeeds = 'bromeliad';
    } else if (category.includes('orchid')) {
        ranges.specialNeeds = 'orchid';
    } else {
        ranges.specialNeeds = 'none';
    }
    
    // Temperature mapping - convert to numeric range (0-50°C normalized to 0-100%)
    const temperatureStr = plant.temperature || '';
    const tempRangeMatch = temperatureStr.match(/(\d+)\s*[-–]\s*(\d+)\s*°?C/i);
    if (tempRangeMatch) {
        const minTemp = parseInt(tempRangeMatch[1]);
        const maxTemp = parseInt(tempRangeMatch[2]);
        const minPercent = Math.max(0, Math.min(100, (minTemp / 50) * 100));
        const maxPercent = Math.max(0, Math.min(100, (maxTemp / 50) * 100));
        ranges.temperatureRange = {
            min: minPercent,
            max: maxPercent,
            ideal: (minPercent + maxPercent) / 2
        };
    } else {
        const singleTempMatch = temperatureStr.match(/(\d+)\s*°?C/i);
        if (singleTempMatch) {
            const temp = parseInt(singleTempMatch[1]);
            const tempPercent = Math.max(0, Math.min(100, (temp / 50) * 100));
            ranges.temperatureRange = {
                min: Math.max(0, tempPercent - 5),
                max: Math.min(100, tempPercent + 5),
                ideal: tempPercent
            };
        } else {
            ranges.temperatureRange = { min: 40, max: 50, ideal: 45 }; // Default: 20-25°C
        }
    }
    
    // Difficulty mapping - convert to numeric range (0-100%)
    const difficultyStr = (plant.difficulty || '').toLowerCase();
    if (difficultyStr.includes('easy')) {
        ranges.difficultyRange = { min: 0, max: 30, ideal: 15 };
    } else if (difficultyStr.includes('moderate')) {
        ranges.difficultyRange = { min: 40, max: 60, ideal: 50 };
    } else if (difficultyStr.includes('hard')) {
        ranges.difficultyRange = { min: 70, max: 100, ideal: 85 };
    } else {
        ranges.difficultyRange = { min: 40, max: 60, ideal: 50 }; // Default to moderate
    }
    
    // Soil pH mapping - parse from description/careTips
    const soilPhRangeMatch = combinedText.match(/soil\s+ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/i) || 
                            combinedText.match(/ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*\(soil\)/i);
    const soilPhSingleMatch = combinedText.match(/soil\s+ph\s+(\d+\.?\d*)/i);
    
    if (soilPhRangeMatch) {
        const minPh = parseFloat(soilPhRangeMatch[1]);
        const maxPh = parseFloat(soilPhRangeMatch[2]);
        const minPercent = Math.max(0, Math.min(100, (minPh / 14) * 100));
        const maxPercent = Math.max(0, Math.min(100, (maxPh / 14) * 100));
        ranges.soilPhRange = {
            min: minPercent,
            max: maxPercent,
            ideal: (minPercent + maxPercent) / 2
        };
    } else if (soilPhSingleMatch) {
        const ph = parseFloat(soilPhSingleMatch[1]);
        const phPercent = Math.max(0, Math.min(100, (ph / 14) * 100));
        ranges.soilPhRange = {
            min: Math.max(0, phPercent - 3),
            max: Math.min(100, phPercent + 3),
            ideal: phPercent
        };
    } else {
        ranges.soilPhRange = { min: 42.9, max: 50, ideal: 46.4 }; // Default: pH 6.0-7.0
    }
    
    // Submerged details for aquatic plants
    if (ranges.substrateType === 'aquatic' || ranges.specialNeeds === 'aquatic') {
        // Water Temperature - same as air temperature for aquatic plants
        ranges.waterTemperatureRange = ranges.temperatureRange;
        
        // Water pH mapping
        const waterPhRangeMatch = combinedText.match(/water\s+ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/i) || 
                                  combinedText.match(/ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*\(water\)/i) ||
                                  combinedText.match(/ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/i);
        const waterPhSingleMatch = combinedText.match(/water\s+ph\s+(\d+\.?\d*)/i) || 
                                   combinedText.match(/ph\s+(\d+\.?\d*)/i);
        
        if (waterPhRangeMatch) {
            const minPh = parseFloat(waterPhRangeMatch[1]);
            const maxPh = parseFloat(waterPhRangeMatch[2]);
            const minPercent = Math.max(0, Math.min(100, (minPh / 14) * 100));
            const maxPercent = Math.max(0, Math.min(100, (maxPh / 14) * 100));
            ranges.waterPhRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else if (waterPhSingleMatch) {
            const ph = parseFloat(waterPhSingleMatch[1]);
            const phPercent = Math.max(0, Math.min(100, (ph / 14) * 100));
            ranges.waterPhRange = {
                min: Math.max(0, phPercent - 3),
                max: Math.min(100, phPercent + 3),
                ideal: phPercent
            };
        } else {
            ranges.waterPhRange = { min: 50, max: 57.1, ideal: 53.6 }; // Default: pH 7.0-8.0
        }
        
        // Water Hardness (GH/dGH) mapping
        const hardnessMatch = combinedText.match(/(\d+)\s*[-–]\s*(\d+)\s*dgh/i) || 
                              combinedText.match(/hardness\s+(\d+)\s*[-–]\s*(\d+)/i) ||
                              combinedText.match(/(\d+)\s*[-–]\s*(\d+)\s*gh/i);
        const hardnessSingleMatch = combinedText.match(/(\d+)\s*dgh/i) || 
                                    combinedText.match(/hardness\s+(\d+)/i) ||
                                    combinedText.match(/(\d+)\s*gh/i);
        
        let hardnessKey = null;
        if (combinedText.includes('very soft') || combinedText.includes('extremely soft')) {
            hardnessKey = 'very-soft';
        } else if (combinedText.includes('soft') || combinedText.includes('soft water')) {
            hardnessKey = 'soft';
        } else if (combinedText.includes('moderate') || combinedText.includes('moderately hard')) {
            hardnessKey = 'moderate';
        } else if (combinedText.includes('hard') || combinedText.includes('hard water')) {
            hardnessKey = 'hard';
        } else if (combinedText.includes('very hard')) {
            hardnessKey = 'very-hard';
        }
        
        if (hardnessMatch) {
            const minGH = parseInt(hardnessMatch[1]);
            const maxGH = parseInt(hardnessMatch[2]);
            const minPercent = Math.max(0, Math.min(100, (minGH / 30) * 100));
            const maxPercent = Math.max(0, Math.min(100, (maxGH / 30) * 100));
            ranges.waterHardnessRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else if (hardnessSingleMatch) {
            const gh = parseInt(hardnessSingleMatch[1]);
            const ghPercent = Math.max(0, Math.min(100, (gh / 30) * 100));
            ranges.waterHardnessRange = {
                min: Math.max(0, ghPercent - 5),
                max: Math.min(100, ghPercent + 5),
                ideal: ghPercent
            };
        } else if (hardnessKey) {
            const hardnessMap = {
                'very-soft': { min: 0, max: 6.67, ideal: 3.33 },
                'soft': { min: 6.67, max: 20, ideal: 13.33 },
                'moderate': { min: 20, max: 40, ideal: 30 },
                'hard': { min: 40, max: 66.67, ideal: 53.33 },
                'very-hard': { min: 66.67, max: 100, ideal: 83.33 }
            };
            ranges.waterHardnessRange = hardnessMap[hardnessKey] || hardnessMap.moderate;
        } else {
            ranges.waterHardnessRange = { min: 6.67, max: 40, ideal: 23.33 }; // Default: 2-12 dGH
        }
        
        // Salinity/Water Type mapping
        let salinityKey = 'freshwater';
        if (combinedText.includes('marine') || combinedText.includes('saltwater') || combinedText.includes('seawater')) {
            salinityKey = 'marine';
        } else if (combinedText.includes('brackish')) {
            salinityKey = 'brackish';
        } else if (combinedText.includes('freshwater') || combinedText.includes('fresh water')) {
            salinityKey = 'freshwater';
        }
        
        const salinitySGMatch = combinedText.match(/salinity\s+1\.(\d{3})\s*[-–]\s*1\.(\d{3})/i) ||
                                combinedText.match(/1\.(\d{3})\s*[-–]\s*1\.(\d{3})\s*salinity/i);
        const salinityPptMatch = combinedText.match(/salinity\s+(\d+)\s*[-–]\s*(\d+)\s*ppt/i) ||
                                 combinedText.match(/(\d+)\s*[-–]\s*(\d+)\s*ppt/i);
        
        if (salinitySGMatch) {
            const minSG = parseFloat('1.' + salinitySGMatch[1]);
            const maxSG = parseFloat('1.' + salinitySGMatch[2]);
            const minPercent = Math.max(0, Math.min(100, ((minSG - 1.000) / 0.030) * 100));
            const maxPercent = Math.max(0, Math.min(100, ((maxSG - 1.000) / 0.030) * 100));
            ranges.salinityRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else if (salinityPptMatch) {
            const minPpt = parseInt(salinityPptMatch[1]);
            const maxPpt = parseInt(salinityPptMatch[2]);
            const minPercent = Math.max(0, Math.min(100, (minPpt / 40) * 100));
            const maxPercent = Math.max(0, Math.min(100, (maxPpt / 40) * 100));
            ranges.salinityRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else {
            const salinityMap = {
                'freshwater': { min: 0, max: 5, ideal: 2.5 },
                'brackish': { min: 12.5, max: 75, ideal: 43.75 },
                'marine': { min: 75, max: 100, ideal: 87.5 }
            };
            ranges.salinityRange = salinityMap[salinityKey] || salinityMap.freshwater;
        }
    }
    
    return ranges;
}

// Find all plant files
function findPlantFiles(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findPlantFiles(fullPath));
        } else if (entry.name.endsWith('.json')) {
            files.push(fullPath);
        }
    }
    
    return files;
}

// Update a single plant file
function updatePlantFile(filePath) {
    try {
        const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Calculate standardized ranges
        const ranges = calculateStandardizedRanges(plant);
        
        // Add ranges to plant object (preserve existing order, add after basic fields)
        const updatedPlant = { ...plant };
        
        // Add standardized ranges - all requirement details
        updatedPlant.humidityRange = ranges.humidityRange;
        updatedPlant.lightRange = ranges.lightRange;
        updatedPlant.airCirculationRange = ranges.airCirculationRange;
        updatedPlant.waterNeedsRange = ranges.waterNeedsRange;
        updatedPlant.temperatureRange = ranges.temperatureRange;
        updatedPlant.difficultyRange = ranges.difficultyRange;
        updatedPlant.soilPhRange = ranges.soilPhRange;
        updatedPlant.substrateType = ranges.substrateType;
        updatedPlant.specialNeeds = ranges.specialNeeds;
        
        // Add submerged details for aquatic plants
        if (ranges.substrateType === 'aquatic' || ranges.specialNeeds === 'aquatic') {
            updatedPlant.waterTemperatureRange = ranges.waterTemperatureRange;
            updatedPlant.waterPhRange = ranges.waterPhRange;
            updatedPlant.waterHardnessRange = ranges.waterHardnessRange;
            updatedPlant.salinityRange = ranges.salinityRange;
            updatedPlant.waterCirculationRange = ranges.waterCirculationRange;
        }
        
        // Write back to file with proper formatting
        fs.writeFileSync(filePath, JSON.stringify(updatedPlant, null, 2) + '\n', 'utf8');
        
        return { success: true, plant: plant.name };
    } catch (error) {
        return { success: false, error: error.message, file: filePath };
    }
}

// Main function
async function main() {
    const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
    
    if (!fs.existsSync(plantsDir)) {
        console.error(`Directory not found: ${plantsDir}`);
        process.exit(1);
    }
    
    console.log('Finding plant files...');
    const plantFiles = findPlantFiles(plantsDir);
    console.log(`Found ${plantFiles.length} plant files\n`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    console.log('Adding standardized numeric ranges to plant files...\n');
    
    for (let i = 0; i < plantFiles.length; i++) {
        const filePath = plantFiles[i];
        const result = updatePlantFile(filePath);
        
        if (result.success) {
            successCount++;
            if ((i + 1) % 50 === 0) {
                process.stdout.write(`\rProcessed: ${i + 1}/${plantFiles.length} files...`);
            }
        } else {
            errorCount++;
            errors.push(result);
            console.error(`\nError processing ${path.basename(filePath)}: ${result.error}`);
        }
    }
    
    console.log(`\n\nCompleted!`);
    console.log(`Successfully updated: ${successCount} files`);
    console.log(`Errors: ${errorCount} files`);
    
    if (errors.length > 0) {
        console.log('\nErrors:');
        errors.forEach(err => {
            console.log(`  ${path.basename(err.file)}: ${err.error}`);
        });
    }
}

main().catch(console.error);

