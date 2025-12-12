// Script to enhance common names by extracting from descriptions and scientific names
const fs = require('fs').promises;
const path = require('path');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants-merged');

// Enhanced extraction of common names
function extractCommonNames(plant) {
    const commonNames = new Set();
    const name = (plant.name || '').trim();
    const scientificName = (plant.scientificName || '').trim();
    const description = (plant.description || '').toLowerCase();
    const careTips = Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '';
    const combinedText = description + ' ' + careTips;
    
    // If name is different from scientific name, it's likely a common name
    if (name && name !== scientificName && !scientificName.toLowerCase().includes(name.toLowerCase())) {
        commonNames.add(name);
    }
    
    // Look for "commonly known as", "also called", etc.
    const patterns = [
        /(?:commonly known as|also called|also known as|also referred to as|popularly known as|sometimes called|known as|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+[A-Z][a-z]+)*)/g,
        /"([^"]+)"\s+(?:is|are)\s+(?:commonly|also|sometimes|popularly)\s+(?:known|called|referred)/gi,
        /(?:the|a|an)\s+([A-Z][a-z]+(?:\s+[a-z]+)*)\s+(?:is|are)\s+(?:commonly|also|sometimes)/gi
    ];
    
    for (const pattern of patterns) {
        const matches = combinedText.matchAll(pattern);
        for (const match of matches) {
            if (match[1]) {
                let extracted = match[1].trim();
                // Clean up
                extracted = extracted
                    .replace(/^(?:a|an|the)\s+/i, '')
                    .replace(/\s+(?:a|an|the)$/i, '')
                    .replace(/[.,;:!?]+$/, '')
                    .trim();
                
                if (extracted && extracted.length > 2 && extracted.length < 60) {
                    // Capitalize properly
                    const formatted = extracted.split(/\s+/).map(word => {
                        // Handle special cases like "of", "the", "and" in middle
                        const lowerWords = ['of', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for'];
                        if (lowerWords.includes(word.toLowerCase()) && word !== extracted.split(/\s+/)[0]) {
                            return word.toLowerCase();
                        }
                        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    }).join(' ');
                    
                    if (formatted !== name && formatted !== scientificName && !formatted.toLowerCase().includes('plant') || formatted.length < 15) {
                        commonNames.add(formatted);
                    }
                }
            }
        }
    }
    
    // Extract from scientific name patterns (genus names that are commonly used)
    const genus = scientificName.split(' ')[0];
    const species = scientificName.split(' ')[1];
    
    // Some genus names are commonly used as common names
    const commonGenusNames = {
        'aloe': 'Aloe',
        'begonia': 'Begonia',
        'philodendron': 'Philodendron',
        'monstera': 'Monstera',
        'anthurium': 'Anthurium',
        'hoya': 'Hoya',
        'tillandsia': 'Tillandsia',
        'peperomia': 'Peperomia',
        'pilea': 'Pilea',
        'ficus': 'Ficus',
        'episcia': 'Episcia',
        'aglaonema': 'Aglaonema',
        'alocasia': 'Alocasia',
        'asplenium': 'Asplenium',
        'nepenthes': 'Nepenthes',
        'drosera': 'Drosera',
        'utricularia': 'Utricularia',
        'pinguicula': 'Pinguicula',
        'sarracenia': 'Sarracenia'
    };
    
    if (commonGenusNames[genus.toLowerCase()] && !commonNames.has(commonGenusNames[genus.toLowerCase()])) {
        // Only add if it's not redundant with name
        if (name.toLowerCase() !== genus.toLowerCase()) {
            commonNames.add(commonGenusNames[genus.toLowerCase()]);
        }
    }
    
    // Look for specific plant type mentions
    if (combinedText.includes('air plant') && !commonNames.has('Air Plant')) {
        commonNames.add('Air Plant');
    }
    if (combinedText.includes('pitcher plant') && !commonNames.has('Pitcher Plant')) {
        commonNames.add('Pitcher Plant');
    }
    if (combinedText.includes('sundew') && !commonNames.has('Sundew')) {
        commonNames.add('Sundew');
    }
    if (combinedText.includes('butterwort') && !commonNames.has('Butterwort')) {
        commonNames.add('Butterwort');
    }
    if (combinedText.includes('bladderwort') && !commonNames.has('Bladderwort')) {
        commonNames.add('Bladderwort');
    }
    
    return Array.from(commonNames);
}

async function processPlantFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        const currentCommonNames = plant.commonNames || [];
        const extracted = extractCommonNames(plant);
        
        // Merge current and extracted, removing duplicates
        const allNames = new Set();
        if (Array.isArray(currentCommonNames)) {
            currentCommonNames.forEach(n => allNames.add(n));
        }
        extracted.forEach(n => allNames.add(n));
        
        const mergedNames = Array.from(allNames);
        
        // Only update if we found additional names
        if (mergedNames.length > currentCommonNames.length || 
            (currentCommonNames.length === 1 && currentCommonNames[0] === plant.name && mergedNames.length > 1)) {
            
            // Update plant
            const keys = Object.keys(plant);
            const scientificNameIndex = keys.indexOf('scientificName');
            const insertIndex = scientificNameIndex >= 0 ? scientificNameIndex + 1 : keys.length;
            
            const newPlant = {};
            let inserted = false;
            
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] === 'commonNames') continue; // Skip old position
                newPlant[keys[i]] = plant[keys[i]];
                if (i === insertIndex - 1 && !inserted) {
                    newPlant.commonNames = mergedNames;
                    inserted = true;
                }
            }
            
            if (!inserted) {
                newPlant.commonNames = mergedNames;
            }
            
            await fs.writeFile(filePath, JSON.stringify(newPlant, null, 2) + '\n', 'utf8');
            
            return { 
                updated: true, 
                plant: plant.name, 
                old: currentCommonNames, 
                new: mergedNames 
            };
        }
        
        return { updated: false, plant: plant.name, commonNames: currentCommonNames };
    } catch (error) {
        return { updated: false, plant: 'unknown', error: error.message };
    }
}

async function main() {
    try {
        const files = await fs.readdir(PLANTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
        
        console.log(`Processing ${jsonFiles.length} plant files...\n`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (const file of jsonFiles) {
            const filePath = path.join(PLANTS_DIR, file);
            const result = await processPlantFile(filePath);
            
            if (result.updated) {
                updatedCount++;
                const oldStr = Array.isArray(result.old) ? result.old.join(', ') : result.old;
                const newStr = Array.isArray(result.new) ? result.new.join(', ') : result.new;
                console.log(`✓ ${result.plant}`);
                console.log(`  Old: [${oldStr}]`);
                console.log(`  New: [${newStr}]\n`);
            } else if (result.error) {
                errorCount++;
                console.log(`✗ ${result.plant}: ${result.error}`);
            } else {
                skippedCount++;
            }
        }
        
        console.log(`\n=== Summary ===`);
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log(`Total: ${jsonFiles.length}`);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
