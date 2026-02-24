const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');

// Orders that belong to monocots, which should have class "Liliopsida"
const MONOCOT_ORDERS = new Set([
  'Acorales',
  'Alismatales',
  'Asparagales',
  'Dioscoreales',
  'Liliales',
  'Pandanales',
  'Arecales',
  'Poales',
  'Commelinales',
  'Zingiberales'
]);

function main() {
  const files = fs
    .readdirSync(plantsDir)
    .filter((file) => file.endsWith('.json') && !file.startsWith('_'));

  let changedCount = 0;

  for (const file of files) {
    const fullPath = path.join(plantsDir, file);
    let content;

    try {
      content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (err) {
      console.error(`Skipping ${file} (invalid JSON):`, err.message);
      continue;
    }

    const taxonomy = content.taxonomy;
    if (!taxonomy || !taxonomy.order || !taxonomy.class) continue;

    if (MONOCOT_ORDERS.has(taxonomy.order) && taxonomy.class !== 'Liliopsida') {
      console.log(
        `Fixing ${file}: class "${taxonomy.class}" -> "Liliopsida" (order: ${taxonomy.order})`
      );
      taxonomy.class = 'Liliopsida';
      fs.writeFileSync(fullPath, JSON.stringify(content, null, 2) + '\n');
      changedCount += 1;
    }
  }

  console.log(`Updated ${changedCount} plant file(s).`);
}

main();

