// AI Vision-Powered Image Fetcher
// Uses OpenAI GPT-4 Vision to validate images for accuracy and quality
// Requires: npm install openai axios
// Cost: ~$0.01-0.05 per plant

const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    openaiApiKey: process.env.OPENAI_API_KEY,
    imagesPerPlant: 3,
    outputDir: path.join(__dirname, '..', 'images'),
    
    // Free image APIs (optional but recommended)
    pexelsApiKey: process.env.PEXELS_API_KEY || '',
    pixabayApiKey: process.env.PIXABAY_API_KEY || '',
    unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || ''
};

if (!CONFIG.openaiApiKey) {
    console.error('❌ OPENAI_API_KEY environment variable not set!');
    console.log('Get your API key from: https://platform.openai.com/api-keys');
    console.log('Cost estimate: ~$2-5 for all 112 plants');
    process.exit(1);
}

const openai = new OpenAI({ apiKey: CONFIG.openaiApiKey });

/**
 * Generate optimal search queries using GPT-4
 */
async function generateOptimalSearchQueries(plant) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert in plant photography and image search. Generate 5 specific search queries optimized for finding high-quality, aesthetically pleasing images of plants.'
                },
                {
                    role: 'user',
                    content: `Plant: ${plant.name} (${plant.scientificName})
Type: ${plant.type?.join(', ') || 'N/A'}
Classification: ${plant.classification?.join(', ') || 'N/A'}

Generate 5 search queries that would find:
- Professional, high-quality photos
- Accurate plant representation
- Aesthetically pleasing images
- Suitable for a plant database

Focus on scientific names, common names, plant features, and professional photography terms.

Return only the queries, one per line, no numbers or formatting.`
                }
            ],
            temperature: 0.7,
            max_tokens: 200
        });
        
        const queries = response.choices[0].message.content
            .split('\n')
            .map(q => q.trim())
            .filter(q => q.length > 0 && !q.match(/^\d+[\.\)]/))
            .slice(0, 5);
        
        return queries.length > 0 ? queries : [
            `${plant.scientificName} plant`,
            `${plant.name} close up`,
            `${plant.scientificName} leaves`
        ];
    } catch (err) {
        console.warn(`  ⚠️ Query generation failed, using fallback: ${err.message}`);
        return [
            `${plant.scientificName} plant`,
            `${plant.name} terrarium`,
            `${plant.scientificName} close up`
        ];
    }
}

/**
 * Search for images using free APIs
 */
async function searchImages(query, count = 5) {
    const allImages = [];
    
    // Search Pexels
    if (CONFIG.pexelsApiKey) {
        try {
            const response = await axios.get('https://api.pexels.com/v1/search', {
                params: { query, per_page: count, orientation: 'landscape' },
                headers: { 'Authorization': CONFIG.pexelsApiKey }
            });
            allImages.push(...response.data.photos.map(p => ({
                url: p.src.large,
                source: 'pexels',
                id: p.id
            })));
        } catch (err) {}
    }
    
    // Search Pixabay
    if (CONFIG.pixabayApiKey) {
        try {
            const response = await axios.get('https://pixabay.com/api/', {
                params: {
                    key: CONFIG.pixabayApiKey,
                    q: query,
                    image_type: 'photo',
                    per_page: count
                }
            });
            allImages.push(...response.data.hits.map(h => ({
                url: h.largeImageURL || h.webformatURL,
                source: 'pixabay',
                id: h.id
            })));
        } catch (err) {}
    }
    
    // Search Unsplash
    if (CONFIG.unsplashAccessKey) {
        try {
            const response = await axios.get('https://api.unsplash.com/search/photos', {
                params: { query, per_page: count },
                headers: { 'Authorization': `Client-ID ${CONFIG.unsplashAccessKey}` }
            });
            allImages.push(...response.data.results.map(r => ({
                url: r.urls.regular,
                source: 'unsplash',
                id: r.id
            })));
        } catch (err) {}
    }
    
    return allImages;
}

/**
 * Validate image using GPT-4 Vision
 */
async function validateImageWithVision(plant, imageUrl) {
    try {
        // Download image
        const imageResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
        
        // Analyze with GPT-4 Vision
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // or 'gpt-4-vision-preview'
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert botanist. Analyze plant images for accuracy, quality, and aesthetic appeal. Return JSON only.'
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze this image. Is it accurately showing ${plant.name} (${plant.scientificName})? Rate quality 1-10 and aesthetic 1-10. Return JSON: {"isAccurate": true/false, "quality": 1-10, "aesthetic": 1-10, "score": (quality+aesthetic)/2, "reason": "brief"}`
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`,
                                detail: 'low' // Use 'high' for better analysis (costs more)
                            }
                        }
                    ]
                }
            ],
            max_tokens: 150
        });
        
        const content = response.choices[0].message.content;
        const result = JSON.parse(content);
        
        return {
            isAccurate: result.isAccurate,
            quality: result.quality || 5,
            aesthetic: result.aesthetic || 5,
            score: result.score || (result.quality + result.aesthetic) / 2,
            reason: result.reason || ''
        };
    } catch (err) {
        console.warn(`    Vision validation failed: ${err.message}`);
        return {
            isAccurate: true,
            quality: 5,
            aesthetic: 5,
            score: 5,
            reason: 'Validation error'
        };
    }
}

/**
 * Download image
 */
async function downloadImage(imageUrl, savePath) {
    const response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const writer = require('fs').createWriteStream(savePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

/**
 * Process a single plant
 */
async function fetchImagesForPlant(plant) {
    console.log(`\n🌱 ${plant.name} (${plant.scientificName})`);
    
    // Generate optimal search queries
    const queries = await generateOptimalSearchQueries(plant);
    console.log(`  Generated ${queries.length} search queries`);
    
    // Search for candidate images
    const candidateImages = [];
    for (const query of queries.slice(0, 3)) {
        const results = await searchImages(query, 5);
        candidateImages.push(...results);
        await new Promise(r => setTimeout(r, 300)); // Rate limiting
    }
    
    // Remove duplicates
    const uniqueImages = [];
    const seen = new Set();
    for (const img of candidateImages) {
        if (!seen.has(img.url)) {
            seen.add(img.url);
            uniqueImages.push(img);
        }
    }
    
    console.log(`  Found ${uniqueImages.length} candidate images`);
    
    if (uniqueImages.length === 0) {
        console.warn(`  ⚠️ No images found`);
        return 0;
    }
    
    // Validate with AI Vision (limit to top 10 to save costs)
    console.log(`  Validating with AI Vision...`);
    const validated = [];
    
    for (const img of uniqueImages.slice(0, 10)) {
        const validation = await validateImageWithVision(plant, img.url);
        
        if (validation.isAccurate && validation.score >= 6) {
            validated.push({
                ...img,
                ...validation
            });
            console.log(`    ✓ ${img.source} - Score: ${validation.score.toFixed(1)} (${validation.reason})`);
        } else {
            console.log(`    ✗ ${img.source} - Rejected: ${validation.reason || 'Low score'}`);
        }
        
        // Rate limiting for API
        await new Promise(r => setTimeout(r, 1000));
    }
    
    // Sort by score and select top images
    validated.sort((a, b) => b.score - a.score);
    const selectedImages = validated.slice(0, CONFIG.imagesPerPlant);
    
    console.log(`  ✅ Selected ${selectedImages.length} validated images`);
    
    if (selectedImages.length === 0) {
        console.warn(`  ⚠️ No images passed validation`);
        return 0;
    }
    
    // Download images
    const plantFolderName = plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const plantFolder = path.join(CONFIG.outputDir, plantFolderName);
    await fs.mkdir(plantFolder, { recursive: true });
    
    let successCount = 0;
    for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        const filename = `${plantFolderName}-${i + 1}.jpg`;
        const savePath = path.join(plantFolder, filename);
        
        try {
            await downloadImage(img.url, savePath);
            console.log(`    ✅ Saved: ${filename} (score: ${img.score.toFixed(1)})`);
            successCount++;
            
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            console.error(`    ❌ Failed: ${err.message}`);
        }
    }
    
    return successCount;
}

/**
 * Load all plants
 */
async function loadAllPlants() {
    const { loadAllPlants } = require('./fetch-images-simple.js');
    return loadAllPlants();
}

/**
 * Main function
 */
async function main() {
    console.log('🤖 AI Vision-Powered Plant Image Fetcher\n');
    console.log('⚠️ This will use OpenAI API (costs money)');
    console.log('Estimated cost: ~$0.01-0.05 per plant\n');
    
    const plants = await loadAllPlants();
    
    const args = process.argv.slice(2);
    let plantsToProcess = plants;
    
    if (args.length > 0) {
        const filter = args[0];
        if (!isNaN(filter)) {
            plantsToProcess = plants.filter(p => p.id === parseInt(filter));
        } else {
            plantsToProcess = plants.filter(p => 
                p.name.toLowerCase().includes(filter.toLowerCase())
            );
        }
    }
    
    console.log(`Processing ${plantsToProcess.length} plant(s)...\n`);
    
    let totalSuccess = 0;
    for (const plant of plantsToProcess) {
        const count = await fetchImagesForPlant(plant);
        totalSuccess += count;
    }
    
    console.log(`\n✅ Complete! Downloaded ${totalSuccess} validated images`);
    console.log(`Total cost: ~$${((plantsToProcess.length * 0.03).toFixed(2)})`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { fetchImagesForPlant };

