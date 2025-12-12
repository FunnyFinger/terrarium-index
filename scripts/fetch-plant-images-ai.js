// AI-Powered Plant Image Fetcher
// Uses AI vision to find and validate high-quality images for each plant

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    // AI API - Choose one:
    // Option 1: OpenAI GPT-4 Vision (requires API key)
    useOpenAI: false,
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    
    // Option 2: Anthropic Claude (requires API key)
    useClaude: false,
    claudeApiKey: process.env.CLAUDE_API_KEY || '',
    
    // Option 3: Free alternative - use multiple image APIs with smart search
    useFreeAPIs: true,
    
    // Image sources (free)
    imageAPIs: {
        unsplash: {
            accessKey: process.env.UNSPLASH_ACCESS_KEY || '', // Get free key at https://unsplash.com/developers
            endpoint: 'https://api.unsplash.com/search/photos'
        },
        pixabay: {
            apiKey: process.env.PIXABAY_API_KEY || '', // Get free key at https://pixabay.com/api/docs/
            endpoint: 'https://pixabay.com/api/'
        },
        pexels: {
            apiKey: process.env.PEXELS_API_KEY || '', // Get free key at https://www.pexels.com/api/
            endpoint: 'https://api.pexels.com/v1/search'
        }
    },
    
    imagesPerPlant: 3,
    outputDir: path.join(__dirname, '..', 'images')
};

/**
 * Generate optimal search terms using AI or smart heuristics
 */
async function generateSearchTerms(plant) {
    const terms = [
        `${plant.scientificName} plant`,
        `${plant.name} terrarium`,
        `${plant.name} vivarium`,
        `${plant.scientificName}`,
        `${plant.name} close up`,
        `${plant.name} leaves`
    ];
    
    // If AI API available, use it to refine terms
    if (CONFIG.useOpenAI && CONFIG.openaiApiKey) {
        // TODO: Call OpenAI to get better search terms
        // For now, return optimized terms
    }
    
    return terms;
}

/**
 * Search for images using multiple free APIs
 */
async function searchImages(plant, searchTerms) {
    const allResults = [];
    
    // Try Unsplash (free tier: 50 requests/hour)
    if (CONFIG.imageAPIs.unsplash.accessKey) {
        try {
            const unsplashResults = await searchUnsplash(searchTerms[0], CONFIG.imagesPerPlant * 2);
            allResults.push(...unsplashResults);
        } catch (err) {
            console.warn(`Unsplash search failed: ${err.message}`);
        }
    }
    
    // Try Pixabay (free tier: generous limits)
    if (CONFIG.imageAPIs.pixabay.apiKey) {
        try {
            const pixabayResults = await searchPixabay(searchTerms[0], CONFIG.imagesPerPlant * 2);
            allResults.push(...pixabayResults);
        } catch (err) {
            console.warn(`Pixabay search failed: ${err.message}`);
        }
    }
    
    // Try Pexels (free tier: generous)
    if (CONFIG.imageAPIs.pexels.apiKey) {
        try {
            const pexelsResults = await searchPexels(searchTerms[0], CONFIG.imagesPerPlant * 2);
            allResults.push(...pexelsResults);
        } catch (err) {
            console.warn(`Pexels search failed: ${err.message}`);
        }
    }
    
    return allResults;
}

/**
 * Use AI Vision to validate and rank images
 */
async function validateImagesWithAI(plant, imageUrls) {
    // This would use OpenAI GPT-4 Vision or Claude to:
    // 1. Check if image actually shows the plant
    // 2. Rate image quality (1-10)
    // 3. Check aesthetic appeal
    // 4. Return top 3 images
    
    // For now, return first 3 (without AI validation)
    // TODO: Implement AI vision validation
    
    return imageUrls.slice(0, CONFIG.imagesPerPlant);
}

/**
 * Download and save images
 */
async function downloadImage(imageUrl, savePath) {
    const https = require('https');
    const http = require('http');
    const url = require('url');
    
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(imageUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        protocol.get(imageUrl, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            const fileStream = fs.createWriteStream(savePath);
            response.pipe(fileStream);
            
            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });
            
            fileStream.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Main function to fetch images for all plants
 */
async function fetchAllPlantImages() {
    // Load plants from JSON files
    const plantsDir = path.join(__dirname, '..', 'data', 'plants');
    const categories = fs.readdirSync(plantsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    const allPlants = [];
    
    for (const category of categories) {
        const categoryPath = path.join(plantsDir, category);
        const indexPath = path.join(categoryPath, 'index.json');
        
        if (fs.existsSync(indexPath)) {
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            
            for (const plantFile of index.plants || []) {
                const plantPath = path.join(categoryPath, plantFile);
                if (fs.existsSync(plantPath)) {
                    const plant = JSON.parse(fs.readFileSync(plantPath, 'utf8'));
                    allPlants.push(plant);
                }
            }
        }
    }
    
    console.log(`Found ${allPlants.length} plants to process`);
    
    // Process each plant
    for (const plant of allPlants) {
        console.log(`\n🌱 Processing: ${plant.name}`);
        
        try {
            // Generate search terms
            const searchTerms = await generateSearchTerms(plant);
            console.log(`  Search terms: ${searchTerms.join(', ')}`);
            
            // Search for images
            const imageUrls = await searchImages(plant, searchTerms);
            console.log(`  Found ${imageUrls.length} candidate images`);
            
            if (imageUrls.length === 0) {
                console.warn(`  ⚠️ No images found for ${plant.name}`);
                continue;
            }
            
            // Validate with AI (if available)
            const validatedImages = await validateImagesWithAI(plant, imageUrls);
            console.log(`  ✅ Selected ${validatedImages.length} images`);
            
            // Create plant folder
            const plantFolderName = plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const plantFolder = path.join(CONFIG.outputDir, plantFolderName);
            if (!fs.existsSync(plantFolder)) {
                fs.mkdirSync(plantFolder, { recursive: true });
            }
            
            // Download images
            for (let i = 0; i < validatedImages.length; i++) {
                const imageUrl = validatedImages[i];
                const filename = `${plantFolderName}-${i + 1}.jpg`;
                const savePath = path.join(plantFolder, filename);
                
                try {
                    await downloadImage(imageUrl, savePath);
                    console.log(`    ✅ Downloaded: ${filename}`);
                    
                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (err) {
                    console.error(`    ❌ Failed to download ${filename}:`, err.message);
                }
            }
            
        } catch (error) {
            console.error(`  ❌ Error processing ${plant.name}:`, error.message);
        }
    }
    
    console.log('\n✅ Image fetching complete!');
}

// Helper functions for API calls (implementations needed)
async function searchUnsplash(query, count) {
    // TODO: Implement Unsplash API call
    return [];
}

async function searchPixabay(query, count) {
    // TODO: Implement Pixabay API call
    return [];
}

async function searchPexels(query, count) {
    // TODO: Implement Pexels API call
    return [];
}

// Run if called directly
if (require.main === module) {
    fetchAllPlantImages().catch(console.error);
}

module.exports = { fetchAllPlantImages, generateSearchTerms, searchImages };

