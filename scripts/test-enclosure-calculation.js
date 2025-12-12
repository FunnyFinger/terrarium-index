// Test script to compare old vs new enclosure calculation

const oldFormula = (h, p) => (h + p) / 0.70;
const newFormula = (h, p) => (h / 0.70) + p;

const testSizes = [5, 10, 20, 50, 100, 200];

console.log('Plant Size | Old Padding | New Padding | Old Enclosure | New Enclosure | Difference');
console.log('-----------|-------------|-------------|--------------|---------------|------------');

testSizes.forEach(h => {
    const oldP = Math.max(2, Math.min(h * 0.10, 10)); // Old: 10% with min 2, max 10
    const newP = h * 0.20; // New: 20% no caps
    const oldE = oldFormula(h, oldP);
    const newE = newFormula(h, newP);
    const diff = newE - oldE;
    
    console.log(
        `${String(h).padStart(10)} | ${String(oldP.toFixed(1)).padStart(11)} | ${String(newP.toFixed(1)).padStart(11)} | ${String(oldE.toFixed(1)).padStart(13)} | ${String(newE.toFixed(1)).padStart(14)} | ${diff > 0 ? '+' : ''}${diff.toFixed(1)}`
    );
});

console.log('\nEnclosure Categories:');
console.log('tiny: 0-5 cm');
console.log('small: 5-15 cm');
console.log('medium: 15-30 cm');
console.log('large: 30-60 cm');
console.log('xlarge: 60-180 cm');
console.log('open: 180+ cm\n');

function getCategory(height) {
    if (height <= 5) return 'tiny';
    if (height > 5 && height <= 15) return 'small';
    if (height > 15 && height <= 30) return 'medium';
    if (height > 30 && height <= 60) return 'large';
    if (height > 60 && height <= 180) return 'xlarge';
    if (height > 180) return 'open';
    return 'small';
}

console.log('Plant Size | Old Category | New Category | Changed?');
console.log('-----------|--------------|--------------|----------');

testSizes.forEach(h => {
    const oldP = Math.max(2, Math.min(h * 0.10, 10));
    const newP = h * 0.20;
    const oldE = oldFormula(h, oldP);
    const newE = newFormula(h, newP);
    const oldCat = getCategory(oldE);
    const newCat = getCategory(newE);
    const changed = oldCat !== newCat ? 'YES' : 'no';
    
    console.log(
        `${String(h).padStart(10)} | ${oldCat.padStart(13)} | ${newCat.padStart(13)} | ${changed.padStart(9)}`
    );
});

