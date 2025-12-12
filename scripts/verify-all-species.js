// Verify All Species - Check for data quality issues
// Identify entries that need Wikipedia verification

const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants');

// Patterns indicating size variants (should be removed unless part of official common name)
const sizeDescriptors = /\b(mini|dwarf|miniature|small|tiny|large|xl|giant|compact)\b/i;

// Check if scientific name looks valid (Genus species format)
function isValidScientificName(name) {
    if (!name || name.trim() === '') return false;
    
    // Should be "Genus species" or "Genus species 'Cultivar'"
    // First word capitalized, second word lowercase
    const pattern = /^[A-Z][a-z]+\s+[a-z]+(\s+[a-z]+)?(\s+'[^']+')?$/;
    return pattern.test(name.trim());
}

// Check if name appears to be a common name (English descriptive)
function isLikelyCommonName(name) {
    if (!name) return false;
    // Contains common plant terms
    const commonTerms = /\b(fern|moss|plant|vine|ivy|cactus|orchid|bromeliad|palm|tree)\b/i;
    return commonTerms.test(name);
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

async function verifyAllSpecies() {
    console.log('🔍 Verifying all plant species...\n');
    console.log('='.repeat(80));
    
    const plantFiles = getAllPlantFiles(plantsDir);
    
    const issues = {
        invalidScientificName: [],
        hasSizeDescriptor: [],
        sameNameAndScientific: [],
        missingCommonName: [],
        needsVerification: []
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
                scientific: plant.scientificName,
                path: filePath
            };
            
            // Check 1: Invalid scientific name
            if (!isValidScientificName(plant.scientificName)) {
                issues.invalidScientificName.push({
                    ...entry,
                    issue: 'Invalid format or missing'
                });
            }
            
            // Check 2: Size descriptors in name (unless it's part of official common name)
            if (sizeDescriptors.test(plant.name) && !plant.name.includes('Dwarf')) {
                issues.hasSizeDescriptor.push({
                    ...entry,
                    descriptor: plant.name.match(sizeDescriptors)?.[0]
                });
            }
            
            // Check 3: Same name and scientific name (for non-botanical names)
            if (plant.name === plant.scientificName && isLikelyCommonName(plant.name)) {
                issues.sameNameAndScientific.push(entry);
            }
            
            // Check 4: Scientific name used as common name
            if (isValidScientificName(plant.name) && !isLikelyCommonName(plant.name)) {
                issues.missingCommonName.push({
                    ...entry,
                    suggestion: 'Use common name instead of scientific name'
                });
            }
            
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err.message);
        }
    }
    
    // Generate report
    console.log('\n📊 VERIFICATION SUMMARY:');
    console.log(`   Total entries: ${plantFiles.length}`);
    console.log(`   Issues found: ${
        issues.invalidScientificName.length +
        issues.hasSizeDescriptor.length +
        issues.sameNameAndScientific.length +
        issues.missingCommonName.length
    }\n`);
    
    if (issues.invalidScientificName.length > 0) {
        console.log(`\n❌ INVALID SCIENTIFIC NAMES (${issues.invalidScientificName.length}):`);
        console.log('   These need Wikipedia verification:\n');
        issues.invalidScientificName.slice(0, 20).forEach(item => {
            console.log(`   ${item.file}`);
            console.log(`   - Name: "${item.name}"`);
            console.log(`   - Scientific: "${item.scientific}"`);
            console.log(`   - Issue: ${item.issue}\n`);
        });
        if (issues.invalidScientificName.length > 20) {
            console.log(`   ... and ${issues.invalidScientificName.length - 20} more\n`);
        }
    }
    
    if (issues.hasSizeDescriptor.length > 0) {
        console.log(`\n⚠️  SIZE DESCRIPTORS IN NAME (${issues.hasSizeDescriptor.length}):`);
        console.log('   Remove unless part of official common name:\n');
        issues.hasSizeDescriptor.slice(0, 15).forEach(item => {
            console.log(`   ${item.file}: "${item.name}" (has "${item.descriptor}")`);
        });
        if (issues.hasSizeDescriptor.length > 15) {
            console.log(`   ... and ${issues.hasSizeDescriptor.length - 15} more\n`);
        }
    }
    
    if (issues.missingCommonName.length > 0) {
        console.log(`\n📝 SCIENTIFIC NAME USED AS COMMON NAME (${issues.missingCommonName.length}):`);
        console.log('   These should have proper common names:\n');
        issues.missingCommonName.slice(0, 15).forEach(item => {
            console.log(`   ${item.file}: "${item.name}"`);
        });
        if (issues.missingCommonName.length > 15) {
            console.log(`   ... and ${issues.missingCommonName.length - 15} more\n`);
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n💡 NEXT STEPS:');
    console.log('   1. Run Wikipedia verification script for invalid scientific names');
    console.log('   2. Remove size descriptors from names');
    console.log('   3. Add proper common names for scientific names\n');
    
    // Save detailed report to file
    const reportPath = path.join(__dirname, 'species-verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(issues, null, 2));
    console.log(`✅ Detailed report saved to: ${reportPath}\n`);
    
    return issues;
}

verifyAllSpecies().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

