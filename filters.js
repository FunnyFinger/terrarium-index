(function () {
'use strict';

const NUMERIC_SCALES = {
    // Humidity: 0% = very dry, 100% = fully submerged/aquatic
    humidity: {
        'very-low': { min: 20, max: 35, ideal: 25 },
        'low': { min: 35, max: 50, ideal: 40 },
        'moderate': { min: 50, max: 70, ideal: 60 },
        'high': { min: 70, max: 90, ideal: 80 },
        'very-high': { min: 90, max: 100, ideal: 95 },
        'aquatic': { min: 100, max: 100, ideal: 100 }
    },
    // Light: 0% = complete darkness, 100% = direct sunlight
    light: {
        'very-low': { min: 0, max: 20, ideal: 10 },
        'low': { min: 20, max: 40, ideal: 30 },
        'moderate': { min: 40, max: 60, ideal: 50 },
        'bright': { min: 60, max: 80, ideal: 70 },
        'very-bright': { min: 80, max: 100, ideal: 90 }
    },
    // Air Circulation: 0% = sealed/closed, 100% = open air/outdoor
    airCirculation: {
        'minimal': { min: 0, max: 20, ideal: 10 },
        'low': { min: 20, max: 40, ideal: 30 },
        'moderate': { min: 40, max: 60, ideal: 50 },
        'high': { min: 60, max: 80, ideal: 70 },
        'very-high': { min: 80, max: 100, ideal: 90 }
    },
    // Water Needs: 0% = minimal/drought tolerant, 100% = constant/submerged
    waterNeeds: {
        'minimal': { min: 0, max: 20, ideal: 10 },
        'low': { min: 20, max: 40, ideal: 30 },
        'moderate': { min: 40, max: 60, ideal: 50 },
        'high': { min: 60, max: 80, ideal: 70 },
        'constant': { min: 80, max: 100, ideal: 90 }
    },
    // Water Circulation: 0% = still/stagnant, 100% = strong current/flow
    waterCirculation: {
        'none': { min: 0, max: 10, ideal: 5 },
        'low': { min: 10, max: 30, ideal: 20 },
        'moderate': { min: 30, max: 60, ideal: 45 },
        'high': { min: 60, max: 80, ideal: 70 },
        'very-high': { min: 80, max: 100, ideal: 90 }
    }
};

function mapPlantToInputs(plant) {
    const inputs = {};
    
    // Humidity mapping - use standardized range if available, otherwise parse from text
    if (plant.humidityRange && typeof plant.humidityRange === 'object' && 
        typeof plant.humidityRange.min === 'number' && typeof plant.humidityRange.max === 'number') {
        inputs.humidityRange = plant.humidityRange;
    } else {
        // Fallback: parse from text
    const humidityStr = (plant.humidity || '').toLowerCase();
    const rangeMatch = humidityStr.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
        inputs.humidityRange = {
            min: parseInt(rangeMatch[1]),
            max: parseInt(rangeMatch[2]),
            ideal: Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2)
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
        inputs.humidityRange = NUMERIC_SCALES.humidity[humidityKey] || NUMERIC_SCALES.humidity.moderate;
    }
    }
    
    // Light mapping - use standardized range if available, otherwise parse from text
    if (plant.lightRange && typeof plant.lightRange === 'object' && 
        typeof plant.lightRange.min === 'number' && typeof plant.lightRange.max === 'number') {
        inputs.lightRange = plant.lightRange;
    } else {
        // Fallback: parse from text
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
    inputs.lightRange = NUMERIC_SCALES.light[lightKey] || NUMERIC_SCALES.light.moderate;
    }
    
    // Air circulation - use standardized range if available, otherwise parse from text
    if (plant.airCirculationRange && typeof plant.airCirculationRange === 'object' && 
        typeof plant.airCirculationRange.min === 'number' && typeof plant.airCirculationRange.max === 'number') {
        inputs.airCirculationRange = plant.airCirculationRange;
    } else {
        // Fallback: parse from text
    const airCircStr = (plant.airCirculation || '').toLowerCase();
    const description = (plant.description || '').toLowerCase();
    const careTips = Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '';
    const combinedText = description + ' ' + careTips;
    
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
            const humidityMid = (inputs.humidityRange.min + inputs.humidityRange.max) / 2;
                const humidityStr = (plant.humidity || '').toLowerCase();
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
    inputs.airCirculationRange = {
        min: Math.max(0, baseRange.min - 10),
        max: Math.min(100, baseRange.max + 10),
        ideal: baseRange.ideal
    };
    }
    
    // Substrate mapping - use standardized value if available, otherwise parse from text
    if (plant.substrateType && typeof plant.substrateType === 'string') {
        inputs.substrate = plant.substrateType;
    } else {
        // Fallback: parse from text
    const substrateStr = (plant.substrate || '').toLowerCase();
    const growthHabit = (plant.growthHabit || '').toLowerCase();
    const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    const nameStr = (plant.name || '').toLowerCase();
    const descriptionStr = (plant.description || '').toLowerCase();
    const scientificNameStr = (plant.scientificName || '').toLowerCase();
        const humidityStr = (plant.humidity || '').toLowerCase();
    
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
        inputs.substrate = 'aquatic';
        } else if (growthHabit === 'epiphytic' || substrateStr.includes('epiphytic') || category.includes('epiphytic') || category.includes('air-plant') || category.includes('bromeliad')) {
        inputs.substrate = 'epiphytic';
    } else if (substrateStr.includes('dry') || substrateStr.includes('well-draining') || substrateStr.includes('sand') || category.includes('succulent') || category.includes('cactus')) {
        inputs.substrate = 'dry';
    } else if (substrateStr.includes('wet') || substrateStr.includes('waterlogged') || substrateStr.includes('bog')) {
        inputs.substrate = 'wet';
    } else {
            inputs.substrate = 'moist';
        }
    }
    
    // Water needs mapping - use standardized range if available, otherwise parse from text
    if (plant.waterNeedsRange && typeof plant.waterNeedsRange === 'object' && 
        typeof plant.waterNeedsRange.min === 'number' && typeof plant.waterNeedsRange.max === 'number') {
        inputs.waterNeedsRange = plant.waterNeedsRange;
    } else {
        // Fallback: parse from text
    const wateringStr = (plant.watering || '').toLowerCase();
        let waterNeedsKey = 'moderate';
    if (wateringStr.includes('semi-aquatic')) {
        waterNeedsKey = 'high';
    } else if (wateringStr.includes('constantly') || wateringStr.includes('always moist') || wateringStr.includes('always wet') || (inputs.substrate === 'aquatic' && !wateringStr.includes('semi'))) {
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
    inputs.waterNeedsRange = NUMERIC_SCALES.waterNeeds[waterNeedsKey] || NUMERIC_SCALES.waterNeeds.moderate;
    }
    
    // Prepare combinedText for use throughout the function (needed for pH, water hardness, salinity, etc.)
    const combinedText = (plant.description || '').toLowerCase() + ' ' + (Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '');
    
    // Water circulation mapping - use standardized range if available, otherwise parse from text
    // Only relevant for aquatic plants (aquarium, paludarium, riparium)
    if (inputs.substrate === 'aquatic' || inputs.specialNeeds === 'aquatic') {
        if (plant.waterCirculationRange && typeof plant.waterCirculationRange === 'object' && 
            typeof plant.waterCirculationRange.min === 'number' && typeof plant.waterCirculationRange.max === 'number') {
            inputs.waterCirculationRange = plant.waterCirculationRange;
        } else {
            // Fallback: parse from text
        const waterCircStr = (plant.waterCirculation || '').toLowerCase();
        
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
        inputs.waterCirculationRange = NUMERIC_SCALES.waterCirculation[waterCircKey] || NUMERIC_SCALES.waterCirculation.moderate;
        }
        
        // Water Hardness (GH/dGH) mapping - convert to numeric range (0-30 dGH normalized to 0-100%)
        // Scale: 0 dGH = 0%, 30 dGH = 100%
        const hardnessMatch = combinedText.match(/(\d+)\s*[-–]\s*(\d+)\s*dgh/i) || 
                              combinedText.match(/hardness\s+(\d+)\s*[-–]\s*(\d+)/i) ||
                              combinedText.match(/(\d+)\s*[-–]\s*(\d+)\s*gh/i);
        const hardnessSingleMatch = combinedText.match(/(\d+)\s*dgh/i) || 
                                    combinedText.match(/hardness\s+(\d+)/i) ||
                                    combinedText.match(/(\d+)\s*gh/i);
        
        // Also check for descriptive terms
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
            inputs.waterHardnessRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else if (hardnessSingleMatch) {
            const gh = parseInt(hardnessSingleMatch[1]);
            const ghPercent = Math.max(0, Math.min(100, (gh / 30) * 100));
            inputs.waterHardnessRange = {
                min: Math.max(0, ghPercent - 5),
                max: Math.min(100, ghPercent + 5),
                ideal: ghPercent
            };
        } else if (hardnessKey) {
            // Map descriptive terms to ranges
            const hardnessMap = {
                'very-soft': { min: 0, max: 6.67, ideal: 3.33 },      // 0-2 dGH
                'soft': { min: 6.67, max: 20, ideal: 13.33 },         // 2-6 dGH
                'moderate': { min: 20, max: 40, ideal: 30 },          // 6-12 dGH
                'hard': { min: 40, max: 66.67, ideal: 53.33 },        // 12-20 dGH
                'very-hard': { min: 66.67, max: 100, ideal: 83.33 }  // 20-30 dGH
            };
            inputs.waterHardnessRange = hardnessMap[hardnessKey] || hardnessMap.moderate;
        } else {
            // Default: soft to moderately hard (2-12 dGH = 6.67-40%)
            inputs.waterHardnessRange = { min: 6.67, max: 40, ideal: 23.33 };
        }
        
        // Salinity/Water Type mapping - convert to numeric range (0-100%)
        // Scale: 0% = Freshwater, 30% = Brackish, 100% = Marine
        let salinityKey = 'freshwater'; // Default
        if (combinedText.includes('marine') || combinedText.includes('saltwater') || combinedText.includes('seawater')) {
            salinityKey = 'marine';
        } else if (combinedText.includes('brackish')) {
            salinityKey = 'brackish';
        } else if (combinedText.includes('freshwater') || combinedText.includes('fresh water')) {
            salinityKey = 'freshwater';
        }
        
        // Try to parse specific gravity (1.000-1.030) or ppt (0-40)
        const salinitySGMatch = combinedText.match(/salinity\s+1\.(\d{3})\s*[-–]\s*1\.(\d{3})/i) ||
                                combinedText.match(/1\.(\d{3})\s*[-–]\s*1\.(\d{3})\s*salinity/i);
        const salinityPptMatch = combinedText.match(/salinity\s+(\d+)\s*[-–]\s*(\d+)\s*ppt/i) ||
                                 combinedText.match(/(\d+)\s*[-–]\s*(\d+)\s*ppt/i);
        
        if (salinitySGMatch) {
            const minSG = parseFloat('1.' + salinitySGMatch[1]);
            const maxSG = parseFloat('1.' + salinitySGMatch[2]);
            // Convert SG to percentage: 1.000 = 0%, 1.030 = 100%
            const minPercent = Math.max(0, Math.min(100, ((minSG - 1.000) / 0.030) * 100));
            const maxPercent = Math.max(0, Math.min(100, ((maxSG - 1.000) / 0.030) * 100));
            inputs.salinityRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else if (salinityPptMatch) {
            const minPpt = parseInt(salinityPptMatch[1]);
            const maxPpt = parseInt(salinityPptMatch[2]);
            // Convert ppt to percentage: 0 ppt = 0%, 40 ppt = 100%
            const minPercent = Math.max(0, Math.min(100, (minPpt / 40) * 100));
            const maxPercent = Math.max(0, Math.min(100, (maxPpt / 40) * 100));
            inputs.salinityRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else {
            // Map water type to ranges
            const salinityMap = {
                'freshwater': { min: 0, max: 5, ideal: 2.5 },      // 0-2 ppt
                'brackish': { min: 12.5, max: 75, ideal: 43.75 },  // 5-30 ppt
                'marine': { min: 75, max: 100, ideal: 87.5 }       // 30-40 ppt
            };
            inputs.salinityRange = salinityMap[salinityKey] || salinityMap.freshwater;
        }
        
        // Water Temperature mapping - separate from air temperature for aquatic plants
        // Use the same temperature field but create a separate waterTemperatureRange
        // This will be the same as temperatureRange but specifically for water
        if (inputs.temperatureRange) {
            inputs.waterTemperatureRange = inputs.temperatureRange;
        } else {
            // Fallback: parse temperature string again if temperatureRange wasn't set
            const tempStr = plant.temperature || '';
            const tempRangeMatch = tempStr.match(/(\d+)\s*[-–]\s*(\d+)\s*°?C/i);
            if (tempRangeMatch) {
                const minTemp = parseInt(tempRangeMatch[1]);
                const maxTemp = parseInt(tempRangeMatch[2]);
                const minPercent = Math.max(0, Math.min(100, (minTemp / 50) * 100));
                const maxPercent = Math.max(0, Math.min(100, (maxTemp / 50) * 100));
                inputs.waterTemperatureRange = {
                    min: minPercent,
                    max: maxPercent,
                    ideal: (minPercent + maxPercent) / 2
                };
            } else {
                // Default: moderate temperature (22-26°C = 44-52%)
                inputs.waterTemperatureRange = { min: 44, max: 52, ideal: 48 };
            }
        }
    }
    
    // Special needs - use standardized value if available, otherwise parse from category
    if (plant.specialNeeds && typeof plant.specialNeeds === 'string') {
        inputs.specialNeeds = plant.specialNeeds;
    } else {
        // Fallback: parse from category
        const category = Array.isArray(plant.category) ? plant.category.map(c => String(c).toLowerCase()) : [];
    if (category.includes('carnivorous')) {
        inputs.specialNeeds = 'carnivorous';
    } else if (category.includes('epiphytic') || category.includes('air-plant')) {
        inputs.specialNeeds = 'epiphytic';
    } else if (category.includes('aquatic') || inputs.substrate === 'aquatic') {
        inputs.specialNeeds = 'aquatic';
    } else if (category.includes('succulent') || category.includes('cactus')) {
        inputs.specialNeeds = 'succulent';
    } else if (category.includes('bromeliad')) {
        inputs.specialNeeds = 'bromeliad';
    } else if (category.includes('orchid')) {
        inputs.specialNeeds = 'orchid';
    } else {
        inputs.specialNeeds = 'none';
        }
    }
    
    // Extract max size from size string
    const sizeStr = plant.size || '';
    const sizeMatch = sizeStr.match(/(\d+)\s*[-–]\s*(\d+)\s*cm/i) || sizeStr.match(/(\d+)\s*cm/i);
    if (sizeMatch) {
        inputs.maxSize = sizeMatch[2] ? parseInt(sizeMatch[2]) : parseInt(sizeMatch[1]);
    } else {
        inputs.maxSize = 30; // Default
    }
    
    // Difficulty mapping - convert to numeric range (0-100%)
    // 0% = super easy, 100% = extremely hard
    const difficultyStr = (plant.difficulty || '').toLowerCase();
    if (difficultyStr.includes('easy')) {
        inputs.difficultyRange = { min: 0, max: 30, ideal: 15 };
    } else if (difficultyStr.includes('moderate')) {
        inputs.difficultyRange = { min: 40, max: 60, ideal: 50 };
    } else if (difficultyStr.includes('hard')) {
        inputs.difficultyRange = { min: 70, max: 100, ideal: 85 };
    } else {
        // Default to moderate
        inputs.difficultyRange = { min: 40, max: 60, ideal: 50 };
    }
    
    // Temperature mapping - convert to numeric range (0-50°C normalized to 0-100%)
    // Scale: 0°C = 0%, 50°C = 100%
    // First check if plant already has temperatureRange object
    if (plant.temperatureRange && plant.temperatureRange.min !== undefined && plant.temperatureRange.max !== undefined) {
        inputs.temperatureRange = {
            min: plant.temperatureRange.min,
            max: plant.temperatureRange.max,
            ideal: plant.temperatureRange.ideal !== undefined ? plant.temperatureRange.ideal : (plant.temperatureRange.min + plant.temperatureRange.max) / 2
        };
    } else {
        // Fall back to parsing temperature string
        const temperatureStr = plant.temperature || '';
        const tempRangeMatch = temperatureStr.match(/(\d+)\s*[-–]\s*(\d+)\s*°?C/i);
        if (tempRangeMatch) {
            const minTemp = parseInt(tempRangeMatch[1]);
            const maxTemp = parseInt(tempRangeMatch[2]);
            // Normalize to 0-100% scale (0°C = 0%, 50°C = 100%)
            const minPercent = Math.max(0, Math.min(100, (minTemp / 50) * 100));
            const maxPercent = Math.max(0, Math.min(100, (maxTemp / 50) * 100));
            inputs.temperatureRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else {
            // Try single temperature value
            const singleTempMatch = temperatureStr.match(/(\d+)\s*°?C/i);
            if (singleTempMatch) {
                const temp = parseInt(singleTempMatch[1]);
                const tempPercent = Math.max(0, Math.min(100, (temp / 50) * 100));
                // Create a small range around the single value (±5%)
                inputs.temperatureRange = {
                    min: Math.max(0, tempPercent - 5),
                    max: Math.min(100, tempPercent + 5),
                    ideal: tempPercent
                };
            } else {
                // Default: moderate temperature range (20-25°C = 40-50%)
                inputs.temperatureRange = { min: 40, max: 50, ideal: 45 };
            }
        }
    }
    
    // Soil pH mapping - convert to numeric range (pH 0-14 normalized to 0-100%)
    // Scale: pH 0 = 0%, pH 14 = 100%
    // Parse from careTips, description, or substrate fields
    // Note: combinedText is already declared earlier in the function for air circulation
    
    // Look for soil pH mentions (pH range or single value)
    const soilPhRangeMatch = combinedText.match(/soil\s+ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/i) || 
                            combinedText.match(/ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*\(soil\)/i);
    const soilPhSingleMatch = combinedText.match(/soil\s+ph\s+(\d+\.?\d*)/i);
    
    if (soilPhRangeMatch) {
        const minPh = parseFloat(soilPhRangeMatch[1]);
        const maxPh = parseFloat(soilPhRangeMatch[2]);
        // Normalize to 0-100% scale (pH 0 = 0%, pH 14 = 100%)
        const minPercent = Math.max(0, Math.min(100, (minPh / 14) * 100));
        const maxPercent = Math.max(0, Math.min(100, (maxPh / 14) * 100));
        inputs.soilPhRange = {
            min: minPercent,
            max: maxPercent,
            ideal: (minPercent + maxPercent) / 2
        };
    } else if (soilPhSingleMatch) {
        const ph = parseFloat(soilPhSingleMatch[1]);
        const phPercent = Math.max(0, Math.min(100, (ph / 14) * 100));
        // Create a small range around the single value (±3%)
        inputs.soilPhRange = {
            min: Math.max(0, phPercent - 3),
            max: Math.min(100, phPercent + 3),
            ideal: phPercent
        };
    } else {
        // Default: neutral to slightly acidic (pH 6.0-7.0 = 42.9-50%)
        inputs.soilPhRange = { min: 42.9, max: 50, ideal: 46.4 };
    }
    
    // Water pH mapping - only for aquatic plants (pH 0-14 normalized to 0-100%)
    // Scale: pH 0 = 0%, pH 14 = 100%
    // Check if plant is aquatic (use inputs.substrate which was set earlier)
    if (inputs.substrate === 'aquatic') {
        // Look for water pH mentions (pH range or single value)
        const waterPhRangeMatch = combinedText.match(/water\s+ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/i) || 
                                  combinedText.match(/ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*\(water\)/i) ||
                                  combinedText.match(/ph\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/i); // Generic pH for aquatic plants
        const waterPhSingleMatch = combinedText.match(/water\s+ph\s+(\d+\.?\d*)/i) || 
                                   combinedText.match(/ph\s+(\d+\.?\d*)/i); // Generic pH for aquatic plants
        
        if (waterPhRangeMatch) {
            const minPh = parseFloat(waterPhRangeMatch[1]);
            const maxPh = parseFloat(waterPhRangeMatch[2]);
            // Normalize to 0-100% scale (pH 0 = 0%, pH 14 = 100%)
            const minPercent = Math.max(0, Math.min(100, (minPh / 14) * 100));
            const maxPercent = Math.max(0, Math.min(100, (maxPh / 14) * 100));
            inputs.waterPhRange = {
                min: minPercent,
                max: maxPercent,
                ideal: (minPercent + maxPercent) / 2
            };
        } else if (waterPhSingleMatch) {
            const ph = parseFloat(waterPhSingleMatch[1]);
            const phPercent = Math.max(0, Math.min(100, (ph / 14) * 100));
            // Create a small range around the single value (±3%)
            inputs.waterPhRange = {
                min: Math.max(0, phPercent - 3),
                max: Math.min(100, phPercent + 3),
                ideal: phPercent
            };
        } else {
            // Default for aquatic: neutral to slightly alkaline (pH 7.0-8.0 = 50-57.1%)
            inputs.waterPhRange = { min: 50, max: 57.1, ideal: 53.6 };
        }
    }
    
    // Growth Rate mapping - use standardized range if available, otherwise parse from text
    if (plant.growthRateRange && typeof plant.growthRateRange === 'object' && 
        typeof plant.growthRateRange.min === 'number' && typeof plant.growthRateRange.max === 'number') {
        inputs.growthRateRange = plant.growthRateRange;
    } else {
        // Fallback: parse from text
        const growthRateStr = (plant.growthRate || '').toLowerCase().trim();
        const growthRateMap = {
            'very slow': { min: 0, max: 20, ideal: 10 },
            'slow': { min: 20, max: 40, ideal: 30 },
            'moderate': { min: 40, max: 60, ideal: 50 },
            'fast': { min: 60, max: 80, ideal: 70 },
            'very fast': { min: 80, max: 100, ideal: 90 }
        };
        
        if (growthRateStr.includes('very fast') || growthRateStr.includes('extremely fast')) {
            inputs.growthRateRange = growthRateMap['very fast'];
        } else if (growthRateStr.includes('fast to moderate') || growthRateStr === 'fast-moderate') {
            inputs.growthRateRange = { min: 50, max: 80, ideal: 65 };
        } else if (growthRateStr.includes('fast')) {
            inputs.growthRateRange = growthRateMap['fast'];
        } else if (growthRateStr.includes('moderate to fast') || growthRateStr === 'moderate-fast') {
            inputs.growthRateRange = { min: 50, max: 80, ideal: 65 };
        } else if (growthRateStr.includes('moderate to slow') || growthRateStr === 'moderate-slow') {
            inputs.growthRateRange = { min: 30, max: 50, ideal: 40 };
        } else if (growthRateStr.includes('moderate')) {
            inputs.growthRateRange = growthRateMap['moderate'];
        } else if (growthRateStr.includes('slow to moderate') || growthRateStr === 'slow-moderate') {
            inputs.growthRateRange = { min: 30, max: 50, ideal: 40 };
        } else if (growthRateStr.includes('slow')) {
            inputs.growthRateRange = growthRateMap['slow'];
        } else if (growthRateStr.includes('very slow')) {
            inputs.growthRateRange = growthRateMap['very slow'];
        } else {
            // Default to moderate
            inputs.growthRateRange = growthRateMap['moderate'];
        }
    }
    
    return inputs;
}

// Check if a plant belongs to a specific taxonomic node
function plantBelongsToTaxonomy(plant, rank, name) {
    if (!plant.taxonomy) return false;
    
    const taxonomy = plant.taxonomy;
    const rankMap = {
        'kingdom': taxonomy.kingdom,
        'phylum': taxonomy.phylum,
        'class': taxonomy.class,
        'order': taxonomy.order,
        'family': taxonomy.family,
        'genus': taxonomy.genus,
        'species': taxonomy.species || plant.scientificName
    };
    
    // Check if the plant matches the exact rank and name
    const plantValue = rankMap[rank];
    if (!plantValue) return false;
    
    // Direct match
    if (plantValue === name) {
        return true;
    }
    
    // Case-insensitive match
    if (plantValue.toLowerCase() === name.toLowerCase()) {
        return true;
    }
    
    return false;
}

function createDefaultAdvancedFilters() {
    return {
        humidity: { min: null, max: null },
        light: { min: null, max: null },
        temperature: { min: null, max: null },
        airCirculation: { min: null, max: null },
        waterNeeds: { min: null, max: null },
        difficulty: { min: null, max: null },
        growthRate: { min: null, max: null },
        soilPh: { min: null, max: null },
        waterTemperature: { min: null, max: null },
        waterPh: { min: null, max: null },
        waterHardness: { min: null, max: null },
        salinity: { min: null, max: null },
        waterCirculation: { min: null, max: null },
        rarity: [],
        special: [],
        classification: [],
        vivariumType: [],
        enclosureSize: [],
        taxonomy: { rank: null, name: null }
    };
}

window.filterUtils = window.filterUtils || {};
Object.assign(window.filterUtils, {
    NUMERIC_SCALES,
    mapPlantToInputs,
    plantBelongsToTaxonomy,
    createDefaultAdvancedFilters
});
})();
