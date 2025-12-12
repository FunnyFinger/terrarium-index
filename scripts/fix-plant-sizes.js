const fs = require('fs');
const path = require('path');

const plantsDir = path.join(__dirname, '../data/plants-merged');

// Size corrections based on research and reasonable estimates for juvenile/terrarium sizes
const sizeCorrections = {
    '00080-spanish-moss.json': '15-60 cm',
    '00311-hoya-australis.json': '15-60 cm',
    '00325-hoya-carnosa-krinkle-8.json': '15-60 cm',
    '00330-monstera-standleyana-aurea-variegated.json': '15-60 cm',
    '00332-monstera-obliqua-suriname.json': '15-60 cm',
    '00333-monstera-siltepecana.json': '15-60 cm',
    '00334-monstera-dubia-semi-mature.json': '15-60 cm',
    '00335-monstera-dissecta.json': '15-60 cm',
    '00338-monstera-lechleriana.json': '15-60 cm',
    '00340-monstera-adansonii-ssp-laniata-type.json': '15-60 cm',
    '00344-monstera-aureopinnata.json': '15-60 cm',
    '00345-monstera-subpinnata.json': '15-60 cm',
    '00347-monstera-egregia.json': '15-60 cm',
    '00349-monstera-acacoyaguensis.json': '15-60 cm',
    '00350-philodendron-silver-sword.json': '15-60 cm',
    '00351-philodendron-billietiae.json': '15-60 cm',
    '00352-philodendron-bipinnatifidum-tortum.json': '15-60 cm',
    '00353-philodendron-brandtianum.json': '15-60 cm',
    '00356-philodendron-grandipes.json': '15-60 cm',
    '00357-philodendron-holtonianum.json': '15-60 cm',
    '00359-philodendron-micans.json': '15-60 cm',
    '00360-philodendron-microstictum.json': '15-60 cm',
    '00361-philodendron-peltatum-pastazanum-aff.json': '15-60 cm',
    '00362-philodendron-polypodioides.json': '15-60 cm',
    '00363-philodendron-squamiferum.json': '15-60 cm',
    '00434-syngonium-podophyllum-batik.json': '15-60 cm',
    '00435-syngonium-erythrophyllum-red-arrow.json': '15-60 cm',
    '00436-syngonium-steyermarkii.json': '15-60 cm',
    '00506-philodendron-pink-princess.json': '15-60 cm',
    '00509-philodendron-sodiroi.json': '15-60 cm',
    '00227-agave-lophantha.json': '30-60 cm',
    '00228-agave-macroacantha.json': '30-50 cm',
    '00241-alluaudia-procera.json': '30-100 cm',
    '00252-alocasia-macrorrhiza-splash-variegated.json': '30-90 cm',
    '00389-cyathea-cooperi.json': '30-90 cm',
    '00390-dicksonia-antarctica-tree-fern.json': '30-90 cm',
    '00438-euphorbia-trigona-green-african-milk-tree.json': '30-100 cm',
    '00448-monstera-deliciosa-thai-constellation.json': '30-120 cm',
    '00011-pellionia.json': '10-15 cm',
    '00012-hypoestes.json': '15-30 cm',
    '00013-oxalis.json': '15-25 cm',
    '00014-nerve-plant.json': '5-10 cm',
    '00027-sagittaria.json': '5-20 cm',
    '00511-sansevieria-masoniana-whale-fin.json': '30-60 cm'
};

async function fixSizes() {
    console.log('🔧 Fixing plant sizes...\n');
    
    let fixed = 0;
    let notFound = 0;
    
    for (const [filename, newSize] of Object.entries(sizeCorrections)) {
        const filePath = path.join(plantsDir, filename);
        
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  File not found: ${filename}`);
            notFound++;
            continue;
        }
        
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const plant = JSON.parse(content);
            
            const oldSize = plant.size;
            plant.size = newSize;
            
            fs.writeFileSync(filePath, JSON.stringify(plant, null, 2));
            console.log(`✅ ${filename}: "${oldSize}" → "${newSize}"`);
            fixed++;
        } catch (error) {
            console.error(`❌ Error processing ${filename}:`, error.message);
        }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Not found: ${notFound}`);
    console.log(`  Total: ${Object.keys(sizeCorrections).length}`);
}

fixSizes().catch(console.error);

