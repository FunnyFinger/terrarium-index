const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');

// Old formula
function oldCalculate(h) {
    const padding = Math.max(2, Math.min(h * 0.10, 10));
    return (h + padding) / 0.70;
}

// New formula
function newCalculate(h) {
    const padding = Math.max(h * 0.20, 2); // 20% with minimum 2cm
    return (h / 0.70) + padding;
}

function getCategory(height) {
    if (height <= 5) return 'tiny';
    if (height > 5 && height <= 15) return 'small';
    if (height > 15 && height <= 30) return 'medium';
    if (height > 30 && height <= 60) return 'large';
    if (height > 60 && height <= 180) return 'xlarge';
    if (height > 180) return 'open';
    return 'small';
}

const files = fs.readdirSync(plantsDir).filter(f => f.endsWith('.json') && f !== 'index.json');
const changes = [];

files.forEach(file => {
    try {
        const plant = JSON.parse(fs.readFileSync(path.join(plantsDir, file), 'utf8'));
        const size = (plant.size || '').toLowerCase();
        
        if (size.includes('cm')) {
            const match = size.match(/([\d.]+)/);
            if (match) {
                const h = parseFloat(match[1]);
                const oldE = oldCalculate(h);
                const newE = newCalculate(h);
                const oldCat = getCategory(oldE);
                const newCat = getCategory(newE);
                
                if (oldCat !== newCat || Math.abs(newE - oldE) > 1) {
                    changes.push({
                        name: plant.name,
                        size: h,
                        oldE: oldE.toFixed(1),
                        newE: newE.toFixed(1),
                        oldCat,
                        newCat,
                        changed: oldCat !== newCat
                    });
                }
            }
        }
    } catch (e) {
        // Skip errors
    }
});

console.log(`Found ${changes.length} plants with significant changes\n`);

const categoryChanges = changes.filter(c => c.changed);
console.log(`Plants that changed categories: ${categoryChanges.length}\n`);

if (categoryChanges.length > 0) {
    console.log('Category Changes:');
    console.log('Name | Size | Old Category | New Category | Old Enclosure | New Enclosure');
    console.log('-----|------|--------------|--------------|---------------|--------------');
    categoryChanges.forEach(c => {
        console.log(`${c.name} | ${c.size}cm | ${c.oldCat.padEnd(13)} | ${c.newCat.padEnd(13)} | ${c.oldE}cm | ${c.newE}cm`);
    });
}

console.log('\n\nAll significant changes (>1cm difference):');
console.log('Name | Size | Old Enclosure | New Enclosure | Difference | Old Cat | New Cat');
console.log('-----|------|---------------|---------------|------------|---------|--------');
changes.slice(0, 20).forEach(c => {
    const diff = (parseFloat(c.newE) - parseFloat(c.oldE)).toFixed(1);
    const marker = c.changed ? ' *' : '';
    console.log(`${c.name}${marker} | ${c.size}cm | ${c.oldE}cm | ${c.newE}cm | ${diff > 0 ? '+' : ''}${diff}cm | ${c.oldCat} | ${c.newCat}`);
});

if (changes.length > 20) {
    console.log(`\n... and ${changes.length - 20} more`);
}

