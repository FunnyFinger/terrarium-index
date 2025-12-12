const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants-merged');

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

function analyzeSize(sizeStr, plant) {
    if (!sizeStr || sizeStr.trim() === '') {
        return { issue: 'missing', severity: 'high' };
    }
    
    const size = sizeStr.toLowerCase();
    const issues = [];
    let severity = 'low';
    
    // Check for sizes in meters (likely too large for terrariums)
    const meterMatch = size.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*m\b/i);
    if (meterMatch) {
        const minM = parseFloat(meterMatch[1]);
        const maxM = parseFloat(meterMatch[2]);
        if (minM > 0.5) { // More than 0.5m
            issues.push(`Size in meters (${minM}-${maxM}m) - likely mature form, not terrarium size`);
            severity = 'high';
        }
    }
    
    // Check for single meter values
    const singleMeterMatch = size.match(/(\d+(?:\.\d+)?)\s*m\b/i);
    if (singleMeterMatch && !meterMatch) {
        const meters = parseFloat(singleMeterMatch[1]);
        if (meters > 0.5) {
            issues.push(`Size in meters (${meters}m) - likely mature form, not terrarium size`);
            severity = 'high';
        }
    }
    
    // Check for very wide ranges in cm
    const cmRangeMatch = size.match(/(\d+)\s*[-–]\s*(\d+)\s*cm/i);
    if (cmRangeMatch) {
        const minCm = parseInt(cmRangeMatch[1]);
        const maxCm = parseInt(cmRangeMatch[2]);
        const ratio = maxCm / minCm;
        
        if (ratio > 5) {
            issues.push(`Very wide range (${minCm}-${maxCm}cm, ratio ${ratio.toFixed(1)}x) - may need narrowing`);
            if (ratio > 10) severity = 'high';
            else if (ratio > 7) severity = 'medium';
        }
        
        // Check for suspiciously large cm values (likely mature form)
        if (maxCm > 200 && !plant.category?.includes('tree')) {
            issues.push(`Very large size (${maxCm}cm+) - verify if this is terrarium-appropriate`);
            severity = 'high';
        }
    }
    
    // Check for multiple dimensions (tall, wide, spread) - parsing may be incorrect
    if ((size.includes('tall') && (size.includes('wide') || size.includes('spread'))) ||
        (size.includes('height') && (size.includes('width') || size.includes('diameter')))) {
        issues.push('Multiple dimensions - function may parse incorrectly');
        severity = 'medium';
    }
    
    // Check for missing units
    if (size.match(/\d+/) && !size.includes('cm') && !size.includes('m') && !size.includes('mm') && !size.includes('inch') && !size.includes('feet')) {
        issues.push('Missing unit (cm/m)');
        severity = 'medium';
    }
    
    // Check for feet/inches (needs conversion)
    if (size.includes('feet') || size.includes('ft') || size.includes('inch')) {
        issues.push('Size in imperial units - should be converted to metric');
        severity = 'medium';
    }
    
    // Check for descriptive text that might indicate mature form
    const matureIndicators = ['mature', 'adult', 'when climbing', 'in nature', 'outdoor', 'full size'];
    if (matureIndicators.some(indicator => size.includes(indicator))) {
        issues.push('Size may refer to mature/outdoor form, not terrarium size');
        severity = 'high';
    }
    
    return {
        issues: issues.length > 0 ? issues : null,
        severity: issues.length > 0 ? severity : null
    };
}

async function identifyIssues() {
    console.log('🔍 Identifying plant size issues...\n');
    console.log('='.repeat(100));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    const results = {
        high: [],
        medium: [],
        low: [],
        missing: []
    };
    
    for (const filePath of plantFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            const filename = path.basename(filePath);
            
            const analysis = analyzeSize(plant.size, plant);
            
            if (analysis.issue === 'missing') {
                results.missing.push({
                    file: filename,
                    name: plant.name,
                    scientificName: plant.scientificName,
                    size: plant.size
                });
            } else if (analysis.issues) {
                const entry = {
                    file: filename,
                    name: plant.name,
                    scientificName: plant.scientificName,
                    size: plant.size,
                    growthPattern: plant.growthPattern,
                    growthRate: plant.growthRate,
                    category: plant.category,
                    issues: analysis.issues
                };
                
                results[analysis.severity].push(entry);
            }
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }
    
    // Print summary
    console.log(`\n📊 SUMMARY`);
    console.log(`Total plants: ${plantFiles.length}`);
    console.log(`High severity issues: ${results.high.length}`);
    console.log(`Medium severity issues: ${results.medium.length}`);
    console.log(`Low severity issues: ${results.low.length}`);
    console.log(`Missing sizes: ${results.missing.length}`);
    
    // Print high severity issues
    if (results.high.length > 0) {
        console.log(`\n🔴 HIGH SEVERITY ISSUES (${results.high.length}):`);
        console.log('='.repeat(100));
        results.high.forEach(entry => {
            console.log(`\n${entry.file}`);
            console.log(`  Name: ${entry.name}`);
            console.log(`  Scientific: ${entry.scientificName}`);
            console.log(`  Size: ${entry.size}`);
            console.log(`  Growth Pattern: ${entry.growthPattern || 'N/A'}`);
            console.log(`  Issues:`);
            entry.issues.forEach(issue => console.log(`    - ${issue}`));
        });
    }
    
    // Print medium severity issues (first 20)
    if (results.medium.length > 0) {
        console.log(`\n🟡 MEDIUM SEVERITY ISSUES (showing first 20 of ${results.medium.length}):`);
        console.log('='.repeat(100));
        results.medium.slice(0, 20).forEach(entry => {
            console.log(`\n${entry.file}`);
            console.log(`  Name: ${entry.name}`);
            console.log(`  Size: ${entry.size}`);
            console.log(`  Issues: ${entry.issues.join('; ')}`);
        });
        if (results.medium.length > 20) {
            console.log(`\n... and ${results.medium.length - 20} more medium severity issues`);
        }
    }
    
    // Save detailed report
    const reportPath = path.join(__dirname, 'size-issues-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        summary: {
            total: plantFiles.length,
            high: results.high.length,
            medium: results.medium.length,
            low: results.low.length,
            missing: results.missing.length
        },
        high: results.high,
        medium: results.medium,
        low: results.low,
        missing: results.missing
    }, null, 2));
    
    console.log(`\n✅ Detailed report saved to: ${reportPath}`);
}

identifyIssues().catch(console.error);

