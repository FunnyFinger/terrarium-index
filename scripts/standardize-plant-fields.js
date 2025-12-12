const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Define default values for missing fields
const defaultValues = {
    // Water-related fields (for aquatic plants, but add to all with null)
    waterCirculationRange: null,
    waterTemperatureRange: null,
    waterPhRange: null,
    waterHardnessRange: null,
    salinityRange: null,
    
    // Additional metadata fields
    geographicOrigin: null,
    additionalInfo: null,
    
    // Internal metadata (should not be in final files, but we'll handle if present)
    _filename: null,
    _filePath: null,
};

// Helper to check if plant is aquatic
function isAquatic(plant) {
    const category = (plant.category || []).map(c => c.toLowerCase());
    const plantType = (plant.plantType || '').toLowerCase();
    const growthHabit = (plant.growthHabit || '').toLowerCase();
    const substrate = (plant.substrate || '').toLowerCase();
    const specialNeeds = (plant.specialNeeds || '').toLowerCase();
    
    return category.includes('aquatic') ||
           plantType.includes('aquatic') ||
           growthHabit === 'aquatic' ||
           growthHabit === 'fully-aquatic' ||
           growthHabit === 'semi-aquatic' ||
           substrate.includes('aquatic') ||
           specialNeeds === 'aquatic';
}

// Default water range structure
const defaultWaterRange = {
    min: null,
    max: null,
    ideal: null
};

async function standardizeFields() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
        
        let updated = 0;
        let skipped = 0;
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const content = await fs.readFile(filePath, 'utf8');
            const plant = JSON.parse(content);
            let modified = false;
            
            // Add water-related fields if missing
            // For aquatic plants, keep existing values or use defaults
            // For non-aquatic plants, set to null but still include sub-properties
            const aquatic = isAquatic(plant);
            
            // Ensure waterCirculationRange exists with all sub-properties
            if (!plant.waterCirculationRange) {
                plant.waterCirculationRange = aquatic ? defaultWaterRange : { ...defaultWaterRange };
                modified = true;
            } else if (plant.waterCirculationRange && typeof plant.waterCirculationRange === 'object') {
                // Ensure all sub-properties exist
                if (plant.waterCirculationRange.min === undefined) plant.waterCirculationRange.min = null;
                if (plant.waterCirculationRange.max === undefined) plant.waterCirculationRange.max = null;
                if (plant.waterCirculationRange.ideal === undefined) plant.waterCirculationRange.ideal = null;
                modified = true;
            } else if (plant.waterCirculationRange === null) {
                // Convert null to object with null sub-properties
                plant.waterCirculationRange = { ...defaultWaterRange };
                modified = true;
            }
            
            // Ensure waterTemperatureRange exists with all sub-properties
            if (!plant.waterTemperatureRange) {
                plant.waterTemperatureRange = aquatic ? defaultWaterRange : { ...defaultWaterRange };
                modified = true;
            } else if (plant.waterTemperatureRange && typeof plant.waterTemperatureRange === 'object') {
                if (plant.waterTemperatureRange.min === undefined) plant.waterTemperatureRange.min = null;
                if (plant.waterTemperatureRange.max === undefined) plant.waterTemperatureRange.max = null;
                if (plant.waterTemperatureRange.ideal === undefined) plant.waterTemperatureRange.ideal = null;
                modified = true;
            } else if (plant.waterTemperatureRange === null) {
                plant.waterTemperatureRange = { ...defaultWaterRange };
                modified = true;
            }
            
            // Ensure waterPhRange exists with all sub-properties
            if (!plant.waterPhRange) {
                plant.waterPhRange = aquatic ? defaultWaterRange : { ...defaultWaterRange };
                modified = true;
            } else if (plant.waterPhRange && typeof plant.waterPhRange === 'object') {
                if (plant.waterPhRange.min === undefined) plant.waterPhRange.min = null;
                if (plant.waterPhRange.max === undefined) plant.waterPhRange.max = null;
                if (plant.waterPhRange.ideal === undefined) plant.waterPhRange.ideal = null;
                modified = true;
            } else if (plant.waterPhRange === null) {
                plant.waterPhRange = { ...defaultWaterRange };
                modified = true;
            }
            
            // Ensure waterHardnessRange exists with all sub-properties
            if (!plant.waterHardnessRange) {
                plant.waterHardnessRange = aquatic ? defaultWaterRange : { ...defaultWaterRange };
                modified = true;
            } else if (plant.waterHardnessRange && typeof plant.waterHardnessRange === 'object') {
                if (plant.waterHardnessRange.min === undefined) plant.waterHardnessRange.min = null;
                if (plant.waterHardnessRange.max === undefined) plant.waterHardnessRange.max = null;
                if (plant.waterHardnessRange.ideal === undefined) plant.waterHardnessRange.ideal = null;
                modified = true;
            } else if (plant.waterHardnessRange === null) {
                plant.waterHardnessRange = { ...defaultWaterRange };
                modified = true;
            }
            
            // Ensure salinityRange exists with all sub-properties
            if (!plant.salinityRange) {
                plant.salinityRange = aquatic ? defaultWaterRange : { ...defaultWaterRange };
                modified = true;
            } else if (plant.salinityRange && typeof plant.salinityRange === 'object') {
                if (plant.salinityRange.min === undefined) plant.salinityRange.min = null;
                if (plant.salinityRange.max === undefined) plant.salinityRange.max = null;
                if (plant.salinityRange.ideal === undefined) plant.salinityRange.ideal = null;
                modified = true;
            } else if (plant.salinityRange === null) {
                plant.salinityRange = { ...defaultWaterRange };
                modified = true;
            }
            
            // Add other optional fields
            if (!('geographicOrigin' in plant)) {
                plant.geographicOrigin = null;
                modified = true;
            }
            
            if (!('additionalInfo' in plant)) {
                plant.additionalInfo = null;
                modified = true;
            }
            
            // Remove internal metadata fields if present
            if ('_filename' in plant) {
                delete plant._filename;
                modified = true;
            }
            if ('_filePath' in plant) {
                delete plant._filePath;
                modified = true;
            }
            
            // Ensure carnivorous field exists (should already be there, but double-check)
            if (!('carnivorous' in plant)) {
                plant.carnivorous = false;
                modified = true;
            }
            
            if (modified) {
                // Write back to file with proper formatting
                const updatedContent = JSON.stringify(plant, null, 2) + '\n';
                await fs.writeFile(filePath, updatedContent, 'utf8');
                updated++;
            } else {
                skipped++;
            }
        }
        
        console.log(`✅ Updated ${updated} files`);
        console.log(`⏭️  Skipped ${skipped} files (already standardized)`);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

standardizeFields();

