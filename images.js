(function () {
'use strict';

let getImagesFolderHandle = () => null;

function init(deps = {}) {
    if (typeof deps.getImagesFolderHandle === 'function') {
        getImagesFolderHandle = deps.getImagesFolderHandle;
    }
}

function slugify(scientificName) {
    if (!scientificName) return null;
    const nameStr = typeof scientificName === 'string'
        ? scientificName
        : (scientificName.scientificName || scientificName.name || String(scientificName));
    if (!nameStr) return null;
    return nameStr
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function ensureUniqueImages(images) {
    if (!Array.isArray(images)) return [];
    return [...new Set(images.filter(img => img && img.trim()))];
}

/**
 * Resolve a plant image path to a full URL when Supabase is configured.
 * Relative paths (plants/, /storage/, or slug/filename) become full Supabase storage URLs
 * so img src works when the site is served from another origin (e.g. Netlify).
 */
function resolvePlantImageUrl(path) {
    if (!path || typeof path !== 'string') return path;
    if (/^https?:\/\//i.test(path)) return path;
    const base = (typeof window !== 'undefined' && window.SUPABASE_URL) ? String(window.SUPABASE_URL).replace(/\/$/, '') : '';
    const storagePrefix = base ? base + '/storage/v1/object/public/vivarium-assets/' : '';
    if (!storagePrefix) return path;
    if (path.startsWith('/storage/')) return base + path;
    if (path.startsWith('plants/')) return storagePrefix + path;
    if (path.indexOf('/') !== -1 && /\.(jpg|jpeg|png|gif|webp)$/i.test(path)) return storagePrefix + 'plants/' + path;
    return path;
}

/**
 * Normalize plant image path: legacy images/slug/ -> images/plants/slug/,
 * and resolve Supabase-relative paths to full URLs so images load when hosted elsewhere.
 */
function normalizePlantImagePath(path) {
    if (!path || typeof path !== 'string') return path;
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('plants/') || path.startsWith('/storage/') || (path.indexOf('/') !== -1 && /\.(jpg|jpeg|png|gif|webp)$/i.test(path)))
        return resolvePlantImageUrl(path);
    if (!path.startsWith('images/')) return resolvePlantImageUrl(path);
    if (path.startsWith('images/plants/')) return path;
    if (path.startsWith('images/supplies/') || path.startsWith('images/vivariums/')) return path;
    const match = path.match(/^images\/([^/]+)\/(.*)$/);
    if (match) return 'images/plants/' + match[1] + '/' + match[2];
    return path;
}

async function checkImageExists(imagePath) {
    if (!imagePath || !imagePath.startsWith('images/') || !imagePath.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        return false;
    }

    const imagesFolderHandle = getImagesFolderHandle();
    if (imagesFolderHandle) {
        try {
            const pathParts = imagePath.split('/').filter(Boolean);
            if (pathParts.length >= 2) {
                const fileName = pathParts[pathParts.length - 1];
                const dirParts = pathParts.slice(1, -1);
                let handle = imagesFolderHandle;
                for (const part of dirParts) {
                    handle = await handle.getDirectoryHandle(part);
                }
                await handle.getFileHandle(fileName);
                return true;
            }
        } catch (error) {
            return false;
        }
    }

    return new Promise((resolve) => {
        let resolved = false;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            if (!resolved) {
                resolved = true;
                resolve(false);
            }
        }, 400);

        const originalError = console.error;
        const originalWarn = console.warn;
        const originalLog = console.log;
        let errorSuppressed = false;

        const suppressConsole = () => {
            if (!errorSuppressed) {
                errorSuppressed = true;
                const errorFn = console.error;
                console.error = (...args) => {
                    const errorStr = args.join(' ');
                    // Suppress 404 errors from image existence checks
                    // Match various error formats: "404", "ERR_ABORTED 404", "File not found", etc.
                    if ((errorStr.includes('404') || errorStr.includes('File not found') || errorStr.includes('ERR_ABORTED')) 
                        && (errorStr.includes('images/') || errorStr.includes('checkImageExists') || errorStr.includes('.jpg'))) {
                        return; // Suppress this error
                    }
                    errorFn.apply(console, args);
                };
            }
        };

        const restoreConsole = () => {
            if (errorSuppressed) {
                console.error = originalError;
                console.warn = originalWarn;
                console.log = originalLog;
                errorSuppressed = false;
            }
        };

        suppressConsole();

        fetch(imagePath, {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-cache'
        })
        .then(response => {
            restoreConsole();
            clearTimeout(timeoutId);
            if (!resolved) {
                resolved = true;
                const contentType = response.headers.get('content-type');
                const isImage = contentType && contentType.startsWith('image/');
                resolve(response.ok && isImage);
            }
        })
        .catch(() => {
            restoreConsole();
            clearTimeout(timeoutId);
            if (!resolved) {
                resolved = true;
                resolve(false);
            }
        });
    });
}

async function discoverPlantImages(plant, knownImageCount = null) {
    if (!plant || !plant.scientificName) {
        return { images: [], imageUrl: null };
    }

    // Use catalog images when present (e.g. from Supabase) so hosted site shows full gallery without 404 probes
    const catalogImages = plant.images;
    if (Array.isArray(catalogImages) && catalogImages.length > 0) {
        const valid = catalogImages.filter(function (p) {
            if (!p || typeof p !== 'string') return false;
            if (p.startsWith('images/') || p.startsWith('plants/') || p.startsWith('/storage/') || /^https?:\/\//i.test(p)) return true;
            if (p.indexOf('/') !== -1 && /\.(jpg|jpeg|png|gif|webp)$/i.test(p)) return true;
            return false;
        });
        if (valid.length > 0) {
            const base = (typeof window !== 'undefined' && window.SUPABASE_URL) ? String(window.SUPABASE_URL).replace(/\/$/, '') : '';
            const storagePrefix = base ? base + '/storage/v1/object/public/vivarium-assets/' : '';
            const resolve = function (u) {
                if (!u || typeof u !== 'string') return u;
                if (/^https?:\/\//i.test(u)) return u;
                if (base && u.startsWith('/storage/')) return base + u;
                if (storagePrefix && u.startsWith('plants/')) return storagePrefix + u;
                if (storagePrefix && u.indexOf('/') !== -1 && /\.(jpg|jpeg|png|gif|webp)$/i.test(u)) return storagePrefix + 'plants/' + u;
                return u;
            };
            const resolved = valid.map(resolve);
            const imageUrl = plant.imageUrl ? resolve(plant.imageUrl) : resolved[0];
            return { images: resolved, imageUrl: imageUrl || resolved[0] };
        }
    }

    const plantId = plant.id;
    const folderName = slugify(plant.scientificName);
    if (!folderName) {
        return { images: [], imageUrl: null };
    }

    const discoveredImages = [];
    // Allow up to 20 numbered images per plant (1–20).
    // Heuristics below stop as soon as we hit the first gap, so in practice
    // we usually only probe up to the real max (e.g. 3) and avoid excess 404s.
    const maxCheck = 20;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 1;

    // Discover numbered images first (slug-1.jpg, slug-2.jpg, ...) so the primary image is full-size, not thumb
    let startCheck = 1;
    let limitCheck = maxCheck;
    // If we know the max image count from cache validation, use it as the limit
    // This prevents checking image 4 when we know only images 1-3 exist
    // CRITICAL: knownImageCount is the highest VALID image number
    // If knownImageCount=3, we should check images 1, 2, 3 (inclusive), but NOT 4
    // So limitCheck should be 3, and the loop should run for i=1,2,3 only
    if (knownImageCount !== null && knownImageCount > 0 && !isNaN(knownImageCount)) {
        // Only check up to the known max (inclusive) - don't check beyond it
        // If maxImage=3, limitCheck=3, loop runs for i=1,2,3
        // IMPORTANT: Use knownImageCount directly as the limit
        limitCheck = Math.min(knownImageCount, maxCheck);
        // Ensure we never check beyond the known limit
        if (limitCheck < startCheck) {
            return { images: [], imageUrl: null };
        }
        // CRITICAL: The loop condition is i <= limitCheck
        // If limitCheck=4, loop runs for i=1,2,3,4
        // But if maxImage=4 is incorrect (only 1-3 exist), we'll check 4 and get 404
        // Then we'll correct maxImage to 3, and next load won't check 4
        // This is unavoidable - we can't know image 4 doesn't exist without checking it
    }

    for (let i = startCheck; i <= limitCheck; i++) {
        // CRITICAL: If we have a known max, only check up to that number (inclusive)
        // If maxImage=3, we check images 1, 2, 3, but NOT 4
        // IMPORTANT: knownImageCount is the highest VALID image number that EXISTS
        // If knownImageCount=4, it means images 1-4 all exist. If only 1-3 exist, maxImage should be 3.
        // However, if localStorage has incorrect maxImage=4, we need to validate it.
        // Solution: If we've found images and the current index exceeds the highest found image + 1,
        // and we're at or beyond knownImageCount, stop to avoid unnecessary 404s.
        if (knownImageCount !== null && knownImageCount > 0 && !isNaN(knownImageCount)) {
            // Calculate the highest image number we've found so far
            let highestFoundSoFar = 0;
            const foundNumbers = new Set();
            for (const imgPath of discoveredImages) {
                const match = imgPath.match(/-(\d+)\./);
                if (match) {
                    const num = parseInt(match[1], 10);
                    foundNumbers.add(num);
                    if (num > highestFoundSoFar) {
                        highestFoundSoFar = num;
                    }
                }
            }
            // Check if we have a consecutive sequence starting from startCheck
            if (discoveredImages.length > 0 && highestFoundSoFar > 0) {
                // Check if images form a consecutive sequence from startCheck
                let isConsecutive = true;
                for (let j = startCheck; j <= highestFoundSoFar; j++) {
                    if (!foundNumbers.has(j)) {
                        isConsecutive = false;
                        break;
                    }
                }
                // If we have a consecutive sequence starting from startCheck,
                // be conservative - don't check beyond it to avoid 404s
                // If we found 1-3 consecutively, the sequence is likely complete
                // Don't check image 4+ to avoid 404s when maxImage is incorrectly stored
                if (isConsecutive && i > highestFoundSoFar) {
                    // We have a complete consecutive sequence, don't check beyond it
                    // This prevents checking image 4 when we found 1-3 and maxImage=4 is wrong
                    // Save maxImage based on what we found to prevent future 404s
                    if (highestFoundSoFar > 0 && plantId) {
                        try {
                            const key = `plant_${plantId}_maxImage`;
                            const currentMax = localStorage.getItem(key);
                            localStorage.setItem(key, highestFoundSoFar.toString());
                            // Silent correction - don't log to reduce console noise
                            // if (currentMax && currentMax !== highestFoundSoFar.toString()) {
                            //     console.log(`💾 Corrected maxImage from ${currentMax} to ${highestFoundSoFar} for plant ${plantId} (${plant.scientificName}) - consecutive sequence detected`);
                            // }
                        } catch (e) {
                            // silent
                        }
                    }
                    break;
                }
            }
            // Stop if checking way beyond knownImageCount
            if (i > knownImageCount + 1) {
                break;
            }
        }
        
        const imagePath = `images/plants/${folderName}/${folderName}-${i}.jpg`;
        const exists = await checkImageExists(imagePath);

        if (exists) {
            consecutiveFailures = 0;
            discoveredImages.push(imagePath);
        } else {
            consecutiveFailures++;
            // When we have no images yet, try at least up to image 5 (some plants have -2.jpg, -3.jpg but no -1.jpg)
            if (discoveredImages.length === 0 && i >= 5) {
                break;
            }
            // Stop immediately if we've found images and hit a failure
            // This prevents checking image 5 after image 4 fails
            if (discoveredImages.length > 0 && consecutiveFailures >= maxConsecutiveFailures) {
                // Save maxImage immediately to prevent checking beyond it next time
                // Calculate highest FOUND (valid) image number - this is the last image that EXISTS
                let highestFound = 0;
                for (const imgPath of discoveredImages) {
                    const match = imgPath.match(/-(\d+)\./);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > highestFound) {
                            highestFound = num;
                        }
                    }
                }
                // Save maxImage to localStorage so next load won't check beyond it
                // CRITICAL: Save the highest VALID image number (what we found), not what we checked
                // If we found images 1,2,3 but image 4 doesn't exist, save maxImage=3, not 4
                if (highestFound > 0 && plantId) {
                    try {
                        const key = `plant_${plantId}_maxImage`;
                        const currentMax = localStorage.getItem(key);
                        // Always save the correct value (highest found), even if it's the same
                        // This ensures maxImage is always correct
                        localStorage.setItem(key, highestFound.toString());
                        // Silent correction - don't log to reduce console noise
                        // if (currentMax && currentMax !== highestFound.toString()) {
                        //     console.log(`💾 Corrected maxImage from ${currentMax} to ${highestFound} for plant ${plantId} (${plant.scientificName})`);
                        // }
                    } catch (e) {
                        // silent
                    }
                }
                break;
            }
            // Stop early if no images found in first 2 checks
            if (startCheck === 1 && i <= 2 && discoveredImages.length === 0 && consecutiveFailures >= 2) {
                break;
            }
            // Stop if checking beyond known count
            if (knownImageCount !== null && knownImageCount > 0) {
                break;
            }
        }

        // Reduced delay - only every 5 images instead of every 2
        if (i > 1 && i % 5 === 0) {
            await new Promise(r => setTimeout(r, 10));
        }
    }

    // Do not add thumb.jpg to the gallery when we have numbered images - it's a duplicate of the main image and clutters the gallery

    const imageUrl = discoveredImages.length > 0 ? discoveredImages[0] : null;
    return { images: discoveredImages, imageUrl };
}

async function getPlantImages(plant, knownImageCount = null, options = {}) {
    if (!plant) {
        return { images: [], imageUrl: null };
    }
    // Skip HEAD requests when doing batch discovery for plants with no cached images (avoids console 404s)
    if (options.skipHeadRequests) {
        return { images: [], imageUrl: null };
    }
    // When opening plant modal we use forceFullDiscovery so we find all images (ignore stale maxImage)
    let maxImage = plant._knownMaxImage || knownImageCount;
    if (!options.forceFullDiscovery && (!maxImage || maxImage === 0)) {
        try {
            const key = `plant_${plant.id}_maxImage`;
            const savedMaxImage = localStorage.getItem(key);
            if (savedMaxImage) {
                maxImage = parseInt(savedMaxImage, 10);
                if (isNaN(maxImage) || maxImage <= 0) maxImage = null;
            }
        } catch (e) { /* silent */ }
    } else if (options.forceFullDiscovery) {
        maxImage = null; // check 1..maxCheck so we find all images in folder
    }
    // Pass maxImage as knownImageCount to prevent checking beyond it (null = check up to maxCheck)
    // CRITICAL: maxImage should be the highest VALID image number, so we check up to maxImage (inclusive)
    // If maxImage=3, we check images 1, 2, 3, but NOT 4
    return discoverPlantImages(plant, maxImage);
}

async function loadImagesFromLocalStorage(allPlants) {
    let loadedCount = 0;
    let validatedCount = 0;

    const validationPromises = allPlants.map(async (plant) => {
        try {
            if (Array.isArray(plant.images) && plant.images.length > 0) return;
            const savedImages = localStorage.getItem(`plant_${plant.id}_images`);
            const savedImageUrl = localStorage.getItem(`plant_${plant.id}_imageUrl`);
            const expectedFolderName = slugify(plant.scientificName);

            if (savedImages && expectedFolderName) {
                const parsedImages = JSON.parse(savedImages);
                if (Array.isArray(parsedImages) && parsedImages.length > 0) {
                    const normalizedParsed = parsedImages.map(p => normalizePlantImagePath(p));
                    const validImages = normalizedParsed.filter(imgPath => {
                        if (!imgPath || !imgPath.startsWith('images/')) return false;
                        const pathMatch = imgPath.match(/images\/(?:plants\/)?([^/]+)\//);
                        if (!pathMatch) return false;
                        const folderNameFromPath = pathMatch[1].replace(/^\d{5}-/, '');
                        return folderNameFromPath === expectedFolderName;
                    });

                    if (validImages.length > 0) {
                        const verifiedImages = [];
                        let highestValidNumber = 0;
                        let highestCheckedNumber = 0;
                        for (const imgPath of validImages) {
                            const match = imgPath.match(/-(\d+)\./);
                            if (match) {
                                const num = parseInt(match[1], 10);
                                if (num > highestCheckedNumber) highestCheckedNumber = num;
                            }
                            const pathToCheck = normalizePlantImagePath(imgPath);
                            if (await checkImageExists(pathToCheck)) {
                                verifiedImages.push(pathToCheck);
                                if (match) {
                                    const num = parseInt(match[1], 10);
                                    if (num > highestValidNumber) highestValidNumber = num;
                                }
                            }
                        }
                        if (verifiedImages.length > 0) {
                            // Don't replace catalog images with fewer (e.g. hosted site 404s for some images)
                            const catalogCount = Array.isArray(plant.images) ? plant.images.length : 0;
                            if (verifiedImages.length >= catalogCount) {
                                plant.images = ensureUniqueImages(verifiedImages);
                                const normalizedSavedUrl = normalizePlantImagePath(savedImageUrl || '');
                                if (normalizedSavedUrl && verifiedImages.includes(normalizedSavedUrl)) {
                                    plant.imageUrl = normalizedSavedUrl;
                                } else {
                                    plant.imageUrl = verifiedImages[0];
                                }
                                try {
                                    localStorage.setItem(`plant_${plant.id}_images`, JSON.stringify(plant.images));
                                    localStorage.setItem(`plant_${plant.id}_imageUrl`, plant.imageUrl);
                                    if (highestValidNumber > 0) {
                                        localStorage.setItem(`plant_${plant.id}_maxImage`, highestValidNumber.toString());
                                    }
                                } catch (e) { /* silent */ }
                            } else if (catalogCount > 0 && !plant.imageUrl) {
                                plant.imageUrl = plant.images[0];
                            }
                            loadedCount++;
                            validatedCount++;
                            return;
                        } else {
                            // No verified images, but we checked some
                            // IMPORTANT: Only save highest VALID number, not highest checked
                            // If we checked up to 4 but only 1-3 exist, save 3, not 4
                            if (highestValidNumber > 0) {
                                try {
                                    localStorage.setItem(`plant_${plant.id}_maxImage`, highestValidNumber.toString());
                                    plant._knownMaxImage = highestValidNumber;
                                } catch (e) {
                                    // silent
                                }
                            } else if (highestCheckedNumber > 0) {
                                // If no valid images found, but we checked some, don't save maxImage
                                // This prevents saving incorrect limits
                            }
                        }
                    }
                }
                // If we got here, cached images were invalid - clear them silently
                // IMPORTANT: Preserve maxImage - DO NOT clear it, as it prevents 404s
                // maxImage tells us the highest valid image number, which is still valid even if cache is cleared
                let maxImage = null;
                try {
                    const savedMaxImage = localStorage.getItem(`plant_${plant.id}_maxImage`);
                    if (savedMaxImage) {
                        maxImage = parseInt(savedMaxImage, 10);
                        // Only use if valid
                        if (isNaN(maxImage) || maxImage <= 0) {
                            maxImage = null;
                        }
                    }
                    // Clear images cache but KEEP maxImage
                    localStorage.removeItem(`plant_${plant.id}_images`);
                    localStorage.removeItem(`plant_${plant.id}_imageUrl`);
                    // maxImage stays in localStorage to prevent checking beyond it
                } catch (e) {
                    // silent
                }
                // Store maxImage for discovery to use
                if (maxImage && maxImage > 0) {
                    plant._knownMaxImage = maxImage;
                }
            }

            plant.images = [];
            plant.imageUrl = null;
        } catch (e) {
            if (!plant.images) {
                plant.images = [];
            }
            plant.imageUrl = null;
        }
    });

    await Promise.all(validationPromises);

    if (loadedCount > 0) {
        console.log(`📦 Loaded and validated images from localStorage for ${validatedCount} plants`);
    } else {
        console.log('📦 No valid cached images found - will discover from folders');
    }
}

async function scanExistingImages(plantFolderName, plant = null) {
    const existingImages = [];
    const existingNumbers = new Set();
    const verifiedImages = new Set();

    const plantImages = plant?.images;
    if (plantImages) {
        const normalizedPlantFolderName = plantFolderName.replace(/^\d{5}-/, '');

        for (const imgPath of plantImages) {
            if (!imgPath || typeof imgPath !== 'string' || !imgPath.trim()) continue;
            const trimmed = imgPath.trim();
            const isHttp = /^https?:\/\//i.test(trimmed);
            const isRelative = trimmed.startsWith('images/');
            if (!isHttp && !isRelative) continue;
            if (!isHttp && !trimmed.match(/\.(jpg|jpeg|png|gif|webp)$/i)) continue;

            const pathMatch = trimmed.match(/images\/(?:plants\/)?([^/]+)\/([^/]+)-(\d+)\.(jpg|jpeg|png|gif|webp)$/i);
            if (pathMatch) {
                const folderNameFromPath = pathMatch[1];
                const fileNamePrefix = pathMatch[2];
                const num = parseInt(pathMatch[3]);
                const normalizedFolderNameFromPath = folderNameFromPath.replace(/^\d{5}-/, '');

                if (normalizedFolderNameFromPath === normalizedPlantFolderName) {
                    const correctPath = `images/plants/${normalizedPlantFolderName}/${fileNamePrefix}-${num}.${pathMatch[4]}`;
                    existingNumbers.add(num);
                    if (!verifiedImages.has(correctPath)) {
                        existingImages.push(correctPath);
                        verifiedImages.add(correctPath);
                    }
                }
            } else if (isHttp || (isRelative && !pathMatch)) {
                // Full URL (e.g. Supabase Storage) or other path - keep as-is for gallery
                if (!verifiedImages.has(trimmed)) {
                    existingImages.push(trimmed);
                    verifiedImages.add(trimmed);
                }
            } else {
                const oldPathMatch = trimmed.match(/images\/(?:plants\/)?([^/]+)\/(\d{2})\.(jpg|jpeg|png|gif|webp)$/i);
                if (oldPathMatch) {
                    const folderNameFromPath = oldPathMatch[1];
                    const num = parseInt(oldPathMatch[2]);
                    const normalizedFolderNameFromPath = folderNameFromPath.replace(/^\d{5}-/, '');

                    if (normalizedFolderNameFromPath === normalizedPlantFolderName) {
                        const correctPath = `images/plants/${normalizedPlantFolderName}/${normalizedPlantFolderName}-${num}.${oldPathMatch[3]}`;
                        existingNumbers.add(num);
                        if (!verifiedImages.has(correctPath)) {
                            existingImages.push(correctPath);
                            verifiedImages.add(correctPath);
                        }
                    }
                }
            }
        }
    }
    // When no paths matched (e.g. catalog has different format), use catalog images as-is so hosted site shows them
    if (existingImages.length === 0 && plantImages && plantImages.length > 0) {
        for (const imgPath of plantImages) {
            const p = (imgPath && typeof imgPath === 'string') ? imgPath.trim() : '';
            if (p && (p.startsWith('images/') || /^https?:\/\//i.test(p)) && /\.(jpg|jpeg|png|gif|webp)$/i.test(p)) {
                existingImages.push(p);
            }
        }
    }

    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;
    const maxCheck = 10;
    const filenameBase = plantFolderName.replace(/^\d{5}-/, '');

    const plantsPrefix = 'images/plants/';
    for (let i = 1; i <= maxCheck; i++) {
        const testPath = `${plantsPrefix}${plantFolderName}/${filenameBase}-${i}.jpg`;
        const legacyTestPath = `images/${plantFolderName}/${filenameBase}-${i}.jpg`;
        if (verifiedImages.has(testPath) || verifiedImages.has(legacyTestPath)) {
            continue;
        }

        if (consecutiveFailures >= maxConsecutiveFailures) {
            break;
        }

        if (i > 1) {
            await new Promise(r => setTimeout(r, 100));
        }

        const exists = await checkImageExists(testPath) || await checkImageExists(legacyTestPath);
        const pathToAdd = exists ? testPath : null;
        if (exists) {
            consecutiveFailures = 0;
            if (!existingNumbers.has(i)) {
                existingNumbers.add(i);
                const resolvedPath = pathToAdd || testPath;
                if (!verifiedImages.has(resolvedPath)) {
                    existingImages.push(resolvedPath);
                    verifiedImages.add(resolvedPath);
                }
            }
        } else {
            const oldTestPath = `${plantsPrefix}${plantFolderName}/${plantFolderName}-${i}.jpg`;
            const oldLegacyPath = `images/${plantFolderName}/${plantFolderName}-${i}.jpg`;
            const oldExists = await checkImageExists(oldTestPath) || await checkImageExists(oldLegacyPath);
            if (oldExists) {
                consecutiveFailures = 0;
                if (!existingNumbers.has(i)) {
                    existingNumbers.add(i);
                    const oldPathToAdd = oldTestPath;
                    if (!verifiedImages.has(oldPathToAdd)) {
                        existingImages.push(oldPathToAdd);
                        verifiedImages.add(oldPathToAdd);
                    }
                }
            } else {
                consecutiveFailures++;
                if (existingNumbers.size > 0 && consecutiveFailures >= maxConsecutiveFailures) {
                    break;
                }
            }
        }
    }

    return { existingImages, existingNumbers };
}

const imageUtils = {
    init,
    ensureUniqueImages,
    normalizePlantImagePath,
    resolvePlantImageUrl,
    loadImagesFromLocalStorage,
    getPlantImages,
    scanExistingImages,
    checkImageExists
};

window.imageUtils = window.imageUtils || {};
Object.assign(window.imageUtils, imageUtils);
})();

