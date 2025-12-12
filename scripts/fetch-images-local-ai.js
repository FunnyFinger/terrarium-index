// Local AI-Powered Image Fetcher using Ollama/Llama
// Uses local AI model (no API costs, fully private)
// Requires: Ollama installed with a vision-capable model
// OPTIMIZED: Uses thumbnail preview for 3-5x faster processing

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

const CONFIG = {
    // Ollama configuration
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    // Recommended models for RTX 4090 (24GB VRAM):
    // - llava:13b (high accuracy, ~8GB) - BEST for accuracy
    // - llava:34b (very high accuracy, ~20GB) - Maximum quality
    // - qwen2-vl:7b (fast, accurate, ~4GB)
    // - qwen2-vl:72b (very accurate, requires multiple GPUs or quantization)
    visionModel: process.env.VISION_MODEL || 'llava:13b', // Default to larger model for better accuracy
    // Fast model for thumbnail preview (smaller, faster)
    fastVisionModel: process.env.FAST_VISION_MODEL || 'llava:latest', // Smaller/faster model for thumbnails
    
    imagesPerPlant: 3,
    outputDir: path.join(__dirname, '..', 'images'),
    
    // Validation settings - can be adjusted for better results
    minScore: parseFloat(process.env.MIN_SCORE) || 7.0, // Minimum combined score (lowered from 7.5)
    minQuality: parseFloat(process.env.MIN_QUALITY) || 6.5, // Minimum quality score (lowered from 7.0)
    minAesthetic: parseFloat(process.env.MIN_AESTHETIC) || 6.5, // Minimum aesthetic score (lowered from 7.0)
    maxCandidatesToCheck: parseInt(process.env.MAX_CANDIDATES) || 80, // Increased to check more images, especially Pexels
    
    // Thumbnail preview settings (for fast initial screening) - SPEED OPTIMIZATION
    useThumbnailPreview: process.env.USE_THUMBNAIL_PREVIEW !== 'false', // Default: enabled for speed
    thumbnailPreviewBatchSize: parseInt(process.env.THUMBNAIL_BATCH_SIZE) || 5, // Process multiple thumbnails at once
    thumbnailMinScore: parseFloat(process.env.THUMBNAIL_MIN_SCORE) || 6.0, // Lower threshold for thumbnails (they're smaller, less detail)
    
    // Free image APIs (optional but recommended)
    pexelsApiKey: process.env.PEXELS_API_KEY || '',
    pixabayApiKey: process.env.PIXABAY_API_KEY || '',
    unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || '',
    // Google Custom Search (recommended for better coverage)
    googleApiKey: process.env.GOOGLE_API_KEY || '',
    googleCseId: process.env.GOOGLE_CSE_ID || ''
};

/**
 * Check if Ollama is running and model is available
 */
async function checkOllamaSetup() {
    try {
        const response = await axios.get(`${CONFIG.ollamaBaseUrl}/api/tags`);
        const models = response.data.models.map(m => m.name);
        
        console.log(`✅ Ollama is running`);
        console.log(`📦 Available models: ${models.join(', ')}`);
        
        const visionModels = models.filter(m => 
            m.includes('llava') || 
            m.includes('vision') ||
            m.includes('qwen2-vl')
        );
        
        if (visionModels.length === 0) {
            console.warn(`⚠️ No vision models found. Install one with:`);
            console.warn(`   ollama pull llava`);
            return false;
        }
        
        // Check if configured models are available
        const mainModelAvailable = models.includes(CONFIG.visionModel) || models.some(m => m.includes('llava'));
        const fastModelAvailable = models.includes(CONFIG.fastVisionModel) || models.some(m => m.includes('llava'));
        
        if (!mainModelAvailable) {
            console.warn(`⚠️ Main model "${CONFIG.visionModel}" not found, using available vision model`);
        }
        if (!fastModelAvailable && CONFIG.useThumbnailPreview) {
            console.warn(`⚠️ Fast model "${CONFIG.fastVisionModel}" not found, will use main model for thumbnails`);
        }
        
        const modelToUse = visionModels[0];
        console.log(`✅ Using model: ${modelToUse}`);
        
        if (CONFIG.useThumbnailPreview) {
            console.log(`⚡ Thumbnail preview: ENABLED (${CONFIG.thumbnailPreviewBatchSize} per batch)`);
            console.log(`   Fast model: ${CONFIG.fastVisionModel}`);
            console.log(`   Main model: ${CONFIG.visionModel}`);
        }
        
        return true;
    } catch (err) {
        console.error(`❌ Ollama not running or not accessible at ${CONFIG.ollamaBaseUrl}`);
        console.error(`   Error: ${err.message}`);
        return false;
    }
}

/**
 * Fast thumbnail preview validation - quick screening before full download
 * Uses smaller/faster model and processes thumbnails (much faster)
 * SPEED OPTIMIZATION: This is 5-10x faster than full image validation
 */
async function validateThumbnailPreview(plant, thumbnailUrl, fullUrl) {
    if (!CONFIG.useThumbnailPreview || !thumbnailUrl) {
        // Fallback: return as candidate if no thumbnail available
        return { isCandidate: true, score: 5.0 };
    }
    
    try {
        // Download thumbnail (much smaller, faster - typically 50-200KB vs 2-5MB)
        const thumbnailResponse = await axios.get(thumbnailUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            maxContentLength: 5 * 1024 * 1024 // 5MB max for thumbnails
        });
        
        const thumbnailBase64 = Buffer.from(thumbnailResponse.data).toString('base64');
        
        // Quick preview prompt (simpler, faster - less tokens to process)
        const previewPrompt = `Quick preview: Is this image likely to be ${plant.scientificName} (${plant.name})?
        
Quick check (1-10 scale):
1. Does it look like the right plant? (accept color variants)
2. Is it reasonably clear and well-composed?
3. Are there obvious distractions (other plants, people, text)?

Respond in JSON:
{"isCandidate": true/false, "score": 1-10, "reason": "brief"}`;
        
        // Use faster model for thumbnails (smaller model = faster processing)
        const modelToUse = CONFIG.fastVisionModel;
        const response = await axios.post(
            `${CONFIG.ollamaBaseUrl}/api/generate`,
            {
                model: modelToUse,
                prompt: previewPrompt,
                images: [thumbnailBase64],
                stream: false,
                format: 'json'
            },
            {
                timeout: 30000 // 30 seconds for thumbnails (faster than full images)
            }
        );
        
        const content = response.data.response || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                isCandidate: result.isCandidate !== false,
                score: parseFloat(result.score) || 5.0,
                reason: result.reason || 'Thumbnail preview',
                fullUrl: fullUrl // Store full URL for later download
            };
        }
        
        return { isCandidate: true, score: 5.0, fullUrl: fullUrl };
    } catch (err) {
        // If thumbnail preview fails, include as candidate (better safe than sorry)
        return { isCandidate: true, score: 5.0, fullUrl: fullUrl };
    }
}

/**
 * Batch validate thumbnails - process multiple at once for speed
 * SPEED OPTIMIZATION: Processes 5 thumbnails in parallel instead of sequentially
 */
async function batchValidateThumbnails(plant, imageCandidates) {
    if (!CONFIG.useThumbnailPreview || imageCandidates.length <= 10) {
        return imageCandidates; // Skip preview if disabled or too few candidates
    }
    
    console.log(`  🔍 Quick thumbnail preview (fast screening - ${imageCandidates.length} candidates)...`);
    
    // Extract thumbnails (prioritize sources that provide them)
    const candidatesWithThumbnails = imageCandidates.map(img => ({
        ...img,
        thumbnailUrl: img.thumbnail || 
                     (img.source === 'pexels' ? (img.url.includes('/original') ? img.url.replace('/original', '/medium') : img.url) : null) ||
                     (img.source === 'google' ? img.url : null) || // Google URLs might be thumbnails
                     img.url // Fallback to full URL if no thumbnail
    }));
    
    // Process in batches for speed (parallel processing)
    const batchSize = CONFIG.thumbnailPreviewBatchSize;
    const promisingCandidates = [];
    
    for (let i = 0; i < candidatesWithThumbnails.length; i += batchSize) {
        const batch = candidatesWithThumbnails.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(candidatesWithThumbnails.length / batchSize);
        
        // Process batch in parallel (SPEED OPTIMIZATION)
        const previewResults = await Promise.all(
            batch.map(img => validateThumbnailPreview(plant, img.thumbnailUrl, img.url))
        );
        
        // Filter promising candidates
        for (let j = 0; j < batch.length; j++) {
            const preview = previewResults[j];
            if (preview.isCandidate && preview.score >= CONFIG.thumbnailMinScore) {
                promisingCandidates.push({
                    ...batch[j],
                    previewScore: preview.score,
                    previewReason: preview.reason
                });
            }
        }
        
        // Show progress
        if (batchNum % 5 === 0 || batchNum === totalBatches) {
            console.log(`    Preview batch ${batchNum}/${totalBatches}: ${promisingCandidates.length} promising candidates so far...`);
        }
        
        // Small delay between batches to avoid overwhelming Ollama
        if (i + batchSize < candidatesWithThumbnails.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    
    console.log(`  ✅ Thumbnail preview: ${promisingCandidates.length}/${imageCandidates.length} candidates passed quick screening`);
    console.log(`  ⚡ Speed gain: Filtered ${imageCandidates.length - promisingCandidates.length} images without full download`);
    
    // Sort by preview score (best first)
    promisingCandidates.sort((a, b) => (b.previewScore || 0) - (a.previewScore || 0));
    
    return promisingCandidates;
}

/**
 * Validate image with local AI (full detailed validation)
 * Only called for promising candidates after thumbnail preview
 * This is the professional photographer + botanist evaluation
 */
async function validateImageWithLocalAI(plant, imageUrl) {
    try {
        // Download image to temp file
        const imageResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000, // Longer timeout for full images
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const tempPath = path.join(__dirname, '..', 'temp_image.jpg');
        await fs.writeFile(tempPath, imageResponse.data);
        
        // Read image as base64
        const imageData = await fs.readFile(tempPath);
        const imageBase64 = imageData.toString('base64');
        
        // Create professional photographer + botanist prompt
        const isPexelsImage = imageUrl.includes('pexels.com') || imageUrl.includes('images.pexels.com');
        const extraStrictNote = isPexelsImage ? 
            '\n\n⚠️ IMPORTANT: This image is from Pexels (stock photo site). Be EXTRA STRICT - Pexels images may not always be accurately labeled. Only accept if you are ABSOLUTELY CERTAIN this is the correct species.' :
            '';
        
        const prompt = `You are a professional photographer who is also a botanical scientist. You have exquisite aesthetic taste and deep botanical knowledge. You're selecting images for a prestigious plant database - only the finest, most accurate, and most beautiful images will do.${extraStrictNote}

Plant name: ${plant.name}
Scientific name: ${plant.scientificName}
${plant.taxonomy ? `
Taxonomy:
- Family: ${plant.taxonomy.family || 'N/A'}
- Genus: ${plant.taxonomy.genus || 'N/A'}
- Species: ${plant.taxonomy.species || 'N/A'}
${plant.taxonomy.variety ? `- Variety: ${plant.taxonomy.variety}` : ''}
${plant.taxonomy.cultivar ? `- Cultivar: ${plant.taxonomy.cultivar}` : ''}
` : ''}
${plant.commonNames && plant.commonNames.length > 0 ? `Common names: ${plant.commonNames.join(', ')}` : ''}
Plant type: ${plant.type?.join(', ') || 'N/A'}
Classification: ${plant.classification?.join(', ') || 'N/A'}

YOUR SELECTION CRITERIA (as a professional photographer + botanist):

BOTANICAL ACCURACY (Non-negotiable):
1. Species must be ${plant.scientificName} (${plant.name}) - MUST be botanically correct
   ✅ ACCEPT color variants (white/pink/red veins, variegated, different cultivars)
   ✅ ACCEPT if plant structure, leaf shape, and growth pattern match
   ❌ REJECT only if it's a completely different species
2. Image must show ONLY this plant species - no other plants visible
3. NO animals, insects, or wildlife distracting from the plant
4. NO human hands, people, or body parts
5. NO text labels, watermarks, copyright marks, or decorative borders

PROFESSIONAL PHOTOGRAPHY STANDARDS (Your aesthetic judgment):
6. COMPOSITION: Well-framed, balanced, visually appealing
   - Rule of thirds applied or intentional composition
   - Plant is the clear focal point
   - Background enhances, not distracts
7. LIGHTING: Professional quality lighting
   - Natural, even lighting preferred
   - No harsh shadows or overexposure
   - Good contrast and depth
8. TECHNICAL QUALITY: Sharp, clear, high resolution
   - In focus (especially the plant)
   - Not blurry or pixelated
   - Good color accuracy
9. AESTHETIC APPEAL: Beautiful, tasteful, gallery-worthy
   - Pleasing color palette
   - Clean, uncluttered background
   - Professional appearance
   - Something you'd be proud to display
10. NO distracting elements: Pots, containers, tools, or man-made objects (unless naturally occurring)

EVALUATION (Rate as a professional photographer + botanist):

1. BOTANICAL ACCURACY (1-10): Is this ${plant.scientificName}?
   - 10 = Absolutely certain, perfect match
   - 7-9 = Confident it's correct (accept color variants)
   - 4-6 = Uncertain, might be wrong species
   - 1-3 = Definitely wrong species
   ✅ ACCEPT if score ≥7 (same species, color variants OK)

2. COMPOSITION & FRAMING (1-10): Professional photography quality
   - 10 = Gallery-worthy composition
   - 7-9 = Well-composed, professional
   - 4-6 = Acceptable but not exceptional
   - 1-3 = Poor composition

3. LIGHTING & TECHNICAL QUALITY (1-10): Professional lighting and sharpness
   - 10 = Perfect lighting, razor sharp
   - 7-9 = Good lighting, sharp focus
   - 4-6 = Acceptable but not great
   - 1-3 = Poor quality

4. AESTHETIC APPEAL (1-10): Beautiful, tasteful, pleasing
   - 10 = Stunning, museum-quality
   - 7-9 = Beautiful, professional
   - 4-6 = Nice but not exceptional
   - 1-3 = Not aesthetically pleasing

5. DISTRACTIONS: Are there distracting elements? (yes/no)
   - Other plants, animals, people, text, watermarks, pots, objects

6. OVERALL ASSESSMENT: Would you select this for a prestigious botanical database?
   - Consider: accuracy + composition + lighting + aesthetic appeal
   - Only select if it meets professional standards

SELECTION DECISION:

ACCEPT if ALL of these are true:
✅ Botanical accuracy ≥7 (correct species, color variants OK)
✅ Composition ≥7 (professional framing)
✅ Lighting/Quality ≥7 (sharp, well-lit)
✅ Aesthetic ≥7 (beautiful, tasteful)
✅ No distracting elements

REJECT if ANY of these:
❌ Wrong species (botanical accuracy <7)
❌ Poor composition (<7)
❌ Poor lighting/quality (<7)
❌ Not aesthetically pleasing (<7)
❌ Has distracting elements

Remember: You're selecting for a prestigious database. Only choose images that are:
- Botanically accurate
- Professionally photographed
- Aesthetically beautiful
- Gallery-worthy quality

${plant.scientificName.includes('Fittonia') || plant.name.toLowerCase().includes('fittonia') ? `
Note: For Fittonia albivenis, accept ALL color variants:
- White-veined ✅ | Pink-veined ✅ | Red-veined ✅ | Any cultivar ✅` : ''}

Respond in JSON format:
{
  "isAccurate": true/false,
  "hasDistractions": true/false,
  "botanicalAccuracy": 1-10,
  "composition": 1-10,
  "lightingQuality": 1-10,
  "aesthetic": 1-10,
  "quality": 1-10,  // Overall technical quality
  "score": (botanicalAccuracy + composition + lightingQuality + aesthetic) / 4,
  "reason": "brief professional assessment"
}`;
        
        // Call Ollama API with retry logic
        let response;
        let lastError;
        const maxRetries = 2;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`    [DEBUG] Retry attempt ${attempt}/${maxRetries}...`);
                    await new Promise(r => setTimeout(r, 3000)); // Wait 3 seconds before retry
                }
                
                response = await axios.post(
                    `${CONFIG.ollamaBaseUrl}/api/generate`,
                    {
                        model: CONFIG.visionModel,
                        prompt: prompt,
                        images: [imageBase64],
                        stream: false,
                        format: 'json'
                    },
                    {
                        timeout: 90000 // 90 second timeout for vision models
                    }
                );
                break; // Success, exit retry loop
            } catch (err) {
                lastError = err;
                if (attempt === maxRetries) {
                    throw err; // Re-throw on final attempt
                }
                // Continue to retry
            }
        }
        
        // Clean up temp file
        await fs.unlink(tempPath).catch(() => {});
        
        // Parse response
        const content = response.data.response || '';
        
        // Try to extract JSON from response
        let result;
        try {
            // Find JSON in response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found');
            }
        } catch (parseErr) {
            // Fallback parsing
            console.warn(`    Could not parse JSON, using strict fallback`);
            return {
                isAccurate: false,
                quality: 0,
                aesthetic: 0,
                score: 0,
                reason: 'Could not parse AI response - rejecting for safety'
            };
        }
        
        // Parse new professional photographer + botanist evaluation format
        const hasDistractions = result.hasDistractions === true || result.hasDistractions === 'true';
        const isAccurate = result.isAccurate === true || result.isAccurate === 'true';
        
        // Extract professional evaluation scores
        const botanicalAccuracy = parseFloat(result.botanicalAccuracy) || parseFloat(result.quality) || 0;
        const composition = parseFloat(result.composition) || 7.0; // Default to acceptable
        const lightingQuality = parseFloat(result.lightingQuality) || parseFloat(result.quality) || 0;
        const aesthetic = parseFloat(result.aesthetic) || 0;
        const quality = parseFloat(result.quality) || (lightingQuality + composition) / 2 || 0;
        
        // Professional photographer + botanist scoring
        // Weighted average: botanical accuracy is critical, but all aspects matter
        const professionalScore = result.score || 
            (botanicalAccuracy * 0.3 + composition * 0.25 + lightingQuality * 0.25 + aesthetic * 0.2);
        
        // Reject if has distractions or not accurate
        if (hasDistractions || !isAccurate || botanicalAccuracy < 7) {
            return {
                isAccurate: false,
                quality: quality,
                aesthetic: aesthetic,
                botanicalAccuracy: botanicalAccuracy,
                composition: composition,
                lightingQuality: lightingQuality,
                score: 0,
                reason: result.reason || `Rejected: ${hasDistractions ? 'Has distracting elements' : botanicalAccuracy < 7 ? 'Botanical accuracy insufficient' : 'Not accurate'}`
            };
        }
        
        // Professional standards: All aspects must meet minimum thresholds
        const adjustedMinScore = CONFIG.minScore;
        const adjustedMinQuality = CONFIG.minQuality;
        const adjustedMinAesthetic = CONFIG.minAesthetic;
        const minComposition = 7.0; // Professional composition standard
        const minLighting = 7.0; // Professional lighting standard
        
        // Bonus for Pexels images that pass all checks (they're often very high quality)
        const qualityBonus = isPexelsImage && professionalScore >= 8.0 ? 0.3 : 0;
        const score = professionalScore + qualityBonus;
        
        // Professional photographer + botanist standards: ALL criteria must be met
        if (score < adjustedMinScore) {
            return {
                isAccurate: true,
                hasDistractions: false,
                quality: quality,
                aesthetic: aesthetic,
                botanicalAccuracy: botanicalAccuracy,
                composition: composition,
                lightingQuality: lightingQuality,
                score: score,
                reason: `Overall score too low: ${score.toFixed(1)} (minimum ${adjustedMinScore} required)`
            };
        }
        
        // Check all professional criteria
        if (botanicalAccuracy < 7) {
            return {
                isAccurate: true,
                hasDistractions: false,
                quality: quality,
                aesthetic: aesthetic,
                botanicalAccuracy: botanicalAccuracy,
                composition: composition,
                lightingQuality: lightingQuality,
                score: score,
                reason: `Botanical accuracy insufficient: ${botanicalAccuracy.toFixed(1)} (minimum 7.0 required)`
            };
        }
        
        if (composition < minComposition) {
            return {
                isAccurate: true,
                hasDistractions: false,
                quality: quality,
                aesthetic: aesthetic,
                botanicalAccuracy: botanicalAccuracy,
                composition: composition,
                lightingQuality: lightingQuality,
                score: score,
                reason: `Composition below professional standard: ${composition.toFixed(1)} (minimum ${minComposition} required)`
            };
        }
        
        if (lightingQuality < minLighting) {
            return {
                isAccurate: true,
                hasDistractions: false,
                quality: quality,
                aesthetic: aesthetic,
                botanicalAccuracy: botanicalAccuracy,
                composition: composition,
                lightingQuality: lightingQuality,
                score: score,
                reason: `Lighting/quality below professional standard: ${lightingQuality.toFixed(1)} (minimum ${minLighting} required)`
            };
        }
        
        if (aesthetic < adjustedMinAesthetic) {
            return {
                isAccurate: true,
                hasDistractions: false,
                quality: quality,
                aesthetic: aesthetic,
                botanicalAccuracy: botanicalAccuracy,
                composition: composition,
                lightingQuality: lightingQuality,
                score: score,
                reason: `Aesthetic appeal insufficient: ${aesthetic.toFixed(1)} (minimum ${adjustedMinAesthetic} required)`
            };
        }
        
        return {
            isAccurate: true,
            hasDistractions: false,
            quality: quality,
            aesthetic: aesthetic,
            botanicalAccuracy: botanicalAccuracy,
            composition: composition,
            lightingQuality: lightingQuality,
            score: score,
            reason: result.reason || `Accepted: Botanical ${botanicalAccuracy.toFixed(1)}, Composition ${composition.toFixed(1)}, Lighting ${lightingQuality.toFixed(1)}, Aesthetic ${aesthetic.toFixed(1)}`
        };
    } catch (err) {
        console.warn(`    Local AI validation failed: ${err.message}`);
        return {
            isAccurate: false,
            quality: 0,
            aesthetic: 0,
            score: 0,
            reason: `Validation error: ${err.message} - rejecting for safety`
        };
    }
}

/**
 * Search GBIF for scientifically verified images
 * IMPORTANT: Only uses scientific name (Latin name) - never common names
 */
async function searchGBIFImages(scientificName, count = 20) {
    if (!scientificName || scientificName.trim() === '') {
        return [];
    }
    
    // Clean scientific name - remove any extra text, ensure it's just the Latin name
    const cleanScientificName = scientificName.trim().split(/[,\s]+/).slice(0, 2).join(' '); // Take first two words (genus + species)
    
    try {
        console.log(`    [DEBUG] Searching GBIF for: "${cleanScientificName}" (scientific name only)`);
        
        // Step 1: Find species key using ONLY scientific name
        const speciesResponse = await axios.get('https://api.gbif.org/v1/species/search', {
            params: {
                q: cleanScientificName, // Only scientific name, no common names
                limit: 5
            },
            timeout: 10000
        });
        
        const species = speciesResponse.data.results || [];
        if (species.length === 0) {
            console.log(`    [DEBUG] GBIF: No species found`);
            return [];
        }
        
        // Use the accepted/backbone species key, not dataset-specific ones
        // Look for the backbone key (usually the one with nubKey or acceptedUsageKey)
        let speciesKey = species[0].key;
        
        // Try to find backbone key - check if first result has nubKey or if we can find accepted key
        for (const sp of species) {
            if (sp.nubKey) {
                speciesKey = sp.nubKey;
                break;
            }
            if (sp.acceptedUsageKey) {
                speciesKey = sp.acceptedUsageKey;
                break;
            }
            // Prefer keys that are likely backbone (lower numbers often indicate backbone)
            if (sp.key < 100000000 && sp.taxonomicStatus === 'ACCEPTED') {
                speciesKey = sp.key;
                break;
            }
        }
        
        console.log(`    [DEBUG] GBIF: Found species key ${speciesKey} for "${cleanScientificName}"`);
        
        // Try multiple approaches to get images:
        // 1. Try species media endpoint (direct access to species images)
        // 2. Try occurrence search with mediaType
        // 3. Try occurrence search without filters
        
        const images = [];
        const seenUrls = new Set();
        
        // Approach 1: Try species media endpoint
        try {
            const mediaResponse = await axios.get(`https://api.gbif.org/v1/species/${speciesKey}/media`, {
                params: {
                    limit: count
                },
                timeout: 10000
            });
            
            const mediaItems = mediaResponse.data.results || [];
            console.log(`    [DEBUG] GBIF: Found ${mediaItems.length} media items from species endpoint`);
            
            for (const media of mediaItems) {
                let imageUrl = media.identifier || 
                             media.url || 
                             media.uri || 
                             media.mediaURL ||
                             media.thumbnail ||
                             null;
                
                if (!imageUrl) continue;
                
                // Ensure URL is absolute
                if (!imageUrl.startsWith('http')) {
                    if (imageUrl.startsWith('//')) {
                        imageUrl = 'https:' + imageUrl;
                    } else if (imageUrl.startsWith('/')) {
                        imageUrl = 'https://www.gbif.org' + imageUrl;
                    } else {
                        continue;
                    }
                }
                
                if (seenUrls.has(imageUrl)) continue;
                
                seenUrls.add(imageUrl);
                images.push({
                    url: imageUrl,
                    source: 'gbif',
                    id: `gbif-${speciesKey}-${images.length}`,
                    title: media.title || media.caption || `GBIF species ${cleanScientificName}`,
                    width: media.width || null,
                    height: media.height || null,
                    scientificAccuracy: 'high'
                });
                
                if (images.length >= count) break;
            }
        } catch (err) {
            console.log(`    [DEBUG] GBIF: Species media endpoint error: ${err.message}`);
        }
        
        // Approach 2: Try occurrence search - need to fetch full occurrence details to get media
        if (images.length < count) {
            // First, get occurrence keys that have media
            let occurrenceResponse = await axios.get('https://api.gbif.org/v1/occurrence/search', {
                params: {
                    speciesKey: speciesKey,
                    mediaType: 'StillImage',
                    limit: 100  // Get more occurrence keys
                },
                timeout: 15000
            });
            
            let occurrences = occurrenceResponse.data.results || [];
            
            // If no results with mediaType filter, try without it (broader search)
            if (occurrences.length === 0) {
                console.log(`    [DEBUG] GBIF: No occurrences with mediaType filter, trying without filter...`);
                occurrenceResponse = await axios.get('https://api.gbif.org/v1/occurrence/search', {
                    params: {
                        speciesKey: speciesKey,
                        limit: 100
                    },
                    timeout: 15000
                });
                occurrences = occurrenceResponse.data.results || [];
            }
            
            console.log(`    [DEBUG] GBIF: Found ${occurrences.length} occurrences`);
            
            // Fetch full occurrence details in batches to get media
            const occurrenceKeys = occurrences.slice(0, 50).map(occ => occ.key || occ.gbifID).filter(Boolean);
            
            for (const occurrenceKey of occurrenceKeys) {
                if (images.length >= count) break;
                
                try {
                    // Fetch full occurrence details to get media
                    const fullOccurrence = await axios.get(`https://api.gbif.org/v1/occurrence/${occurrenceKey}`, {
                        timeout: 5000
                    });
                    
                    const occ = fullOccurrence.data;
                    
                    // Check multiple possible locations for media
                    let mediaList = occ.media || 
                                occ.verbatim?.media ||
                                occ.verbatim?.multimedia ||
                                occ.multimedia ||
                                occ.images ||
                                [];
                    
                    // Also check extensions
                    if ((!mediaList || !Array.isArray(mediaList) || mediaList.length === 0) && occ.extensions) {
                        // Check for Multimedia extension
                        if (occ.extensions['http://rs.tdwg.org/ac/terms/Multimedia']) {
                            mediaList = occ.extensions['http://rs.tdwg.org/ac/terms/Multimedia'];
                        }
                    }
                    
                    if (!Array.isArray(mediaList) || mediaList.length === 0) {
                        continue;
                    }
                    
                    for (const media of mediaList) {
                        // Extract image URL from various possible fields
                        let imageUrl = media.identifier || 
                                     media['http://rs.tdwg.org/ac/terms/accessURI'] ||
                                     media['http://purl.org/dc/terms/identifier'] ||
                                     media.url || 
                                     media.uri || 
                                     media.mediaURL ||
                                     media.thumbnail ||
                                     null;
                        
                        if (!imageUrl) continue;
                        
                        // Ensure URL is absolute
                        if (!imageUrl.startsWith('http')) {
                            if (imageUrl.startsWith('//')) {
                                imageUrl = 'https:' + imageUrl;
                            } else if (imageUrl.startsWith('/')) {
                                imageUrl = 'https://www.gbif.org' + imageUrl;
                            } else {
                                continue;
                            }
                        }
                        
                        // Skip duplicates
                        if (seenUrls.has(imageUrl)) continue;
                        
                        seenUrls.add(imageUrl);
                        images.push({
                            url: imageUrl,
                            source: 'gbif',
                            id: `gbif-${occ.key || occurrenceKey}-${images.length}`,
                            title: media.title || media.caption || media['http://purl.org/dc/elements/1.1/creator'] || `GBIF occurrence ${occ.key || occurrenceKey}`,
                            width: media.width || null,
                            height: media.height || null,
                            scientificAccuracy: 'high'
                        });
                        
                        if (images.length >= count) break;
                    }
                } catch (err) {
                    // Skip if individual occurrence fetch fails
                    continue;
                }
            }
        }
        
        console.log(`    [DEBUG] GBIF: Extracted ${images.length} images`);
        return images;
        
    } catch (err) {
        if (err.response?.status === 429) {
            console.warn(`    ⚠️ GBIF API rate limit`);
        } else if (err.response?.status === 404) {
            console.log(`    [DEBUG] GBIF: Species not found`);
        } else {
            console.log(`    [DEBUG] GBIF API error: ${err.message}`);
        }
        return [];
    }
}

/**
 * Search Pexels for high-quality images
 */
async function searchPexels(query, count = 10) {
    if (!CONFIG.pexelsApiKey) {
        return [];
    }
    try {
        const response = await axios.get('https://api.pexels.com/v1/search', {
            params: { 
                query, 
                per_page: Math.min(count, 80)
                // Removed orientation and size filters to get more results
            },
            headers: { 'Authorization': CONFIG.pexelsApiKey }
        });
        
        const photos = response.data.photos || [];
        return photos.map(p => ({
            url: p.src.original || p.src.large,
            thumbnail: p.src.medium,
            source: 'pexels',
            id: p.id,
            photographer: p.photographer,
            width: p.width,
            height: p.height,
            needsVerification: true
        }));
    } catch (err) {
        if (err.response?.status === 401) {
            console.warn(`    ⚠️ Pexels API key invalid`);
        } else if (err.response?.status === 429) {
            console.warn(`    ⚠️ Pexels API rate limit`);
        } else {
            console.warn(`    ⚠️ Pexels API error: ${err.message}`);
        }
        return [];
    }
}

/**
 * Search Google Images using Custom Search API
 */
async function searchGoogleImages(query, count = 10) {
    if (!CONFIG.googleApiKey || !CONFIG.googleCseId) {
        return [];
    }
    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: CONFIG.googleApiKey,
                cx: CONFIG.googleCseId,
                q: query,
                searchType: 'image',
                num: Math.min(count, 10)
                // Removed filters: imgSize, fileType, safe - to show all images
            },
            timeout: 10000
        });
        
        const items = response.data.items || [];
        return items.map((item, idx) => ({
            url: item.link,
            source: 'google',
            id: `google-${item.link.length}-${idx}`,
            title: item.title || query,
            width: item.image?.width,
            height: item.image?.height
        }));
    } catch (err) {
        if (err.response?.status === 429) {
            console.warn(`    ⚠️ Google API rate limit - Free tier allows 100 queries/day`);
            console.warn(`    💡 Wait 24 hours or upgrade to a paid plan for more queries`);
        } else if (err.response?.status === 400) {
            console.warn(`    ⚠️ Google API error (400): ${err.response?.data?.error?.message || err.message}`);
        } else if (err.response?.status === 403) {
            console.warn(`    ⚠️ Google API access denied (403): Check your API key and CSE ID`);
        } else {
            console.warn(`    ⚠️ Google API error: ${err.message}`);
            if (err.response?.data) {
                console.warn(`    Response: ${JSON.stringify(err.response.data)}`);
            }
        }
        return [];
    }
}

/**
 * Search Wikipedia for images
 * Uses scientific name in Wikipedia page format: "Genus_species" (underscores, not spaces)
 * Example: "Ficus pumila" -> "Ficus_pumila" -> https://en.wikipedia.org/wiki/Ficus_pumila
 * Accesses all images from the page including gallery sections
 */
async function searchWikipediaImages(query, count = 10) {
    try {
        // Convert scientific name to Wikipedia page format
        // "Ficus pumila" -> "Ficus_pumila" (underscores, capitalize first letter of genus)
        const scientificName = query.trim();
        const parts = scientificName.split(/\s+/).slice(0, 2); // Take only genus and species (first two words)
        
        if (parts.length < 2) {
            console.log(`    [DEBUG] Wikipedia: Need genus and species, got "${scientificName}"`);
            return [];
        }
        
        const wikipediaPageName = parts
            .map((word, idx) => idx === 0 
                ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() 
                : word.toLowerCase())
            .join('_');
        
        console.log(`    [DEBUG] Wikipedia: Accessing page "${wikipediaPageName}"`);
        
        // Step 1: Get all images from the page (including gallery) using query action
        const articleResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
            params: {
                action: 'query',
                titles: wikipediaPageName,
                prop: 'images',
                imlimit: 'max', // Get maximum images (500)
                format: 'json',
                origin: '*'
            },
            headers: {
                'User-Agent': 'TerrariumIndex/1.0 (Plant Image Fetcher; https://github.com/your-repo)'
            },
            timeout: 15000
        });
        
        const pages = articleResponse.data.query?.pages || {};
        const allImageNames = [];
        
        // Extract image names from all pages
        for (const pageId in pages) {
            const page = pages[pageId];
            if (page.images && Array.isArray(page.images)) {
                for (const img of page.images) {
                    if (img.title && !allImageNames.includes(img.title)) {
                        allImageNames.push(img.title);
                    }
                }
            }
        }
        
        // If no images found and we have genus+species, try genus page (for monotypic genera)
        if (allImageNames.length === 0 && parts.length === 2) {
            const genus = parts[0];
            const genusPageName = genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase();
            console.log(`    [DEBUG] Wikipedia: No images on species page, trying genus page "${genusPageName}"`);
            
            const genusResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
                params: {
                    action: 'query',
                    titles: genusPageName,
                    prop: 'images',
                    imlimit: 'max',
                    format: 'json',
                    origin: '*'
                },
                headers: {
                    'User-Agent': 'TerrariumIndex/1.0 (Plant Image Fetcher; https://github.com/your-repo)'
                },
                timeout: 15000
            });
            
            const genusPages = genusResponse.data.query?.pages || {};
            for (const pageId in genusPages) {
                const page = genusPages[pageId];
                if (page.images && Array.isArray(page.images)) {
                    for (const img of page.images) {
                        if (img.title && !allImageNames.includes(img.title)) {
                            allImageNames.push(img.title);
                        }
                    }
                }
            }
            
            if (allImageNames.length > 0) {
                console.log(`    [DEBUG] Wikipedia: Found ${allImageNames.length} images on genus page`);
            }
        }
        
        if (allImageNames.length === 0) {
            console.log(`    [DEBUG] Wikipedia: No images found in page "${wikipediaPageName}"`);
            return [];
        }
        
        console.log(`    [DEBUG] Wikipedia: Found ${allImageNames.length} image references on page`);
        
        // Filter for actual image files (jpg, png, etc.) - remove "File:" prefix if present
        const imageFileNames = allImageNames
            .map(name => name.startsWith('File:') ? name.substring(5) : name)
            .filter(name => /\.(jpg|jpeg|png|gif|webp)$/i.test(name))
            .slice(0, count * 2); // Get more than needed, then filter by size
        
        if (imageFileNames.length === 0) {
            console.log(`    [DEBUG] Wikipedia: No image files found after filtering`);
            return [];
        }
        
        // Step 2: Get image info (URLs and metadata) for all images
        const imageInfoResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
            params: {
                action: 'query',
                titles: imageFileNames.map(name => `File:${name}`).join('|'),
                prop: 'imageinfo',
                iiprop: 'url|size|mime|thumburl',
                iiurlwidth: 1200, // Prefer larger images
                format: 'json',
                origin: '*'
            },
            headers: {
                'User-Agent': 'TerrariumIndex/1.0 (Plant Image Fetcher; https://github.com/your-repo)'
            },
            timeout: 20000
        });
        
        const imagePages = imageInfoResponse.data.query?.pages || {};
        const results = [];
        
        for (const pageId in imagePages) {
            const page = imagePages[pageId];
            if (page.imageinfo && page.imageinfo.length > 0) {
                const info = page.imageinfo[0];
                const url = info.url || info.thumburl;
                
                // Don't skip small images - gallery images might be smaller but still valid
                // Only skip if it's clearly a tiny icon/thumbnail (< 200px)
                if (info.width && info.width < 200) {
                    continue;
                }
                
                if (url) {
                    results.push({
                        url: url,
                        thumbnail: info.thumburl || url,
                        source: 'wikipedia',
                        id: `wikipedia-${pageId}`,
                        title: page.title || query,
                        width: info.width,
                        height: info.height
                    });
                }
            }
        }
        
        // Sort by size (larger first) and limit to requested count
        results.sort((a, b) => (b.width || 0) - (a.width || 0));
        const finalResults = results.slice(0, count);
        
        console.log(`    [DEBUG] Wikipedia: Returning ${finalResults.length} images from page "${wikipediaPageName}"`);
        return finalResults;
        
    } catch (err) {
        if (err.response?.status === 404) {
            console.log(`    [DEBUG] Wikipedia: Page not found - "${query}"`);
        } else if (err.response?.status === 403) {
            console.log(`    [DEBUG] Wikipedia: Access denied (403) - ${err.message}`);
            console.log(`    [DEBUG] Wikipedia: This might be a rate limit or access restriction`);
        } else if (err.response?.status === 429) {
            console.warn(`    ⚠️ Wikipedia API rate limit`);
        } else {
            console.log(`    [DEBUG] Wikipedia API error: ${err.message}`);
            if (err.response) {
                console.log(`    [DEBUG] Wikipedia API response status: ${err.response.status}`);
            }
        }
        return [];
    }
}

/**
 * Download image from URL
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
 * Convert scientific name to folder slug
 */
function scientificNameToSlug(scientificName) {
    if (!scientificName) return null;
    return scientificName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[×x]/g, 'x')
        .replace(/[^a-z0-9\-x]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Check if plant already has enough images
 */
async function hasEnoughImages(plant) {
    const plantFolderName = scientificNameToSlug(plant.scientificName) || 
                           plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const plantFolder = path.join(CONFIG.outputDir, plantFolderName);
    
    try {
        const files = await fs.readdir(plantFolder);
        const imageFiles = files.filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        });
        
        return imageFiles.length >= CONFIG.imagesPerPlant;
    } catch (err) {
        return false;
    }
}

/**
 * Generate search queries using local AI
 */
async function generateSearchQueriesWithLocalAI(plant) {
    const queries = [
        plant.scientificName,
        `${plant.scientificName} plant`,
        `${plant.name} plant`,
        `${plant.scientificName} leaves`,
        `${plant.name} close up`
    ];
    
    if (plant.type && plant.type.includes('terrarium')) {
        queries.push(`${plant.name} terrarium`);
        queries.push(`${plant.scientificName} terrarium`);
    }
    
    return [...new Set(queries)];
}

/**
 * Load all plants from JSON files
 */
async function loadAllPlants() {
    const plantsDir = path.join(__dirname, '..', 'data', 'plants-merged');
    const indexFile = path.join(plantsDir, 'index.json');
    
    try {
        const indexData = await fs.readFile(indexFile, 'utf-8');
        const index = JSON.parse(indexData);
        
        const plants = [];
        const filesToLoad = index.files && index.files.length > 0 ? index.files : null;
        
        // If index is empty, load all JSON files directly
        if (!filesToLoad) {
            const allFiles = await fs.readdir(plantsDir);
            const jsonFiles = allFiles.filter(f => f.endsWith('.json') && f !== 'index.json').sort();
            for (const filename of jsonFiles) {
                try {
                    const filePath = path.join(plantsDir, filename);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const plant = JSON.parse(content);
                    plants.push(plant);
                } catch (err) {
                    console.warn(`Failed to load ${filename}: ${err.message}`);
                }
            }
        } else {
            // Use index files
            for (const filename of filesToLoad) {
                try {
                    const filePath = path.join(plantsDir, filename);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const plant = JSON.parse(content);
                    plants.push(plant);
                } catch (err) {
                    console.warn(`Failed to load ${filename}: ${err.message}`);
                }
            }
        }
        
        return plants;
    } catch (err) {
        // Fallback to old structure
        const plantsDirOld = path.join(__dirname, '..', 'data', 'plants');
        try {
            const categories = (await fs.readdir(plantsDirOld, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            const allPlants = [];
            for (const category of categories) {
                const categoryPath = path.join(plantsDirOld, category);
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
                            // Skip
                        }
                    }
                } catch (err) {
                    // Skip
                }
            }
            
            return allPlants.sort((a, b) => a.id - b.id);
        } catch (err) {
            return [];
        }
    }
}

/**
 * Main function: Fetch images for a plant with speed optimizations
 */
async function fetchImagesForPlant(plant) {
    console.log(`\n🌱 ${plant.name} (${plant.scientificName})`);
    
    // Check if already has enough images
    const alreadyHasEnough = await hasEnoughImages(plant);
    if (alreadyHasEnough) {
        const plantFolderName = scientificNameToSlug(plant.scientificName) || 
                               plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const plantFolder = path.join(CONFIG.outputDir, plantFolderName);
        const files = await fs.readdir(plantFolder);
        const imageFiles = files.filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        });
        console.log(`  ⏭️  Skipping - already has ${imageFiles.length} image(s) (target: ${CONFIG.imagesPerPlant})`);
        return 0;
    }
    
    // Generate search queries
    const queries = await generateSearchQueriesWithLocalAI(plant);
    console.log(`  Generated ${queries.length} search queries`);
    
    // Search for candidate images - GBIF first (highest priority)
    const candidateImages = [];
    console.log(`  Searching GBIF first (most accurate source)...`);
    const gbifResults = await searchGBIFImages(plant.scientificName, 30);
    if (gbifResults.length > 0) {
        candidateImages.push(...gbifResults);
        console.log(`    ✅ GBIF: Found ${gbifResults.length} scientifically verified images`);
    }
    
    // Search Pexels with scientific name
    if (plant.scientificName && CONFIG.pexelsApiKey) {
        console.log(`  Searching Pexels with scientific name...`);
        const pexelsResults = await searchPexels(plant.scientificName, 40);
        if (pexelsResults.length > 0) {
            candidateImages.push(...pexelsResults);
            console.log(`    ✅ Pexels: Found ${pexelsResults.length} images`);
        }
    }
    
    // Search other sources
    for (const query of queries.slice(0, 5)) {
        const [wikipediaResults, googleResults, pexelsResults] = await Promise.all([
            searchWikipediaImages(query, 10),
            searchGoogleImages(query, 10),
            CONFIG.pexelsApiKey ? searchPexels(query, 10) : Promise.resolve([])
        ]);
        
        candidateImages.push(...wikipediaResults, ...googleResults, ...pexelsResults);
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
    
    // Prioritize sources: GBIF > Wikipedia > Pexels > Google
    uniqueImages.sort((a, b) => {
        const priority = { 'gbif': 1, 'wikipedia': 2, 'pexels': 3, 'google': 4 };
        const aPriority = priority[a.source] || 5;
        const bPriority = priority[b.source] || 5;
        return aPriority - bPriority;
    });
    
    // STAGE 1: Fast thumbnail preview (quick screening)
    let candidatesForDetailedValidation = uniqueImages;
    if (CONFIG.useThumbnailPreview && uniqueImages.length > 10) {
        candidatesForDetailedValidation = await batchValidateThumbnails(plant, uniqueImages);
        console.log(`  ⚡ Fast preview filtered to ${candidatesForDetailedValidation.length} promising candidates`);
    }
    
    // STAGE 2: Detailed validation (only promising candidates)
    console.log(`  Validating with local AI (${CONFIG.visionModel})...`);
    const imagesToCheck = Math.min(candidatesForDetailedValidation.length, CONFIG.maxCandidatesToCheck);
    console.log(`  Checking ${imagesToCheck} images (min score: ${CONFIG.minScore})...`);
    const validated = [];
    
    for (const img of candidatesForDetailedValidation.slice(0, imagesToCheck)) {
        const validation = await validateImageWithLocalAI(plant, img.url);
        
        if (validation.isAccurate && !validation.hasDistractions && validation.score >= CONFIG.minScore) {
            validated.push({
                ...img,
                ...validation
            });
            const botAcc = validation.botanicalAccuracy?.toFixed(1) || validation.quality?.toFixed(1) || 'N/A';
            const comp = validation.composition?.toFixed(1) || 'N/A';
            const light = validation.lightingQuality?.toFixed(1) || validation.quality?.toFixed(1) || 'N/A';
            const aest = validation.aesthetic?.toFixed(1) || 'N/A';
            console.log(`    ✓ ${img.source} - Score: ${validation.score.toFixed(1)} (Bot:${botAcc} Comp:${comp} Light:${light} Aest:${aest}) - ${validation.reason || 'Accepted'}`);
        } else {
            const reason = validation.reason || 
                          (validation.score < CONFIG.minScore ? `Score ${validation.score.toFixed(1)} < ${CONFIG.minScore}` : 
                           validation.hasDistractions ? 'Has distracting elements' : 
                           !validation.isAccurate ? 'Not accurate species' : 
                           'Rejected');
            console.log(`    ✗ ${img.source} - ${reason}`);
        }
        
        // Early exit if we have enough
        if (validated.length >= CONFIG.imagesPerPlant * 2) {
            break;
        }
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
    const plantFolderName = scientificNameToSlug(plant.scientificName) || 
                           plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const plantFolder = path.join(CONFIG.outputDir, plantFolderName);
    await fs.mkdir(plantFolder, { recursive: true });
    
    let successCount = 0;
    for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        const filename = `${plantFolderName}-${i + 1}.jpg`;
        const savePath = path.join(plantFolder, filename);
        
        try {
            await downloadImage(img.url, savePath);
            console.log(`    ✅ ${filename} (from ${img.source})`);
            successCount++;
        } catch (err) {
            console.error(`    ❌ Failed to download ${filename}: ${err.message}`);
        }
    }
    
    return successCount;
}

/**
 * Main function
 */
async function main() {
    console.log('🤖 Local AI-Powered Plant Image Fetcher');
    console.log('Using Ollama with vision model\n');
    
    const ollamaReady = await checkOllamaSetup();
    if (!ollamaReady) {
        console.log('\n📦 To install Ollama:');
        console.log('  1. Download from: https://ollama.ai');
        console.log('  2. Install and run Ollama');
        console.log('  3. Pull a vision model:');
        console.log('     ollama pull llava');
        process.exit(1);
    }
    
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
    
    let skippedCount = 0;
    for (const plant of plantsToProcess) {
        if (await hasEnoughImages(plant)) {
            skippedCount++;
        }
    }
    
    console.log(`\n📋 Processing ${plantsToProcess.length} plant(s)`);
    if (skippedCount > 0) {
        console.log(`⏭️  ${skippedCount} plant(s) already have enough images - will be skipped`);
    }
    console.log(`⚠️ This may take a while - local AI validation is slower but free!\n`);
    
    let totalSuccess = 0;
    let totalSkipped = 0;
    for (const plant of plantsToProcess) {
        const count = await fetchImagesForPlant(plant);
        if (count > 0) {
            totalSuccess += count;
        } else if (await hasEnoughImages(plant)) {
            totalSkipped++;
        }
    }
    
    console.log(`\n✅ Complete! Successfully downloaded ${totalSuccess} images`);
    if (totalSkipped > 0) {
        console.log(`⏭️  Skipped ${totalSkipped} plants (already have images)`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { 
    fetchImagesForPlant, 
    checkOllamaSetup, 
    validateImageWithLocalAI, 
    batchValidateThumbnails, 
    loadAllPlants, 
    hasEnoughImages, 
    scientificNameToSlug,
    searchGBIFImages,
    searchPexels,
    searchGoogleImages,
    searchWikipediaImages,
    downloadImage
};
