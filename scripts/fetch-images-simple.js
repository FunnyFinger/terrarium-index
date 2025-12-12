// Simple Automated Image Fetcher
// Uses free image APIs with smart search terms
// No AI required - simpler and faster approach

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG = {
    imagesPerPlant: 3,
    outputDir: path.join(__dirname, '..', 'images'),
    
    // Optional: Add API keys for better results (free tier available)
    unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || '',
    pixabayApiKey: process.env.PIXABAY_API_KEY || '',
    pexelsApiKey: process.env.PEXELS_API_KEY || ''
};

/**
 * Generate smart search terms for a plant
 */
function generateSearchTerms(plant) {
    const terms = [];
    
    // Primary searches
    terms.push(plant.scientificName);
    terms.push(`${plant.scientificName} plant`);
    terms.push(`${plant.name} plant`);
    
    // Context-specific
    if (plant.type && plant.type.includes('terrarium')) {
        terms.push(`${plant.name} terrarium`);
        terms.push(`${plant.scientificName} terrarium`);
    }
    if (plant.type && plant.type.includes('aquarium')) {
        terms.push(`${plant.name} aquarium`);
        terms.push(`${plant.scientificName} aquatic`);
    }
    
    // Feature-based
    terms.push(`${plant.name} close up`);
    terms.push(`${plant.name} leaves`);
    terms.push(`${plant.scientificName} foliage`);
    
    return [...new Set(terms)]; // Remove duplicates
}

/**
 * Search Pexels API (free, generous limits)
 */
async function searchPexels(query, count = 10) {
    if (!CONFIG.pexelsApiKey) {
        return [];
    }
    
    try {
        const response = await axios.get('https://api.pexels.com/v1/search', {
            params: {
                query: query,
                per_page: count,
                orientation: 'landscape'
            },
            headers: {
                'Authorization': CONFIG.pexelsApiKey
            }
        });
        
        return response.data.photos.map(photo => ({
            url: photo.src.large,
            thumbnail: photo.src.medium,
            photographer: photo.photographer,
            source: 'pexels',
            id: photo.id,
            likes: 0 // Pexels doesn't provide likes
        }));
    } catch (err) {
        if (err.response?.status !== 401) {
            console.warn(`  ⚠️ Pexels search failed: ${err.message}`);
        }
        return [];
    }
}

/**
 * Search Pixabay API (free)
 */
async function searchPixabay(query, count = 10) {
    if (!CONFIG.pixabayApiKey) {
        return [];
    }
    
    try {
        const response = await axios.get('https://pixabay.com/api/', {
            params: {
                key: CONFIG.pixabayApiKey,
                q: query,
                image_type: 'photo',
                orientation: 'horizontal',
                category: 'nature',
                per_page: count,
                safesearch: 'true'
            }
        });
        
        return response.data.hits.map(hit => ({
            url: hit.largeImageURL || hit.webformatURL,
            thumbnail: hit.previewURL,
            source: 'pixabay',
            id: hit.id,
            likes: hit.likes || 0
        }));
    } catch (err) {
        if (err.response?.status !== 401) {
            console.warn(`  ⚠️ Pixabay search failed: ${err.message}`);
        }
        return [];
    }
}

/**
 * Search Unsplash API
 */
async function searchUnsplash(query, count = 10) {
    if (!CONFIG.unsplashAccessKey) {
        return [];
    }
    
    try {
        const response = await axios.get('https://api.unsplash.com/search/photos', {
            params: {
                query: query,
                per_page: count,
                orientation: 'landscape'
            },
            headers: {
                'Authorization': `Client-ID ${CONFIG.unsplashAccessKey}`
            }
        });
        
        return response.data.results.map(result => ({
            url: result.urls.regular,
            thumbnail: result.urls.thumb,
            source: 'unsplash',
            id: result.id,
            likes: result.likes || 0
        }));
    } catch (err) {
        if (err.response?.status !== 401) {
            console.warn(`  ⚠️ Unsplash search failed: ${err.message}`);
        }
        return [];
    }
}

/**
 * Download image from URL
 */
async function downloadImage(imageUrl, savePath) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(imageUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const file = require('fs').createWriteStream(savePath);
        
        protocol.get(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (response) => {
            if (response.statusCode !== 200) {
                file.close();
                require('fs').unlinkSync(savePath);
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            if (require('fs').existsSync(savePath)) {
                require('fs').unlinkSync(savePath);
            }
            reject(err);
        });
    });
}

/**
 * Filter and rank images by quality indicators
 */
function rankImages(images) {
    return images
        .sort((a, b) => {
            // Prioritize by likes (if available)
            const aLikes = a.likes || 0;
            const bLikes = b.likes || 0;
            if (aLikes !== bLikes) return bLikes - aLikes;
            
            // Prefer certain sources
            const sourcePriority = { unsplash: 3, pexels: 2, pixabay: 1 };
            return (sourcePriority[b.source] || 0) - (sourcePriority[a.source] || 0);
        })
        .slice(0, CONFIG.imagesPerPlant);
}

/**
 * Process a single plant
 */
async function fetchImagesForPlant(plant) {
    console.log(`\n🌱 ${plant.name} (${plant.scientificName})`);
    
    // Generate search terms
    const searchTerms = generateSearchTerms(plant);
    console.log(`  Search terms: ${searchTerms.slice(0, 3).join(', ')}...`);
    
    // Search all APIs
    const allImages = [];
    
    for (const term of searchTerms.slice(0, 3)) {
        const [pexels, pixabay, unsplash] = await Promise.all([
            searchPexels(term, 5),
            searchPixabay(term, 5),
            searchUnsplash(term, 5)
        ]);
        
        allImages.push(...pexels, ...pixabay, ...unsplash);
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`  Found ${allImages.length} candidate images`);
    
    if (allImages.length === 0) {
        console.warn(`  ⚠️ No images found - API keys may be needed`);
        return 0;
    }
    
    // Remove duplicates by URL
    const uniqueImages = [];
    const seenUrls = new Set();
    for (const img of allImages) {
        if (!seenUrls.has(img.url)) {
            seenUrls.add(img.url);
            uniqueImages.push(img);
        }
    }
    
    // Rank and select best images
    const selectedImages = rankImages(uniqueImages);
    console.log(`  ✅ Selected ${selectedImages.length} images`);
    
    // Create plant folder
    const plantFolderName = plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const plantFolder = path.join(CONFIG.outputDir, plantFolderName);
    await fs.mkdir(plantFolder, { recursive: true });
    
    // Download images
    let successCount = 0;
    for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        const filename = `${plantFolderName}-${i + 1}.jpg`;
        const savePath = path.join(plantFolder, filename);
        
        try {
            await downloadImage(img.url, savePath);
            console.log(`    ✅ ${filename} (from ${img.source})`);
            successCount++;
            
            // Rate limiting
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            console.error(`    ❌ Failed: ${err.message}`);
        }
    }
    
    return successCount;
}

/**
 * Load all plants from JSON files
 */
async function loadAllPlants() {
    const plantsDir = path.join(__dirname, '..', 'data', 'plants');
    const categories = (await fs.readdir(plantsDir, { withFileTypes: true }))
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    const allPlants = [];
    
    for (const category of categories) {
        const categoryPath = path.join(plantsDir, category);
        const indexPath = path.join(categoryPath, 'index.json');
        
        try {
            const indexContent = await fs.readFile(indexPath, 'utf8');
            const index = JSON.parse(indexContent);
            
            for (const plantFile of index.plants || []) {
                const plantPath = path.join(categoryPath, plantFile);
                try {
                    const plantContent = await fs.readFile(plantPath, 'utf8');
                    const plant = JSON.parse(plantContent);
                    allPlants.push(plant);
                } catch (err) {
                    console.warn(`Failed to load ${plantFile}:`, err.message);
                }
            }
        } catch (err) {
            // Index file might not exist, skip
        }
    }
    
    return allPlants.sort((a, b) => a.id - b.id);
}

/**
 * Main function
 */
async function main() {
    console.log('🌿 Automated Plant Image Fetcher\n');
    
    // Check API keys
    const hasKeys = CONFIG.pexelsApiKey || CONFIG.pixabayApiKey || CONFIG.unsplashAccessKey;
    if (!hasKeys) {
        console.log('⚠️ No API keys found!');
        console.log('\nFor best results, get free API keys:');
        console.log('  1. Pexels: https://www.pexels.com/api/');
        console.log('  2. Pixabay: https://pixabay.com/api/docs/');
        console.log('  3. Unsplash: https://unsplash.com/developers\n');
        console.log('Then set them as environment variables:');
        console.log('  $env:PEXELS_API_KEY="your_key"');
        console.log('  $env:PIXABAY_API_KEY="your_key"');
        console.log('  $env:UNSPLASH_ACCESS_KEY="your_key"\n');
        console.log('Continuing without keys (may have limited results)...\n');
    }
    
    // Load plants
    const plants = await loadAllPlants();
    console.log(`📋 Found ${plants.length} plants\n`);
    
    // Optional: Process specific plants
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
    
    if (plantsToProcess.length === 0) {
        console.log('No plants found matching criteria');
        return;
    }
    
    console.log(`🎯 Processing ${plantsToProcess.length} plant(s)\n`);
    
    // Process plants
    let totalSuccess = 0;
    for (const plant of plantsToProcess) {
        const count = await fetchImagesForPlant(plant);
        totalSuccess += count;
    }
    
    console.log(`\n✅ Complete! Successfully downloaded ${totalSuccess} images`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { fetchImagesForPlant, loadAllPlants };
