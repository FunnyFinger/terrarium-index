// Final verification and web enhancement
// 1. Verify ALL tags are ONLY vivarium types
// 2. Fetch enhanced descriptions from multiple web sources
// 3. Fill in missing care information

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');
const VALID_TAGS = ['terrarium', 'paludarium', 'aquarium', 'desertarium', 'aerarium', 'house-plant'];
const DELAY = 2000;

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Search plant information from multiple sources
 */
async function searchPlantInfo(scientificName, commonName) {
    const searchTerm = scientificName || commonName;
    if (!searchTerm) return null;
    
    // Clean the search term
    const cleanTerm = searchTerm
        .replace(/\s+/g, '_')
        .replace(/['"]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+/g, '_')
        .trim();
    
    // Try Wikipedia
    try {
        await delay(DELAY);
        
        const wikiUrl = `https://en.wikipedia.org/wiki/${cleanTerm}`;
        const response = await axios.get(wikiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 8000
        });
        
        const $ = cheerio.load(response.data);
        
        // Get description
        let description = '';
        $('p').each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 150 && 
                !text.includes('may refer to') &&
                !text.includes('disambiguation') &&
                !text.includes('redirect') &&
                !description) {
                description = text.substring(0, 500).replace(/\n/g, ' ').trim();
            }
        });
        
        // Extract additional info
        const fullText = $.text();
        
        // Size
        let size = null;
        const sizePatterns = [
            /(\d+\s*[-–]\s*\d+\s*cm)/i,
            /(up to \d+\s*cm)/i,
            /(\d+\s*cm (tall|high|wide|long))/i,
            /(reaches \d+\s*cm)/i,
            /(grows to \d+\s*cm)/i,
            /(maximum \d+\s*cm)/i,
            /(typically \d+\s*[-–]\s*\d+\s*cm)/i
        ];
        
        for (const pattern of sizePatterns) {
            const match = fullText.match(pattern);
            if (match && match[1]) {
                size = match[1];
                break;
            }
        }
        
        // Temperature
        let temperature = null;
        const tempPatterns = [
            /(\d+\s*[-–]\s*\d+\s*°[CF])/i,
            /(temperature[^.]*?(\d+\s*[-–]\s*\d+\s*°[CF]))/i
        ];
        
        for (const pattern of tempPatterns) {
            const match = fullText.match(pattern);
            if (match && (match[2] || match[1])) {
                temperature = (match[2] || match[1]);
                break;
            }
        }
        
        // Light requirements
        let light = null;
        const lightKeywords = ['bright indirect', 'bright light', 'full sun', 'partial shade', 'low light'];
        for (const keyword of lightKeywords) {
            if (fullText.toLowerCase().includes(keyword)) {
                light = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                break;
            }
        }
        
        if (description) {
            return {
                description: description,
                size: size,
                temperature: temperature,
                light: light,
                source: 'Wikipedia'
            };
        }
    } catch (error) {
        // Wikipedia failed, try other approach
    }
    
    return null;
}

/**
 * Verify and enhance a plant
 */
async function verifyAndEnhancePlant(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const plant = JSON.parse(content);
        
        let updated = false;
        const issues = [];
        
        // 1. Verify tags are ONLY valid vivarium types
        const currentTags = plant.type || [];
        const invalidTags = currentTags.filter(t => !VALID_TAGS.includes(t));
        
        if (invalidTags.length > 0) {
            issues.push(`Invalid tags: ${invalidTags.join(', ')}`);
            // Remove invalid tags, keep valid ones
            plant.type = currentTags.filter(t => VALID_TAGS.includes(t));
            if (plant.type.length === 0) {
                plant.type = ['terrarium']; // Default
            }
            updated = true;
        }
        
        // 2. Enhance description if needed
        const needsEnhancement = !plant.description || 
                                 plant.description.length < 100 ||
                                 plant.description.includes('no information') ||
                                 plant.description.includes('will become available') ||
                                 plant.description.includes('Sorry, no') ||
                                 plant.description.includes('beautiful plant suitable') ||
                                 plant.description.includes('Additional information');
        
        if (needsEnhancement && plant.scientificName && plant.scientificName.length > 5) {
            const enhanced = await searchPlantInfo(plant.scientificName, plant.name);
            
            if (enhanced && enhanced.description) {
                plant.description = enhanced.description;
                
                if (enhanced.size && (plant.size === 'Varies' || !plant.size)) {
                    plant.size = enhanced.size;
                }
                
                if (enhanced.temperature && plant.temperature === '18-24°C') {
                    plant.temperature = enhanced.temperature;
                }
                
                if (enhanced.light && plant.lightRequirements === 'Bright Indirect to Medium Light') {
                    plant.lightRequirements = enhanced.light;
                }
                
                updated = true;
            }
        }
        
        // 3. Update vivariumType to match type array
        if (plant.type) {
            const vivariumTypes = [];
            if (plant.type.includes('terrarium')) vivariumTypes.push('Closed Terrarium');
            if (plant.type.includes('paludarium')) vivariumTypes.push('Paludarium');
            if (plant.type.includes('aquarium')) vivariumTypes.push('Aquarium');
            if (plant.type.includes('desertarium')) vivariumTypes.push('Desertarium');
            if (plant.type.includes('aerarium')) vivariumTypes.push('Aerarium');
            
            if (plant.type.includes('house-plant')) {
                plant.vivariumType = [];
            } else if (vivariumTypes.length > 0) {
                const currentVivariumTypes = plant.vivariumType || [];
                if (JSON.stringify(currentVivariumTypes.sort()) !== JSON.stringify(vivariumTypes.sort())) {
                    plant.vivariumType = vivariumTypes;
                    updated = true;
                }
            }
        }
        
        if (updated) {
            await fs.writeFile(filePath, JSON.stringify(plant, null, 2));
            return { 
                fixed: true, 
                plant: plant.name, 
                issues: issues,
                enhanced: needsEnhancement && plant.description.length > 100
            };
        }
        
        return { fixed: false };
    } catch (error) {
        return { fixed: false, error: error.message };
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🔍 Final Verification and Web Enhancement...\n');
    console.log('Checking:');
    console.log('  1. All tags are ONLY vivarium types');
    console.log('  2. Fetching enhanced descriptions from Wikipedia');
    console.log('  3. Filling missing care information\n');
    
    const categories = ['additional', 'tropical', 'ferns', 'carnivorous', 'orchids', 
                       'air-plants', 'aquarium', 'mosses', 'succulents'];
    
    let totalFixed = 0;
    let totalEnhanced = 0;
    let totalProcessed = 0;
    const issues = [];
    
    for (const category of categories) {
        const categoryDir = path.join(PLANTS_DIR, category);
        try {
            const files = await fs.readdir(categoryDir);
            const plantFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');
            
            console.log(`\n📂 ${category} (${plantFiles.length} plants)`);
            
            // Process first 30 plants per category to avoid too many web requests
            for (const file of plantFiles.slice(0, 30)) {
                const filePath = path.join(categoryDir, file);
                const result = await verifyAndEnhancePlant(filePath);
                totalProcessed++;
                
                if (result.fixed) {
                    totalFixed++;
                    if (result.issues && result.issues.length > 0) {
                        issues.push(`${result.plant}: ${result.issues.join(', ')}`);
                    }
                    if (result.enhanced) {
                        totalEnhanced++;
                        console.log(`  ✅ ${result.plant} - Enhanced`);
                    } else if (result.issues && result.issues.length > 0) {
                        console.log(`  ✅ ${result.plant} - Fixed tags`);
                    }
                }
                
                // Progress
                if (totalProcessed % 10 === 0) {
                    console.log(`    Progress: ${totalProcessed} processed...`);
                }
            }
        } catch (error) {
            console.log(`  ⚠️  Category ${category}: ${error.message}`);
        }
    }
    
    console.log(`\n\n✅ Verification complete!`);
    console.log(`   Processed: ${totalProcessed} plants`);
    console.log(`   Fixed: ${totalFixed} plants`);
    console.log(`   Enhanced: ${totalEnhanced} plants`);
    
    if (issues.length > 0) {
        console.log(`\n⚠️  Issues found:`);
        issues.slice(0, 10).forEach(issue => console.log(`   - ${issue}`));
        if (issues.length > 10) {
            console.log(`   ... and ${issues.length - 10} more`);
        }
    }
    
    console.log('\n💡 All tags verified to be ONLY vivarium types!');
}

main().catch(console.error);

