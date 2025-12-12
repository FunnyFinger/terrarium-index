// AI-Powered Image Fetcher using OpenAI GPT-4 Vision
// Requires: npm install openai axios
// Set environment variable: OPENAI_API_KEY=your_key_here

const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    openaiApiKey: process.env.OPENAI_API_KEY,
    imagesPerPlant: 3,
    outputDir: path.join(__dirname, '..', 'images'),
    // Free image search APIs (no API key needed for basic use)
    useFreeSearch: true
};

if (!CONFIG.openaiApiKey) {
    console.error('❌ OPENAI_API_KEY environment variable not set!');
    console.log('Get your API key from: https://platform.openai.com/api-keys');
    process.exit(1);
}

const openai = new OpenAI({ apiKey: CONFIG.openaiApiKey });

/**
 * Search Unsplash for images (free, no key needed for limited use)
 */
async function searchUnsplashFree(query, count = 10) {
    try {
        // Unsplash Source - free, no API key, but less reliable
        const results = [];
        for (let i = 0; i < count; i++) {
            const url = `https://source.unsplash.com/800x600/?${encodeURIComponent(query)},plant`;
            results.push({
                url: url,
                thumbnail: url,
                source: 'unsplash-source',
                relevance: 1 // Unknown without API
            });
        }
        return results;
    } catch (err) {
        console.warn('Unsplash free search failed:', err.message);
        return [];
    }
}

/**
 * Use OpenAI to generate optimal search queries
 */
async function generateOptimalSearchQueries(plant) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert in plant photography and image search. Generate 5 specific search queries that would find high-quality, aesthetically pleasing images of the given plant.'
                },
                {
                    role: 'user',
                    content: `Plant: ${plant.name} (${plant.scientificName})\nType: ${plant.type.join(', ')}\nClassification: ${plant.classification?.join(', ') || 'N/A'}\n\nGenerate 5 search queries optimized for finding beautiful, professional photos of this plant. Focus on:\n- Scientific and common names\n- Plant features (leaves, foliage, growth habit)\n- Context (terrarium, vivarium, natural habitat)\n- Professional photography terms\n\nReturn only the queries, one per line, no numbers or bullets.`
                }
            ],
            temperature: 0.7,
            max_tokens: 200
        });
        
        const queries = response.choices[0].message.content
            .split('\n')
            .map(q => q.trim())
            .filter(q => q.length > 0)
            .slice(0, 5);
        
        return queries;
    } catch (err) {
        console.warn('OpenAI query generation failed, using fallback:', err.message);
        // Fallback queries
        return [
            `${plant.scientificName} plant`,
            `${plant.name} terrarium`,
            `${plant.scientificName} close up`,
            `${plant.name} leaves`,
            `${plant.scientificName} foliage`
        ];
    }
}

/**
 * Use OpenAI Vision to validate images
 */
async function validateImageWithVision(plant, imageUrl) {
    try {
        // Download image to analyze
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4-vision-preview',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert botanist and photographer. Analyze plant images for accuracy, quality, and aesthetic appeal.'
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Is this image accurately showing a ${plant.name} (${plant.scientificName})? Rate the image quality and aesthetic appeal (1-10). Respond in JSON format: {"isAccurate": true/false, "quality": 1-10, "aesthetic": 1-10, "reason": "brief explanation"}. Plant type: ${plant.type.join(', ')}.`
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 200
        });
        
        const result = JSON.parse(response.choices[0].message.content);
        return {
            isAccurate: result.isAccurate,
            quality: result.quality,
            aesthetic: result.aesthetic,
            score: (result.quality + result.aesthetic) / 2,
            reason: result.reason
        };
    } catch (err) {
        console.warn(`Vision validation failed for ${imageUrl}:`, err.message);
        return {
            isAccurate: true, // Assume valid if validation fails
            quality: 5,
            aesthetic: 5,
            score: 5,
            reason: 'Validation error'
        };
    }
}

/**
 * Main fetching function
 */
async function fetchImagesForPlant(plant) {
    console.log(`\n🌱 Processing: ${plant.name}`);
    
    // Generate optimal search queries
    const queries = await generateOptimalSearchQueries(plant);
    console.log(`  Generated queries: ${queries.length}`);
    
    // Search for images using free sources
    const candidateImages = [];
    for (const query of queries.slice(0, 3)) { // Use first 3 queries
        const results = await searchUnsplashFree(query, 5);
        candidateImages.push(...results);
    }
    
    console.log(`  Found ${candidateImages.length} candidate images`);
    
    // Validate with AI Vision
    const validated = [];
    for (const img of candidateImages.slice(0, 10)) { // Check top 10
        const validation = await validateImageWithVision(plant, img.url);
        if (validation.isAccurate && validation.score >= 6) {
            validated.push({
                ...img,
                ...validation
            });
        }
    }
    
    // Sort by score and take top 3
    validated.sort((a, b) => b.score - a.score);
    const selectedImages = validated.slice(0, CONFIG.imagesPerPlant);
    
    console.log(`  ✅ Selected ${selectedImages.length} validated images`);
    
    // Download and save
    const plantFolderName = plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const plantFolder = path.join(CONFIG.outputDir, plantFolderName);
    await fs.mkdir(plantFolder, { recursive: true });
    
    for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        const filename = `${plantFolderName}-${i + 1}.jpg`;
        const savePath = path.join(plantFolder, filename);
        
        try {
            const response = await axios.get(img.url, { responseType: 'stream' });
            const writer = fs.createWriteStream(savePath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            console.log(`    ✅ Saved: ${filename} (score: ${img.score.toFixed(1)})`);
            
            // Rate limiting
            await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
            console.error(`    ❌ Failed: ${filename} - ${err.message}`);
        }
    }
    
    return selectedImages.length;
}

/**
 * Load all plants and process
 */
async function main() {
    // Load plants (similar to previous script)
    const plantsDir = path.join(__dirname, '..', 'data', 'plants');
    const allPlants = [];
    
    // ... (same loading logic)
    
    console.log(`Processing ${allPlants.length} plants with OpenAI Vision...`);
    console.log(`⚠️ Note: This will use OpenAI API credits. Cost: ~$0.01-0.05 per plant`);
    
    // Process plants
    for (const plant of allPlants) {
        await fetchImagesForPlant(plant);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { fetchImagesForPlant };

