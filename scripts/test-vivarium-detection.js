// Test script to identify vivarium type detection issues
const fs = require('fs');
const path = require('path');

// Copy the calculation functions from script.js
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

// Simplified version of mapPlantToInputs for testing
function mapPlantToInputs(plant) {
    const inputs = {};
    
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
        if (humidityStr.includes('very high') || humidityStr.includes('70-90') || humidityStr.includes('80-100')) {
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
    
    return inputs;
}

function calculatePlantVivariumTypes(plant) {
    try {
        const VIVARIUM_TYPES = {
            'open-terrarium': { 
                name: 'Open Terrarium', 
                humidity: { min: 70, max: 100, ideal: 85 }, 
                light: { min: 20, max: 80, ideal: 50 }, 
                airCirculation: { min: 40, max: 60, ideal: 50 }, 
                substrate: ['moist', 'wet', 'epiphytic'], 
                waterNeeds: { min: 40, max: 100, ideal: 70 },
                waterBody: false
            },
            'closed-terrarium': { 
                name: 'Closed Terrarium', 
                humidity: { min: 60, max: 100, ideal: 80 }, 
                light: { min: 20, max: 70, ideal: 40 }, 
                airCirculation: { min: 0, max: 30, ideal: 20 }, 
                substrate: ['moist', 'wet', 'epiphytic'], 
                waterNeeds: { min: 40, max: 100, ideal: 70 },
                waterBody: false
            },
            paludarium: { 
                name: 'Paludarium', 
                humidity: { min: 70, max: 100, ideal: 90 }, 
                light: { min: 20, max: 100, ideal: 60 }, 
                airCirculation: { min: 20, max: 60, ideal: 50 }, 
                substrate: ['wet', 'aquatic', 'moist'], 
                waterNeeds: { min: 40, max: 100, ideal: 80 },
                waterBody: true,
                waterCirculation: { min: 10, max: 30, ideal: 20 }
            },
            aerarium: { 
                name: 'Aerarium', 
                humidity: { min: 50, max: 90, ideal: 70 }, 
                light: { min: 40, max: 100, ideal: 70 }, 
                airCirculation: { min: 60, max: 100, ideal: 80 }, 
                substrate: ['epiphytic'], 
                waterNeeds: { min: 20, max: 60, ideal: 40 },
                waterBody: false
            },
            deserterium: { 
                name: 'Deserterium', 
                humidity: { min: 20, max: 50, ideal: 30 }, 
                light: { min: 60, max: 100, ideal: 90 }, 
                airCirculation: { min: 60, max: 100, ideal: 80 }, 
                substrate: ['dry'], 
                waterNeeds: { min: 0, max: 30, ideal: 15 },
                waterBody: false
            },
            aquarium: { 
                name: 'Aquarium', 
                humidity: { min: 100, max: 100, ideal: 100 }, 
                light: { min: 20, max: 70, ideal: 50 }, 
                airCirculation: { min: 0, max: 30, ideal: 20 }, 
                substrate: ['aquatic'], 
                waterNeeds: { min: 80, max: 100, ideal: 90 },
                waterBody: true,
                waterCirculation: { min: 0, max: 100, ideal: 50 }
            },
            riparium: { 
                name: 'Riparium', 
                humidity: { min: 70, max: 100, ideal: 85 }, 
                light: { min: 20, max: 70, ideal: 50 }, 
                airCirculation: { min: 60, max: 100, ideal: 80 }, 
                substrate: ['wet', 'aquatic'], 
                waterNeeds: { min: 60, max: 100, ideal: 80 },
                waterBody: true,
                waterCirculation: { min: 30, max: 80, ideal: 55 }
            },
            'indoor': { 
                name: 'Indoor', 
                humidity: { min: 30, max: 70, ideal: 50 }, 
                light: { min: 40, max: 100, ideal: 70 }, 
                airCirculation: { min: 60, max: 100, ideal: 80 }, 
                substrate: ['moist', 'dry'], 
                waterNeeds: { min: 20, max: 60, ideal: 40 },
                waterBody: false
            }
        };
        
        const inputs = mapPlantToInputs(plant);
        const scores = {};
        
        // Determine plant characteristics for proper vivarium type assignment
        const isEpiphytic = inputs.substrate === 'epiphytic' || inputs.specialNeeds === 'epiphytic';
        const isAquatic = inputs.substrate === 'aquatic' || inputs.specialNeeds === 'aquatic';
        const isSucculent = inputs.substrate === 'dry' || inputs.specialNeeds === 'succulent' || 
                           (Array.isArray(plant.category) && plant.category.map(c => String(c).toLowerCase()).includes('succulent'));
        const isDesertPlant = isSucculent || (Array.isArray(plant.category) && plant.category.map(c => String(c).toLowerCase()).includes('cactus'));
        
        for (const [type, config] of Object.entries(VIVARIUM_TYPES)) {
            // AQUARIUM: Only for fully aquatic plants
            if (type === 'aquarium' && !isAquatic) {
                continue;
            }
            
            // AERARIUM: Only for epiphytic plants
            if (type === 'aerarium' && !isEpiphytic) {
                continue;
            }
            
            // PALUDARIUM: Requires a body of water - skip for regular terrestrial plants that just need moist soil
            if (type === 'paludarium' && !isAquatic && inputs.substrate !== 'wet' && 
                !(plant.description && (plant.description.toLowerCase().includes('marginal') || 
                                       plant.description.toLowerCase().includes('emergent') ||
                                       plant.description.toLowerCase().includes('semi-aquatic') ||
                                       plant.description.toLowerCase().includes('bog') ||
                                       plant.description.toLowerCase().includes('water\'s edge') ||
                                       plant.description.toLowerCase().includes('riparian')))) {
                continue;
            }
            
            // RIPARIUM: Requires a body of water and high air circulation
            if (type === 'riparium') {
                const canAdaptToHydroponic = plant.description && (
                    plant.description.toLowerCase().includes('marginal') ||
                    plant.description.toLowerCase().includes('riparian') ||
                    plant.description.toLowerCase().includes('root-in-water') ||
                    plant.description.toLowerCase().includes('hydroponic') ||
                    plant.description.toLowerCase().includes('adapts to water')
                );
                if (!isAquatic && !canAdaptToHydroponic && inputs.substrate !== 'wet') {
                    continue;
                }
                if (inputs.airCirculationRange && inputs.airCirculationRange.max < 50) {
                    continue;
                }
            }
            
            // TERRARIUMS: Can have both terrestrial AND epiphytic plants
            if ((type === 'open-terrarium' || type === 'closed-terrarium')) {
                if (isAquatic) {
                    continue;
                }
                if (isDesertPlant) {
                    continue;
                }
                if (inputs.airCirculationRange && inputs.airCirculationRange.min > 70) {
                    continue;
                }
            }
            
            // DESERTERIUM: Only for succulents/desert plants
            if (type === 'deserterium' && !isDesertPlant) {
                continue;
            }
            let score = 0;
            let maxScore = 0;
            
            // Humidity (25%)
            maxScore += 25;
            if (inputs.humidityRange) {
                const plantMin = inputs.humidityRange.min;
                const plantMax = inputs.humidityRange.max;
                const vivariumMin = config.humidity.min;
                const vivariumMax = config.humidity.max;
                
                const overlapMin = Math.max(plantMin, vivariumMin);
                const overlapMax = Math.min(plantMax, vivariumMax);
                
                if (overlapMin <= overlapMax) {
                    const overlapSize = overlapMax - overlapMin;
                    const plantRangeSize = plantMax - plantMin;
                    const overlapPercentage = overlapSize / plantRangeSize;
                    const overlapMidpoint = (overlapMin + overlapMax) / 2;
                    const distanceFromIdeal = Math.abs(overlapMidpoint - config.humidity.ideal);
                    
                    const baseScore = overlapPercentage >= 0.3 ? 20 : overlapPercentage * 20;
                    const idealPenalty = Math.min(distanceFromIdeal * 0.15, baseScore * 0.25);
                    score += Math.max(0, baseScore - idealPenalty);
                }
            }
            
            // Light (15%)
            maxScore += 15;
            if (inputs.lightRange && config.light.min !== undefined) {
                const plantMin = inputs.lightRange.min;
                const plantMax = inputs.lightRange.max;
                const vivariumMin = config.light.min;
                const vivariumMax = config.light.max;
                
                const overlapMin = Math.max(plantMin, vivariumMin);
                const overlapMax = Math.min(plantMax, vivariumMax);
                
                if (overlapMin <= overlapMax) {
                    const overlapSize = overlapMax - overlapMin;
                    const plantRangeSize = plantMax - plantMin;
                    const overlapPercentage = overlapSize / plantRangeSize;
                    const overlapMidpoint = (overlapMin + overlapMax) / 2;
                    const distanceFromIdeal = Math.abs(overlapMidpoint - config.light.ideal);
                    
                    const baseScore = overlapPercentage >= 0.3 ? 15 : overlapPercentage * 15;
                    const idealPenalty = Math.min(distanceFromIdeal * 0.1, baseScore * 0.2);
                    score += Math.max(0, baseScore - idealPenalty);
                }
            }
            
            // Air circulation (15%)
            maxScore += 15;
            if (inputs.substrate === 'aquatic' && (type === 'aquarium' || type === 'riparium' || type === 'paludarium')) {
                score += 15;
            } else if (inputs.airCirculationRange && config.airCirculation.min !== undefined) {
                const plantMin = inputs.airCirculationRange.min;
                const plantMax = inputs.airCirculationRange.max;
                const vivariumMin = config.airCirculation.min;
                const vivariumMax = config.airCirculation.max;
                
                const overlapMin = Math.max(plantMin, vivariumMin);
                const overlapMax = Math.min(plantMax, vivariumMax);
                
                if (overlapMin <= overlapMax) {
                    const overlapSize = overlapMax - overlapMin;
                    const plantRangeSize = plantMax - plantMin;
                    const overlapPercentage = overlapSize / plantRangeSize;
                    
                    const baseScore = overlapPercentage >= 0.3 ? 15 : overlapPercentage * 15;
                    score += Math.max(0, baseScore);
                }
            }
            
            // Substrate (20%)
            maxScore += 20;
            if (config.substrate.includes(inputs.substrate)) {
                score += 20;
            } else if (inputs.substrate === 'epiphytic' && config.substrate.includes('epiphytic')) {
                score += 20;
            }
            
            // Water needs (10%)
            maxScore += 10;
            if (inputs.waterNeedsRange && config.waterNeeds.min !== undefined) {
                const plantMin = inputs.waterNeedsRange.min;
                const plantMax = inputs.waterNeedsRange.max;
                const vivariumMin = config.waterNeeds.min;
                const vivariumMax = config.waterNeeds.max;
                
                const overlapMin = Math.max(plantMin, vivariumMin);
                const overlapMax = Math.min(plantMax, vivariumMax);
                
                if (overlapMin <= overlapMax) {
                    const overlapSize = overlapMax - overlapMin;
                    const plantRangeSize = plantMax - plantMin;
                    const overlapPercentage = overlapSize / plantRangeSize;
                    const overlapMidpoint = (overlapMin + overlapMax) / 2;
                    const distanceFromIdeal = Math.abs(overlapMidpoint - config.waterNeeds.ideal);
                    
                    const baseScore = overlapPercentage >= 0.3 ? 10 : overlapPercentage * 10;
                    const idealPenalty = Math.min(distanceFromIdeal * 0.08, baseScore * 0.15);
                    score += Math.max(0, baseScore - idealPenalty);
                }
            }
            
            // Water circulation (5%)
            maxScore += 5;
            if (config.waterBody && config.waterCirculation && inputs.waterCirculationRange) {
                const plantMin = inputs.waterCirculationRange.min;
                const plantMax = inputs.waterCirculationRange.max;
                const vivariumMin = config.waterCirculation.min;
                const vivariumMax = config.waterCirculation.max;
                
                const overlapMin = Math.max(plantMin, vivariumMin);
                const overlapMax = Math.min(plantMax, vivariumMax);
                
                if (overlapMin <= overlapMax) {
                    const overlapSize = overlapMax - overlapMin;
                    const plantRangeSize = plantMax - plantMin;
                    const overlapPercentage = overlapSize / plantRangeSize;
                    const overlapMidpoint = (overlapMin + overlapMax) / 2;
                    const distanceFromIdeal = Math.abs(overlapMidpoint - config.waterCirculation.ideal);
                    
                    const baseScore = overlapPercentage >= 0.3 ? 5 : overlapPercentage * 5;
                    const idealPenalty = Math.min(distanceFromIdeal * 0.05, baseScore * 0.15);
                    score += Math.max(0, baseScore - idealPenalty);
                }
            } else if (!config.waterBody) {
                score += 5;
            }
            
            // Special needs (10%)
            maxScore += 10;
            if (inputs.specialNeeds !== 'none') {
                if ((inputs.specialNeeds === 'aquatic' && (type === 'aquarium' || type === 'paludarium')) ||
                    (inputs.specialNeeds === 'epiphytic' && (type === 'aerarium' || type === 'open-terrarium' || type === 'closed-terrarium')) ||
                    (inputs.specialNeeds === 'succulent' && type === 'deserterium') ||
                    (inputs.specialNeeds === 'carnivorous' && (type === 'open-terrarium' || type === 'closed-terrarium' || type === 'paludarium'))) {
                    score += 10;
                } else if ((inputs.specialNeeds === 'bromeliad' || inputs.specialNeeds === 'orchid') && (type === 'open-terrarium' || type === 'closed-terrarium' || type === 'aerarium')) {
                    score += 8;
                }
            } else {
                score += 5;
            }
            
            const percentageScore = (score / maxScore) * 100;
            scores[type] = { score: percentageScore, name: config.name };
        }
        
        let results = Object.entries(scores)
            .filter(([type, data]) => data.score >= 80)
            .sort((a, b) => b[1].score - a[1].score)
            .map(([type, data]) => data.name);
        
        if (results.length === 0) {
            // For succulents/desert plants, default to Deserterium or Indoor (never terrariums)
            if (isDesertPlant) {
                const deserteriumScore = scores['deserterium'];
                if (deserteriumScore && deserteriumScore.score >= 50) {
                    results = ['Deserterium'];
                } else {
                    results = ['Indoor'];
                }
            } else if (isEpiphytic) {
                // For epiphytic plants, prefer Aerarium or appropriate terrarium type
                const aerariumScore = scores['aerarium'];
                if (aerariumScore && aerariumScore.score >= 50) {
                    results = ['Aerarium'];
                } else {
                    // Fall through to terrarium selection
                    if (inputs.airCirculationRange && inputs.airCirculationRange.ideal <= NUMERIC_SCALES.airCirculation.low.ideal) {
                        results = ['Closed Terrarium'];
                    } else {
                        results = ['Open Terrarium'];
                    }
                }
            } else {
                // Default terrarium selection based on air circulation
                if (inputs.airCirculationRange && inputs.airCirculationRange.ideal <= NUMERIC_SCALES.airCirculation.low.ideal) {
                    results = ['Closed Terrarium'];
                } else {
                    results = ['Open Terrarium'];
                }
            }
        }
        return { results, scores, inputs };
    } catch (error) {
        console.error('Error:', error);
        return { results: [], scores: {}, inputs: {}, error: error.message };
    }
}

// Test with sample plants
const testPlants = [
    'data/plants-merged/00136-anthurium-mini-purple.json',
    'data/plants-merged/00416-dendrochillum-tenellum-grass-orchid.json',
    'data/plants-merged/00229-agave-stricta-var-nana.json',
    'data/plants-merged/00001-baby-s-tears.json'
];

console.log('Testing vivarium type detection...\n');

testPlants.forEach(filePath => {
    const plant = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const result = calculatePlantVivariumTypes(plant);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Plant: ${plant.name} (${plant.scientificName})`);
    console.log(`Stored vivariumType: ${JSON.stringify(plant.vivariumType)}`);
    console.log(`\nCalculated Results: ${JSON.stringify(result.results)}`);
    console.log(`\nInputs:`);
    console.log(`  Substrate: ${result.inputs.substrate}`);
    console.log(`  Special Needs: ${result.inputs.specialNeeds}`);
    console.log(`  Humidity Range: ${result.inputs.humidityRange?.min}-${result.inputs.humidityRange?.max}%`);
    console.log(`  Air Circulation Range: ${result.inputs.airCirculationRange?.min}-${result.inputs.airCirculationRange?.max}%`);
    console.log(`\nScores:`);
    Object.entries(result.scores).sort((a, b) => b[1].score - a[1].score).forEach(([type, data]) => {
        console.log(`  ${data.name}: ${data.score.toFixed(1)}%`);
    });
});

