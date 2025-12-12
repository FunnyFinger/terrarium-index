const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants-merged');

// Copy the determineMinimumEnclosureSize function logic
function determineMinimumEnclosureSize(plant) {
    const size = (plant.size || '').toLowerCase();
    const growthPattern = (plant.growthPattern || '').toLowerCase();
    const growthRate = (plant.growthRate || '').toLowerCase();
    
    const enclosureSizes = {
        'tiny': { min: 0, max: 16.67, height: '0-5 cm' },
        'small': { min: 16.67, max: 33.33, height: '5-15 cm' },
        'medium': { min: 33.33, max: 50, height: '15-30 cm' },
        'large': { min: 50, max: 66.67, height: '30-60 cm' },
        'xlarge': { min: 66.67, max: 90, height: '60-180 cm' },
        'open': { min: 90, max: 100, height: '180+ cm' }
    };
    
    // Substrate takes 30% of enclosure height, leaving 70% usable space
    const SUBSTRATE_PERCENTAGE = 0.30;
    const USABLE_HEIGHT_PERCENTAGE = 0.70;
    
    // Calculate padding: 20% of plant size, minimum 2 cm
    function calculatePadding(plantSize) {
        return Math.max(plantSize * 0.20, 2);
    }
    
    // Helper function to determine enclosure size category from required enclosure height in cm
    function getEnclosureCategory(requiredEnclosureHeightCm) {
        if (requiredEnclosureHeightCm <= 5) return 'tiny';
        if (requiredEnclosureHeightCm > 5 && requiredEnclosureHeightCm <= 15) return 'small';
        if (requiredEnclosureHeightCm > 15 && requiredEnclosureHeightCm <= 30) return 'medium';
        if (requiredEnclosureHeightCm > 30 && requiredEnclosureHeightCm <= 60) return 'large';
        if (requiredEnclosureHeightCm > 60 && requiredEnclosureHeightCm <= 180) return 'xlarge';
        if (requiredEnclosureHeightCm > 180) return 'open';
        return 'small'; // default
    }
    
    // Extract size from size string - use only juvenile (minimum) size
    if (size.includes('cm') && size.match(/[\d.]+/)) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            const juvenileSize = parseFloat(numbers[0]);
            
            // Calculate padding space (20% of plant size)
            const padding = calculatePadding(juvenileSize);
            
            // Calculate required enclosure height: (plant height / usable height percentage) + padding
            // Since substrate takes 30%, we need: (plantHeight / 0.7) + padding
            const requiredEnclosureHeight = (juvenileSize / USABLE_HEIGHT_PERCENTAGE) + padding;
            
            // Determine enclosure size based on calculated required height
            const enclosureCategory = getEnclosureCategory(requiredEnclosureHeight);
            return { size: enclosureCategory, ...enclosureSizes[enclosureCategory] };
        }
    }
    
    // Handle meters if present - use only juvenile (minimum) size
    if (size.includes('m') && size.match(/[\d.]+/)) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            const juvenileSize = parseFloat(numbers[0]) * 100; // Convert to cm
            
            // Calculate padding space (20% of plant size)
            const padding = calculatePadding(juvenileSize);
            
            // Calculate required enclosure height: (plant height / usable height percentage) + padding
            const requiredEnclosureHeight = (juvenileSize / USABLE_HEIGHT_PERCENTAGE) + padding;
            
            // Determine enclosure size based on calculated required height
            const enclosureCategory = getEnclosureCategory(requiredEnclosureHeight);
            return { size: enclosureCategory, ...enclosureSizes[enclosureCategory] };
        }
    }
    
    // Default based on growth pattern
    if (growthPattern.includes('creep') || growthPattern.includes('carpet') || growthPattern.includes('trail')) {
        return { size: 'small', ...enclosureSizes.small };
    }
    
    if (growthPattern.includes('vining') || growthPattern.includes('climb')) {
        return { size: 'medium', ...enclosureSizes.medium };
    }
    
    return { size: 'small', ...enclosureSizes.small };
}

function getAllPlantFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.json') && item !== 'index.json') {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

function parseSize(sizeStr) {
    if (!sizeStr) return null;
    
    const size = sizeStr.toLowerCase();
    const issues = [];
    
    // Check for problematic patterns
    if (size.includes('m') && size.match(/[\d.]+/)) {
        const meters = parseFloat(size.match(/[\d.]+/)[0]);
        if (meters > 3) {
            issues.push(`Very large size (${meters}m) - may be incorrect for terrarium`);
        }
    }
    
    if (size.includes('cm') && size.match(/\d+/)) {
        const cm = parseInt(size.match(/\d+/)[0]);
        if (cm > 200) {
            issues.push(`Large size (${cm}cm+) - verify if correct`);
        }
    }
    
    // Check for multiple dimensions (tall, wide, spread)
    if (size.includes('tall') && size.includes('wide') || size.includes('spread')) {
        issues.push('Multiple dimensions - function may not parse correctly');
    }
    
    // Check for very wide ranges
    if (size.includes('-')) {
        const rangeMatch = size.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
        if (rangeMatch) {
            const min = parseFloat(rangeMatch[1]);
            const max = parseFloat(rangeMatch[2]);
            const ratio = max / min;
            if (ratio > 5) {
                issues.push(`Very wide range (${min}-${max}) - ratio ${ratio.toFixed(1)}x`);
            }
        }
    }
    
    // Check for missing units
    if (size.match(/\d+/) && !size.includes('cm') && !size.includes('m') && !size.includes('inch')) {
        issues.push('Missing unit (cm/m)');
    }
    
    return {
        original: sizeStr,
        issues: issues.length > 0 ? issues : null
    };
}

async function reviewSizes() {
    console.log('🔍 Reviewing all plant sizes...\n');
    console.log('='.repeat(100));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    const results = {
        total: plantFiles.length,
        missing: [],
        problematic: [],
        all: []
    };
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            const entry = {
                file: filename,
                id: plant.id,
                name: plant.name,
                scientificName: plant.scientificName,
                size: plant.size,
                growthPattern: plant.growthPattern,
                growthRate: plant.growthRate,
                category: plant.category
            };
            
            // Check if size is missing
            if (!plant.size || plant.size.trim() === '') {
                results.missing.push(entry);
                entry.parsed = null;
                entry.enclosureSize = null;
            } else {
                // Parse size for issues
                const parsed = parseSize(plant.size);
                entry.parsed = parsed;
                
                // Calculate enclosure size
                const enclosureSize = determineMinimumEnclosureSize(plant);
                entry.enclosureSize = enclosureSize.size;
                entry.enclosureHeight = enclosureSize.height;
                
                // Check if problematic
                if (parsed.issues) {
                    results.problematic.push({
                        ...entry,
                        issues: parsed.issues
                    });
                }
            }
            
            results.all.push(entry);
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }
    
    // Generate report
    console.log(`\n📊 SUMMARY`);
    console.log(`Total plants: ${results.total}`);
    console.log(`Missing sizes: ${results.missing.length}`);
    console.log(`Problematic sizes: ${results.problematic.length}`);
    
    if (results.missing.length > 0) {
        console.log(`\n❌ MISSING SIZES (${results.missing.length}):`);
        console.log('='.repeat(100));
        results.missing.forEach(entry => {
            console.log(`${entry.file.padEnd(60)} | ${entry.name.padEnd(40)}`);
        });
    }
    
    if (results.problematic.length > 0) {
        console.log(`\n⚠️  PROBLEMATIC SIZES (${results.problematic.length}):`);
        console.log('='.repeat(100));
        results.problematic.forEach(entry => {
            console.log(`\n${entry.file}`);
            console.log(`  Name: ${entry.name}`);
            console.log(`  Scientific: ${entry.scientificName}`);
            console.log(`  Size: ${entry.size}`);
            console.log(`  Growth Pattern: ${entry.growthPattern || 'N/A'}`);
            console.log(`  Growth Rate: ${entry.growthRate || 'N/A'}`);
            console.log(`  Calculated Enclosure: ${entry.enclosureSize} (${entry.enclosureHeight})`);
            console.log(`  Issues:`);
            entry.issues.forEach(issue => console.log(`    - ${issue}`));
        });
    }
    
    // Save detailed report to file
    const reportPath = path.join(__dirname, 'size-review-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        summary: {
            total: results.total,
            missing: results.missing.length,
            problematic: results.problematic.length
        },
        missing: results.missing,
        problematic: results.problematic,
        all: results.all
    }, null, 2));
    
    console.log(`\n✅ Detailed report saved to: ${reportPath}`);
    
    // Show some examples of different enclosure sizes
    console.log(`\n📏 ENCLOSURE SIZE DISTRIBUTION:`);
    const sizeDistribution = {};
    results.all.forEach(entry => {
        if (entry.enclosureSize) {
            sizeDistribution[entry.enclosureSize] = (sizeDistribution[entry.enclosureSize] || 0) + 1;
        }
    });
    Object.entries(sizeDistribution).sort((a, b) => {
        const order = ['tiny', 'small', 'medium', 'large', 'open'];
        return order.indexOf(a[0]) - order.indexOf(b[0]);
    }).forEach(([size, count]) => {
        const percentage = ((count / results.total) * 100).toFixed(1);
        console.log(`  ${size.padEnd(10)}: ${count.toString().padStart(4)} (${percentage}%)`);
    });
}

reviewSizes().catch(console.error);

