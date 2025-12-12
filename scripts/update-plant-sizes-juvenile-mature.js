const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants-merged');

// Get all plant files
function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

// Parse size string to extract min and max in cm
function parseSize(sizeStr) {
    if (!sizeStr) return null;
    
    const size = sizeStr.toLowerCase();
    let minSize = null;
    let maxSize = null;
    
    // Handle cm ranges like "10-30 cm" or "30 cm"
    if (size.includes('cm')) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            minSize = parseFloat(numbers[0]);
            maxSize = numbers.length > 1 ? parseFloat(numbers[1]) : minSize;
        }
    }
    
    // Handle meter ranges like "1-2 m" or "2 m"
    if (size.includes('m') && !size.includes('cm')) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            const minM = parseFloat(numbers[0]);
            const maxM = numbers.length > 1 ? parseFloat(numbers[1]) : minM;
            minSize = minM * 100;
            maxSize = maxM * 100;
        }
    }
    
    return { min: minSize, max: maxSize };
}

// Estimate juvenile size based on mature size and plant characteristics
function estimateJuvenileSize(matureMin, matureMax, plant) {
    const growthPattern = (plant.growthPattern || '').toLowerCase();
    const growthHabit = (plant.growthHabit || '').toLowerCase();
    const description = (plant.description || '').toLowerCase();
    
    // Plants with distinct juvenile/mature forms (like Ficus pumila)
    if (description.includes('juvenile') && description.includes('mature')) {
        // Extract juvenile size from description if mentioned
        const juvenileMatch = description.match(/juvenile.*?(\d+(?:\.\d+)?)\s*[-–]?\s*(\d+(?:\.\d+)?)?\s*cm/i);
        if (juvenileMatch) {
            const juvMin = parseFloat(juvenileMatch[1]);
            const juvMax = juvenileMatch[2] ? parseFloat(juvenileMatch[2]) : juvMin;
            return { min: juvMin, max: juvMax };
        }
        // Default for plants with juvenile forms: start very small
        return { min: 5, max: 15 };
    }
    
    // Climbing/trailing plants: juvenile is typically 10-20% of mature
    if (growthPattern.includes('vining') || growthPattern.includes('climbing') || 
        growthPattern.includes('trailing') || growthPattern.includes('creep')) {
        const juvMin = Math.max(5, Math.round(matureMin * 0.1));
        const juvMax = Math.max(10, Math.round(matureMax * 0.15));
        return { min: juvMin, max: juvMax };
    }
    
    // Large upright plants: juvenile is typically 20-30% of mature
    if (matureMax > 100) {
        const juvMin = Math.max(10, Math.round(matureMin * 0.2));
        const juvMax = Math.max(20, Math.round(matureMax * 0.3));
        return { min: juvMin, max: juvMax };
    }
    
    // Medium plants: juvenile is typically 30-40% of mature
    if (matureMax > 50) {
        const juvMin = Math.max(5, Math.round(matureMin * 0.3));
        const juvMax = Math.max(10, Math.round(matureMax * 0.4));
        return { min: juvMin, max: juvMax };
    }
    
    // Small plants: juvenile is typically 40-50% of mature
    const juvMin = Math.max(2, Math.round(matureMin * 0.4));
    const juvMax = Math.max(5, Math.round(matureMax * 0.5));
    return { min: juvMin, max: juvMax };
}

// Update plant size to show juvenile to mature range
function updatePlantSize(plant) {
    const currentSize = plant.size;
    if (!currentSize) return null;
    
    const parsed = parseSize(currentSize);
    if (!parsed || !parsed.min || !parsed.max) return null;
    
    const matureMin = parsed.min;
    const matureMax = parsed.max;
    
    // Get juvenile size estimate
    const juvenile = estimateJuvenileSize(matureMin, matureMax, plant);
    
    // If juvenile min is already close to or equal to mature min, no change needed
    if (juvenile.min >= matureMin * 0.8) {
        return null; // Already showing a reasonable range
    }
    
    // Create new size range: juvenile min to mature max
    const newSize = `${juvenile.min}-${matureMax} cm`;
    
    return {
        old: currentSize,
        new: newSize,
        juvenile: juvenile,
        mature: { min: matureMin, max: matureMax }
    };
}

async function updateAllPlantSizes() {
    console.log('🔄 Updating plant sizes to show juvenile to mature range...\n');
    
    const files = getAllPlantFiles(plantsDir);
    const updates = [];
    const unchanged = [];
    
    for (const filePath of files) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const plant = JSON.parse(content);
            
            const update = updatePlantSize(plant);
            if (update) {
                plant.size = update.new;
                fs.writeFileSync(filePath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
                updates.push({
                    file: path.basename(filePath),
                    name: plant.name,
                    old: update.old,
                    new: update.new,
                    juvenile: update.juvenile,
                    mature: update.mature
                });
            } else {
                unchanged.push({
                    file: path.basename(filePath),
                    name: plant.name,
                    size: plant.size
                });
            }
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }
    
    console.log(`\n✅ Updated ${updates.length} plants:`);
    updates.forEach(u => {
        console.log(`  ${u.name}: ${u.old} → ${u.new} (juvenile: ${u.juvenile.min}-${u.juvenile.max} cm, mature: ${u.mature.min}-${u.mature.max} cm)`);
    });
    
    console.log(`\n📋 ${unchanged.length} plants unchanged (already showing appropriate range):`);
    unchanged.slice(0, 10).forEach(u => {
        console.log(`  ${u.name}: ${u.size}`);
    });
    if (unchanged.length > 10) {
        console.log(`  ... and ${unchanged.length - 10} more`);
    }
    
    console.log(`\n✨ Total: ${files.length} plants processed`);
}

updateAllPlantSizes().catch(console.error);

