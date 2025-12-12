// Manual Image Selection Tool - Streamlined Workflow
// Fetches candidate images and displays them for manual selection
// Much faster than AI validation - you pick the best ones!

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const cheerio = require('cheerio');

// Helper function to get Windows environment variable from registry
function getWindowsEnvVar(varName) {
    try {
        // Try to read from User environment variables in registry
        const result = execSync(
            `powershell -Command "[System.Environment]::GetEnvironmentVariable('${varName}', 'User')"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        return result.trim() || null;
    } catch (err) {
        return null;
    }
}

// Global state for multi-plant processing
let currentPlantIndex = -1;
let plantsToProcess = [];
let currentServer = null;
let currentTempFile = null;
let currentPlantData = null;

const CONFIG = {
    imagesPerPlant: 999, // No limit - select as many as you want
    outputDir: path.join(__dirname, '..', 'images'),
    
    // Image sources - try environment variable first, then Windows registry
    pexelsApiKey: process.env.PEXELS_API_KEY || getWindowsEnvVar('PEXELS_API_KEY') || '',
    pixabayApiKey: process.env.PIXABAY_API_KEY || getWindowsEnvVar('PIXABAY_API_KEY') || '',
    googleApiKey: process.env.GOOGLE_API_KEY || getWindowsEnvVar('GOOGLE_API_KEY') || '',
    googleCseId: process.env.GOOGLE_CSE_ID || getWindowsEnvVar('GOOGLE_CSE_ID') || '',
    
    // Manual selection settings - organized by source groups
    imagesPerGroup: 10, // Up to 10 images per source group
    groups: [
        { name: 'GBIF', source: 'gbif', priority: 1 },
        { name: 'Wikipedia', source: 'wikipedia', priority: 2 },
        { name: 'Google', source: 'google', priority: 3 },
        { name: 'Pexels', source: 'pexels', priority: 4 },
        { name: 'Pixabay', source: 'pixabay', priority: 5 },
        { name: 'Little Prince', source: 'littleprince', priority: 6 }
    ],
    thumbnailSize: 'medium', // Use medium thumbnails for faster loading
};

// Import search functions from main script
const { searchGBIFImages, searchPexels, searchGoogleImages, searchWikipediaImages, scientificNameToSlug } = require('./fetch-images-local-ai.js');

/**
 * Search Little Prince Plants website for images
 */
async function searchLittlePrince(query, count = 10) {
    try {
        // Search URL format: https://littleprinceplants.com/?s={query}&post_type=product
        const searchUrl = `https://littleprinceplants.com/?s=${encodeURIComponent(query)}&post_type=product`;
        
        console.log(`    [DEBUG] Little Prince: Searching for "${query}"`);
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        const images = [];
        const seenUrls = new Set();
        
        // Find product links from search results
        const productLinks = [];
        $('a[href*="/our-plants/"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && href.includes('/our-plants/') && !productLinks.includes(href)) {
                productLinks.push(href);
            }
        });
        
        // Limit to first few products to avoid too many requests
        const productsToCheck = productLinks.slice(0, Math.min(5, Math.ceil(count / 3)));
        
        console.log(`    [DEBUG] Little Prince: Found ${productLinks.length} products, checking ${productsToCheck.length} for images`);
        
        // Visit each product page to get gallery images
        for (const productUrl of productsToCheck) {
            try {
                const productResponse = await axios.get(productUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                });
                
                const $product = cheerio.load(productResponse.data);
                
                // Find all images in the product gallery
                $product('img[src*="wp-content/uploads"]').each((i, elem) => {
                    const imgSrc = $product(elem).attr('src');
                    if (imgSrc && !seenUrls.has(imgSrc)) {
                        // Get full-size image URL (remove size suffixes like -150x150, -300x300, etc.)
                        const fullSizeUrl = imgSrc.replace(/-\d+x\d+\.(jpg|jpeg|png|gif|webp)/i, '.$1')
                                                 .replace(/-\d+x\d+\.(jpg|jpeg|png|gif|webp)/i, '.$1'); // Remove multiple size suffixes
                        
                        // Skip placeholder images
                        if (!fullSizeUrl.includes('placeholder') && 
                            !fullSizeUrl.includes('coming-soon') &&
                            !fullSizeUrl.includes('no-image')) {
                            seenUrls.add(fullSizeUrl);
                            images.push({
                                url: fullSizeUrl,
                                thumbnail: imgSrc,
                                source: 'littleprince',
                                id: `littleprince-${images.length}`,
                                title: $product(elem).attr('alt') || 'Little Prince Plants'
                            });
                            
                            if (images.length >= count) return false; // Stop if we have enough
                        }
                    }
                });
                
                if (images.length >= count) break;
            } catch (err) {
                // Skip if individual product page fails
                continue;
            }
        }
        
        console.log(`    [DEBUG] Little Prince: Found ${images.length} images`);
        return images.slice(0, count);
        
    } catch (err) {
        console.log(`    [DEBUG] Little Prince API error: ${err.message}`);
        return [];
    }
}

/**
 * Search Pixabay API
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
                per_page: Math.min(count, 200),
                safesearch: 'true'
            },
            timeout: 10000
        });
        
        const hits = response.data.hits || [];
        return hits.map(hit => ({
            url: hit.largeImageURL || hit.webformatURL,
            thumbnail: hit.previewURL || hit.webformatURL,
            source: 'pixabay',
            id: hit.id,
            photographer: hit.user,
            width: hit.imageWidth,
            height: hit.imageHeight
        }));
    } catch (err) {
        if (err.response?.status === 401) {
            console.warn(`    ⚠️ Pixabay API key invalid`);
        } else if (err.response?.status === 429) {
            console.warn(`    ⚠️ Pixabay API rate limit`);
        } else {
            console.warn(`    ⚠️ Pixabay API error: ${err.message}`);
            if (err.response?.data) {
                console.warn(`    Response: ${JSON.stringify(err.response.data)}`);
            }
        }
        return [];
    }
}

/**
 * Generate HTML viewer for manual image selection - organized by source groups
 */
function generateSelectionHTML(plant, imageGroups, port = 3001, plantIndex = 0, totalPlants = 1) {
    const plantSlug = scientificNameToSlug(plant.scientificName) || plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    // Flatten all images for selection tracking
    const allImages = [];
    imageGroups.forEach(group => {
        group.images.forEach(img => {
            allImages.push({ ...img, groupName: group.name });
        });
    });
    
    const hasMorePlants = plantIndex < totalPlants - 1;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Select Images: ${plant.name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a1a;
            color: #fff;
            padding: 20px;
        }
        .header {
            background: #2a2a2a;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        h1 { font-size: 24px; margin-bottom: 8px; }
        .scientific { color: #888; font-size: 16px; }
        .stats {
            display: flex;
            gap: 20px;
            margin-top: 12px;
            font-size: 14px;
        }
        .group {
            margin-bottom: 40px;
        }
        .group-header {
            background: #2a2a2a;
            padding: 16px 20px;
            border-radius: 8px 8px 0 0;
            border-bottom: 2px solid #3a3a3a;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .group-title {
            font-size: 18px;
            font-weight: 600;
            color: #4CAF50;
        }
        .group-count {
            font-size: 14px;
            color: #888;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 12px;
            padding: 16px;
            background: #2a2a2a;
            border-radius: 0 0 8px 8px;
        }
        .image-card {
            background: #1a1a1a;
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
            transition: all 0.2s;
            border: 2px solid transparent;
        }
        .image-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .image-card.selected {
            border-color: #4CAF50;
            box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.3);
        }
        .image-card img {
            width: 100%;
            height: 180px;
            object-fit: cover;
            display: block;
        }
        .image-info {
            padding: 10px;
            font-size: 11px;
        }
        .actions {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #2a2a2a;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            z-index: 1000;
        }
        .selected-count {
            margin-bottom: 12px;
            font-size: 14px;
            color: #888;
        }
        .selected-count strong {
            color: #4CAF50;
            font-size: 18px;
        }
        button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: background 0.2s;
        }
        button:hover {
            background: #45a049;
        }
        button:disabled {
            background: #555;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${plant.name}</h1>
        <div class="scientific">${plant.scientificName}</div>
        <div class="stats">
            <span>📸 ${allImages.length} total candidates</span>
            <span>🎯 Select images (no limit)</span>
        </div>
    </div>
    
    ${imageGroups.map((group, groupIdx) => {
        const isEmpty = group.images.length === 0;
        const noApi = !group.hasApi;
        return `
        <div class="group">
            <div class="group-header">
                <div class="group-title">${group.name}${noApi ? ' (API not configured)' : ''}</div>
                <div class="group-count">${isEmpty ? (noApi ? 'No API key' : 'No images found') : group.images.length + ' images'}</div>
            </div>
            ${isEmpty ? `
            <div style="padding: 40px; text-align: center; background: #2a2a2a; border-radius: 0 0 8px 8px; color: #888;">
                ${noApi ? '⚠️ API key not configured' : 'No images found for this source'}
            </div>
            ` : `
            <div class="grid">
                ${group.images.map((img, idx) => {
                    const globalIdx = imageGroups.slice(0, groupIdx).reduce((sum, g) => sum + g.images.length, 0) + idx;
                    return `
                        <div class="image-card" data-index="${globalIdx}" onclick="toggleSelect(${globalIdx})">
                            <img src="${img.thumbnail || img.url}" alt="${img.source}" loading="lazy" 
                                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22180%22 height=%22180%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23222%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23999%22 font-size=%2212%22%3EFailed to load%3C/text%3E%3C/svg%3E'; this.style.opacity='0.5';"
                                 onload="this.style.opacity='1';"
                                 style="opacity: 0; transition: opacity 0.3s;">
                            <div class="image-info">
                                <div style="color: #4CAF50; font-weight: 600;">${img.source}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            `}
        </div>
    `;
    }).join('')}
    
    <div class="actions">
        <div class="selected-count">
            Selected: <strong id="selectedCount">0</strong>
        </div>
        <button id="downloadBtn" onclick="downloadSelected()" disabled>Download Selected</button>
    </div>
    
    <script>
        const images = ${JSON.stringify(allImages)};
        const plantSlug = ${JSON.stringify(plantSlug)};
        const port = ${port};
        const currentPlantIndex = ${plantIndex};
        const totalPlants = ${totalPlants};
        const hasMorePlants = ${hasMorePlants};
        let selected = [];
        
        function toggleSelect(idx) {
            const card = document.querySelector(\`[data-index="\${idx}"]\`);
            const isSelected = selected.includes(idx);
            
            if (isSelected) {
                selected = selected.filter(i => i !== idx);
                card.classList.remove('selected');
            } else {
                selected.push(idx);
                card.classList.add('selected');
            }
            
            updateUI();
        }
        
        function updateUI() {
            document.getElementById('selectedCount').textContent = selected.length;
            document.getElementById('downloadBtn').disabled = selected.length === 0;
        }
        
        async function downloadSelected() {
            if (selected.length === 0) return;
            
            const selectedImages = selected.map(idx => images[idx]);
            const data = {
                plantSlug: plantSlug,
                images: selectedImages.map(img => ({
                    url: img.url,
                    source: img.source
                }))
            };
            
            // Show loading
            const btn = document.getElementById('downloadBtn');
            btn.disabled = true;
            btn.textContent = 'Downloading...';
            
            // Send to server
            try {
                const response = await fetch(\`http://localhost:\${port}/download\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                    mode: 'cors'
                });
                
                if (!response.ok) {
                    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                }
                
                const result = await response.json();
                if (result.success) {
                    // Call /next to update HTML for next plant
                    const nextResponse = await fetch(\`http://localhost:\${port}/next\`, { 
                        method: 'POST', 
                        mode: 'cors' 
                    });
                    
                    if (nextResponse.ok) {
                        const nextResult = await nextResponse.json();
                        // If update was successful, always reload to show the next plant
                        // The reloaded page will have the correct hasMorePlants value
                        if (nextResult.success) {
                            // Always reload if update was successful (to show the next plant)
                            setTimeout(() => {
                                window.location.reload();
                            }, 500);
                        } else {
                            // Update failed - only show "All Done" if we're already on the last plant
                            // Otherwise try reload anyway (might be a transient error)
                            if (!hasMorePlants) {
                                // We're on the last plant and update failed - truly done
                                document.body.innerHTML = '<div style="padding: 40px; text-align: center; background: #2a2a2a; color: #fff; font-family: sans-serif;"><h1>✅ All Done!</h1><p>All plants have been processed.</p><p>You can close this window.</p></div>';
                            } else {
                                // Should have more but update failed, try reload anyway
                                setTimeout(() => {
                                    window.location.reload();
                                }, 500);
                            }
                        }
                    } else {
                        // If /next fails, only show "All Done" if we're on the last plant
                        if (!hasMorePlants) {
                            document.body.innerHTML = '<div style="padding: 40px; text-align: center; background: #2a2a2a; color: #fff; font-family: sans-serif;"><h1>✅ All Done!</h1><p>All plants have been processed.</p><p>You can close this window.</p></div>';
                        } else {
                            // Should have more, try reload anyway
                            setTimeout(() => {
                                window.location.reload();
                            }, 500);
                        }
                    }
                } else {
                    alert(\`❌ Download failed: \${result.error || 'Unknown error'}\`);
                    btn.disabled = false;
                    btn.textContent = 'Download Selected';
                }
            } catch (err) {
                alert(\`❌ Download failed: \${err.message}\\n\\nMake sure the server is running.\\nCheck console for details.\`);
                console.error('Download error:', err);
                btn.disabled = false;
                btn.textContent = 'Download Selected';
            }
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && selected.length > 0) {
                downloadSelected();
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Start simple HTTP server for image selection
 */
async function startServer(downloadCallback) {
    const http = require('http');
    const net = require('net');
    
    // Find available port
    function findAvailablePort(startPort) {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.listen(startPort, () => {
                const port = server.address().port;
                server.close(() => resolve(port));
            });
            server.on('error', () => {
                // Try next port
                findAvailablePort(startPort + 1).then(resolve).catch(reject);
            });
        });
    }
    
    return findAvailablePort(3001).then(port => {
        const server = http.createServer(async (req, res) => {
            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }
            
            if (req.method === 'POST' && req.url === '/download') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const data = JSON.parse(body);
                        await downloadCallback(data.plantSlug, data.images);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: err.message }));
                    }
                });
            } else if (req.method === 'POST' && req.url === '/next') {
                // Signal to move to next plant
                // Update HTML for next plant first, then respond
                try {
                    const updated = await updateHTMLForNextPlant();
                    // Check if there are more plants AFTER the one we just updated to
                    const hasMoreAfterUpdate = currentPlantIndex < plantsToProcess.length - 1;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: updated, hasMore: hasMoreAfterUpdate }));
                    
                    if (downloadCallback.onNext) {
                        downloadCallback.onNext();
                    }
                } catch (err) {
                    console.error('Error updating HTML:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message, hasMore: false }));
                }
            } else if (req.method === 'GET' && req.url === '/') {
                // Serve the current HTML file
                try {
                    const html = await fs.readFile(currentTempFile || path.join(__dirname, '..', 'temp-selection.html'), 'utf-8');
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(html);
                } catch (err) {
                    res.writeHead(404);
                    res.end('Not found');
                }
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        
        return new Promise((resolve, reject) => {
            server.listen(port, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`  🌐 Selection server running on http://localhost:${port}`);
                    resolve({ server, port });
                }
            });
        });
    });
}

/**
 * Open URL or file in browser
 */
function openInBrowser(urlOrPath) {
    const platform = process.platform;
    let command;
    
    if (platform === 'win32') {
        // Handle both file paths and URLs
        if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
            command = `start "" "${urlOrPath}"`;
        } else {
            command = `start "" "${urlOrPath}"`;
        }
    } else if (platform === 'darwin') {
        command = `open "${urlOrPath}"`;
    } else {
        command = `xdg-open "${urlOrPath}"`;
    }
    
    require('child_process').exec(command);
}

/**
 * Download selected images
 */
async function downloadSelectedImages(plantSlug, selectedImages) {
    const plantFolder = path.join(CONFIG.outputDir, plantSlug);
    await fs.mkdir(plantFolder, { recursive: true });
    
    for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        const filename = `${plantSlug}-${i + 1}.jpg`;
        const savePath = path.join(plantFolder, filename);
        
        try {
            const response = await axios.get(img.url, {
                responseType: 'stream',
                timeout: 30000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            const writer = require('fs').createWriteStream(savePath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            console.log(`    ✅ ${filename} (from ${img.source})`);
        } catch (err) {
            console.error(`    ❌ Failed to download ${filename}: ${err.message}`);
            throw err;
        }
    }
}

/**
 * Manual selection workflow for a single plant - organized by source groups
 * Can be called multiple times to process plants sequentially
 */
async function manualSelectForPlant(plant, plantIndex = 0, totalPlants = 1) {
    console.log(`\n🌱 ${plant.name} (${plant.scientificName})`);
    
    // Fetch images from each source group separately
    console.log(`  🔍 Fetching images from ${CONFIG.groups.length} sources...`);
    const imageGroups = [];
    
    for (const group of CONFIG.groups) {
        let images = [];
        
        try {
            switch (group.source) {
                case 'gbif':
                    // GBIF: Only use scientific name (Latin name) - never common names
                    if (plant.scientificName) {
                        images = await searchGBIFImages(plant.scientificName, CONFIG.imagesPerGroup);
                        console.log(`    ${group.name}: ${images.length} images (searched: "${plant.scientificName}")`);
                    } else {
                        console.log(`    ${group.name}: No scientific name available`);
                    }
                    break;
                    
                case 'wikipedia':
                    // Wikipedia: Use scientific name in Wikipedia format (Genus_species with underscores)
                    if (plant.scientificName) {
                        images = await searchWikipediaImages(plant.scientificName, CONFIG.imagesPerGroup);
                        console.log(`    ${group.name}: ${images.length} images (searched: "${plant.scientificName}")`);
                    } else {
                        console.log(`    ${group.name}: No scientific name available`);
                    }
                    break;
                    
                case 'google':
                    if (CONFIG.googleApiKey && CONFIG.googleCseId) {
                        images = await searchGoogleImages(plant.scientificName, CONFIG.imagesPerGroup);
                        console.log(`    ${group.name}: ${images.length} images`);
                    } else {
                        console.log(`    ${group.name}: API not configured`);
                    }
                    break;
                    
                case 'pexels':
                    if (CONFIG.pexelsApiKey) {
                        // Try both scientific name and common name for better results
                        const searchQueries = [plant.scientificName];
                        if (plant.name && plant.name !== plant.scientificName) {
                            searchQueries.push(plant.name);
                        }
                        
                        // Search with both queries and combine results
                        const allPexelsImages = [];
                        for (const searchQuery of searchQueries) {
                            if (searchQuery) {
                                const pexelsResults = await searchPexels(searchQuery, CONFIG.imagesPerGroup);
                                allPexelsImages.push(...pexelsResults);
                            }
                        }
                        
                        // Remove duplicates by URL
                        const seenUrls = new Set();
                        images = allPexelsImages.filter(img => {
                            if (seenUrls.has(img.url)) return false;
                            seenUrls.add(img.url);
                            return true;
                        }).slice(0, CONFIG.imagesPerGroup);
                        
                        // Ensure thumbnails exist
                        images = images.map(img => ({
                            ...img,
                            thumbnail: img.thumbnail || img.url.replace('/original', '/medium')
                        }));
                        console.log(`    ${group.name}: ${images.length} images`);
                    } else {
                        console.log(`    ${group.name}: API not configured`);
                    }
                    break;
                    
                case 'pixabay':
                    if (CONFIG.pixabayApiKey) {
                        images = await searchPixabay(plant.scientificName, CONFIG.imagesPerGroup);
                        console.log(`    ${group.name}: ${images.length} images`);
                    } else {
                        console.log(`    ${group.name}: API not configured`);
                        console.log(`    💡 Tip: Set PIXABAY_API_KEY environment variable and restart terminal`);
                    }
                    break;
                    
                case 'littleprince':
                    // Try both scientific name and common name
                    const littlePrinceQueries = [];
                    if (plant.scientificName) {
                        littlePrinceQueries.push(plant.scientificName);
                    }
                    if (plant.name && plant.name !== plant.scientificName) {
                        littlePrinceQueries.push(plant.name);
                    }
                    
                    // Search with all queries and combine results
                    const allLittlePrinceImages = [];
                    for (const searchQuery of littlePrinceQueries) {
                        if (searchQuery) {
                            const results = await searchLittlePrince(searchQuery, CONFIG.imagesPerGroup);
                            allLittlePrinceImages.push(...results);
                        }
                    }
                    
                    // Remove duplicates by URL
                    const seenLittlePrinceUrls = new Set();
                    images = allLittlePrinceImages.filter(img => {
                        if (seenLittlePrinceUrls.has(img.url)) return false;
                        seenLittlePrinceUrls.add(img.url);
                        return true;
                    }).slice(0, CONFIG.imagesPerGroup);
                    console.log(`    ${group.name}: ${images.length} images`);
                    break;
            }
            
            // Limit to max per group and remove duplicates
            const seen = new Set();
            const uniqueImages = [];
            for (const img of images.slice(0, CONFIG.imagesPerGroup)) {
                if (!seen.has(img.url)) {
                    seen.add(img.url);
                    uniqueImages.push(img);
                }
            }
            
            // Always add group, even if empty (so user can see which sources were checked)
            imageGroups.push({
                name: group.name,
                source: group.source,
                priority: group.priority,
                images: uniqueImages,
                hasApi: group.source === 'gbif' || group.source === 'wikipedia' || 
                       (group.source === 'google' && CONFIG.googleApiKey && CONFIG.googleCseId) ||
                       (group.source === 'pexels' && CONFIG.pexelsApiKey) ||
                       (group.source === 'pixabay' && CONFIG.pixabayApiKey) ||
                       group.source === 'littleprince'
            });
        } catch (err) {
            console.warn(`    ⚠️ ${group.name}: Error - ${err.message}`);
        }
    }
    
    // Sort groups by priority
    imageGroups.sort((a, b) => a.priority - b.priority);
    
    const totalImages = imageGroups.reduce((sum, g) => sum + g.images.length, 0);
    console.log(`  ✅ Found ${totalImages} total images across ${imageGroups.length} sources`);
    
    if (totalImages === 0) {
        console.warn(`  ⚠️ No images found`);
        return 0;
    }
    
    // Store current plant data
    currentPlantData = { plant, imageGroups };
    currentPlantIndex = plantIndex;
    
    // Generate HTML viewer (will update with port after server starts)
    let html = generateSelectionHTML(plant, imageGroups, 3001); // Placeholder port
    const tempFile = path.join(__dirname, '..', 'temp-selection.html');
    currentTempFile = tempFile;
    
    // Wait for user to select (server handles download)
    return new Promise((resolve) => {
        // Handle next plant signal
        const downloadHandler = async (plantSlug, images) => {
            await downloadSelectedImages(plantSlug, images);
        };
        
        // Create callback with onNext handler
        const callbackWrapper = async (plantSlug, images) => {
            await downloadHandler(plantSlug, images);
        };
        callbackWrapper.onNext = async () => {
            console.log('\n  ✅ Download complete! Moving to next plant...\n');
            // Don't resolve immediately - server should stay open
            // Only resolve if there are no more plants
            if (currentPlantIndex >= plantsToProcess.length - 1) {
                // Last plant - wait a bit then resolve
                setTimeout(() => {
                    resolve(1);
                }, 2000);
            }
        };
        
        // Start or reuse server
        if (!currentServer) {
            // First plant - start new server
            startServer(callbackWrapper).then(({ server: serverInstance, port: serverPort }) => {
                currentServer = { server: serverInstance, port: serverPort, callback: callbackWrapper };
                
                // Update HTML with correct port
                html = generateSelectionHTML(plant, imageGroups, serverPort, plantIndex, totalPlants);
                fs.writeFile(tempFile, html).then(() => {
                    // Open in browser only for first plant - use HTTP server URL
                    if (plantIndex === 0) {
                        console.log(`  🌐 Opening selection viewer in browser...`);
                        console.log(`  💡 Select images from any group (no limit) and click "Download Selected"`);
                        console.log(`  💡 After download, page will refresh to show next plant`);
                        // Open browser to HTTP server instead of file://
                        const serverUrl = `http://localhost:${serverPort}/`;
                        openInBrowser(serverUrl);
                    }
                });
                
                console.log('\n  ⏳ Waiting for selection...');
                console.log('  💡 Press Ctrl+C to cancel\n');
                
                // Handle graceful shutdown
                process.on('SIGINT', () => {
                    console.log('\n\n  👋 Closing server...');
                    if (currentServer && currentServer.server) {
                        currentServer.server.close();
                    }
                    fs.unlink(tempFile).catch(() => {});
                    resolve(0);
                    process.exit(0);
                });
            });
        } else {
            // Subsequent plants - update HTML file
            const serverPort = currentServer.port;
            html = generateSelectionHTML(plant, imageGroups, serverPort, plantIndex, totalPlants);
            fs.writeFile(tempFile, html).then(() => {
                console.log(`  🔄 Updated page with next plant: ${plant.name} (${plantIndex + 1}/${totalPlants})`);
            });
            
            // Update server callback
            currentServer.callback = callbackWrapper;
            resolve(1); // Already waiting
        }
    });
}

async function updateHTMLForNextPlant() {
    if (currentPlantIndex >= 0 && currentPlantIndex < plantsToProcess.length - 1) {
        const nextIndex = currentPlantIndex + 1;
        const nextPlant = plantsToProcess[nextIndex];
        
        // Fetch images for next plant
        console.log(`\n🌱 ${nextPlant.name} (${nextPlant.scientificName})`);
        console.log(`  🔍 Fetching images from ${CONFIG.groups.length} sources...`);
        const imageGroups = [];
        
        for (const group of CONFIG.groups) {
            let images = [];
            try {
                switch (group.source) {
                    case 'gbif':
                        if (nextPlant.scientificName) {
                            images = await searchGBIFImages(nextPlant.scientificName, CONFIG.imagesPerGroup);
                        }
                        break;
                    case 'wikipedia':
                        if (nextPlant.scientificName) {
                            images = await searchWikipediaImages(nextPlant.scientificName, CONFIG.imagesPerGroup);
                        }
                        break;
                    case 'google':
                        if (CONFIG.googleApiKey && CONFIG.googleCseId) {
                            images = await searchGoogleImages(nextPlant.scientificName, CONFIG.imagesPerGroup);
                        }
                        break;
                    case 'pexels':
                        if (CONFIG.pexelsApiKey) {
                            // Try both scientific name and common name for better results
                            const searchQueries = [nextPlant.scientificName];
                            if (nextPlant.name && nextPlant.name !== nextPlant.scientificName) {
                                searchQueries.push(nextPlant.name);
                            }
                            
                            // Search with both queries and combine results
                            const allPexelsImages = [];
                            for (const searchQuery of searchQueries) {
                                if (searchQuery) {
                                    const pexelsResults = await searchPexels(searchQuery, CONFIG.imagesPerGroup);
                                    allPexelsImages.push(...pexelsResults);
                                }
                            }
                            
                            // Remove duplicates by URL
                            const seenUrls = new Set();
                            images = allPexelsImages.filter(img => {
                                if (seenUrls.has(img.url)) return false;
                                seenUrls.add(img.url);
                                return true;
                            }).slice(0, CONFIG.imagesPerGroup);
                            
                            images = images.map(img => ({
                                ...img,
                                thumbnail: img.thumbnail || img.url.replace('/original', '/medium')
                            }));
                        }
                        break;
                    case 'pixabay':
                        if (CONFIG.pixabayApiKey) {
                            images = await searchPixabay(nextPlant.scientificName, CONFIG.imagesPerGroup);
                        }
                        break;
                    case 'littleprince':
                        // Try both scientific name and common name
                        const searchQueries = [];
                        if (nextPlant.scientificName) {
                            searchQueries.push(nextPlant.scientificName);
                        }
                        if (nextPlant.name && nextPlant.name !== nextPlant.scientificName) {
                            searchQueries.push(nextPlant.name);
                        }
                        
                        // Search with all queries and combine results
                        const allLittlePrinceImages = [];
                        for (const searchQuery of searchQueries) {
                            if (searchQuery) {
                                const results = await searchLittlePrince(searchQuery, CONFIG.imagesPerGroup);
                                allLittlePrinceImages.push(...results);
                            }
                        }
                        
                        // Remove duplicates by URL
                        const seenLittlePrinceUrls = new Set();
                        images = allLittlePrinceImages.filter(img => {
                            if (seenLittlePrinceUrls.has(img.url)) return false;
                            seenLittlePrinceUrls.add(img.url);
                            return true;
                        }).slice(0, CONFIG.imagesPerGroup);
                        break;
                }
                
                const seen = new Set();
                const uniqueImages = [];
                for (const img of images.slice(0, CONFIG.imagesPerGroup)) {
                    if (!seen.has(img.url)) {
                        seen.add(img.url);
                        uniqueImages.push(img);
                    }
                }
                
                imageGroups.push({
                    name: group.name,
                    source: group.source,
                    priority: group.priority,
                    images: uniqueImages,
                    hasApi: group.source === 'gbif' || group.source === 'wikipedia' || 
                           (group.source === 'google' && CONFIG.googleApiKey && CONFIG.googleCseId) ||
                           (group.source === 'pexels' && CONFIG.pexelsApiKey) ||
                           (group.source === 'pixabay' && CONFIG.pixabayApiKey) ||
                           group.source === 'littleprince'
                });
            } catch (err) {
                console.warn(`    ⚠️ ${group.name}: Error - ${err.message}`);
            }
        }
        
        imageGroups.sort((a, b) => a.priority - b.priority);
        const totalImages = imageGroups.reduce((sum, g) => sum + g.images.length, 0);
        console.log(`  ✅ Found ${totalImages} total images`);
        
        if (totalImages > 0 && currentServer && currentTempFile) {
            const html = generateSelectionHTML(nextPlant, imageGroups, currentServer.port, nextIndex, plantsToProcess.length);
            // Ensure file is fully written before continuing
            await fs.writeFile(currentTempFile, html, 'utf-8');
            // Verify file was written by reading it back
            await fs.access(currentTempFile);
            currentPlantData = { plant: nextPlant, imageGroups };
            currentPlantIndex = nextIndex;
            console.log(`  ✅ HTML updated for next plant: ${nextPlant.name} (${nextIndex + 1}/${plantsToProcess.length})`);
            
            // Return true if we successfully updated to a plant (meaning browser should reload to show it)
            // We return true even if this is the last plant, because the browser needs to reload to show it
            // The reloaded page will have hasMorePlants=false, and when the user downloads from that page,
            // the /next call will return success=false, which will then show "All Done!"
            return true;
        } else if (totalImages === 0 && nextIndex < plantsToProcess.length - 1) {
            // No images for this plant, try next one
            console.log(`  ⚠️ No images found for ${nextPlant.name}, skipping...`);
            currentPlantIndex = nextIndex;
            return await updateHTMLForNextPlant();
        } else {
            console.log(`  ℹ️ All plants processed.`);
            return false;
        }
    } else {
        console.log(`  ℹ️ All plants processed.`);
        return false;
    }
}

/**
 * Main function - processes plants sequentially
 */
async function main() {
    const args = process.argv.slice(2);
    let foundPlants = [];
    
    const { loadAllPlants } = require('./fetch-images-local-ai.js');
    const allPlants = await loadAllPlants();
    
    if (args.length === 0) {
        // No arguments - process all plants
        foundPlants = allPlants;
        console.log(`📸 Manual Image Selection Tool`);
        console.log(`🌱 Processing ALL ${foundPlants.length} plants...\n`);
    } else {
        // Check if first argument is a plant name/ID to start from
        const startPlant = args[0].toLowerCase();
        const startIdx = allPlants.findIndex(p => 
            p.name.toLowerCase().includes(startPlant) || 
            p.scientificName.toLowerCase().includes(startPlant) ||
            p.id?.toString() === startPlant
        );
        
        if (startIdx >= 0) {
            // Start from this plant and continue with all remaining plants
            foundPlants = allPlants.slice(startIdx);
            console.log(`📸 Manual Image Selection Tool`);
            console.log(`🌱 Starting from plant ${startIdx + 1}/${allPlants.length}: ${foundPlants[0].name}`);
            console.log(`🌱 Processing ${foundPlants.length} remaining plant(s)...\n`);
        } else {
            // Filter by provided names/IDs
            for (const filter of args) {
                let plant;
                if (!isNaN(filter)) {
                    plant = allPlants.find(p => p.id === parseInt(filter));
                } else {
                    plant = allPlants.find(p => 
                        p.name.toLowerCase().includes(filter.toLowerCase()) ||
                        p.scientificName.toLowerCase().includes(filter.toLowerCase())
                    );
                }
                
                if (plant) {
                    foundPlants.push(plant);
                } else {
                    console.warn(`⚠️ Plant not found: ${filter}`);
                }
            }
            
            if (foundPlants.length === 0) {
                console.error(`❌ No plants found to process`);
                console.log('Usage: node scripts/manual-image-select.js [plant-name-or-id] [plant2] [plant3] ...');
                console.log('Or: node scripts/manual-image-select.js  (processes all plants)');
                console.log('Or: node scripts/manual-image-select.js "plant-name" (starts from this plant and continues with all remaining)');
                process.exit(1);
            }
            
            console.log(`📸 Manual Image Selection Tool`);
            console.log(`🌱 Processing ${foundPlants.length} plant(s)...\n`);
        }
    }
    
    // Store plants globally for sequential processing
    // Update the global variable
    while (plantsToProcess.length > 0) plantsToProcess.pop();
    foundPlants.forEach(p => plantsToProcess.push(p));
    
    // Process first plant (will trigger browser)
    const firstPlant = foundPlants[0];
    const startIndex = args.length > 0 ? allPlants.findIndex(p => p.id === firstPlant.id) : 0;
    const totalPlants = allPlants.length;
    console.log(`\n[${startIndex + 1}/${totalPlants}] Processing: ${firstPlant.name}`);
    
    await manualSelectForPlant(firstPlant, 0, foundPlants.length);
    
    // Keep server running - don't exit until user stops or all plants done
    console.log(`\n⏳ Server running. Processing remaining plants as you download...`);
    console.log(`💡 Press Ctrl+C to stop the server\n`);
    
    // Keep process alive - server handles remaining plants via /next endpoint
    await new Promise((resolve) => {
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n\n  👋 Closing server...');
            if (currentServer && currentServer.server) {
                currentServer.server.close();
            }
            if (currentTempFile) {
                fs.unlink(currentTempFile).catch(() => {});
            }
            resolve();
            process.exit(0);
        });
    });
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { manualSelectForPlant };

