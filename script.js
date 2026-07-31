// Main application logic — shopper-mode hides edit buttons. Set after auth is ready (Supabase restores session async).
function applyShopperMode() {
    if (typeof window === 'undefined' || !document.body) return;
    var canManage = (window.auth && typeof window.auth.canManageInventory === 'function' && window.auth.canManageInventory());
    if (canManage) document.body.classList.remove('shopper-mode');
    else document.body.classList.add('shopper-mode');
}
if (typeof window !== 'undefined') {
    if (window.auth) {
        if (typeof window.auth.getUser === 'function') {
            window.auth.getUser().then(applyShopperMode).catch(function () { applyShopperMode(); });
        } else {
            applyShopperMode();
        }
        window.addEventListener('authStateChange', applyShopperMode);
    } else {
        document.body.classList.add('shopper-mode');
    }
}
let allPlants = [];
let filteredPlants = [];
let allEquipment = [];
let currentView = 'plants';

function dedupePlantsById(plants) {
    if (!plants || !plants.length) return plants || [];
    return plants.filter((p, i, arr) => p && p.id != null && arr.findIndex(x => x.id === p.id) === i);
}

const filterUtils = window.filterUtils;
if (!filterUtils) {
    throw new Error('filters.js must be loaded before script.js');
}
const {
    NUMERIC_SCALES,
    mapPlantToInputs,
    plantBelongsToTaxonomy,
    createDefaultAdvancedFilters
} = filterUtils;

let advancedFilters = createDefaultAdvancedFilters();

const imageUtils = window.imageUtils;
if (!imageUtils) {
    throw new Error('images.js must be loaded before script.js');
}
const {
    ensureUniqueImages,
    loadImagesFromLocalStorage,
    getPlantImages,
    scanExistingImages,
    checkImageExists,
    init: initImageUtils
} = imageUtils;

/** When running on localhost, sync localStorage-backed edits to repo (data/overrides/) via sync server so push reflects on hosted site.
 * Sync is only enabled if window.SYNC_API_ENABLED === true, to avoid noisy errors when no sync server is running.
 */
var REPO_SYNC_URL = (typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    && window.SYNC_API_ENABLED === true)
    ? window.location.origin
    : '';
var _repoSyncTimeout = null;
function syncToRepo() {
    if (!REPO_SYNC_URL) return;
    clearTimeout(_repoSyncTimeout);
    _repoSyncTimeout = setTimeout(function () {
        var list = window.allEquipment || [];
        var equipment = list.map(function (e) {
            var o = Object.assign({}, e);
            try {
                var edit = localStorage.getItem('equipment_' + e.id + '_edit');
                if (edit) {
                    var parsed = JSON.parse(edit);
                    if (parsed && typeof parsed === 'object') Object.assign(o, parsed);
                }
                var imgUrl = localStorage.getItem('equipment_' + e.id + '_imageUrl');
                var imgs = localStorage.getItem('equipment_' + e.id + '_images');
                if (imgUrl) o.imageUrl = imgUrl;
                if (imgs) try { o.images = JSON.parse(imgs); } catch (err) { }
            } catch (e) { }
            return o;
        });
        var plantEdits = {};
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf('plant_edit_') === 0) {
                    var id = key.replace('plant_edit_', '');
                    var val = localStorage.getItem(key);
                    if (val) {
                        try {
                            var overlay = JSON.parse(val);
                            var imgUrl = localStorage.getItem('plant_' + id + '_imageUrl');
                            var imgs = localStorage.getItem('plant_' + id + '_images');
                            if (imgUrl) overlay.imageUrl = imgUrl;
                            if (imgs) try { overlay.images = JSON.parse(imgs); } catch (err) { }
                            plantEdits[id] = overlay;
                        } catch (e) { }
                    }
                }
            }
        } catch (e) { }
        var vivariumEdits = {};
        var customVivariums = [];
        try { customVivariums = JSON.parse(localStorage.getItem('custom_vivariums') || '[]'); } catch (e) { }
        try {
            for (var j = 0; j < localStorage.length; j++) {
                var k = localStorage.key(j);
                if (k && k.indexOf('vivarium_') === 0 && k.indexOf('_edit') !== -1) {
                    var id = k.replace('vivarium_', '').replace('_edit', '');
                    var raw = localStorage.getItem(k);
                    if (raw) {
                        try {
                            var ed = JSON.parse(raw);
                            var vImg = localStorage.getItem('vivarium_' + id + '_imageUrl');
                            var vImgs = localStorage.getItem('vivarium_' + id + '_images');
                            if (vImg) ed.imageUrl = vImg;
                            if (vImgs) try { ed.images = JSON.parse(vImgs); } catch (err) { }
                            vivariumEdits[id] = ed;
                        } catch (e) { }
                    }
                }
            }
        } catch (e) { }
        fetch(REPO_SYNC_URL + '/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipment: equipment, plantEdits: plantEdits, vivariumEdits: vivariumEdits, customVivariums: customVivariums })
        }).catch(function () { });
    }, 600);
}

const PLANT_RENDER_BATCH_SIZE = 60; // Increased for faster initial render
let plantsPerPage = 24;
let currentPlantsPage = 1;
let currentRenderToken = 0;

/**
 * Convert a Supabase storage object URL to a resized render URL for use in cards/thumbnails.
 * Falls back to original URL for non-Supabase URLs.
 * @param {string} url  - full image URL
 * @param {number} width - desired width in px (default 360; kept modest to reduce Supabase egress)
 * @param {number} quality - JPEG/WebP quality 1-100 (default 60 for card thumbs to reduce egress)
 */
function getCardThumbUrl(url, width, quality) {
    if (!url || typeof url !== 'string') return url;
    if (!/^https?:\/\//i.test(url)) return url;
    var w = width || 480;
    var q = quality || 78;
    // Supabase Storage object URL pattern
    var match = url.match(/^(https:\/\/[^/]+)(\/storage\/v1\/object\/public\/)(.+)$/i);
    if (!match) return url;
    // resize=contain: server returns full image scaled to fit (no crop). We do the square crop in CSS (object-fit: cover).
    return match[1] + '/storage/v1/render/image/public/' + match[3] + '?width=' + w + '&quality=' + q + '&resize=contain';
}

/** Responsive srcset for card images (Supabase render widths). Empty string if not transformable. */
function getCardThumbSrcset(url, quality) {
    if (!url || typeof url !== 'string') return '';
    var q = quality || 78;
    var widths = [360, 480, 720, 960];
    var parts = [];
    for (var i = 0; i < widths.length; i++) {
        var u = getCardThumbUrl(url, widths[i], q);
        if (!u || u === url) return '';
        parts.push(u + ' ' + widths[i] + 'w');
    }
    return parts.join(', ');
}

/** sizes hint for catalog card grid — works for mobile (2-col) and desktop (multi-col). */
function getCardThumbSizes() {
    return '(max-width: 600px) 45vw, (max-width: 1024px) 30vw, 360px';
}

/**
 * Returns the full-resolution URL for a given image URL.
 * - Supabase URLs: returned as-is (Supabase serves full res without width params).
 * - Local paths: appends "-full" before the extension (e.g. slug-1.jpg → slug-1-full.jpg).
 *   Falls back to the original path if the full-res file doesn't exist (onerror on the img).
 */
function getFullResUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (/^https?:\/\//i.test(url)) return url;
    return url.replace(/(\d+)(\.jpe?g|\.png|\.gif|\.webp)$/i, '$1-full$2');
}

/** Width in px for card thumbnails; sized for sharp retina displays. */
function getCardThumbWidth() {
    if (typeof window === 'undefined' || !window.innerWidth) return 480;
    return window.innerWidth <= 768 ? 360 : 480;
}


// Convert scientific name to slug (matching folder naming convention)
function scientificNameToSlug(scientificName) {
    if (!scientificName) return null;
    // Handle both string and object formats; strip BOM so slugs/URLs are valid
    let nameStr = typeof scientificName === 'string'
        ? scientificName
        : (scientificName.scientificName || scientificName.name || String(scientificName));
    if (!nameStr) return null;
    if (nameStr.charCodeAt(0) === 0xFEFF) nameStr = nameStr.slice(1);
    return nameStr
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/** Generic slug for names (supplies / vivariums). */
function nameToSlug(name) {
    if (!name) return '';
    return String(name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Public SEO path for a catalog item. Collision-safe (appends -id when needed).
 * Matches netlify/functions/lib/catalog-seo.js so new catalog rows get stable URLs.
 */
function getCatalogSeoPath(type, item, list) {
    if (!item || item.id == null) return '/';
    const slugFn = (type === 'plant')
        ? function (p) { return scientificNameToSlug(p && p.scientificName) || nameToSlug(p && p.name) || String(p.id); }
        : function (p) { return nameToSlug(p && p.name) || String(p.id); };
    const used = new Set();
    const items = Array.isArray(list) ? list : [item];
    let chosen = '';
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || it.hidden) continue;
        let base = slugFn(it) || String(it.id);
        let slug = base;
        if (used.has(slug)) slug = base + '-' + it.id;
        used.add(slug);
        if (it.id == item.id) chosen = slug;
    }
    if (!chosen) {
        chosen = slugFn(item) || String(item.id);
    }
    if (type === 'plant') return '/plants/' + chosen;
    if (type === 'supply') return '/supplies/' + chosen;
    return '/vivariums/' + chosen;
}

function setCatalogSeoUrl(type, item, list) {
    if (!history.replaceState) return;
    try {
        history.replaceState(null, '', getCatalogSeoPath(type, item, list));
    } catch (e) { /* ignore */ }
}

window.getCatalogSeoPath = getCatalogSeoPath;

// Load plants from modular structure or fallback to data.js
async function initializePlants() {
    console.log('Initializing plants...');
    
    // Wait a bit for scripts to load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Priority 1: Check if modular loader has populated window.plantsDatabase
    if (typeof window !== 'undefined' && window.plantsDatabase && Array.isArray(window.plantsDatabase) && window.plantsDatabase.length > 0) {
        allPlants = dedupePlantsById(window.plantsDatabase || []);
        console.log(`✅ Loaded ${allPlants.length} plants from modular loader`);
        filteredPlants = [...allPlants];
        if (window.inventoryDb && window.inventoryDb.mergeInventoryIntoPlants) {
            await window.inventoryDb.mergeInventoryIntoPlants(allPlants);
        }
        clearPlantVivariumTypesCache();
        initializeUI();
        return;
    }
    
    // Priority 2: Wait for plantsLoaded event from modular loader
    await new Promise((resolve) => {
        let resolved = false;
        let pollInterval = null; // Declare before handler
        
        // Polling mechanism to check for plants periodically
        let pollCount = 0;
        const maxPolls = 60; // Check for up to 30 seconds (60 * 500ms)
        
        const handler = (e) => {
            if (resolved) return;
            resolved = true;
            window.removeEventListener('plantsLoaded', handler);
            if (pollInterval) clearInterval(pollInterval); // Stop polling if event fires
            
            console.log('🔔 plantsLoaded event received:', e.detail);
            
            // Always check window.plantsDatabase first (most reliable)
            if (window.plantsDatabase && Array.isArray(window.plantsDatabase) && window.plantsDatabase.length > 0) {
                allPlants = dedupePlantsById(window.plantsDatabase);
                console.log(`✅ Loaded ${allPlants.length} plants from window.plantsDatabase (event)`);
                var firstWithImg = allPlants.find(function (p) { return p.images && p.images.length > 0; });
                if (firstWithImg) {
                    console.log('[plant-images] script.js received first plant with images:', { id: firstWithImg.id, name: firstWithImg.name, imageUrl: firstWithImg.imageUrl, images0: firstWithImg.images[0], imageUrlIsFull: !!(firstWithImg.imageUrl && /^https?:/i.test(firstWithImg.imageUrl)) });
                }
            } else if (e.detail?.plants && Array.isArray(e.detail.plants) && e.detail.plants.length > 0) {
                allPlants = dedupePlantsById(e.detail.plants);
                console.log(`✅ Loaded ${allPlants.length} plants from event detail`);
            } else if (typeof plantsDatabase !== 'undefined' && Array.isArray(plantsDatabase) && plantsDatabase.length > 0) {
                allPlants = dedupePlantsById(plantsDatabase);
                console.log(`✅ Loaded ${allPlants.length} plants from data.js (event)`);
            } else {
                console.warn('⚠️ No plants found in event - will continue polling...');
                console.log('window.plantsDatabase:', window.plantsDatabase);
                console.log('global plantsDatabase:', typeof plantsDatabase !== 'undefined' ? plantsDatabase : 'undefined');
                // Don't resolve yet - let polling continue
                resolved = false;
                return;
            }
            resolve();
        };
        
        // Check if event already fired (plants already loaded)
        if (window.plantsDatabase && Array.isArray(window.plantsDatabase) && window.plantsDatabase.length > 0) {
            allPlants = dedupePlantsById(window.plantsDatabase);
            console.log(`✅ Loaded ${allPlants.length} plants (already available)`);
            resolve();
            return;
        }
        
        console.log('⏳ Waiting for plantsLoaded event...');
        window.addEventListener('plantsLoaded', handler);
        
        // Start polling
        pollInterval = setInterval(() => {
            pollCount++;
            if (resolved) {
                clearInterval(pollInterval);
                return;
            }
            
            // Check if plants are loaded
            if (window.plantsDatabase && Array.isArray(window.plantsDatabase) && window.plantsDatabase.length > 0) {
                resolved = true;
                clearInterval(pollInterval);
                window.removeEventListener('plantsLoaded', handler);
                allPlants = dedupePlantsById(window.plantsDatabase);
                console.log(`✅ Loaded ${allPlants.length} plants (polling check)`);
                resolve();
            } else if (pollCount >= maxPolls) {
                // Final timeout after polling
                resolved = true;
                clearInterval(pollInterval);
                window.removeEventListener('plantsLoaded', handler);
                
                console.log('⏰ Final timeout reached after polling, checking all sources...');
                
                // Final check
                if (window.plantsDatabase && Array.isArray(window.plantsDatabase) && window.plantsDatabase.length > 0) {
                    allPlants = dedupePlantsById(window.plantsDatabase);
                    console.log(`✅ Loaded ${allPlants.length} plants (final timeout fallback)`);
                } else if (typeof plantsDatabase !== 'undefined' && Array.isArray(plantsDatabase) && plantsDatabase.length > 0) {
                    allPlants = dedupePlantsById(plantsDatabase);
                    console.log(`✅ Loaded ${allPlants.length} plants from data.js (final timeout)`);
                } else {
                    console.error('❌ No plants loaded after extended timeout!');
                    console.log('Debug info:');
                    console.log('  - window.plantsDatabase:', window.plantsDatabase);
                    console.log('  - typeof plantsDatabase:', typeof plantsDatabase);
                    console.log('  - window.location.protocol:', window.location.protocol);
                }
                resolve();
            }
        }, 500); // Check every 500ms
    });
    
    // Final check - sometimes plants load right after the promise resolves
    if (allPlants.length === 0) {
        // Wait a bit more and check again
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (window.plantsDatabase && Array.isArray(window.plantsDatabase) && window.plantsDatabase.length > 0) {
            allPlants = dedupePlantsById(window.plantsDatabase);
            console.log(`✅ Loaded ${allPlants.length} plants (final check after promise)`);
        }
    }
    
    filteredPlants = [...allPlants];
    if (allPlants.length > 0 && window.inventoryDb && window.inventoryDb.mergeInventoryIntoPlants) {
        await window.inventoryDb.mergeInventoryIntoPlants(allPlants);
    }
    console.log(`📊 Initialization complete: ${allPlants.length} plants loaded, ${filteredPlants.length} after initial filter`);
    
    // Initialize the UI
    if (allPlants.length > 0) {
        initializeUI();
    } else {
        console.error('❌ No plants loaded! Check console for errors.');
        console.log('Debugging info:');
        console.log('  - window.plantsDatabase:', window.plantsDatabase?.length || 'undefined');
        console.log('  - typeof plantsDatabase:', typeof plantsDatabase !== 'undefined' ? plantsDatabase?.length || 'empty' : 'undefined');
        
        // Show a retry button instead of just an error
        const plantsGrid = document.getElementById('plantsGrid');
        if (plantsGrid) {
            plantsGrid.innerHTML = `
                <div class="error-message" style="text-align: center; padding: 2rem;">
                    <p style="font-size: 1.2rem; margin-bottom: 1rem;">⚠️ Unable to load plant data</p>
                    <p style="margin-bottom: 1rem;">Plants are still loading. Please wait a moment...</p>
                    <button onclick="location.reload()" style="padding: 0.75rem 1.5rem; font-size: 1rem; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry / Refresh Page
                    </button>
                    <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-light);">Check browser console (F12) for detailed error messages</p>
                </div>
            `;
        }
        
        // Try one more time after a delay
        setTimeout(() => {
            if (window.plantsDatabase && Array.isArray(window.plantsDatabase) && window.plantsDatabase.length > 0) {
                allPlants = dedupePlantsById(window.plantsDatabase);
                filteredPlants = [...allPlants];
                console.log(`✅ Loaded ${allPlants.length} plants (delayed retry)`);
                initializeUI();
            }
        }, 2000);
    }
}

async function initializeUI() {
    console.log('🎨 Initializing UI...');
    
    setupShopTabs();
    
    // Read taxonomy filter from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const taxonomyRank = urlParams.get('taxonomyRank');
    const taxonomyName = urlParams.get('taxonomyName');
    const urlSearchQ = urlParams.get('q');
    
    if (taxonomyRank && taxonomyName) {
        advancedFilters.taxonomy.rank = taxonomyRank;
        advancedFilters.taxonomy.name = taxonomyName;
        console.log(`🌳 Taxonomy filter applied: ${taxonomyRank} = ${taxonomyName}`);
    }

    if (urlSearchQ) {
        searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = urlSearchQ;
            var navSearch = document.getElementById('navSearch');
            if (navSearch) navSearch.classList.add('open');
        }
    }
    
    console.log(`📊 Plants ready: ${allPlants.length} plants`);
    
    // Single source: when Supabase is configured, use only catalog (no localStorage). Otherwise allow localStorage fallback.
    var supabaseOnly = !!(typeof window !== 'undefined' && window.SUPABASE_URL);
    let imagesLoadedCount = 0;
    allPlants.forEach(plant => {
        try {
            var catalogCount = Array.isArray(plant.images) ? plant.images.length : 0;
            if (catalogCount > 0) {
                plant.imageUrl = plant.imageUrl || plant.images[0];
                return;
            }
            if (supabaseOnly) {
                plant.images = plant.images || [];
                return;
            }
            const savedImages = localStorage.getItem(`plant_${plant.id}_images`);
            const savedImageUrl = localStorage.getItem(`plant_${plant.id}_imageUrl`);
            if (savedImages) {
                const parsedImages = JSON.parse(savedImages);
                if (Array.isArray(parsedImages) && parsedImages.length > 0) {
                    const expectedSlug = scientificNameToSlug(plant.scientificName);
                    const prefixLegacy = expectedSlug ? `images/${expectedSlug}/` : null;
                    const prefixPlants = expectedSlug ? `images/plants/${expectedSlug}/` : null;
                    const validImages = (prefixLegacy || prefixPlants)
                        ? parsedImages.filter(p => typeof p === 'string' && (prefixLegacy && p.startsWith(prefixLegacy) || prefixPlants && p.startsWith(prefixPlants)))
                        : [];
                    if (validImages.length > 0) {
                        plant.images = validImages;
                        plant.imageUrl = (savedImageUrl && validImages.includes(savedImageUrl)) ? savedImageUrl : validImages[0];
                        imagesLoadedCount++;
                    } else {
                        plant.images = plant.images || [];
                    }
                } else {
                    plant.images = plant.images || [];
                }
            } else {
                plant.images = plant.images || [];
            }
        } catch (e) {
            if (!(Array.isArray(plant.images) && plant.images.length > 0)) plant.images = plant.images || [];
        }
    });
    console.log(supabaseOnly ? '📦 Plant images: Supabase only (single source)' : `📦 Quick-loaded ${imagesLoadedCount} plant images from localStorage`);

    // When Supabase-only and catalog has no images, discover from Storage (list bucket prefix) so gallery matches Storage
    if (supabaseOnly && window.supabaseDb && typeof window.supabaseDb.listStoragePaths === 'function') {
        var discoveryPromises = [];
        allPlants.forEach(function (plant) {
            if (Array.isArray(plant.images) && plant.images.length > 0) return;
            var slug = scientificNameToSlug(getScientificNameString(plant));
            if (!slug) return;
            discoveryPromises.push(
                window.supabaseDb.listStoragePaths('plants/' + slug + '/').then(function (urls) {
                    if (urls && urls.length > 0) {
                        plant.images = urls;
                        plant.imageUrl = urls[0];
                    }
                })
            );
        });
        if (discoveryPromises.length > 0) {
            Promise.all(discoveryPromises).then(function () {
                applyAllFilters();
            }).catch(function () {});
        }
    }

    // Second: Apply filters and render IMMEDIATELY (images are now available)
    applyAllFilters();
    
    // Third: Validate only current page's cached images (fast), then discover for current page.
    // On mobile, defer until idle so initial paint isn't blocked (slower CPU + network).
    var isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    var scheduleDiscovery = function () {
        var start = (currentPlantsPage - 1) * plantsPerPage;
        var pagePlants = (filteredPlants || []).slice(start, start + plantsPerPage);
        loadImagesFromLocalStorage(pagePlants.length ? pagePlants : []).then(function () {
            (pagePlants.length ? pagePlants : []).forEach(function (plant) {
                if (plant && plant.imageUrl) updatePlantCardImage(plant.id, plant.imageUrl);
            });
            discoverImagesForCurrentPage();
        }).catch(function () { discoverImagesForCurrentPage(); });
    };
    if (isMobile && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(scheduleDiscovery, { timeout: 1200 });
    } else {
        setTimeout(scheduleDiscovery, isMobile ? 400 : 200);
    }
    
    // Note: Image scanning is now disabled on page load to prevent console flooding
    // Images will be checked only when:
    // - User opens a plant modal (gallery refresh)
    // - User manually triggers refresh
    // - User uploads a new image

    // Open item from URL (e.g. from inventory: index.html?tab=plants&id=123)
    const tabParam = urlParams.get('tab');
    const idParam = urlParams.get('id');
    const addParam = urlParams.get('add');
    if (tabParam && idParam) {
        const numId = parseInt(idParam, 10);
        if (!isNaN(numId)) {
            const tabPlantsEl = document.getElementById('tabPlants');
            const tabEquipmentEl = document.getElementById('tabEquipment');
            const tabVivariumsEl = document.getElementById('tabVivariums');
            const tabEl = tabParam === 'plants' ? tabPlantsEl : (tabParam === 'equipment' ? tabEquipmentEl : (tabParam === 'vivariums' ? tabVivariumsEl : null));
            if (tabEl) {
                tabEl.click();
                if (tabParam === 'plants') {
                    setTimeout(function() {
                        if (allPlants && allPlants.length) {
                            const plant = allPlants.find(function(p) { return p.id === numId; });
                            if (plant) showPlantModal(plant);
                        }
                    }, 0);
                } else if (tabParam === 'equipment') {
                    ensureEquipmentLoaded().then(function() {
                        const equipment = allEquipment.find(function(e) { return e.id === numId; });
                        if (equipment) showEquipmentDetail(equipment);
                    });
                } else if (tabParam === 'vivariums') {
                    ensureVivariumsLoaded().then(function() {
                        const vivarium = allVivariums.find(function(v) { return v.id === numId; });
                        if (vivarium) showVivariumDetail(vivarium);
                    });
                }
            }
        }
    } else if (addParam === 'plant' || addParam === 'equipment' || addParam === 'vivarium') {
        var canAddItems = typeof auth !== 'undefined' && auth && ((auth.isOwner && auth.isOwner()) || (auth.isAdmin && auth.isAdmin()));
        if (canAddItems) {
            var inAddIframe = window.self !== window.top;
            var tabPlantsEl = document.getElementById('tabPlants');
            var tabEquipmentEl = document.getElementById('tabEquipment');
            var tabVivariumsEl = document.getElementById('tabVivariums');
            var tabEl = addParam === 'plant' ? tabPlantsEl : (addParam === 'equipment' ? tabEquipmentEl : tabVivariumsEl);
            if (tabEl && !inAddIframe) tabEl.click();
            setTimeout(function() {
                if (addParam === 'plant' && typeof window.openImageUpload === 'function') window.openImageUpload(null);
                else if (addParam === 'equipment' && typeof openEquipmentEdit === 'function') openEquipmentEdit(null);
                else if (addParam === 'vivarium' && typeof openVivariumEdit === 'function') openVivariumEdit(null);
                if (inAddIframe) {
                    document.documentElement.classList.remove('embed-add-standby');
                    document.documentElement.classList.add('embed-add-active');
                }
            }, 0);
        }
    }
    var editParam = urlParams.get('edit');
    var editIdParam = urlParams.get('id') || urlParams.get('editId');
    if (editParam && window.self !== window.top) {
        document.documentElement.classList.remove('embed-add-standby');
        document.documentElement.classList.add('embed-add-active');
    }
    if (editParam === 'equipment' && editIdParam) {
        var editId = parseInt(editIdParam, 10);
        if (!isNaN(editId)) setTimeout(function() {
            var list = window.allEquipment || [];
            var item = list.find(function(e) { return e.id === editId; });
            if (item && typeof openEquipmentEdit === 'function') openEquipmentEdit(item);
        }, 100);
    } else if (editParam === 'vivarium' && editIdParam) {
        var vid = parseInt(editIdParam, 10);
        if (!isNaN(vid)) setTimeout(function() {
            var vlist = window.allVivariums || [];
            var vitem = vlist.find(function(v) { return v.id === vid; });
            if (vitem && typeof openVivariumEdit === 'function') openVivariumEdit(vitem);
        }, 100);
    } else if (editParam === 'plant' && editIdParam) {
        var pid = parseInt(editIdParam, 10);
        if (!isNaN(pid)) setTimeout(function() {
            var plist = window.allPlants || window.plantsDatabase || [];
            var pitem = plist.find(function(p) { return p.id === pid; });
            if (pitem && typeof window.openImageUpload === 'function') window.openImageUpload(pitem.id);
        }, 100);
    }
}
let sortField = 'scientific';
let sortDirection = 'asc';
let equipmentSortField = 'name';
let equipmentSortDirection = 'asc';

const PLANT_SORT_OPTIONS = [
    { value: 'name', label: 'Name' },
    { value: 'scientific', label: 'Scientific Name' },
    { value: 'rarity', label: 'Rarity' },
    { value: 'difficulty', label: 'Difficulty' },
    { value: 'temperature', label: 'Temperature' },
    { value: 'humidity', label: 'Humidity' },
    { value: 'light', label: 'Light Requirements' },
    { value: 'growthRate', label: 'Growth Rate' },
    { value: 'price', label: 'Price' },
    { value: 'topSeller', label: 'Top Seller' },
    { value: 'userRatings', label: 'User Ratings' }
];
const EQUIPMENT_SORT_OPTIONS = [
    { value: 'name', label: 'Name' },
    { value: 'price', label: 'Price' },
    { value: 'topSeller', label: 'Top Seller' },
    { value: 'userRatings', label: 'User Ratings' }
];

const VIVARIUM_SORT_OPTIONS = [
    { value: 'name', label: 'Name' },
    { value: 'price', label: 'Price' },
    { value: 'type', label: 'Type' },
    { value: 'userRatings', label: 'User Ratings' }
];

// DOM Elements
const plantsGrid = document.getElementById('plantsGrid');
let searchInput = document.getElementById('searchInput');
let searchBtn = document.getElementById('searchBtn');
const sortSelect = document.getElementById('sortSelect');
const sortDirectionBtn = document.getElementById('sortDirectionBtn');
const filterToggle = document.getElementById('filterToggle');
const filtersSidebar = document.getElementById('filtersSidebar');
const filtersSidebarWrapper = document.getElementById('filtersSidebarWrapper');
const plantCount = document.getElementById('plantCount');
const plantsPagination = document.getElementById('plantsPagination');
const loading = document.getElementById('loading');
const plantModal = document.getElementById('plantModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.querySelector('.close');
const listView = document.getElementById('listView');
const mainContent = document.querySelector('.main-content');
const mainLayout = document.querySelector('.main-layout');
const plantDetailPanel = document.getElementById('plantDetailPanel');
const plantPanelBack = document.getElementById('plantPanelBack');

function resetDetailPanelScroll() {
    if (modalBody) modalBody.scrollTop = 0;
    if (plantDetailPanel) plantDetailPanel.scrollTop = 0;
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
}

// Shared mono stroke-style SVGs (same look across site)
const CART_ICON_SVG = '<svg class="cart-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
const PLACEHOLDER_EQUIPMENT_SVG = '<svg class="placeholder-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
const PLACEHOLDER_PLANT_SVG = '<svg class="placeholder-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.5 6c.5-2 1.5-3 3-3 1.5 0 2.5 1 3 3A7 7 0 0 1 13 20z"/></svg>';

/** Units that use whole numbers only. Used for quick-add step (integer vs float). */
const INTEGER_UNITS_QUICKADD = /^(pcs?|piece[s]?|each|unit[s]?|box(?:es)?|pack[s]?|ct|no\.?|bag[s]?|set[s]?|pair[s]?|bottle[s]?|can[s]?|jar[s]?|pot[s]?)$/i;
function isIntegerUnitQuickAdd(unit) {
    if (!unit || typeof unit !== 'string') return false;
    return INTEGER_UNITS_QUICKADD.test(unit.trim());
}

/**
 * Unified quick-add HTML for main page and builder. item: { id, unit, stockQuantity }. opts: { dataPlantId, label, value, min, max, step, disabled, maxedClass }.
 * Shows unit next to qty input when present. step derived from unit if not in opts.
 */
function getQuickAddHtml(item, opts) {
    opts = opts || {};
    const stock = typeof item !== 'undefined' && typeof item.stockQuantity === 'number' && item.stockQuantity >= 0 ? item.stockQuantity : 999;
    const max = opts.max != null ? opts.max : Math.min(999, stock);
    const min = opts.min != null ? opts.min : (isIntegerUnitQuickAdd(item && item.unit) ? 1 : 0);
    const step = opts.step != null ? opts.step : (isIntegerUnitQuickAdd(item && item.unit) ? 1 : 0.001);
    const value = opts.value != null ? opts.value : 1;
    const unit = (item && item.unit != null && String(item.unit).trim() !== '') ? String(item.unit).trim() : '';
    const dataPlantId = opts.dataPlantId != null ? opts.dataPlantId : (item && item.id);
    const cartQty = opts.cartQuantity != null ? parseFloat(opts.cartQuantity) : 0;
    const displayUnit = opts.unit != null ? String(opts.unit).trim() : unit;
    const hasQty = cartQty > 0;
    const label = hasQty ? formatQuickAddQtyUnit(cartQty, displayUnit) : (opts.label != null ? opts.label : 'Add to cart');
    const disabled = opts.disabled ? ' disabled' : '';
    const maxedClass = opts.maxedClass ? ' quick-add-btn-maxed' : '';
    const hasQtyClass = hasQty ? ' quick-add-has-qty' : '';
    const unitEsc = unit ? escapeHtml(unit) : '';
    return '<div class="quick-add-wrap" data-plant-id="' + dataPlantId + '" data-unit="' + escapeHtml(displayUnit) + '">' +
        '<button type="button" class="quick-add-btn' + maxedClass + hasQtyClass + '" aria-label="' + escapeHtml(label || 'Add to cart') + '" data-plant-id="' + dataPlantId + '"' + disabled + '>' +
        '<span class="quick-add-icon" aria-hidden="true">' + CART_ICON_SVG + '</span><span class="quick-add-label">' + escapeHtml(label) + '</span></button>' +
        '<div class="quick-add-expanded hidden">' +
        '<div class="quick-add-expanded-row">' +
        '<input type="number" class="quick-add-qty" value="' + value + '" min="' + min + '" max="' + max + '" step="' + step + '" aria-label="Quantity' + (unit ? ' in ' + unitEsc : '') + '" data-plant-id="' + dataPlantId + '">' +
        (unitEsc ? '<span class="quick-add-unit" aria-hidden="true">' + unitEsc + '</span>' : '') +
        '<div class="quick-add-stepper" aria-label="Quantity stepper">' +
        '<button type="button" class="quick-add-plus" aria-label="Increase quantity">+</button>' +
        '<button type="button" class="quick-add-minus" aria-label="Decrease quantity">−</button></div>' +
        '<button type="button" class="quick-add-confirm" data-plant-id="' + dataPlantId + '">Add</button></div></div></div>';
}
if (typeof window !== 'undefined') {
    window.CART_ICON_SVG = CART_ICON_SVG;
    window.getQuickAddHtml = getQuickAddHtml;
    window.getCartQuantityForItem = getCartQuantityForItem;
    window.setCartQuantityForItem = setCartQuantityForItem;
    window.formatQuickAddQtyUnit = formatQuickAddQtyUnit;
    window.isIntegerUnitQuickAdd = isIntegerUnitQuickAdd;
    window.getCardThumbUrl = getCardThumbUrl;
    window.getCardThumbWidth = getCardThumbWidth;
    window.getCardThumbSrcset = getCardThumbSrcset;
    window.getCardThumbSizes = getCardThumbSizes;
}

const CART_STORAGE_KEY = 'terrarium_cart';
const cartToggle = document.getElementById('cartToggle');
const cartCountEl = document.getElementById('cartCount');
const cartOverlay = document.getElementById('cartOverlay');
const cartDrawer = document.getElementById('cartDrawer');
const cartItemsEl = document.getElementById('cartItems');
const cartClose = document.getElementById('cartClose');
const cartEmptyMsg = document.getElementById('cartEmptyMsg');
const cartTotalEl = document.getElementById('cartTotal');
const cartCheckoutBtn = document.getElementById('cartCheckoutBtn');
const cartClearBtn = document.getElementById('cartClearBtn');

function getCart() {
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function getCartQuantityForItem(itemId) {
    const cart = getCart();
    const item = cart.find(i => i.plantId == itemId);
    return item && item.quantity != null ? parseFloat(item.quantity) : 0;
}

function formatQuickAddQtyUnit(qty, unit) {
    if (qty <= 0) return '';
    const q = (qty % 1 === 0) ? String(Math.round(qty)) : String(qty);
    const u = (unit != null && String(unit).trim() !== '') ? ' ' + String(unit).trim() : '';
    return q + u;
}

/** Normalize a product unit string; empty/whitespace → ''. */
function normalizeProductUnit(unit) {
    if (unit == null) return '';
    const u = String(unit).trim();
    return u;
}

/** Look up unit from plants/equipment catalogs when a cart/order line is missing it. */
function resolveItemUnit(item) {
    if (!item) return '';
    const fromItem = normalizeProductUnit(item.unit);
    if (fromItem) return fromItem;
    const id = item.plantId != null ? item.plantId : item.id;
    if (id == null) return '';
    const idNum = Number(id);
    const matchId = function (x) {
        if (!x || x.id == null) return false;
        return x.id == id || Number(x.id) === idNum;
    };
    const plants = (typeof allPlants !== 'undefined' && allPlants) ? allPlants
        : (window.allPlants || window.plantsDatabase || []);
    const equipment = (typeof allEquipment !== 'undefined' && allEquipment) ? allEquipment
        : (window.allEquipment || window.equipmentData || []);
    const vivariums = (typeof allVivariums !== 'undefined' && allVivariums) ? allVivariums
        : (window.allVivariums || []);
    const lists = [plants, equipment, vivariums];
    for (let i = 0; i < lists.length; i++) {
        const list = lists[i];
        if (!Array.isArray(list)) continue;
        const found = list.find(matchId);
        if (found) {
            const u = normalizeProductUnit(found.unit);
            if (u) return u;
        }
    }
    return '';
}

/** Display quantity with unit, e.g. "2 piece" or "1.5 kg". */
function formatQtyWithUnit(quantity, unit) {
    const qty = Number(quantity);
    const qtyDisplay = (!isNaN(qty) && qty % 1 !== 0) ? qty : (isNaN(qty) ? 0 : Math.round(qty));
    const u = normalizeProductUnit(unit);
    return u ? (qtyDisplay + ' ' + u) : String(qtyDisplay);
}
window.resolveItemUnit = resolveItemUnit;
window.formatQtyWithUnit = formatQtyWithUnit;
window.normalizeProductUnit = normalizeProductUnit;

function setCart(items) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    updateCartUI();
    updateQuickAddButtonsState();
    // Nav may have re-rendered (auth), so always refresh the live badge node
    if (typeof window.updateNavCartCount === 'function') window.updateNavCartCount();
}
const DEFAULT_SELL_PRICE_KD = 2;
function getPlantPrice(plant) {
    const p = plant && (plant.price !== undefined && plant.price !== null && plant.price !== '') ? plant.price : null;
    if (p == null) return DEFAULT_SELL_PRICE_KD;
    const n = Number(p);
    return isNaN(n) ? DEFAULT_SELL_PRICE_KD : n;
}
function formatPrice(amount) {
    if (amount == null || isNaN(Number(amount))) return null;
    // Round to 0.00, display as 0.000 (e.g. 2.222 → 2.220)
    var rounded = roundSellPrice(amount);
    if (rounded == null) return null;
    return 'KD ' + rounded.toFixed(3);
}
/** Round sell/display price to 0.00. */
function roundSellPrice(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return null;
    return Math.round(n * 100) / 100;
}
if (typeof window !== 'undefined') {
    window.roundSellPrice = roundSellPrice;
    window.formatPrice = formatPrice;
}
function formatPlantPrice(plant) {
    return formatPrice(getPlantPrice(plant));
}
function addToCart(plant, quantity) {
    const cart = getCart();
    const id = plant.id;
    const existing = cart.find(i => i.plantId === id);
    const qty = Math.max(0.001, parseFloat(quantity) || 1);
    const price = getPlantPrice(plant);
    const unit = normalizeProductUnit(plant.unit) || null;
    if (existing) {
        existing.quantity += qty;
        if (!normalizeProductUnit(existing.unit) && unit) existing.unit = unit;
    } else {
        cart.push({
            plantId: id,
            name: plant.name || 'Plant',
            scientificName: getScientificNameString(plant),
            quantity: qty,
            price: price,
            unit: unit || undefined
        });
    }
    setCart(cart);
    // Show toast instead of auto-opening the drawer — less disruptive,
    // user can open the cart manually via the nav icon.
    if (typeof quickAddShowToast === 'function') {
        const label = plant.name ? '\u2713 ' + plant.name + ' added' : '\u2713 Added to cart';
        quickAddShowToast(label);
    }
    // Bounce the cart badge so users see the count update
    if (typeof window.navBounceCartCount === 'function') window.navBounceCartCount();
}

/** Set cart quantity for an item (replace, don't add). qty <= 0 removes the line. For builder quick-add so checkbox + cart stay in sync. */
function setCartQuantityForItem(item, qty) {
    const cart = getCart();
    const id = item.id;
    const existing = cart.find(i => i.plantId == id);
    const num = parseFloat(qty);
    if (num == null || isNaN(num) || num < 0) return;
    if (num <= 0) {
        const next = cart.filter(i => i.plantId != id);
        setCart(next);
    } else {
        const quantity = num;
        const price = getPlantPrice(item);
        const unit = normalizeProductUnit(item.unit) || null;
        if (existing) {
            existing.quantity = quantity;
            if (!normalizeProductUnit(existing.unit) && unit) existing.unit = unit;
            else if (unit) existing.unit = unit;
        } else {
            cart.push({
                plantId: id,
                name: item.name || 'Item',
                scientificName: getScientificNameString(item) || '',
                quantity: quantity,
                price: price,
                unit: unit || undefined
            });
        }
        setCart(cart);
    }
    if (typeof window.navBounceCartCount === 'function') window.navBounceCartCount();
}

var LABOUR_VIVARIUM_ID = 'labour-vivarium';
var LABOUR_VIVARIUM_CHARGE_KD = 10;

function addVivariumBuildToCart(vivarium) {
    var bc = vivarium._buildConfig;
    if (!bc) {
        addToCart(vivarium, 1);
        return;
    }
    var cart = getCart().filter(function(i) { return i.plantId !== LABOUR_VIVARIUM_ID; });
    var equipment = window.allEquipment || [];
    var plants = window.allPlants || window.plantsDatabase || [];
    function addSupply(id) {
        var n = parseInt(id, 10);
        var e = equipment.filter(function(x) { return x && (x.id === n || parseInt(x.id, 10) === n); })[0];
        if (!e) return;
        var price = (e.price !== undefined && e.price !== null && e.price !== '') ? Number(e.price) : null;
        var unit = (typeof normalizeProductUnit === 'function' ? normalizeProductUnit(e.unit) : (e.unit || '')) || undefined;
        var existing = cart.filter(function(i) { return i.plantId == e.id || parseInt(i.plantId, 10) === n; })[0];
        if (existing) {
            existing.quantity += 1;
            if (!existing.unit && unit) existing.unit = unit;
        } else {
            cart.push({ plantId: e.id, name: e.name || 'Item', scientificName: '', quantity: 1, price: price, unit: unit });
        }
    }
    if (bc.enclosureId) addSupply(bc.enclosureId);
    (bc.drainageIds || []).forEach(addSupply);
    (bc.substrateIds || []).forEach(addSupply);
    (bc.hardscapeIds || []).forEach(addSupply);
    (bc.plantIds || []).forEach(function(id) {
        var n = parseInt(id, 10);
        var p = plants.filter(function(x) { return x && (x.id === n || parseInt(x.id, 10) === n); })[0];
        if (!p) return;
        var price = (p.price !== undefined && p.price !== null && p.price !== '') ? Number(p.price) : null;
        var unit = (typeof normalizeProductUnit === 'function' ? normalizeProductUnit(p.unit) : (p.unit || '')) || undefined;
        var sci = typeof p.scientificName === 'string' ? p.scientificName : (p.scientificName && p.scientificName.name) ? p.scientificName.name : '';
        var existing = cart.filter(function(i) { return i.plantId == p.id || parseInt(i.plantId, 10) === n; })[0];
        if (existing) {
            existing.quantity += 1;
            if (!existing.unit && unit) existing.unit = unit;
        } else {
            cart.push({ plantId: p.id, name: p.name || 'Plant', scientificName: sci, quantity: 1, price: price, unit: unit });
        }
    });
    (bc.decorationIds || []).forEach(addSupply);
    (bc.accessoryIds || []).forEach(addSupply);
    (bc.toolIds || []).forEach(addSupply);
    cart.push({ plantId: LABOUR_VIVARIUM_ID, name: 'Labour (Vivarium build)', scientificName: '', quantity: 1, price: LABOUR_VIVARIUM_CHARGE_KD });
    setCart(cart);
    if (typeof quickAddShowToast === 'function') quickAddShowToast('\u2713 Vivarium build added to cart');
    if (typeof window.navBounceCartCount === 'function') window.navBounceCartCount();
}

function removeFromCart(plantId) {
    setCart(getCart().filter(i => i.plantId != plantId));
}
function clearCart() {
    setCart([]);
}
/** Nav badge: number of unique line items (not total quantity). */
function getCartCount() {
    return getCart().filter((item) => {
        const qty = parseFloat(item.quantity);
        return !isNaN(qty) && qty > 0;
    }).length;
}
function updateCartUI() {
    const cart = getCart();
    const count = getCartCount();
    // Re-query: #cartCount is rebuilt when nav.js re-renders after auth changes
    const badge = document.getElementById('cartCount') || cartCountEl;
    if (badge) badge.textContent = String(count);
    if (cartEmptyMsg) cartEmptyMsg.classList.toggle('hidden', cart.length > 0);
    if (cartTotalEl) {
        const total = cart.reduce((sum, i) => sum + (i.price != null ? i.price * i.quantity : 0), 0);
        const showTotal = cart.length > 0 && cart.some(i => i.price != null);
        cartTotalEl.classList.toggle('hidden', !showTotal);
        cartTotalEl.textContent = showTotal ? 'Subtotal: ' + formatPrice(total) : '';
    }
    if (cartCheckoutBtn) cartCheckoutBtn.classList.toggle('hidden', cart.length === 0);
    if (cartClearBtn) cartClearBtn.classList.toggle('hidden', cart.length === 0);
    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = cart.map(item => {
        const lineTotal = item.price != null ? item.price * item.quantity : null;
        const priceStr = item.price != null ? formatPrice(item.price) : 'Price on request';
        const lineStr = lineTotal != null ? formatPrice(lineTotal) : '—';
        const unitRaw = resolveItemUnit(item);
        if (unitRaw && !normalizeProductUnit(item.unit)) item.unit = unitRaw;
        const qtyWithUnit = formatQtyWithUnit(item.quantity, unitRaw);
        const perUnitLabel = unitRaw ? ' per ' + escapeHtml(unitRaw) : ' each';
        return `
        <div class="cart-item" data-plant-id="${item.plantId}">
            <div class="cart-item-info">
                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                <div class="cart-item-scientific">${escapeHtml(item.scientificName)}</div>
                <div class="cart-item-qty">Qty: ${escapeHtml(qtyWithUnit)}</div>
                <div class="cart-item-price">${priceStr}${perUnitLabel} · ${lineStr} total</div>
            </div>
            <button type="button" class="cart-item-remove" aria-label="Remove from cart" data-plant-id="${item.plantId}">×</button>
        </div>`;
    }).join('');
    // Persist any units we backfilled from the catalog so checkout/orders keep them
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (e) { /* ignore */ }
    cartItemsEl.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', () => { removeFromCart(btn.dataset.plantId); });
    });
}
function initCart() {
    if (cartToggle && cartDrawer && cartOverlay) {
        cartToggle.addEventListener('click', () => {
            cartDrawer.classList.remove('hidden');
            cartOverlay.classList.remove('hidden');
            cartDrawer.classList.add('open');
            cartOverlay.classList.add('open');
        });
        cartClose && cartClose.addEventListener('click', closeCartDrawer);
        cartOverlay.addEventListener('click', closeCartDrawer);
        cartClearBtn && cartClearBtn.addEventListener('click', () => { clearCart(); });
        if (typeof location !== 'undefined' && location.search && location.search.indexOf('openCart=1') !== -1) {
            cartDrawer.classList.remove('hidden');
            cartOverlay.classList.remove('hidden');
            cartDrawer.classList.add('open');
            cartOverlay.classList.add('open');
            try { history.replaceState(null, '', location.pathname + (location.hash || '')); } catch (e) {}
        }
    }
}
function closeCartDrawer() {
    if (cartDrawer) cartDrawer.classList.remove('open');
    if (cartOverlay) cartOverlay.classList.remove('open');
}

function quickAddShowToast(message) {
    const toast = document.getElementById('quickAddToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('quick-add-toast-visible');
    clearTimeout(toast._toastTimeout);
    toast._toastTimeout = setTimeout(() => {
        toast.textContent = '';
        toast.classList.remove('quick-add-toast-visible');
    }, 2500);
}
if (typeof window !== 'undefined') window.quickAddShowToast = quickAddShowToast;

function getAvailableToAdd(itemId) {
    const plant = allPlants && allPlants.find(p => p.id == itemId);
    const equipment = (typeof allEquipment !== 'undefined' && allEquipment.length) ? allEquipment.find(e => e.id == itemId) : null;
    const item = plant || equipment;
    const stock = (item != null && typeof item.stockQuantity === 'number' && item.stockQuantity >= 0)
        ? item.stockQuantity
        : 999;
    const cart = getCart();
    const inCart = cart.filter(i => i.plantId == itemId).reduce((s, i) => s + i.quantity, 0);
    return Math.max(0, stock - inCart);
}

function updateQuickAddButtonsState() {
    document.querySelectorAll('.quick-add-wrap').forEach(function (wrap) {
        const plantId = parseInt(wrap.dataset.plantId, 10);
        const btn = wrap.querySelector('.quick-add-btn');
        if (!btn) return;
        if (btn.disabled) return;
        const available = getAvailableToAdd(plantId);
        if (available <= 0) {
            btn.classList.add('quick-add-btn-maxed');
        } else {
            btn.classList.remove('quick-add-btn-maxed');
        }
    });
}

function initQuickAddOnCards() {
    if (!plantsGrid) return;
    plantsGrid.addEventListener('click', (e) => {
        const wrap = e.target.closest('.quick-add-wrap');
        if (!wrap) return;
        const plantId = parseInt(wrap.dataset.plantId, 10);
        const plant = allPlants.find(p => p.id === plantId);
        const equipment = (allEquipment && allEquipment.length) ? allEquipment.find(ev => ev.id === plantId) : null;
        const item = plant || equipment;
        if (!item) return;

        if (e.target.closest('.quick-add-btn')) {
            const cartQty = getCartQuantityForItem(plantId);
            const isInCart = cartQty > 0;
            if (!isInCart && getAvailableToAdd(plantId) <= 0) {
                quickAddShowToast('Max stock reached');
                e.preventDefault();
                return;
            }
            wrap.querySelector('.quick-add-btn').classList.add('hidden');
            const expanded = wrap.querySelector('.quick-add-expanded');
            const qtyInput = wrap.querySelector('.quick-add-qty');
            const confirmBtn = wrap.querySelector('.quick-add-confirm');
            if (expanded && qtyInput) {
                expanded.classList.remove('hidden');
                if (isInCart) {
                    const fullStock = typeof item.stockQuantity === 'number' ? item.stockQuantity : 999;
                    qtyInput.max = Math.min(999, fullStock);
                    qtyInput.min = 0;
                    qtyInput.disabled = false;
                    qtyInput.value = cartQty;
                    if (confirmBtn) { confirmBtn.textContent = 'Update'; confirmBtn.disabled = false; }
                } else {
                    const availableToAdd = getAvailableToAdd(plantId);
                    const max = Math.min(999, availableToAdd);
                    qtyInput.max = max;
                    qtyInput.disabled = availableToAdd === 0;
                    if (availableToAdd === 0) {
                        qtyInput.value = 0;
                        quickAddShowToast('Max stock reached');
                        if (confirmBtn) confirmBtn.disabled = true;
                    } else {
                        qtyInput.value = 1;
                        if (confirmBtn) { confirmBtn.textContent = 'Add'; confirmBtn.disabled = false; }
                    }
                }
                qtyInput.focus();
            }
            return;
        }
        if (e.target.closest('.quick-add-plus')) {
            const qtyInput = wrap.querySelector('.quick-add-qty');
            if (qtyInput && !qtyInput.disabled) {
                const max = parseFloat(qtyInput.getAttribute('max')) || 999;
                const current = parseFloat(qtyInput.value) || 0;
                const newVal = Math.min(current + 1, max);
                qtyInput.value = newVal;
                if (newVal >= max && max < 999) {
                    quickAddShowToast('Max stock reached');
                }
            }
            e.preventDefault();
            return;
        }
        if (e.target.closest('.quick-add-minus')) {
            const qtyInput = wrap.querySelector('.quick-add-qty');
            if (qtyInput && !qtyInput.disabled) {
                const minAttr = parseFloat(qtyInput.getAttribute('min'));
                const min = isNaN(minAttr) ? 0 : minAttr;
                const v = Math.max(min, (parseFloat(qtyInput.value) || 1) - 1);
                qtyInput.value = v;
            }
            e.preventDefault();
            return;
        }
        if (e.target.closest('.quick-add-confirm')) {
            const qtyInput = wrap.querySelector('.quick-add-qty');
            const cartQtyBefore = getCartQuantityForItem(plantId);
            const isInCart = cartQtyBefore > 0;
            const btn = wrap.querySelector('.quick-add-btn');
            const labelEl = wrap.querySelector('.quick-add-label');
            const unitStr = (item && item.unit != null && String(item.unit).trim() !== '') ? String(item.unit).trim() : (wrap.getAttribute('data-unit') || '');
            if (isInCart) {
                // Update mode: set quantity directly (replace, don't add)
                let qty = qtyInput ? parseFloat(qtyInput.value) : 0;
                if (isNaN(qty) || qty < 0) qty = 0;
                const fullStock = typeof item.stockQuantity === 'number' ? item.stockQuantity : 999;
                qty = Math.min(qty, fullStock);
                setCartQuantityForItem(item, qty);
                if (btn && labelEl) {
                    btn.classList.remove('hidden');
                    if (qty > 0) {
                        btn.classList.add('quick-add-has-qty');
                        labelEl.textContent = formatQuickAddQtyUnit(qty, unitStr);
                        btn.setAttribute('aria-label', labelEl.textContent);
                    } else {
                        btn.classList.remove('quick-add-has-qty');
                        labelEl.textContent = 'Add to cart';
                        btn.setAttribute('aria-label', 'Add to cart');
                    }
                }
                if (typeof quickAddShowToast === 'function') {
                    const toastMsg = qty > 0 ? '\u2713 ' + (item.name || 'Item') + ' updated' : (item.name || 'Item') + ' removed from cart';
                    quickAddShowToast(toastMsg);
                }
            } else {
                // Add mode: accumulate as before
                const availableToAdd = getAvailableToAdd(plantId);
                if (availableToAdd <= 0) {
                    quickAddShowToast('Max stock reached');
                    e.preventDefault();
                    return;
                }
                let qty = qtyInput ? parseFloat(qtyInput.value) : 0;
                if (isNaN(qty) || qty < 0.001) qty = 0;
                qty = Math.min(qty, availableToAdd);
                if (qty < 0.001) {
                    quickAddShowToast('Max stock reached');
                    e.preventDefault();
                    return;
                }
                addToCart(item, qty);
                if (btn && labelEl) {
                    btn.classList.remove('hidden');
                    btn.classList.add('quick-add-has-qty');
                    const newTotal = getCartQuantityForItem(plantId);
                    labelEl.textContent = formatQuickAddQtyUnit(newTotal, unitStr);
                    btn.setAttribute('aria-label', labelEl.textContent || 'Add to cart');
                }
            }
            wrap.querySelector('.quick-add-expanded').classList.add('hidden');
            e.preventDefault();
        }
    });

    plantsGrid.addEventListener('input', (e) => {
        const qtyInput = e.target.closest('.quick-add-qty');
        if (!qtyInput) return;
        const wrap = qtyInput.closest('.quick-add-wrap');
        const max = parseFloat(qtyInput.getAttribute('max')) || 999;
        const minAttr = parseFloat(qtyInput.getAttribute('min'));
        const min = isNaN(minAttr) ? 0 : minAttr;
        let v = parseFloat(qtyInput.value);
        if (isNaN(v) || v < 0) {
            qtyInput.value = min;
            return;
        }
        if (v > max) {
            qtyInput.value = max;
            quickAddShowToast('Max stock reached');
        }
    });
    plantsGrid.addEventListener('change', (e) => {
        const qtyInput = e.target.closest('.quick-add-qty');
        if (!qtyInput) return;
        const wrap = qtyInput.closest('.quick-add-wrap');
        const max = parseFloat(qtyInput.getAttribute('max')) || 999;
        const minAttr = parseFloat(qtyInput.getAttribute('min'));
        const min = isNaN(minAttr) ? 0 : minAttr;
        let v = parseFloat(qtyInput.value);
        if (isNaN(v) || v < min) {
            qtyInput.value = max >= min ? min : 0;
            return;
        }
        if (v > max) {
            qtyInput.value = max;
            quickAddShowToast('Max stock reached');
        }
    });

    // Collapse any open quick-add expanded panel when clicking outside a card
    if (!window._quickAddOutsideClickBound) {
        window._quickAddOutsideClickBound = true;
        document.addEventListener('click', (e) => {
            if (e.target.closest('.plant-card') || e.target.closest('.build-plant-card')) return;
            document.querySelectorAll('.quick-add-expanded:not(.hidden)').forEach(expanded => {
                expanded.classList.add('hidden');
                const wrap = expanded.closest('.quick-add-wrap');
                if (!wrap) return;
                const btn = wrap.querySelector('.quick-add-btn');
                if (btn) btn.classList.remove('hidden');
                const confirmBtn = wrap.querySelector('.quick-add-confirm');
                if (confirmBtn) confirmBtn.textContent = 'Add';
            });
        });
    }
}

function closePlantPanel() {
    document.removeEventListener('keydown', handlePlantPanelEscape);
    var jsonLd = document.getElementById('product-jsonld');
    if (jsonLd) jsonLd.remove();
    const navBackWrap = document.getElementById('navBackToListWrap');
    const navBackBtn = document.getElementById('navBackToList');
    if (navBackWrap) {
        navBackWrap.classList.remove('hidden');
        navBackWrap.classList.add('nav-back-disabled');
    }
    if (navBackBtn) navBackBtn.disabled = true;
    if (mainLayout) mainLayout.classList.remove('detail-view-active');
    if (typeof window.syncFiltersUiForDetailView === 'function') window.syncFiltersUiForDetailView(false);
    if (filtersSidebarWrapper) {
        filtersSidebarWrapper.style.display = '';
        requestAnimationFrame(function() {
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new Event('scroll'));
        });
    }
    if (mainContent && plantDetailPanel) {
        mainContent.classList.remove('list-view-hidden');
        plantDetailPanel.classList.add('hidden');
        plantDetailPanel.setAttribute('aria-hidden', 'true');
    }
    if (history.replaceState) {
        try {
            var path = location.pathname || '/';
            // Leaving a pretty SEO URL returns to the shop root
            if (/^\/(plants|supplies|vivariums)\//i.test(path)) path = '/';
            history.replaceState(null, '', path);
        } catch (e) { /* ignore */ }
    }
    if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('detail-startup');
    }
}
function handlePlantPanelEscape(e) {
    if (e.key !== 'Escape' || !plantDetailPanel || plantDetailPanel.classList.contains('hidden')) return;
    const page2 = document.getElementById('modal-page-2');
    if (page2 && page2.classList.contains('active')) {
        const plantId = page2.getAttribute('data-plant-id');
        if (plantId) {
            closeGalleryFullscreen();
            switchModalPage(1, plantId);
        } else {
            closePlantPanel();
        }
    } else {
        closePlantPanel();
    }
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// Image Upload Elements
const uploadModal = document.getElementById('uploadModal');
const closeUploadModal = document.getElementById('closeUploadModal');
const fileInput = document.getElementById('fileInput');
const imageUrlInput = document.getElementById('imageUrlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');
const dragDropArea = document.getElementById('dragDropArea');
const dragPreview = document.getElementById('dragPreview');
const saveImageBtn = document.getElementById('saveImageBtn');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const folderStatus = document.getElementById('folderStatus');
const uploadPlantName = document.getElementById('uploadPlantName');
const uploadName = document.getElementById('uploadName');
const uploadScientificName = document.getElementById('uploadScientificName');
const uploadCommonNames = document.getElementById('uploadCommonNames');
const uploadHybridParentsWrap = document.getElementById('uploadHybridParentsWrap');
const uploadHybridParent1 = document.getElementById('uploadHybridParent1');
const uploadHybridParent2 = document.getElementById('uploadHybridParent2');
const uploadVariety = document.getElementById('uploadVariety');
const uploadCatalogueOfLifeUrl = document.getElementById('uploadCatalogueOfLifeUrl');
const uploadPlantDescription = document.getElementById('uploadPlantDescription');
const uploadCareTips = document.getElementById('uploadCareTips');
const uploadPlantType = document.getElementById('uploadPlantType');
const uploadSizeMin = document.getElementById('uploadSizeMin');
const uploadSizeMax = document.getElementById('uploadSizeMax');
const uploadSubstrate = document.getElementById('uploadSubstrate');
const uploadGrowthRate = document.getElementById('uploadGrowthRate');
const uploadPrice = document.getElementById('uploadPrice');
const uploadCost = document.getElementById('uploadCost');
const uploadMarginPct = document.getElementById('uploadMarginPct');
const uploadUnit = document.getElementById('uploadUnit');
const uploadInventory = document.getElementById('uploadInventory');
const uploadReorder = document.getElementById('uploadReorder');
const uploadRarity = document.getElementById('uploadRarity');
const uploadGrowthPattern = document.getElementById('uploadGrowthPattern');
const uploadGrowthHabit = document.getElementById('uploadGrowthHabit');
const uploadHazard = document.getElementById('uploadHazard');
const uploadFloweringPeriod = document.getElementById('uploadFloweringPeriod');
const uploadSuitableForTags = document.getElementById('uploadSuitableForTags');
const uploadHumidityMin = document.getElementById('uploadHumidityMin');
const uploadHumidityMax = document.getElementById('uploadHumidityMax');
const uploadLightMin = document.getElementById('uploadLightMin');
const uploadLightMax = document.getElementById('uploadLightMax');
const uploadTempMin = document.getElementById('uploadTempMin');
const uploadTempMax = document.getElementById('uploadTempMax');
const uploadAirCircMin = document.getElementById('uploadAirCircMin');
const uploadAirCircMax = document.getElementById('uploadAirCircMax');
const uploadWaterNeedsMin = document.getElementById('uploadWaterNeedsMin');
const uploadWaterNeedsMax = document.getElementById('uploadWaterNeedsMax');
const uploadDifficultyMin = document.getElementById('uploadDifficultyMin');
const uploadDifficultyMax = document.getElementById('uploadDifficultyMax');
const uploadGrowthRateMin = document.getElementById('uploadGrowthRateMin');
const uploadGrowthRateMax = document.getElementById('uploadGrowthRateMax');
const uploadSoilPhMin = document.getElementById('uploadSoilPhMin');
const uploadSoilPhMax = document.getElementById('uploadSoilPhMax');
const uploadGallery = document.getElementById('uploadGallery');
const uploadGalleryGrid = document.getElementById('uploadGalleryGrid');
const uploadGalleryCount = document.getElementById('uploadGalleryCount');
const dragDropEmpty = document.getElementById('dragDropEmpty');
const dragDropGallery = document.getElementById('dragDropGallery');
const dragDropGalleryGrid = document.getElementById('dragDropGalleryGrid');
const dragDropCount = document.getElementById('dragDropCount');

let imagesFolderHandle = null; // Stored folder handle for direct saving
let plantsMergedFolderHandle = null; // Stored folder handle for saving plant JSON files

initImageUtils({ getImagesFolderHandle: () => imagesFolderHandle });

// upload.js (~67KB) is lazy-loaded for staff/edit only — guests never download it.
const UPLOAD_SCRIPT_SRC = 'upload.js?v=2';
let _uploadInitPromise = null;
let _uploadBound = false;

function getUploadInitOptions() {
    return {
        elements: {
            uploadModal,
            closeUploadModal,
            fileInput,
            imageUrlInput,
            loadUrlBtn,
            dragDropArea,
            dragPreview,
            saveImageBtn,
            cancelUploadBtn,
            selectFolderBtn,
            folderStatus,
            uploadPlantName,
            uploadName,
            uploadScientificName,
            uploadCommonNames,
            uploadHybridParentsWrap,
            uploadHybridParent1,
            uploadHybridParent2,
            uploadVariety,
            uploadCatalogueOfLifeUrl,
            uploadPlantDescription,
            uploadCareTips,
            uploadPlantType,
            uploadSizeMin,
            uploadSizeMax,
            uploadSubstrate,
            uploadGrowthRate,
            uploadPrice,
            uploadCost,
            uploadMarginPct,
            uploadUnit,
            uploadInventory,
            uploadReorder,
            uploadRarity,
            uploadGrowthPattern,
            uploadGrowthHabit,
            uploadHazard,
            uploadFloweringPeriod,
            uploadSuitableForTags,
            uploadHumidityMin,
            uploadHumidityMax,
            uploadLightMin,
            uploadLightMax,
            uploadTempMin,
            uploadTempMax,
            uploadAirCircMin,
            uploadAirCircMax,
            uploadWaterNeedsMin,
            uploadWaterNeedsMax,
            uploadDifficultyMin,
            uploadDifficultyMax,
            uploadGrowthRateMin,
            uploadGrowthRateMax,
            uploadSoilPhMin,
            uploadSoilPhMax,
            uploadGallery,
            uploadGalleryGrid,
            uploadGalleryCount,
            dragDropEmpty,
            dragDropGallery,
            dragDropGalleryGrid,
            dragDropCount,
            plantModal
        },
        getAllPlants: () => allPlants,
        getFilteredPlants: () => filteredPlants,
        renderPlants: (plants) => renderPlants(plants),
        showPlantModal: (plant) => showPlantModal(plant),
        scientificNameToSlug,
        ensureUniqueImages,
        scanExistingImages,
        generateThumbnailFromBlob,
        generateThumbnailForPlant,
        getImagesFolderHandle: () => imagesFolderHandle,
        setImagesFolderHandle: (handle) => { imagesFolderHandle = handle; },
        getPlantsMergedFolderHandle: () => plantsMergedFolderHandle,
        setPlantsMergedFolderHandle: (handle) => { plantsMergedFolderHandle = handle; },
        getScientificNameString: (plant) => getScientificNameString(plant),
        savePlantToJsonFile: (plant) => savePlantToJsonFile(plant),
        getColTaxonId: (name, rank) => getColTaxonId(name, rank),
        getCalculatedVivariumTypes: (plant) => calculatePlantVivariumTypes(plant)
    };
}

function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
        var existing = document.querySelector('script[data-lazy-src="' + src.replace(/"/g, '') + '"]');
        if (existing) {
            if (window.uploadUtils) return resolve();
            existing.addEventListener('load', function () { resolve(); });
            existing.addEventListener('error', function () { reject(new Error('Failed to load ' + src)); });
            return;
        }
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.dataset.lazySrc = src;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('Failed to load ' + src)); };
        document.head.appendChild(s);
    });
}

function bindUploadUtils(u) {
    if (!u) return null;
    if (!_uploadBound) {
        u.init(getUploadInitOptions());
        _uploadBound = true;
        window.closeUploadModalFunc = u.closeUploadModalFunc;
    }
    return u;
}

function ensureUploadReady() {
    if (_uploadBound && window.uploadUtils) return Promise.resolve(window.uploadUtils);
    if (_uploadInitPromise) return _uploadInitPromise;
    _uploadInitPromise = Promise.resolve()
        .then(function () {
            if (window.uploadUtils) return;
            return loadScriptOnce(UPLOAD_SCRIPT_SRC);
        })
        .then(function () {
            if (!window.uploadUtils) throw new Error('upload.js failed to expose uploadUtils');
            return bindUploadUtils(window.uploadUtils);
        })
        .catch(function (err) {
            _uploadInitPromise = null;
            throw err;
        });
    return _uploadInitPromise;
}

function needsUploadOnStartup() {
    try {
        var params = new URLSearchParams(window.location.search || '');
        if (params.get('add') || params.get('edit')) return true;
    } catch (e) { /* ignore */ }
    return !!(window.auth && typeof window.auth.canManageInventory === 'function' && window.auth.canManageInventory());
}

function uploadCall(name) {
    return function () {
        var args = arguments;
        return ensureUploadReady().then(function (u) {
            return u[name].apply(u, args);
        });
    };
}

function setupUploadListeners() {
    if (window.uploadUtils && _uploadBound) window.uploadUtils.setupUploadListeners();
}
var selectImagesFolder = uploadCall('selectImagesFolder');
var checkStoredFolder = uploadCall('checkStoredFolder');
var ensureFolderAccess = uploadCall('ensureFolderAccess');
function openImageUpload(plantId) {
    return ensureUploadReady().then(function (u) {
        var plant = (typeof allPlants !== 'undefined' && allPlants)
            ? allPlants.find(function (p) { return p && p.id == plantId; })
            : null;
        var hydrate = (plant && plant._catalogSlim && typeof hydratePlantFromCatalog === 'function')
            ? hydratePlantFromCatalog(plant)
            : Promise.resolve(plant);
        return hydrate.then(function () { return u.openImageUpload(plantId); });
    }).catch(function (err) {
        console.error(err);
        alert('Could not load the editor. Please refresh and try again.');
    });
}
var updateUploadGallery = uploadCall('updateUploadGallery');
var removeImageFromUploadGallery = uploadCall('removeImageFromUploadGallery');
var updateDragDropGallery = uploadCall('updateDragDropGallery');
var clearDragDropGallery = uploadCall('clearDragDropGallery');
function closeUploadModalFunc() {
    if (window.uploadUtils && window.uploadUtils.closeUploadModalFunc) {
        return window.uploadUtils.closeUploadModalFunc();
    }
}
var handleFileSelect = uploadCall('handleFileSelect');
var handleDragOver = uploadCall('handleDragOver');
var handleDragLeave = uploadCall('handleDragLeave');
var handleDrop = uploadCall('handleDrop');
var handlePaste = uploadCall('handlePaste');
var loadImageFromUrl = uploadCall('loadImageFromUrl');
var saveImage = uploadCall('saveImage');
var saveSingleImage = uploadCall('saveSingleImage');
var savePlantImageFilesToFolder = uploadCall('savePlantImageFilesToFolder');
var saveEquipmentImageFilesToFolder = uploadCall('saveEquipmentImageFilesToFolder');
var saveVivariumImageFilesToFolder = uploadCall('saveVivariumImageFilesToFolder');
var fileToDataUrl = uploadCall('fileToDataUrl');
var blobToDataUrl = uploadCall('blobToDataUrl');

window.openImageUpload = openImageUpload;
window.ensureUploadReady = ensureUploadReady;

// Initialize (nav menu is unified in js/nav.js)
document.addEventListener('DOMContentLoaded', async () => {
    // Clear only plant image cache on localhost so hard refresh avoids stale images but keeps login/session
    try {
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && (k.indexOf('plant_') === 0 && (k.endsWith('_images') || k.endsWith('_imageUrl') || k.endsWith('_maxImage')))) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
        }
    } catch (e) { /* ignore */ }
    setupEventListeners();
    async function maybeInitUpload() {
        if (!needsUploadOnStartup()) return;
        try {
            await ensureUploadReady();
            setupUploadListeners();
        } catch (err) {
            console.error('Upload module failed to load', err);
        }
    }
    await maybeInitUpload();
    window.addEventListener('authStateChange', function () { maybeInitUpload(); });
    initCart();
    initQuickAddOnCards();

    // Load plants (from modular structure or data.js)
    await initializePlants();
    
    // Open plant panel if URL hash is a plant id (e.g. #12345)
    const hash = (location.hash || '').replace(/^#/, '');
    const plantIdFromHash = hash && /^\d+$/.test(hash) ? parseInt(hash, 10) : null;
    if (plantIdFromHash && allPlants && allPlants.length > 0) {
        const plant = allPlants.find(p => p.id === plantIdFromHash);
        if (plant) showPlantModal(plant);
    }
    
    // Images are now handled gracefully - browser will show placeholders for missing images
    imageErrorsLogged = true;
    updateCartUI();

    // When custom_equipment is updated in another tab (e.g. add form in inventory iframe), refresh supplies so the Supplies tab shows new items
    window.addEventListener('storage', function (e) {
        if (e && e.key === 'custom_equipment' && typeof window.loadEquipment === 'function') {
            window.loadEquipment().then(function (list) {
                if (!Array.isArray(list)) return;
                allEquipment = list;
                window.allEquipment = list;
                if (window.inventoryDb && window.inventoryDb.mergeInventoryIntoPlants) {
                    window.inventoryDb.mergeInventoryIntoPlants(list);
                }
                var canSeeHidden = typeof auth !== 'undefined' && auth && (auth.isOwner && auth.isOwner() || auth.isAdmin && auth.isAdmin());
                filteredEquipment = list.filter(function (eq) { return canSeeHidden ? true : !eq.hidden; });
                if (typeof applyEquipmentFilters === 'function') applyEquipmentFilters();
            });
        }
    });
});

// Scan all plant folders for existing images
// NOTE: This function is now disabled on automatic page load to prevent console flooding
// It will only be called manually when needed (e.g., user uploads images)
async function scanAllPlantImages() {
    // DISABLED: Automatic scanning causes too many network requests
    // Images are now checked only when:
    // 1. User opens a plant modal (checks gallery images)
    // 2. User uploads a new image
    // 3. User manually triggers refresh
    
    return; // Early return - no automatic scanning
    
    /* Previous automatic scanning code disabled to prevent console errors:
    (async () => {
        for (const plant of allPlants) {
            // ... checking code ...
        }
    })();
    */
}

var _shopSearchDebounced = null;

/** Re-bind catalog search after nav re-renders (auth state changes replace the DOM). */
function bindShopNavSearch() {
    searchInput = document.getElementById('searchInput');
    searchBtn = document.getElementById('searchBtn');
    if (!searchInput) return;

    if (!_shopSearchDebounced) {
        _shopSearchDebounced = debounce(handleSearch, 300);
    }

    // Avoid stacking duplicate listeners on the same node if called twice before re-render
    if (searchInput.dataset.shopSearchBound === '1') return;
    searchInput.dataset.shopSearchBound = '1';

    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleSearch();
    });
    searchInput.addEventListener('input', _shopSearchDebounced);

    if (searchBtn && searchBtn.dataset.shopSearchBound !== '1') {
        searchBtn.dataset.shopSearchBound = '1';
        searchBtn.addEventListener('click', handleSearch);
    }
}
window.bindShopNavSearch = bindShopNavSearch;

// Event Listeners
function setupEventListeners() {
    bindShopNavSearch();

    // Sort select
    if (sortSelect) {
        sortSelect.addEventListener('change', handleSort);
    }
    
    // Sort direction button
    if (sortDirectionBtn) {
        sortDirectionBtn.addEventListener('click', handleSortDirection);
        updateSortDirectionButton();
    }
    
    // Filter toggle and edge actions container
    const controlPanelCollapse = document.getElementById('controlPanelCollapse');
    const controlPanelReopen = document.getElementById('controlPanelReopen');
    const controlPanelEdgeActions = document.getElementById('controlPanelEdgeActions');
    const controlPanelReset = document.getElementById('controlPanelReset');
    const filtersSidebarWrapper = document.getElementById('filtersSidebarWrapper');
    const EDGE_ACTIONS_MIN_TOP = 72;
    const EDGE_ACTIONS_PANEL_INSET = 10; // keep stack inside rounded panel edges

    function updateEdgeActionsPosition() {
        if (!controlPanelEdgeActions || !filtersSidebar || filtersSidebar.classList.contains('control-panel-collapsed') || filtersSidebar.style.display === 'none') {
            return;
        }
        const rect = filtersSidebar.getBoundingClientRect();
        const height = controlPanelEdgeActions.offsetHeight || 0;
        const half = height / 2;
        const inset = EDGE_ACTIONS_PANEL_INSET;
        // `top` is the center Y because CSS uses transform: translateY(-50%).
        // Inset so the stack never sits past the panel's top/bottom (incl. border-radius).
        var minCenter = Math.max(EDGE_ACTIONS_MIN_TOP + half, rect.top + half + inset);
        var maxCenter = rect.bottom - half - inset;
        var center;
        if (maxCenter < minCenter) {
            center = rect.top + rect.height / 2;
        } else {
            const viewportCenter = window.innerHeight / 2;
            center = Math.min(maxCenter, Math.max(minCenter, viewportCenter));
        }
        controlPanelEdgeActions.style.top = center + 'px';
        controlPanelEdgeActions.style.transform = 'translateY(-50%)';
        controlPanelEdgeActions.style.left = rect.right + 'px';
    }

    function isFiltersMobile() {
        return window.matchMedia('(max-width: 1024px)').matches;
    }
    function isDetailViewActive() {
        return !!(document.querySelector('.main-layout.detail-view-active'));
    }
    function openFiltersPanel() {
        if (!filtersSidebar || !filtersSidebarWrapper) return;
        if (isDetailViewActive()) return;
        filtersSidebar.classList.remove('control-panel-collapsed');
        filtersSidebarWrapper.classList.remove('filters-sidebar-wrapper-collapsed');
        filtersSidebar.style.display = '';
        controlPanelReopen.classList.add('hidden');
        if (isFiltersMobile()) {
            var overlay = document.getElementById('filtersOverlay');
            if (overlay) { overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden', 'false'); }
            document.body.classList.add('filters-drawer-open');
        }
        updateEdgeActionsPosition();
    }
    function closeFiltersPanel() {
        if (!filtersSidebar || !filtersSidebarWrapper) return;
        filtersSidebar.classList.add('control-panel-collapsed');
        filtersSidebarWrapper.classList.add('filters-sidebar-wrapper-collapsed');
        if (!isDetailViewActive()) {
            controlPanelReopen.classList.remove('hidden');
        } else {
            controlPanelReopen.classList.add('hidden');
        }
        var overlay = document.getElementById('filtersOverlay');
        if (overlay) { overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden', 'true'); }
        document.body.classList.remove('filters-drawer-open');
    }
    function syncFiltersUiForDetailView(enteringDetail) {
        var reopen = document.getElementById('controlPanelReopen');
        var overlay = document.getElementById('filtersOverlay');
        if (enteringDetail) {
            if (reopen) reopen.classList.add('hidden');
            if (overlay) { overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden', 'true'); }
            document.body.classList.remove('filters-drawer-open');
            if (filtersSidebar) filtersSidebar.classList.add('control-panel-collapsed');
            if (filtersSidebarWrapper) filtersSidebarWrapper.classList.add('filters-sidebar-wrapper-collapsed');
            document.body.classList.remove('legend-drawer-open');
            var legendOverlay = document.getElementById('legendOverlay');
            if (legendOverlay) { legendOverlay.classList.add('hidden'); legendOverlay.setAttribute('aria-hidden', 'true'); }
            var legendSidebar = document.getElementById('legendSidebar');
            var legendSidebarWrapper = document.getElementById('legendSidebarWrapper');
            var legendSidebarReopen = document.getElementById('legendSidebarReopen');
            if (legendSidebar) legendSidebar.classList.add('legend-sidebar-collapsed');
            if (legendSidebarWrapper) legendSidebarWrapper.classList.add('legend-sidebar-wrapper-collapsed');
            if (legendSidebarReopen) legendSidebarReopen.classList.add('hidden');
        } else if (reopen && filtersSidebar && filtersSidebar.classList.contains('control-panel-collapsed') && isFiltersMobile()) {
            reopen.classList.remove('hidden');
        }
        if (typeof window.updateLegendButtonVisibility === 'function') {
            window.updateLegendButtonVisibility();
        }
    }
    window.syncFiltersUiForDetailView = syncFiltersUiForDetailView;

    if (controlPanelCollapse && filtersSidebar && controlPanelReopen && filtersSidebarWrapper) {
        if (isFiltersMobile()) {
            closeFiltersPanel();
        }
        controlPanelCollapse.addEventListener('click', () => {
            closeFiltersPanel();
        });
        controlPanelReopen.addEventListener('click', openFiltersPanel);
        var filtersOverlay = document.getElementById('filtersOverlay');
        if (filtersOverlay) {
            filtersOverlay.addEventListener('click', () => {
                if (isFiltersMobile()) closeFiltersPanel();
            });
        }
        var filtersMobileClose = document.getElementById('filtersMobileClose');
        if (filtersMobileClose) {
            filtersMobileClose.addEventListener('click', closeFiltersPanel);
        }
        var filtersMobileReset = document.getElementById('filtersMobileReset');
        if (filtersMobileReset && controlPanelReset) {
            filtersMobileReset.addEventListener('click', function() {
                controlPanelReset.click();
            });
        }
        window.addEventListener('resize', function() {
            updateEdgeActionsPosition();
            if (isDetailViewActive()) {
                controlPanelReopen.classList.add('hidden');
                var ovDetail = document.getElementById('filtersOverlay');
                if (ovDetail) { ovDetail.classList.add('hidden'); ovDetail.setAttribute('aria-hidden', 'true'); }
                document.body.classList.remove('filters-drawer-open');
                return;
            }
            if (isFiltersMobile()) {
                if (!filtersSidebar.classList.contains('control-panel-collapsed')) {
                    var o = document.getElementById('filtersOverlay');
                    if (o) { o.classList.remove('hidden'); o.setAttribute('aria-hidden', 'false'); }
                    document.body.classList.add('filters-drawer-open');
                }
            } else {
                filtersSidebar.classList.remove('control-panel-collapsed');
                if (filtersSidebarWrapper) filtersSidebarWrapper.classList.remove('filters-sidebar-wrapper-collapsed');
                filtersSidebar.style.display = '';
                controlPanelReopen.classList.add('hidden');
                var ov = document.getElementById('filtersOverlay');
                if (ov) { ov.classList.add('hidden'); ov.setAttribute('aria-hidden', 'true'); }
                document.body.classList.remove('filters-drawer-open');
            }
        });
        var mq = window.matchMedia('(max-width: 1024px)');
        mq.addEventListener('change', function() {
            if (isDetailViewActive()) {
                controlPanelReopen.classList.add('hidden');
                return;
            }
            if (mq.matches) closeFiltersPanel();
            else {
                filtersSidebar.classList.remove('control-panel-collapsed');
                if (filtersSidebarWrapper) filtersSidebarWrapper.classList.remove('filters-sidebar-wrapper-collapsed');
                filtersSidebar.style.display = '';
                controlPanelReopen.classList.add('hidden');
                var ov = document.getElementById('filtersOverlay');
                if (ov) { ov.classList.add('hidden'); ov.setAttribute('aria-hidden', 'true'); }
                document.body.classList.remove('filters-drawer-open');
            }
        });
        window.addEventListener('scroll', updateEdgeActionsPosition, { passive: true });
        updateEdgeActionsPosition();
    }

    var legendSidebar = document.getElementById('legendSidebar');
    var legendSidebarWrapper = document.getElementById('legendSidebarWrapper');
    var legendSidebarCollapse = document.getElementById('legendSidebarCollapse');
    var legendSidebarReopen = document.getElementById('legendSidebarReopen');
    function isLegendMobile() {
        return window.matchMedia('(max-width: 1024px)').matches;
    }
    function openLegendPanel() {
        // Legend UI is mobile-only
        if (!legendSidebar || !legendSidebarWrapper || !isLegendMobile()) return;
        if (document.querySelector('.main-layout.detail-view-active')) return;
        legendSidebar.classList.remove('legend-sidebar-collapsed');
        legendSidebarWrapper.classList.remove('legend-sidebar-wrapper-collapsed');
        if (legendSidebarReopen) legendSidebarReopen.classList.add('hidden');
        document.body.classList.add('legend-drawer-open');
        var lo = document.getElementById('legendOverlay');
        if (lo) { lo.classList.remove('hidden'); lo.setAttribute('aria-hidden', 'false'); }
    }
    function closeLegendPanel() {
        if (!legendSidebar || !legendSidebarWrapper) return;
        legendSidebar.classList.add('legend-sidebar-collapsed');
        legendSidebarWrapper.classList.add('legend-sidebar-wrapper-collapsed');
        document.body.classList.remove('legend-drawer-open');
        var lo = document.getElementById('legendOverlay');
        if (lo) { lo.classList.add('hidden'); lo.setAttribute('aria-hidden', 'true'); }
        // Reopen control only on mobile + plants tab + not on item detail
        if (legendSidebarReopen) {
            var show = isLegendMobile() && currentView === 'plants' &&
                !document.querySelector('.main-layout.detail-view-active');
            legendSidebarReopen.classList.toggle('hidden', !show);
        }
    }
    function updateLegendButtonVisibility() {
        if (!legendSidebarReopen || !legendSidebar) return;
        var mobile = isLegendMobile();
        var plantsView = currentView === 'plants';
        var detailActive = !!document.querySelector('.main-layout.detail-view-active');
        if (!mobile || !plantsView || detailActive) {
            closeLegendPanel();
            legendSidebarReopen.classList.add('hidden');
            return;
        }
        // Mobile plants view: closed by default, reopen when collapsed
        if (legendSidebar.classList.contains('legend-sidebar-collapsed')) {
            legendSidebarReopen.classList.remove('hidden');
        } else {
            legendSidebarReopen.classList.add('hidden');
        }
    }
    if (legendSidebarCollapse && legendSidebar && legendSidebarReopen && legendSidebarWrapper) {
        legendSidebarCollapse.addEventListener('click', closeLegendPanel);
        legendSidebarReopen.addEventListener('click', openLegendPanel);
        var legendOverlay = document.getElementById('legendOverlay');
        if (legendOverlay) legendOverlay.addEventListener('click', closeLegendPanel);
        closeLegendPanel();
        window.updateLegendButtonVisibility = updateLegendButtonVisibility;
        window.addEventListener('resize', updateLegendButtonVisibility);
        updateLegendButtonVisibility();
    }

    if (controlPanelReset) {
        controlPanelReset.addEventListener('click', () => {
            if (currentView === 'equipment') {
                if (searchInput) searchInput.value = '';
                document.querySelectorAll('.equipment-filter-checkbox').forEach(function(cb) { cb.checked = false; });
                var pm = document.getElementById('equipmentPriceMin');
                var px = document.getElementById('equipmentPriceMax');
                if (pm) pm.value = '';
                if (px) px.value = '';
                var minReq = document.getElementById('minRatingEquipment');
                if (minReq) minReq.value = '';
                applyEquipmentFilters();
            } else if (currentView === 'vivariums') {
                if (searchInput) searchInput.value = '';
                document.querySelectorAll('.vivarium-filter-checkbox').forEach(function(cb) { cb.checked = false; });
                var vpm = document.getElementById('vivariumPriceMin');
                var vpx = document.getElementById('vivariumPriceMax');
                if (vpm) vpm.value = '';
                if (vpx) vpx.value = '';
                var minRv = document.getElementById('minRatingVivariums');
                if (minRv) minRv.value = '';
                applyVivariumFilters();
            } else if (typeof resetAllFilters === 'function') {
                resetAllFilters();
            }
        });
    }

    var equipmentPriceMin = document.getElementById('equipmentPriceMin');
    var equipmentPriceMax = document.getElementById('equipmentPriceMax');
    function onEquipmentFilterChange() {
        if (currentView === 'equipment') applyEquipmentFilters();
    }
    document.querySelectorAll('.equipment-filter-checkbox').forEach(function(cb) {
        cb.addEventListener('change', onEquipmentFilterChange);
    });
    if (equipmentPriceMin) equipmentPriceMin.addEventListener('input', debounce(onEquipmentFilterChange, 300));
    if (equipmentPriceMax) equipmentPriceMax.addEventListener('input', debounce(onEquipmentFilterChange, 300));
    var minRatingEquipmentEl = document.getElementById('minRatingEquipment');
    if (minRatingEquipmentEl) minRatingEquipmentEl.addEventListener('change', onEquipmentFilterChange);

    function onVivariumFilterChange() {
        if (currentView === 'vivariums') applyVivariumFilters();
    }
    document.querySelectorAll('.vivarium-filter-checkbox').forEach(function(cb) {
        cb.addEventListener('change', onVivariumFilterChange);
    });
    var filtersContentVivariumsEl = document.getElementById('filtersContentVivariums');
    if (filtersContentVivariumsEl) {
        filtersContentVivariumsEl.addEventListener('change', function(e) {
            if (e.target && e.target.classList && e.target.classList.contains('vivarium-filter-checkbox') && currentView === 'vivariums') {
                applyVivariumFilters();
            }
        });
    }
    var vivariumPriceMin = document.getElementById('vivariumPriceMin');
    var vivariumPriceMax = document.getElementById('vivariumPriceMax');
    if (vivariumPriceMin) vivariumPriceMin.addEventListener('input', debounce(onVivariumFilterChange, 300));
    if (vivariumPriceMax) vivariumPriceMax.addEventListener('input', debounce(onVivariumFilterChange, 300));
    var minRatingVivariumsEl = document.getElementById('minRatingVivariums');
    if (minRatingVivariumsEl) minRatingVivariumsEl.addEventListener('change', onVivariumFilterChange);

    var minRatingPlantsEl = document.getElementById('minRatingPlants');
    if (minRatingPlantsEl) minRatingPlantsEl.addEventListener('change', applyAllFilters);

    if (filtersSidebar) {
        document.querySelectorAll('.filter-group').forEach(g => g.classList.add('collapsed'));
        filtersSidebar.addEventListener('click', (e) => {
            const label = e.target.closest('.filter-group-label');
            if (label) {
                const group = label.closest('.filter-group');
                if (group) group.classList.toggle('collapsed');
            }
        });
    }

    var footerEl = document.querySelector('footer');
    if (filtersSidebar && filtersSidebarWrapper) {
        function updateFiltersSticky() {
            if (filtersSidebar.classList.contains('control-panel-collapsed') || filtersSidebar.style.display === 'none') {
                filtersSidebar.classList.remove('is-sticky');
                filtersSidebar.style.removeProperty('--filters-sticky-left');
                filtersSidebar.style.removeProperty('--filters-sticky-top');
                return;
            }
            var rect = filtersSidebarWrapper.getBoundingClientRect();
            var navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--main-nav-height'), 10) || 65;
            var footerPadding = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--filters-footer-padding'), 10) || 24;
            var stickyTop = 2 * navHeight;
            if (rect.top <= stickyTop) {
                filtersSidebar.classList.add('is-sticky');
                filtersSidebar.style.setProperty('--filters-sticky-left', rect.left + 'px');
                var panelHeight = filtersSidebar.offsetHeight;
                var defaultTop = stickyTop + 'px';
                if (footerEl) {
                    var footerRect = footerEl.getBoundingClientRect();
                    if (footerRect.top < stickyTop + panelHeight + footerPadding) {
                        var top = footerRect.top - footerPadding - panelHeight;
                        filtersSidebar.style.setProperty('--filters-sticky-top', Math.min(stickyTop, top) + 'px');
                    } else {
                        filtersSidebar.style.setProperty('--filters-sticky-top', defaultTop);
                    }
                } else {
                    filtersSidebar.style.setProperty('--filters-sticky-top', defaultTop);
                }
            } else {
                filtersSidebar.classList.remove('is-sticky');
                filtersSidebar.style.removeProperty('--filters-sticky-left');
                filtersSidebar.style.removeProperty('--filters-sticky-top');
            }
            // Reposition edge buttons after sticky top changes (avoids bottom overhang near footer)
            if (typeof updateEdgeActionsPosition === 'function') updateEdgeActionsPosition();
        }
        window.addEventListener('scroll', updateFiltersSticky, { passive: true });
        window.addEventListener('resize', updateFiltersSticky);
        updateFiltersSticky();
    }

    if (legendSidebar && legendSidebarWrapper) {
        function updateLegendSticky() {
            if (legendSidebar.classList.contains('legend-sidebar-collapsed') || legendSidebarWrapper.offsetParent === null) {
                legendSidebar.classList.remove('is-sticky');
                legendSidebar.style.removeProperty('--legend-sticky-right');
                legendSidebar.style.removeProperty('--legend-sticky-top');
                return;
            }
            var rect = legendSidebarWrapper.getBoundingClientRect();
            var navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--main-nav-height'), 10) || 65;
            var footerPadding = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--filters-footer-padding'), 10) || 24;
            var stickyTop = 2 * navHeight;
            if (rect.top <= stickyTop) {
                legendSidebar.classList.add('is-sticky');
                legendSidebar.style.setProperty('--legend-sticky-right', (window.innerWidth - rect.right) + 'px');
                var panelHeight = legendSidebar.offsetHeight;
                var defaultTop = stickyTop + 'px';
                if (footerEl) {
                    var footerRect = footerEl.getBoundingClientRect();
                    if (footerRect.top < stickyTop + panelHeight + footerPadding) {
                        var top = footerRect.top - footerPadding - panelHeight;
                        legendSidebar.style.setProperty('--legend-sticky-top', Math.min(stickyTop, top) + 'px');
                    } else {
                        legendSidebar.style.setProperty('--legend-sticky-top', defaultTop);
                    }
                } else {
                    legendSidebar.style.setProperty('--legend-sticky-top', defaultTop);
                }
            } else {
                legendSidebar.classList.remove('is-sticky');
                legendSidebar.style.removeProperty('--legend-sticky-right');
                legendSidebar.style.removeProperty('--legend-sticky-top');
            }
        }
        window.addEventListener('scroll', updateLegendSticky, { passive: true });
        window.addEventListener('resize', updateLegendSticky);
        updateLegendSticky();
    }

    // Card size: medium (default), small, large – persist in localStorage
    const CARD_SIZE_KEY = 'plantCardSize';
    const cardSizeBtns = document.querySelectorAll('.card-size-btn');
    if (plantsGrid && cardSizeBtns.length) {
        function setCardSize(size) {
            const valid = ['large', 'medium', 'small'].includes(size) ? size : 'medium';
            plantsGrid.classList.remove('card-size-large', 'card-size-medium', 'card-size-small');
            plantsGrid.classList.add('card-size-' + valid);
            cardSizeBtns.forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-size') === valid);
            });
            try { localStorage.setItem(CARD_SIZE_KEY, valid); } catch (e) {}
            if (typeof window.updateLegendButtonVisibility === 'function') window.updateLegendButtonVisibility();
        }
        const saved = localStorage.getItem(CARD_SIZE_KEY);
        if (saved) setCardSize(saved);
        cardSizeBtns.forEach(btn => {
            btn.addEventListener('click', () => setCardSize(btn.getAttribute('data-size')));
        });
    }
    
    // Advanced filter checkboxes
    const filterCheckboxes = document.querySelectorAll('.filter-checkbox');
    filterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', applyAdvancedFilters);
    });
    
    // Range inputs for numeric filters
    const rangeInputs = [
        { min: 'humidityMin', max: 'humidityMax', filter: 'humidity' },
        { min: 'lightMin', max: 'lightMax', filter: 'light' },
        { min: 'tempMin', max: 'tempMax', filter: 'temperature' },
        { min: 'airCirculationMin', max: 'airCirculationMax', filter: 'airCirculation' },
        { min: 'waterNeedsMin', max: 'waterNeedsMax', filter: 'waterNeeds' },
        { min: 'difficultyMin', max: 'difficultyMax', filter: 'difficulty' },
        { min: 'growthRateMin', max: 'growthRateMax', filter: 'growthRate' },
        { min: 'soilPhMin', max: 'soilPhMax', filter: 'soilPh' },
        { min: 'waterTempMin', max: 'waterTempMax', filter: 'waterTemperature' },
        { min: 'waterPhMin', max: 'waterPhMax', filter: 'waterPh' },
        { min: 'waterHardnessMin', max: 'waterHardnessMax', filter: 'waterHardness' },
        { min: 'salinityMin', max: 'salinityMax', filter: 'salinity' },
        { min: 'waterCirculationMin', max: 'waterCirculationMax', filter: 'waterCirculation' }
    ];
    
    rangeInputs.forEach(({ min, max, filter }) => {
        const minInput = document.getElementById(min);
        const maxInput = document.getElementById(max);
        if (minInput) minInput.addEventListener('input', debounce(applyAdvancedFilters, 300));
        if (maxInput) maxInput.addEventListener('input', debounce(applyAdvancedFilters, 300));
    });
    
    // Dual range sliders (min and max)
    const dualRangeSliders = [
        { minSlider: 'humidityMinSlider', maxSlider: 'humidityMaxSlider', min: 'humidityMin', max: 'humidityMax', minDisplay: 'humidityMinDisplay', maxDisplay: 'humidityMaxDisplay', maxValue: 100 },
        { minSlider: 'lightMinSlider', maxSlider: 'lightMaxSlider', min: 'lightMin', max: 'lightMax', minDisplay: 'lightMinDisplay', maxDisplay: 'lightMaxDisplay', maxValue: 100 },
        { minSlider: 'tempMinSlider', maxSlider: 'tempMaxSlider', min: 'tempMin', max: 'tempMax', minDisplay: 'tempMinDisplay', maxDisplay: 'tempMaxDisplay', maxValue: 40 },
        { minSlider: 'airCirculationMinSlider', maxSlider: 'airCirculationMaxSlider', min: 'airCirculationMin', max: 'airCirculationMax', minDisplay: 'airCirculationMinDisplay', maxDisplay: 'airCirculationMaxDisplay', maxValue: 100 },
        { minSlider: 'waterNeedsMinSlider', maxSlider: 'waterNeedsMaxSlider', min: 'waterNeedsMin', max: 'waterNeedsMax', minDisplay: 'waterNeedsMinDisplay', maxDisplay: 'waterNeedsMaxDisplay', maxValue: 100 },
        { minSlider: 'difficultyMinSlider', maxSlider: 'difficultyMaxSlider', min: 'difficultyMin', max: 'difficultyMax', minDisplay: 'difficultyMinDisplay', maxDisplay: 'difficultyMaxDisplay', maxValue: 100 },
        { minSlider: 'growthRateMinSlider', maxSlider: 'growthRateMaxSlider', min: 'growthRateMin', max: 'growthRateMax', minDisplay: 'growthRateMinDisplay', maxDisplay: 'growthRateMaxDisplay', maxValue: 100 },
        { minSlider: 'soilPhMinSlider', maxSlider: 'soilPhMaxSlider', min: 'soilPhMin', max: 'soilPhMax', minDisplay: 'soilPhMinDisplay', maxDisplay: 'soilPhMaxDisplay', maxValue: 100 },
        { minSlider: 'waterTempMinSlider', maxSlider: 'waterTempMaxSlider', min: 'waterTempMin', max: 'waterTempMax', minDisplay: 'waterTempMinDisplay', maxDisplay: 'waterTempMaxDisplay', maxValue: 40 },
        { minSlider: 'waterPhMinSlider', maxSlider: 'waterPhMaxSlider', min: 'waterPhMin', max: 'waterPhMax', minDisplay: 'waterPhMinDisplay', maxDisplay: 'waterPhMaxDisplay', maxValue: 100 },
        { minSlider: 'waterHardnessMinSlider', maxSlider: 'waterHardnessMaxSlider', min: 'waterHardnessMin', max: 'waterHardnessMax', minDisplay: 'waterHardnessMinDisplay', maxDisplay: 'waterHardnessMaxDisplay', maxValue: 100 },
        { minSlider: 'salinityMinSlider', maxSlider: 'salinityMaxSlider', min: 'salinityMin', max: 'salinityMax', minDisplay: 'salinityMinDisplay', maxDisplay: 'salinityMaxDisplay', maxValue: 100 },
        { minSlider: 'waterCirculationMinSlider', maxSlider: 'waterCirculationMaxSlider', min: 'waterCirculationMin', max: 'waterCirculationMax', minDisplay: 'waterCirculationMinDisplay', maxDisplay: 'waterCirculationMaxDisplay', maxValue: 100 }
    ];
    
    dualRangeSliders.forEach(({ minSlider, maxSlider, min, max, minDisplay, maxDisplay, maxValue }) => {
        const minSliderEl = document.getElementById(minSlider);
        const maxSliderEl = document.getElementById(maxSlider);
        const minInput = document.getElementById(min);
        const maxInput = document.getElementById(max);
        const minDisplayEl = document.getElementById(minDisplay);
        const maxDisplayEl = document.getElementById(maxDisplay);
        
        if (minSliderEl && maxSliderEl && minInput && maxInput) {
            // Update min slider
            minSliderEl.addEventListener('input', (e) => {
                const minVal = parseInt(e.target.value);
                const maxVal = parseInt(maxSliderEl.value);
                
                if (minVal > maxVal) {
                    minSliderEl.value = maxVal;
                    minInput.value = maxVal;
                    if (minDisplayEl) minDisplayEl.textContent = maxVal;
                } else {
                    minInput.value = minVal;
                    if (minDisplayEl) minDisplayEl.textContent = minVal;
                }
                applyAdvancedFilters();
            });
            
            // Update max slider
            maxSliderEl.addEventListener('input', (e) => {
                const maxVal = parseInt(e.target.value);
                const minVal = parseInt(minSliderEl.value);
                
                if (maxVal < minVal) {
                    maxSliderEl.value = minVal;
                    maxInput.value = minVal;
                    if (maxDisplayEl) maxDisplayEl.textContent = minVal;
                } else {
                    maxInput.value = maxVal;
                    if (maxDisplayEl) maxDisplayEl.textContent = maxVal;
                }
                applyAdvancedFilters();
            });
            
            // Sync number inputs to sliders
            minInput.addEventListener('input', (e) => {
                const value = parseInt(e.target.value) || 0;
                const clampedValue = Math.max(0, Math.min(maxValue, value));
                minSliderEl.value = clampedValue;
                if (minDisplayEl) minDisplayEl.textContent = clampedValue;
                
                // Ensure min doesn't exceed max
                if (clampedValue > parseInt(maxSliderEl.value)) {
                    maxSliderEl.value = clampedValue;
                    maxInput.value = clampedValue;
                    if (maxDisplayEl) maxDisplayEl.textContent = clampedValue;
                }
                applyAdvancedFilters();
            });
            
            maxInput.addEventListener('input', (e) => {
                const value = parseInt(e.target.value) || maxValue;
                const clampedValue = Math.max(0, Math.min(maxValue, value));
                maxSliderEl.value = clampedValue;
                if (maxDisplayEl) maxDisplayEl.textContent = clampedValue;
                
                // Ensure max doesn't go below min
                if (clampedValue < parseInt(minSliderEl.value)) {
                    minSliderEl.value = clampedValue;
                    minInput.value = clampedValue;
                    if (minDisplayEl) minDisplayEl.textContent = clampedValue;
                }
                applyAdvancedFilters();
            });
        }
    });
    
    // Classification search filter
    const classificationSearch = document.getElementById('classificationSearch');
    if (classificationSearch) {
        classificationSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const classificationGroup = document.querySelector('.classification-checkbox-group');
            if (!classificationGroup) return;
            
            const labels = classificationGroup.querySelectorAll('.checkbox-label');
            labels.forEach(label => {
                const span = label.querySelector('span');
                if (!span) return;
                
                const text = span.textContent.toLowerCase();
                if (searchTerm === '' || text.includes(searchTerm)) {
                    label.classList.remove('hidden');
                } else {
                    label.classList.add('hidden');
                }
            });
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            if (plantModal) { plantModal.classList.remove('show'); plantModal.classList.add('hidden'); }
        });
    }
    if (plantModal) {
        plantModal.addEventListener('click', (e) => {
            if (e.target === plantModal) {
                plantModal.classList.remove('show');
                plantModal.classList.add('hidden');
            }
        });
    }

    if (plantPanelBack) {
        plantPanelBack.addEventListener('click', function() {
            const page2 = document.getElementById('modal-page-2');
            if (page2 && page2.classList.contains('active')) {
                const plantId = page2.getAttribute('data-plant-id');
                closeGalleryFullscreen();
                if (plantId) switchModalPage(1, plantId);
                else closePlantPanel();
            } else {
                closePlantPanel();
            }
        });
    }
    document.addEventListener('click', function(e) {
        const navBackToList = e.target && e.target.closest ? e.target.closest('#navBackToList') : null;
        if (!navBackToList || navBackToList.disabled) return;
        e.preventDefault();
        if (window._buildViewActive && typeof window._onNavBackFromBuildView === 'function') {
            window._onNavBackFromBuildView();
            return;
        }
        const page2 = document.getElementById('modal-page-2');
        if (page2 && page2.classList.contains('active')) {
            const plantId = page2.getAttribute('data-plant-id');
            if (plantId) {
                closeGalleryFullscreen();
                switchModalPage(1, plantId);
            } else {
                closePlantPanel();
            }
        } else {
            closePlantPanel();
        }
    });

    // Edit supply modal
    const closeEquipmentEditModalBtn = document.getElementById('closeEquipmentEditModal');
    const equipmentEditCancelBtn = document.getElementById('equipmentEditCancelBtn');
    const equipmentEditSaveBtn = document.getElementById('equipmentEditSaveBtn');
    const equipmentEditModal = document.getElementById('equipmentEditModal');
    if (closeEquipmentEditModalBtn) closeEquipmentEditModalBtn.addEventListener('click', closeEquipmentEditModal);
    if (equipmentEditCancelBtn) equipmentEditCancelBtn.addEventListener('click', closeEquipmentEditModal);
    if (equipmentEditSaveBtn) equipmentEditSaveBtn.addEventListener('click', saveEquipmentEdit);
    var editPageBackBtn = document.getElementById('editPageBack');
    if (editPageBackBtn) editPageBackBtn.addEventListener('click', function() {
        var uploadModal = document.getElementById('uploadModal');
        if (uploadModal && uploadModal.classList.contains('show') && typeof window.closeUploadModalFunc === 'function') {
            window.closeUploadModalFunc();
            return;
        }
        var equipPanel = document.getElementById('editPanelEquipment');
        var vivPanel = document.getElementById('editPanelVivarium');
        if (equipPanel && equipPanel.classList.contains('active')) closeEquipmentEditModal();
        else if (vivPanel && vivPanel.classList.contains('active')) closeVivariumEditModal();
        else hideEditPage();
    });
    var closeVivariumEditModalBtn = document.getElementById('closeVivariumEditModal');
    var vivariumEditCancelBtn = document.getElementById('vivariumEditCancelBtn');
    var vivariumEditSaveBtn = document.getElementById('vivariumEditSaveBtn');
    var vivariumEditModal = document.getElementById('vivariumEditModal');
    if (closeVivariumEditModalBtn) closeVivariumEditModalBtn.addEventListener('click', closeVivariumEditModal);
    if (vivariumEditCancelBtn) vivariumEditCancelBtn.addEventListener('click', closeVivariumEditModal);
    if (vivariumEditSaveBtn) vivariumEditSaveBtn.addEventListener('click', saveVivariumEdit);
    var vivariumEditPlantSearch = document.getElementById('vivariumEditPlantSearch');
    if (vivariumEditPlantSearch) vivariumEditPlantSearch.addEventListener('input', function() {
        if (typeof refreshVivariumEditPlantOptions === 'function') refreshVivariumEditPlantOptions();
    });
    var vivariumEditPlantTableWrap = document.getElementById('vivariumEditPlantTableWrap');
    if (vivariumEditPlantTableWrap) vivariumEditPlantTableWrap.addEventListener('change', function(e) {
        if (e.target && e.target.classList && e.target.classList.contains('vivarium-plant-checkbox') && vivariumEditing) {
            var n = Number(e.target.value);
            if (isNaN(n)) return;
            if (!Array.isArray(vivariumEditing.plantIds)) vivariumEditing.plantIds = [];
            var ids = vivariumEditing.plantIds.slice();
            var idx = ids.indexOf(n);
            if (e.target.checked) {
                if (idx === -1) ids.push(n);
            } else if (idx !== -1) {
                ids.splice(idx, 1);
            }
            vivariumEditing.plantIds = ids;
        }
    });
    var vivariumPlantImageTooltip = document.getElementById('vivariumPlantImageTooltip');
    if (vivariumEditPlantTableWrap && vivariumPlantImageTooltip) {
        var tooltipImg = vivariumPlantImageTooltip.querySelector('img');
        var tooltipShow = function(tr, pageX, pageY) {
            var url = tr.getAttribute('data-plant-image');
            if (!url || !tooltipImg) return;
            tooltipImg.src = url;
            tooltipImg.alt = (tr.querySelector('td:nth-child(2)') && tr.querySelector('td:nth-child(2)').textContent) || 'Plant';
            vivariumPlantImageTooltip.classList.add('show');
            vivariumPlantImageTooltip.style.left = (pageX + 12) + 'px';
            vivariumPlantImageTooltip.style.top = (pageY + 12) + 'px';
        };
        var tooltipHide = function() {
            vivariumPlantImageTooltip.classList.remove('show');
            if (tooltipImg) tooltipImg.src = '';
        };
        vivariumEditPlantTableWrap.addEventListener('mouseover', function(e) {
            var tr = e.target && e.target.closest && e.target.closest('tr');
            if (tr && tr.getAttribute('data-plant-image')) tooltipShow(tr, e.pageX, e.pageY);
        });
        vivariumEditPlantTableWrap.addEventListener('mousemove', function(e) {
            var tr = e.target && e.target.closest && e.target.closest('tr');
            if (tr && tr.getAttribute('data-plant-image') && vivariumPlantImageTooltip.classList.contains('show')) {
                vivariumPlantImageTooltip.style.left = (e.pageX + 12) + 'px';
                vivariumPlantImageTooltip.style.top = (e.pageY + 12) + 'px';
            }
        });
        vivariumEditPlantTableWrap.addEventListener('mouseleave', tooltipHide);
    }
    var vivariumEditSupplySearch = document.getElementById('vivariumEditSupplySearch');
    if (vivariumEditSupplySearch) vivariumEditSupplySearch.addEventListener('input', function() {
        if (typeof refreshVivariumEditSupplyOptions === 'function') refreshVivariumEditSupplyOptions();
    });
    var vivariumEditSupplyIdsEl = document.getElementById('vivariumEditSupplyIds');
    if (vivariumEditSupplyIdsEl) vivariumEditSupplyIdsEl.addEventListener('change', function() {
        if (vivariumEditing) {
            var ids = [];
            [].forEach.call(vivariumEditSupplyIdsEl.selectedOptions, function(opt) {
                var n = Number(opt.value);
                if (!isNaN(n)) ids.push(n);
            });
            vivariumEditing.supplyIds = ids;
        }
    });

    var equipmentImageModal = document.getElementById('equipmentImageModal');
    var equipmentDragDropArea = document.getElementById('equipmentDragDropArea');
    var equipmentFileInput = document.getElementById('equipmentFileInput');
    if (equipmentDragDropArea && equipmentFileInput) {
        equipmentDragDropArea.addEventListener('click', function() { equipmentFileInput.click(); });
        equipmentDragDropArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            equipmentDragDropArea.classList.add('drag-over');
        });
        equipmentDragDropArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            equipmentDragDropArea.classList.remove('drag-over');
        });
        equipmentDragDropArea.addEventListener('drop', function(e) {
            e.preventDefault();
            equipmentDragDropArea.classList.remove('drag-over');
            var files = Array.from(e.dataTransfer.files || []).filter(function(f) { return f.type.startsWith('image/'); });
            if (files.length) {
                currentEquipmentImageFiles = currentEquipmentImageFiles.concat(files);
                updateEquipmentImageGallery();
            }
        });
    }
    if (equipmentFileInput) {
        equipmentFileInput.addEventListener('change', function() {
            var files = Array.from(equipmentFileInput.files || []).filter(function(f) { return f.type.startsWith('image/'); });
            if (files.length) {
                currentEquipmentImageFiles = currentEquipmentImageFiles.concat(files);
                updateEquipmentImageGallery();
            }
            equipmentFileInput.value = '';
        });
    }
    var equipmentImageLoadUrlBtn = document.getElementById('equipmentImageLoadUrlBtn');
    var equipmentImageUrlInput = document.getElementById('equipmentImageUrlInput');
    if (equipmentImageLoadUrlBtn && equipmentImageUrlInput) {
        equipmentImageLoadUrlBtn.addEventListener('click', function() {
            var url = (equipmentImageUrlInput.value || '').trim();
            if (url) {
                currentEquipmentImageUrls.push(url);
                equipmentImageUrlInput.value = '';
                updateEquipmentImageGallery();
            }
        });
    }
    var equipmentClearGalleryBtn = document.getElementById('equipmentClearGalleryBtn');
    if (equipmentClearGalleryBtn) equipmentClearGalleryBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); clearEquipmentImageGallery(); });
    var equipmentImageSaveBtn = document.getElementById('equipmentImageSaveBtn');
    if (equipmentImageSaveBtn) equipmentImageSaveBtn.addEventListener('click', saveEquipmentImages);
    var equipmentImageCancelBtn = document.getElementById('equipmentImageCancelBtn');
    if (equipmentImageCancelBtn) equipmentImageCancelBtn.addEventListener('click', closeEquipmentImageModal);
    var closeEquipmentImageModalBtn = document.getElementById('closeEquipmentImageModal');
    if (closeEquipmentImageModalBtn) closeEquipmentImageModalBtn.addEventListener('click', closeEquipmentImageModal);

    var plantImageModal = document.getElementById('plantImageModal');
    var plantDragDropArea = document.getElementById('plantDragDropArea');
    var plantFileInput = document.getElementById('plantFileInput');
    if (plantDragDropArea && plantFileInput) {
        plantDragDropArea.addEventListener('click', function() { plantFileInput.click(); });
        plantDragDropArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            plantDragDropArea.classList.add('drag-over');
        });
        plantDragDropArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            plantDragDropArea.classList.remove('drag-over');
        });
        plantDragDropArea.addEventListener('drop', function(e) {
            e.preventDefault();
            plantDragDropArea.classList.remove('drag-over');
            var files = Array.from(e.dataTransfer.files || []).filter(function(f) { return f.type.startsWith('image/'); });
            if (files.length) {
                currentPlantImageFiles = currentPlantImageFiles.concat(files);
                updatePlantImageGallery();
            }
        });
    }
    if (plantFileInput) {
        plantFileInput.addEventListener('change', function() {
            var files = Array.from(plantFileInput.files || []).filter(function(f) { return f.type.startsWith('image/'); });
            if (files.length) {
                currentPlantImageFiles = currentPlantImageFiles.concat(files);
                updatePlantImageGallery();
            }
            plantFileInput.value = '';
        });
    }
    var plantImageLoadUrlBtn = document.getElementById('plantImageLoadUrlBtn');
    var plantImageUrlInput = document.getElementById('plantImageUrlInput');
    if (plantImageLoadUrlBtn && plantImageUrlInput) {
        plantImageLoadUrlBtn.addEventListener('click', function() {
            var url = (plantImageUrlInput.value || '').trim();
            if (url) {
                currentPlantImageUrls.push(url);
                plantImageUrlInput.value = '';
                updatePlantImageGallery();
            }
        });
    }
    var plantClearGalleryBtn = document.getElementById('plantClearGalleryBtn');
    if (plantClearGalleryBtn) plantClearGalleryBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); clearPlantImageGallery(); });
    var plantImageSaveBtn = document.getElementById('plantImageSaveBtn');
    if (plantImageSaveBtn) plantImageSaveBtn.addEventListener('click', savePlantImages);
    var plantImageCancelBtn = document.getElementById('plantImageCancelBtn');
    if (plantImageCancelBtn) plantImageCancelBtn.addEventListener('click', closePlantImageModal);
    var closePlantImageModalBtn = document.getElementById('closePlantImageModal');
    if (closePlantImageModalBtn) closePlantImageModalBtn.addEventListener('click', closePlantImageModal);

    // Supply edit: capture phase on document so pencil icon click is always handled first
    document.addEventListener('click', function equipmentEditCapture(e) {
        var btn = e.target.closest('.equipment-edit-icon');
        if (!btn) return;
        var grid = document.getElementById('plantsGrid');
        if (!grid || !grid.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        var id = parseInt(btn.getAttribute('data-equipment-id'), 10);
        if (isNaN(id)) return;
        var equip = (typeof allEquipment !== 'undefined' && allEquipment) ? allEquipment.find(function(ev) { return ev.id === id; }) : null;
        if (equip) openEquipmentEdit(equip);
    }, true);
    // Supply images: same for image icon
    document.addEventListener('click', function equipmentImageCapture(e) {
        var btn = e.target.closest('.equipment-image-icon');
        if (!btn) return;
        var grid = document.getElementById('plantsGrid');
        if (!grid || !grid.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        var id = parseInt(btn.getAttribute('data-equipment-id'), 10);
        if (isNaN(id)) return;
        var equip = (typeof allEquipment !== 'undefined' && allEquipment) ? allEquipment.find(function(ev) { return ev.id === id; }) : null;
        if (equip) openEquipmentImageUpload(equip);
    }, true);
}

// Search functionality
function handleSearch() {
    if (!searchInput) return;
    if (currentView === 'equipment') {
        applyEquipmentFilters();
        return;
    }
    if (currentView === 'vivariums') {
        applyVivariumFilters();
        return;
    }
    const searchTerm = searchInput.value.toLowerCase().trim();
    if (!searchTerm) {
        filteredPlants = [...allPlants];
    } else {
        filteredPlants = allPlants.filter(plant => {
            const nameMatch = plant.name?.toLowerCase().includes(searchTerm) || false;
            const scientificMatch = getScientificNameString(plant).toLowerCase().includes(searchTerm);
            const descriptionMatch = plant.description?.toLowerCase().includes(searchTerm) || false;
            const typeMatch = plant.type?.some(t => t.toLowerCase().includes(searchTerm)) || false;
            const commonNamesMatch = plant.commonNames?.some(name =>
                name.toLowerCase().includes(searchTerm)
            ) || false;
            return nameMatch || scientificMatch || descriptionMatch || typeMatch || commonNamesMatch;
        });
    }
    applyAllFilters();
}

function setSortSelectOptions(view) {
    if (!sortSelect) return;
    const opts = view === 'equipment' ? EQUIPMENT_SORT_OPTIONS : (view === 'vivariums' ? VIVARIUM_SORT_OPTIONS : PLANT_SORT_OPTIONS);
    const currentVal = view === 'equipment' ? equipmentSortField : (view === 'vivariums' ? vivariumSortField : sortField);
    sortSelect.innerHTML = opts.map(o => `<option value="${o.value}"${o.value === currentVal ? ' selected' : ''}>${o.label}</option>`).join('');
}

// Sort functionality: plants vs supplies vs vivariums use separate options and state
function handleSort() {
    if (!sortSelect) return;
    if (currentView === 'plants') {
        sortField = sortSelect.value;
        applyAllFilters();
    } else if (currentView === 'equipment') {
        equipmentSortField = sortSelect.value;
        applyEquipmentFilters();
    } else if (currentView === 'vivariums') {
        vivariumSortField = sortSelect.value;
        applyVivariumFilters();
    }
}

function handleSortDirection() {
    if (currentView === 'plants') {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        updateSortDirectionButton();
        applyAllFilters();
    } else if (currentView === 'equipment') {
        equipmentSortDirection = equipmentSortDirection === 'asc' ? 'desc' : 'asc';
        updateSortDirectionButton();
        applyEquipmentFilters();
    } else if (currentView === 'vivariums') {
        vivariumSortDirection = vivariumSortDirection === 'asc' ? 'desc' : 'asc';
        updateSortDirectionButton();
        applyVivariumFilters();
    }
}

function updateSortDirectionButton() {
    if (!sortDirectionBtn) return;
    const dir = currentView === 'equipment' ? equipmentSortDirection : (currentView === 'vivariums' ? vivariumSortDirection : sortDirection);
    const upEl = sortDirectionBtn.querySelector('.sort-icon-up');
    const downEl = sortDirectionBtn.querySelector('.sort-icon-down');
    if (dir === 'asc') {
        sortDirectionBtn.classList.remove('active-desc');
        if (upEl) upEl.classList.remove('hidden');
        if (downEl) downEl.classList.add('hidden');
    } else {
        sortDirectionBtn.classList.add('active-desc');
        if (upEl) upEl.classList.add('hidden');
        if (downEl) downEl.classList.remove('hidden');
    }
}

// Helper function to extract scientific name as string (handles both string and object formats)
function getScientificNameString(plant) {
    if (!plant || !plant.scientificName) return '';
    if (typeof plant.scientificName === 'string') {
        return plant.scientificName;
    }
    if (typeof plant.scientificName === 'object') {
        return plant.scientificName.scientificName || plant.scientificName.name || '';
    }
    return String(plant.scientificName);
}

// Cultivated variety: full species + quoted cultivar name (e.g. Aglaonema commutatum 'Red Ruby'). Stored override plant.isCultivar wins.
function isPlantCultivar(plant) {
    if (!plant) return false;
    if (plant.isCultivar === true || plant.isCultivar === false) return plant.isCultivar === true;
    const speciesBase = (plant.taxonomy && plant.taxonomy.species && String(plant.taxonomy.species).trim()) || '';
    const full = getScientificNameString(plant).trim();
    if (!speciesBase || full === speciesBase) return false;
    return (/'[^']+'/.test(full) || /"[^"]+"/.test(full));
}

// Botanical variety: scientific name contains " var. " (e.g. Ananas comosus var. microstachys). Stored override plant.isVariety wins.
function isPlantVariety(plant) {
    if (!plant) return false;
    if (plant.isVariety === true || plant.isVariety === false) return plant.isVariety === true;
    return /\s+var\.\s+/i.test(getScientificNameString(plant));
}

// Hybrid: scientific name contains " x " or " × " between two names. Stored override plant.isHybrid wins.
function isPlantHybrid(plant) {
    if (!plant) return false;
    if (plant.isHybrid === true || plant.isHybrid === false) return plant.isHybrid === true;
    return /\s+(x|×)\s+/i.test(getScientificNameString(plant));
}

// Hybrid parents: use stored hybridParent1/hybridParent2 when present, else parse from scientificName
function getHybridParentNames(plant) {
    if (!plant) return null;
    const p1 = (plant.hybridParent1 && String(plant.hybridParent1).trim()) || '';
    const p2 = (plant.hybridParent2 && String(plant.hybridParent2).trim()) || '';
    if (p1 && p2) return [p1, p2];
    const full = getScientificNameString(plant).trim();
    const match = full.match(/\s+(x|×)\s+/i);
    if (!match) return null;
    const idx = match.index;
    const parent1 = full.slice(0, idx).trim();
    const parent2 = full.slice(idx + match[0].length).trim();
    return parent1 && parent2 ? [parent1, parent2] : null;
}

// Genus = first word of a parent name (e.g. "Tillandsia brachycaulos" -> "Tillandsia")
function getGenusFromParentName(parentName) {
    if (!parentName || typeof parentName !== 'string') return '';
    return parentName.trim().split(/\s+/)[0] || '';
}

// Intergeneric hybrid: parents from different genera (rank = species-level)
function isIntergenericHybrid(plant) {
    if (!plant || !isPlantHybrid(plant)) return false;
    const parents = getHybridParentNames(plant);
    if (!parents || parents.length < 2) return false;
    const g1 = getGenusFromParentName(parents[0]);
    const g2 = getGenusFromParentName(parents[1]);
    return g1 && g2 && g1.toLowerCase() !== g2.toLowerCase();
}

// Interspecific hybrid: parents from same genus (rank = cultivar-level)
function isInterspecificHybrid(plant) {
    if (!plant || !isPlantHybrid(plant)) return false;
    const parents = getHybridParentNames(plant);
    if (!parents || parents.length < 2) return false;
    const g1 = getGenusFromParentName(parents[0]);
    const g2 = getGenusFromParentName(parents[1]);
    return g1 && g2 && g1.toLowerCase() === g2.toLowerCase();
}

function sortPlants(plants) {
    if (!plants || plants.length === 0) return plants;
    
    const ascending = sortDirection === 'asc';
    
    return [...plants].sort((a, b) => {
        let aVal, bVal;
        
        switch(sortField) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                break;
            case 'scientific':
                aVal = getScientificNameString(a).toLowerCase();
                bVal = getScientificNameString(b).toLowerCase();
                break;
            case 'rarity':
                aVal = raritySortRank(a.rarity);
                bVal = raritySortRank(b.rarity);
                break;
            case 'difficulty':
                // Use difficultyRange if available, otherwise try difficulty string
                const difficultyOrder = { 'Easy': 1, 'easy': 1, 'Moderate': 2, 'moderate': 2, 'Hard': 3, 'hard': 3 };
                const aDiffRange = a.difficultyRange || a.difficulty;
                const bDiffRange = b.difficultyRange || b.difficulty;
                if (aDiffRange && typeof aDiffRange === 'object' && aDiffRange.ideal !== undefined) {
                    aVal = aDiffRange.ideal || (aDiffRange.min + aDiffRange.max) / 2;
                } else {
                    aVal = difficultyOrder[aDiffRange] || 0;
                }
                if (bDiffRange && typeof bDiffRange === 'object' && bDiffRange.ideal !== undefined) {
                    bVal = bDiffRange.ideal || (bDiffRange.min + bDiffRange.max) / 2;
                } else {
                    bVal = difficultyOrder[bDiffRange] || 0;
                }
                break;
            case 'temperature':
                // Use temperatureRange if available, otherwise try temperature string
                const aTempRange = a.temperatureRange || a.temperature;
                const bTempRange = b.temperatureRange || b.temperature;
                if (aTempRange && typeof aTempRange === 'object' && aTempRange.ideal !== undefined) {
                    aVal = aTempRange.ideal || (aTempRange.min + aTempRange.max) / 2;
                } else {
                    aVal = extractTemperature(aTempRange);
                }
                if (bTempRange && typeof bTempRange === 'object' && bTempRange.ideal !== undefined) {
                    bVal = bTempRange.ideal || (bTempRange.min + bTempRange.max) / 2;
                } else {
                    bVal = extractTemperature(bTempRange);
                }
                break;
            case 'humidity':
                // Use humidityRange if available, otherwise try humidity string
                const aHumRange = a.humidityRange || a.humidity;
                const bHumRange = b.humidityRange || b.humidity;
                if (aHumRange && typeof aHumRange === 'object' && aHumRange.ideal !== undefined) {
                    aVal = aHumRange.ideal || (aHumRange.min + aHumRange.max) / 2;
                } else {
                    aVal = extractHumidity(aHumRange);
                }
                if (bHumRange && typeof bHumRange === 'object' && bHumRange.ideal !== undefined) {
                    bVal = bHumRange.ideal || (bHumRange.min + bHumRange.max) / 2;
                } else {
                    bVal = extractHumidity(bHumRange);
                }
                break;
            case 'light':
                // Use lightRange if available, otherwise try lightRequirements string
                const aLightRange = a.lightRange || a.lightRequirements;
                const bLightRange = b.lightRange || b.lightRequirements;
                if (aLightRange && typeof aLightRange === 'object' && aLightRange.ideal !== undefined) {
                    aVal = aLightRange.ideal || (aLightRange.min + aLightRange.max) / 2;
                } else {
                    aVal = extractLight(aLightRange);
                }
                if (bLightRange && typeof bLightRange === 'object' && bLightRange.ideal !== undefined) {
                    bVal = bLightRange.ideal || (bLightRange.min + bLightRange.max) / 2;
                } else {
                    bVal = extractLight(bLightRange);
                }
                break;
            case 'growthRate':
                const aInputs = mapPlantToInputs(a);
                const bInputs = mapPlantToInputs(b);
                const aGrowthRate = aInputs.growthRateRange || a.growthRateRange;
                const bGrowthRate = bInputs.growthRateRange || b.growthRateRange;
                aVal = aGrowthRate ? (aGrowthRate.ideal || (aGrowthRate.min + aGrowthRate.max) / 2) : 50;
                bVal = bGrowthRate ? (bGrowthRate.ideal || (bGrowthRate.min + bGrowthRate.max) / 2) : 50;
                break;
            case 'price':
                aVal = getPlantPrice(a);
                bVal = getPlantPrice(b);
                break;
            case 'topSeller':
                aVal = Number(a.topSeller ?? a.salesCount ?? 0);
                bVal = Number(b.topSeller ?? b.salesCount ?? 0);
                break;
            case 'userRatings':
                aVal = Number(a.userRatings ?? a.rating ?? 0);
                bVal = Number(b.userRatings ?? b.rating ?? 0);
                break;
            default:
                return 0;
        }
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        } else {
            return ascending ? aVal - bVal : bVal - aVal;
        }
    });
}

function extractTemperature(tempStr) {
    if (!tempStr) return 0;
    const match = tempStr.match(/(\d+)-(\d+)/);
    if (match) {
        return (parseInt(match[1]) + parseInt(match[2])) / 2; // Average temperature
    }
    return 0;
}

function extractHumidity(humidityStr) {
    if (!humidityStr) return 0;
    const str = humidityStr.toLowerCase();
    if (str.includes('very high') || str.includes('80-100') || str.includes('70-90')) return 5;
    if (str.includes('high') || str.includes('60-80')) return 4;
    if (str.includes('moderate') || str.includes('50-70')) return 3;
    if (str.includes('low') || str.includes('40-50')) return 2;
    if (str.includes('submerged')) return 6;
    return 0;
}

function extractLight(lightStr) {
    if (!lightStr) return 0;
    const str = lightStr.toLowerCase();
    if (str.includes('high') || str.includes('bright')) return 4;
    if (str.includes('medium') || str.includes('moderate')) return 3;
    if (str.includes('low') || str.includes('shade')) return 2;
    return 0;
}

// Extract air circulation from plant data and format for display
function extractAirCirculation(plant) {
    // First check if plant has airCirculation field
    if (plant.airCirculation) {
        return plant.airCirculation;
    }
    
    // Try to extract from description and careTips
    const description = (plant.description || '').toLowerCase();
    const careTips = Array.isArray(plant.careTips) ? plant.careTips.join(' ').toLowerCase() : '';
    const combinedText = description + ' ' + careTips;
    
    if (combinedText.includes('closed') || combinedText.includes('sealed') || combinedText.includes('self-contained')) {
        return 'Minimal (Closed/Sealed)';
    } else if (combinedText.includes('semi-closed') || combinedText.includes('partially open')) {
        return 'Low (Semi-closed)';
    } else if (combinedText.includes('ventilated') || combinedText.includes('air circulation')) {
        return 'Moderate (Ventilated)';
    } else if (combinedText.includes('open') || combinedText.includes('well-ventilated') || combinedText.includes('good air flow')) {
        return 'High (Open/Well-ventilated)';
    } else if (combinedText.includes('open air') || combinedText.includes('outdoor')) {
        return 'Very High (Open air)';
    }
    
    // Infer from humidity if not found in text
    const humidityStr = (plant.humidity || '').toLowerCase();
    if (humidityStr.includes('very high') || humidityStr.includes('70-90') || humidityStr.includes('80-100') || humidityStr.includes('85-100')) {
        if (!humidityStr.includes('submerged')) {
            return 'Minimal (Closed/Sealed)'; // High humidity usually means closed terrarium
        }
    } else if (humidityStr.includes('high') || humidityStr.includes('60-80') || humidityStr.includes('70-80')) {
        return 'Low (Semi-closed)';
    } else if (humidityStr.includes('low') || humidityStr.includes('40-50') || humidityStr.includes('30-40') || humidityStr.includes('20-30') || humidityStr.includes('very low')) {
        return 'High (Open/Well-ventilated)';
    }
    
    // Default
    return 'Moderate (Ventilated)';
}

/** Per-plant cache for vivarium type badges (cleared when catalog reloads). */
const _plantVivariumTypesCache = new Map();
function clearPlantVivariumTypesCache() {
    _plantVivariumTypesCache.clear();
}
function invalidatePlantVivariumTypesCache(plantId) {
    if (plantId != null) _plantVivariumTypesCache.delete(String(plantId));
}

// Calculate vivarium types for a plant using mathematical logic
function calculatePlantVivariumTypes(plant) {
    var cacheKey = plant && plant.id != null ? String(plant.id) : '';
    if (cacheKey && _plantVivariumTypesCache.has(cacheKey)) {
        var hit = _plantVivariumTypesCache.get(cacheKey);
        window.__lastVivariumScores = hit.scores;
        return hit.results.slice();
    }
    var computed = calculatePlantVivariumTypesUncached(plant);
    if (cacheKey) {
        _plantVivariumTypesCache.set(cacheKey, {
            results: Array.isArray(computed) ? computed.slice() : [],
            scores: window.__lastVivariumScores || {}
        });
    }
    return computed;
}

function calculatePlantVivariumTypesUncached(plant) {
    try {
        // Build type config once — descriptions are unused for scoring but kept for parity
        if (!calculatePlantVivariumTypesUncached._types) {
        calculatePlantVivariumTypesUncached._types = {
            'open-terrarium': { 
                name: 'Open Terrarium', 
                description: 'Imagine a glass container with its top partially open, creating a delicate balance between humidity and fresh air. This is the open terrarium, where tropical plants find their perfect home. The design allows gentle air currents to flow through while maintaining that essential high humidity that many plants crave. You\'ll find terrestrial plants and epiphytes thriving here, their leaves glistening with moisture yet breathing freely. Hardscape elements like driftwood, rocks, and porous walls provide mounting surfaces for epiphytic plants, creating vertical interest and maximizing space utilization. The partially open design prevents the stagnant air conditions that can lead to mold and fungal issues, while still providing the elevated moisture levels that tropical species require. This setup is particularly well-suited for plants that benefit from some air movement, such as those prone to rot in completely still environments. Since the open design allows humidity to escape more readily than closed systems, humidity levels can be restored or maintained through manual misting or automatic water spraying and fogging systems. The increased ventilation also makes open terrariums more forgiving for beginners, as they\'re less prone to overwatering issues and allow for easier adjustment of environmental conditions.',
                humidity: { min: 70, max: 100, ideal: 85 }, 
                light: { min: 20, max: 80, ideal: 50 }, 
                airCirculation: { min: 40, max: 60, ideal: 50 }, 
                substrate: ['moist', 'wet', 'epiphytic'], 
                waterNeeds: { min: 40, max: 100, ideal: 70 },
                temperature: { min: 36, max: 50, ideal: 42 },
                difficulty: { min: 30, max: 70, ideal: 50 },
                soilPh: { min: 35.7, max: 57.1, ideal: 46.4 },
                waterBody: false
            },
            'closed-terrarium': { 
                name: 'Closed Terrarium', 
                description: 'Picture a sealed glass world, a miniature ecosystem that sustains itself through the beautiful dance of condensation and evaporation. The closed terrarium is nature\'s own greenhouse, trapping moisture and creating a stable microclimate where humidity levels remain consistently high. Inside this sealed environment, tropical plants flourish in the still, humid air that mimics their native rainforest homes. Hardscape elements like driftwood, rocks, and porous walls provide mounting surfaces for epiphytic plants, allowing you to create layered displays with both terrestrial and epiphytic species. The water cycle creates a self-sustaining system where moisture condenses on the glass and trickles back down, nourishing the plants below. This creates a nearly autonomous ecosystem where plants recycle their own moisture through transpiration and condensation. The sealed design means minimal water loss, making these terrariums incredibly low-maintenance once properly established. However, the lack of air exchange means they require careful plant selection, as species that need air movement or are prone to fungal issues may struggle. The high humidity and still air create perfect conditions for mosses, ferns, and other moisture-loving plants that thrive in stagnant, humid environments. These terrariums can remain sealed for extended periods, only needing occasional opening to refresh the air or remove excess condensation.',
                humidity: { min: 60, max: 100, ideal: 80 }, 
                light: { min: 20, max: 70, ideal: 40 }, 
                airCirculation: { min: 0, max: 30, ideal: 20 }, 
                substrate: ['moist', 'wet', 'epiphytic'], 
                waterNeeds: { min: 40, max: 100, ideal: 70 },
                temperature: { min: 36, max: 50, ideal: 42 },
                difficulty: { min: 20, max: 50, ideal: 35 },
                soilPh: { min: 35.7, max: 57.1, ideal: 46.4 },
                waterBody: false
            },
            paludarium: { 
                name: 'Paludarium', 
                description: 'Step into a world where land and water meet, where aquatic plants drift beneath the surface while terrestrial species reach toward the light above. The paludarium is a semi-aquatic masterpiece, featuring a permanent water body alongside carefully designed land areas. Derived from the Latin word "palus" meaning marsh or swamp, paludariums replicate these transitional ecosystems where water and land coexist. Here, fully submerged plants create underwater gardens while emergent species send their roots into the water and their leaves into the humid air above. Terrestrial plants thrive in the saturated soil near the water\'s edge, benefiting from the constant humidity created by evaporation. Epiphytic plants can be mounted on driftwood, rocks, and porous walls that emerge from the water, creating vertical interest and utilizing all available space. This is the realm of bog plants, marginal species, and those fascinating plants that bridge two worlds. The water section becomes a living pond, supporting aquatic life while the land areas create elevated habitats for moisture-loving terrestrial plants. Hardscape elements like driftwood, stone formations, and porous walls provide mounting surfaces for epiphytic species, allowing for incredible biodiversity in a single cohesive environment. Water circulation systems help maintain water quality while contributing to the overall humidity of the terrestrial zones. While the water body naturally contributes to humidity through evaporation, open paludarium designs often benefit from supplemental humidity maintenance through manual misting or automatic water spraying and fogging systems, ensuring optimal conditions for both aquatic and terrestrial inhabitants. The combination of water and land creates naturalistic displays that showcase the beauty of wetland ecosystems.',
                humidity: { min: 70, max: 100, ideal: 90 }, 
                light: { min: 20, max: 100, ideal: 60 }, 
                airCirculation: { min: 20, max: 60, ideal: 50 }, 
                substrate: ['wet', 'aquatic', 'moist', 'epiphytic'], 
                waterNeeds: { min: 40, max: 100, ideal: 80 },
                temperature: { min: 36, max: 50, ideal: 42 },
                difficulty: { min: 50, max: 90, ideal: 70 },
                soilPh: { min: 35.7, max: 57.1, ideal: 46.4 },
                waterBody: true,
                waterCirculation: { min: 10, max: 30, ideal: 20 },
                waterTemperature: { min: 40, max: 50, ideal: 45 },
                waterPh: { min: 46.4, max: 53.6, ideal: 50 },
                waterHardness: { min: 0, max: 50, ideal: 25 },
                salinity: { min: 0, max: 5, ideal: 0 }
            },
            aerarium: { 
                name: 'Aerarium', 
                description: 'Enter a space designed for plants that defy convention, growing without soil or water bodies, suspended in air like living sculptures. The aerarium celebrates epiphytic plants in their natural glory, mounted on branches, bark, driftwood, or specialized structures that mimic their tree-dwelling habitats. High air circulation flows through this open-air enclosure, essential for these air-breathing plants that absorb moisture and nutrients directly from the atmosphere through specialized structures like trichomes and velamen roots. Orchids display their intricate blooms, bromeliads form rosettes that catch rainwater and debris, and Tillandsia species cling to surfaces with their specialized holdfasts. These plants have evolved to thrive without traditional soil, instead extracting what they need from the air, rain, and organic matter that accumulates around them. The moderate to high humidity levels are maintained through regular misting, fogging systems, or humidifiers, creating an environment that replicates the canopy of tropical forests where these remarkable plants naturally thrive. The open design ensures excellent air movement, preventing the stagnant conditions that can lead to rot in epiphytic species. Some aerariums incorporate fans to simulate the breezy conditions of their natural canopy habitats, while others rely on natural room air circulation.',
                humidity: { min: 50, max: 90, ideal: 70 }, 
                light: { min: 40, max: 100, ideal: 70 }, 
                airCirculation: { min: 60, max: 100, ideal: 80 }, 
                substrate: ['epiphytic'], 
                waterNeeds: { min: 20, max: 60, ideal: 40 },
                temperature: { min: 36, max: 50, ideal: 42 },
                difficulty: { min: 50, max: 90, ideal: 70 },
                soilPh: { min: 35.7, max: 57.1, ideal: 46.4 },
                waterBody: false
            },
            deserterium: { 
                name: 'Deserterium', 
                description: 'Welcome to an arid landscape recreated indoors, where succulents and cacti showcase their incredible adaptations to harsh conditions. The deserterium, also known as a desertarium or xerarium, is a dry, well-ventilated space where low humidity and excellent air circulation prevent the moisture buildup that would spell disaster for these desert dwellers. Bright light floods the enclosure, mimicking the intense sun of arid regions, while fast-draining substrates like sand, pumice, or specialized cactus mixes ensure that water never lingers around sensitive roots. Here, plants with water-storing tissues, reduced leaf surfaces, waxy coatings, and specialized root systems demonstrate their survival strategies. The environment celebrates the beauty of xerophytic plants, from the geometric perfection of cacti with their spines and ribbed structures to the plump leaves of succulents that store water in their tissues. These plants have evolved CAM photosynthesis, allowing them to open their stomata at night to minimize water loss. The low humidity prevents fungal diseases and rot, while the high light levels ensure proper growth and often trigger spectacular flowering displays. Ventilation is crucial to prevent any moisture accumulation, making these setups ideal for arid-adapted species that would suffer in the high-humidity conditions of traditional terrariums.',
                humidity: { min: 20, max: 50, ideal: 30 }, 
                light: { min: 60, max: 100, ideal: 90 }, 
                airCirculation: { min: 60, max: 100, ideal: 80 }, 
                substrate: ['dry'], 
                waterNeeds: { min: 0, max: 30, ideal: 15 },
                temperature: { min: 40, max: 60, ideal: 50 },
                difficulty: { min: 30, max: 60, ideal: 45 },
                soilPh: { min: 42.9, max: 64.3, ideal: 53.6 },
                waterBody: false
            },
            aquarium: { 
                name: 'Aquarium', 
                description: 'Dive into a fully aquatic world where plants exist entirely underwater, their entire life cycle playing out beneath the surface. The aquarium is a water-filled environment where aquatic plants grow completely submerged, obtaining all their nutrients from the water column and specialized aquatic substrates. These plants have adapted to life underwater through remarkable evolutionary changes, with leaves designed to absorb nutrients directly from water, reduced cuticles that allow gas exchange, and stems that float or anchor in aquatic media. Some species attach themselves to driftwood or rocks using specialized holdfasts, while others root in fine gravel or specialized aquatic soils rich in nutrients. The environment is completely saturated, with no emergent parts, creating an underwater garden that supports not just plants but an entire aquatic ecosystem including fish, invertebrates, and beneficial bacteria. Lighting penetrates the water to fuel photosynthesis, with specialized aquarium lights providing the spectrum and intensity needed for aquatic plant growth. Water circulation through filters and pumps ensures nutrients reach every plant while maintaining water quality. The water chemistry, including pH, hardness, and nutrient levels, becomes critical for plant health, requiring careful monitoring and management. Some aquariums incorporate CO2 injection systems to enhance plant growth, while others rely on natural processes and careful plant selection.',
                humidity: { min: 100, max: 100, ideal: 100 }, 
                light: { min: 20, max: 70, ideal: 50 }, 
                airCirculation: { min: 0, max: 30, ideal: 20 }, 
                substrate: ['aquatic'], 
                waterNeeds: { min: 80, max: 100, ideal: 90 },
                temperature: { min: 36, max: 50, ideal: 42 },
                difficulty: { min: 50, max: 90, ideal: 70 },
                soilPh: { min: 35.7, max: 57.1, ideal: 46.4 },
                waterBody: true,
                waterCirculation: { min: 0, max: 100, ideal: 50 },
                waterTemperature: { min: 40, max: 50, ideal: 45 },
                waterPh: { min: 46.4, max: 53.6, ideal: 50 },
                waterHardness: { min: 0, max: 50, ideal: 25 },
                salinity: { min: 0, max: 5, ideal: 0 }
            },
            riparium: { 
                name: 'Riparium', 
                description: 'Experience the dynamic environment of a riverbank brought indoors, where plants straddle the boundary between water and air. The riparium, derived from the Latin "ripa" meaning riverbank, features a shallow water section with high air circulation, perfectly suited for marginal and riparian plants that naturally grow at water\'s edge. These remarkable plants send their roots into the water while their foliage extends above the surface, creating a striking vertical display that emphasizes the transition zone between aquatic and terrestrial environments. Epiphytic plants can be mounted on driftwood, rocks, and porous walls positioned above or emerging from the water, taking advantage of the high humidity and air circulation. The high air circulation mimics the moving air of streamside environments, where plants experience both aquatic roots and exposed foliage, preventing the stagnant conditions that can plague other setups. Some houseplants adapt beautifully to this setup, growing hydroponically with roots submerged while maintaining their terrestrial foliage above, making ripariums versatile displays that combine aquatic and terrestrial aesthetics. Hardscape elements provide mounting opportunities for epiphytic species, maximizing vertical space and creating naturalistic riverbank scenes. The constant water evaporation creates elevated humidity levels, benefiting the emergent growth while the flowing water ensures roots receive constant hydration. Unlike paludariums which feature deeper water sections and more extensive land areas, ripariums focus specifically on the shallow water margin, creating a more specialized habitat for plants that thrive in this unique ecological niche. Water circulation systems help maintain water quality while creating the gentle flow that many marginal plants appreciate.',
                humidity: { min: 70, max: 100, ideal: 85 }, 
                light: { min: 20, max: 70, ideal: 50 }, 
                airCirculation: { min: 60, max: 100, ideal: 80 }, 
                substrate: ['wet', 'aquatic', 'moist', 'epiphytic'], 
                waterNeeds: { min: 60, max: 100, ideal: 80 },
                temperature: { min: 36, max: 50, ideal: 42 },
                difficulty: { min: 50, max: 90, ideal: 70 },
                soilPh: { min: 35.7, max: 57.1, ideal: 46.4 },
                waterBody: true,
                waterCirculation: { min: 30, max: 80, ideal: 55 },
                waterTemperature: { min: 40, max: 50, ideal: 45 },
                waterPh: { min: 46.4, max: 53.6, ideal: 50 },
                waterHardness: { min: 0, max: 50, ideal: 25 },
                salinity: { min: 0, max: 5, ideal: 0 }
            },
            'indoor': { 
                name: 'Indoor', 
                description: 'Discover the world of adaptable houseplants that thrive in typical home and office environments without requiring specialized enclosures. These plants have learned to adapt to moderate humidity levels, making them perfect companions for everyday living spaces. They appreciate good light and benefit from the natural air movement that comes with being in an open room, whether that\'s gentle breezes from HVAC systems or the subtle air currents of a well-ventilated space. Potted in containers with appropriate soil mixes, these plants bring nature indoors while remaining accessible and easy to care for. While they might appreciate the extra humidity of a terrarium, they don\'t require it, making them ideal for those who want greenery without the commitment of specialized vivarium setups.',
                humidity: { min: 30, max: 70, ideal: 50 }, 
                light: { min: 40, max: 100, ideal: 70 }, 
                airCirculation: { min: 60, max: 100, ideal: 80 }, 
                substrate: ['moist', 'dry'], 
                waterNeeds: { min: 20, max: 60, ideal: 40 },
                temperature: { min: 36, max: 50, ideal: 42 },
                difficulty: { min: 20, max: 60, ideal: 40 },
                growthRate: { min: 0, max: 100, ideal: 50 },
                soilPh: { min: 35.7, max: 57.1, ideal: 46.4 },
                waterBody: false
            },
            'outdoor': { 
                name: 'Outdoor', 
                description: 'Embrace the natural world where plants experience the full spectrum of environmental conditions, from gentle morning mists to intense afternoon sun. Outdoor growing environments offer plants exposure to natural weather patterns, unrestricted air movement, and the variable humidity that comes with changing seasons and weather conditions. These plants are adapted to handle environmental fluctuations, thriving in conditions that would challenge more delicate species. Whether planted in garden beds, containers on patios, or integrated into landscape designs, outdoor plants benefit from maximum air circulation and natural light cycles. They\'ve evolved to handle the realities of outdoor life, from temperature swings to varying moisture levels, creating resilient displays that change with the seasons.',
                humidity: { min: 20, max: 80, ideal: 50 }, 
                light: { min: 60, max: 100, ideal: 90 }, 
                airCirculation: { min: 80, max: 100, ideal: 95 }, 
                substrate: ['moist', 'dry', 'wet'], 
                waterNeeds: { min: 10, max: 70, ideal: 40 },
                temperature: { min: 20, max: 80, ideal: 50 },
                difficulty: { min: 20, max: 60, ideal: 40 },
                soilPh: { min: 28.6, max: 64.3, ideal: 46.4 },
                waterBody: false
            }
        };
        }
        const VIVARIUM_TYPES = calculatePlantVivariumTypesUncached._types;
        
        // Use global NUMERIC_SCALES and mapPlantToInputs
        // (removed duplicate definitions - they're defined at module level)
        
        const inputs = mapPlantToInputs(plant);
        const scores = {};
        
        // Determine plant characteristics for proper vivarium type assignment
        const isEpiphytic = inputs.substrate === 'epiphytic' || inputs.specialNeeds === 'epiphytic';
        const isAquatic = inputs.substrate === 'aquatic' || inputs.specialNeeds === 'aquatic';
        const isSucculent = inputs.substrate === 'dry' || inputs.specialNeeds === 'succulent' || 
                           (Array.isArray(plant.category) && plant.category.map(c => String(c).toLowerCase()).includes('succulent'));
        const isDesertPlant = isSucculent || (Array.isArray(plant.category) && plant.category.map(c => String(c).toLowerCase()).includes('cactus'));
        const isTerrestrial = !isAquatic && !isEpiphytic && inputs.substrate !== 'dry';
        
        // Calculate scores for each vivarium type based purely on range overlaps
        // Only hard exclusions: physical requirements (aquarium needs aquatic, aerarium needs epiphytic)
        for (const [type, config] of Object.entries(VIVARIUM_TYPES)) {
            // AQUARIUM: Physical requirement - only for fully aquatic plants (completely submerged)
            // This is a physical constraint, not a preference
            if (type === 'aquarium' && !isAquatic) {
                continue;
            }
            
            // AERARIUM: Physical requirement - only for epiphytic plants (no soil, no water body, mounted on surfaces)
            // This is a physical constraint, not a preference
            if (type === 'aerarium' && !isEpiphytic) {
                continue;
            }
            
            // All other exclusions are removed - let range overlap scoring determine compatibility
            // If ranges don't overlap, the score will be 0 or very low, effectively excluding it
            let score = 0;
            let maxScore = 0;
            
            // Determine if plant is fully aquatic (for paludarium/riparium logic)
            const isFullyAquatic = inputs.substrate === 'aquatic';
            const isSemiAquaticVivarium = (type === 'paludarium' || type === 'riparium');
            
            // Humidity (25%) - numeric range scoring (0-100%)
            // Skip for aquariums (irrelevant for fully aquatic environments)
            // Skip for aquatic plants in paludariums/ripariums (they use aquatic environment, not terrestrial)
            if (type !== 'aquarium' && !(isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 25;
                if (inputs.humidityRange && config.humidity) {
                    const plantMin = inputs.humidityRange.min;
                    const plantMax = inputs.humidityRange.max;
                    const vivariumMin = config.humidity.min;
                    const vivariumMax = config.humidity.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        // Ranges overlap - calculate score based on overlap
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        
                        // Use the midpoint of overlap as the actual humidity value for ideal distance calculation
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.humidity.ideal);
                        
                        // Score based on overlap percentage - if ranges overlap, the plant can be satisfied
                        // Standardized: require 30% overlap for full score (consistent across all requirements)
                        const baseScore = overlapPercentage >= 0.3 ? 20 : overlapPercentage * 20;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.15, baseScore * 0.25);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required humidity
                }
            } else {
                // For aquariums, skip humidity scoring (not applicable)
                maxScore += 25;
                score += 25; // Full points since humidity is always 100% (fully submerged)
            }
            
            // Light (15%) - numeric range scoring (0-100%)
            maxScore += 15;
            if (inputs.lightRange && config.light.min !== undefined) {
                const plantMin = inputs.lightRange.min;
                const plantMax = inputs.lightRange.max;
                const vivariumMin = config.light.min;
                const vivariumMax = config.light.max;
                
                // Check if ranges overlap
                const overlapMin = Math.max(plantMin, vivariumMin);
                const overlapMax = Math.min(plantMax, vivariumMax);
                
                if (overlapMin <= overlapMax) {
                    const overlapSize = overlapMax - overlapMin;
                    const plantRangeSize = plantMax - plantMin;
                    const overlapPercentage = overlapSize / plantRangeSize;
                    const overlapMidpoint = (overlapMin + overlapMax) / 2;
                    const distanceFromIdeal = Math.abs(overlapMidpoint - config.light.ideal);
                    
                    const baseScore = overlapPercentage >= 0.3 ? 15 : overlapPercentage * 15;
                    const idealPenalty = Math.min(distanceFromIdeal * 0.1, baseScore * 0.2);
                    score += Math.max(0, baseScore - idealPenalty);
                }
            }
            
            // Air circulation (15%)
            // Skip for aquariums (irrelevant for fully aquatic environments)
            // Skip for aquatic plants in paludariums/ripariums (they use aquatic environment, not terrestrial)
            if (type !== 'aquarium' && !(isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 15;
                if (inputs.airCirculationRange && config.airCirculation && config.airCirculation.min !== undefined) {
                    // Use range-based scoring for air circulation
                    const plantMin = inputs.airCirculationRange.min;
                    const plantMax = inputs.airCirculationRange.max;
                    const vivariumMin = config.airCirculation.min;
                    const vivariumMax = config.airCirculation.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        // Ranges overlap - calculate score based on overlap
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.airCirculation.ideal);
                        
                        // Score based on overlap - if ranges overlap, the plant can be satisfied
                        const baseScore = overlapPercentage >= 0.3 ? 15 : overlapPercentage * 15;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.1, baseScore * 0.2);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required air circulation
                }
            } else {
                // For aquariums, skip air circulation scoring (not applicable)
                maxScore += 15;
                score += 15; // Full points since air circulation is irrelevant for fully aquatic
            }
            
            // Substrate (20%)
            maxScore += 20;
            if (config.substrate.includes(inputs.substrate)) {
                score += 20;
            } else if (inputs.substrate === 'epiphytic' && config.substrate.includes('epiphytic')) {
                score += 20;
            }
            
            // Water needs (10%) - numeric range scoring (0-100%)
            // Skip for aquariums (irrelevant for fully aquatic environments)
            // Skip for aquatic plants in paludariums/ripariums (they use aquatic environment, not terrestrial)
            if (type !== 'aquarium' && !(isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 10;
                if (inputs.waterNeedsRange && config.waterNeeds && config.waterNeeds.min !== undefined) {
                    const plantMin = inputs.waterNeedsRange.min;
                    const plantMax = inputs.waterNeedsRange.max;
                    const vivariumMin = config.waterNeeds.min;
                    const vivariumMax = config.waterNeeds.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.waterNeeds.ideal);
                        
                        const baseScore = overlapPercentage >= 0.3 ? 10 : overlapPercentage * 10;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.08, baseScore * 0.15);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required water needs
                }
            } else {
                // For aquariums, skip water needs scoring (not applicable - always fully submerged)
                maxScore += 10;
                score += 10; // Full points since water needs are always met in aquariums
            }
            
            // Temperature (5%) - cross-check vivarium can provide vs plant needs
            // Skip for aquariums (irrelevant for fully aquatic environments)
            // Skip for aquatic plants in paludariums/ripariums (they use aquatic environment, not terrestrial)
            if (type !== 'aquarium' && !(isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 5;
                if (inputs.temperatureRange && config.temperature && config.temperature.min !== undefined) {
                    const plantMin = inputs.temperatureRange.min;
                    const plantMax = inputs.temperatureRange.max;
                    const vivariumMin = config.temperature.min;
                    const vivariumMax = config.temperature.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.temperature.ideal);
                        
                        const baseScore = overlapPercentage >= 0.3 ? 5 : overlapPercentage * 5;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.03, baseScore * 0.15);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required temperature
                }
            } else {
                // For aquariums, skip temperature scoring (not applicable)
                maxScore += 5;
                score += 5; // Full points since temperature is managed via water temperature
            }
            
            // Soil pH (5%) - cross-check vivarium can provide vs plant needs
            // Skip for aquatic plants in paludariums/ripariums (they use aquatic environment, not terrestrial)
            if (!(isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 5;
                if (inputs.soilPhRange && config.soilPh && config.soilPh.min !== undefined) {
                    const plantMin = inputs.soilPhRange.min;
                    const plantMax = inputs.soilPhRange.max;
                    const vivariumMin = config.soilPh.min;
                    const vivariumMax = config.soilPh.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.soilPh.ideal);
                        
                        const baseScore = overlapPercentage >= 0.3 ? 5 : overlapPercentage * 5;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.03, baseScore * 0.15);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required soil pH
                }
            }
            
            // Water circulation (5%) - only for vivarium types with water body
            // Only check for aquatic plants (or always for aquariums)
            if (type === 'aquarium' || (isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 5;
                if (config.waterBody && config.waterCirculation && inputs.waterCirculationRange) {
                    const plantMin = inputs.waterCirculationRange.min;
                    const plantMax = inputs.waterCirculationRange.max;
                    const vivariumMin = config.waterCirculation.min;
                    const vivariumMax = config.waterCirculation.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.waterCirculation.ideal);
                        
                        const baseScore = overlapPercentage >= 0.3 ? 5 : overlapPercentage * 5;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.05, baseScore * 0.15);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required water circulation
                }
            } else if (!config.waterBody || !isFullyAquatic) {
                // No water body OR non-aquatic plant in semi-aquatic vivarium - give full points (water circulation not applicable)
                maxScore += 5;
                score += 5;
            }
            
            // Water Temperature (3%) - only for vivarium types with water body
            // Only check for aquatic plants (or always for aquariums)
            if (type === 'aquarium' || (isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 3;
                if (config.waterBody && config.waterTemperature && inputs.waterTemperatureRange) {
                    const plantMin = inputs.waterTemperatureRange.min;
                    const plantMax = inputs.waterTemperatureRange.max;
                    const vivariumMin = config.waterTemperature.min;
                    const vivariumMax = config.waterTemperature.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.waterTemperature.ideal);
                        
                        const baseScore = overlapPercentage >= 0.3 ? 3 : overlapPercentage * 3;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.02, baseScore * 0.15);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required water temperature
                }
            } else if (!config.waterBody || !isFullyAquatic) {
                // No water body OR non-aquatic plant in semi-aquatic vivarium - give full points (water temperature not applicable)
                maxScore += 3;
                score += 3;
            }
            
            // Water pH (3%) - only for vivarium types with water body
            // Only check for aquatic plants (or always for aquariums)
            if (type === 'aquarium' || (isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 3;
                if (config.waterBody && config.waterPh && inputs.waterPhRange) {
                    const plantMin = inputs.waterPhRange.min;
                    const plantMax = inputs.waterPhRange.max;
                    const vivariumMin = config.waterPh.min;
                    const vivariumMax = config.waterPh.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.waterPh.ideal);
                        
                        const baseScore = overlapPercentage >= 0.3 ? 3 : overlapPercentage * 3;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.02, baseScore * 0.15);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required water pH
                }
            } else if (!config.waterBody || !isFullyAquatic) {
                // No water body OR non-aquatic plant in semi-aquatic vivarium - give full points (water pH not applicable)
                maxScore += 3;
                score += 3;
            }
            
            // Water Hardness (2%) - only for vivarium types with water body
            // Only check for aquatic plants (or always for aquariums)
            if (type === 'aquarium' || (isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 2;
                if (config.waterBody && config.waterHardness && inputs.waterHardnessRange) {
                    const plantMin = inputs.waterHardnessRange.min;
                    const plantMax = inputs.waterHardnessRange.max;
                    const vivariumMin = config.waterHardness.min;
                    const vivariumMax = config.waterHardness.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.waterHardness.ideal);
                        
                        const baseScore = overlapPercentage >= 0.3 ? 2 : overlapPercentage * 2;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.01, baseScore * 0.15);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required water hardness
                }
            } else if (!config.waterBody || !isFullyAquatic) {
                // No water body OR non-aquatic plant in semi-aquatic vivarium - give full points (water hardness not applicable)
                maxScore += 2;
                score += 2;
            }
            
            // Salinity (2%) - only for vivarium types with water body
            // Only check for aquatic plants (or always for aquariums)
            if (type === 'aquarium' || (isSemiAquaticVivarium && isFullyAquatic)) {
                maxScore += 2;
                if (config.waterBody && config.salinity && inputs.salinityRange) {
                    const plantMin = inputs.salinityRange.min;
                    const plantMax = inputs.salinityRange.max;
                    const vivariumMin = config.salinity.min;
                    const vivariumMax = config.salinity.max;
                    
                    // Check if ranges overlap - if no overlap, vivarium CAN'T provide what plant needs
                    const overlapMin = Math.max(plantMin, vivariumMin);
                    const overlapMax = Math.min(plantMax, vivariumMax);
                    
                    if (overlapMin <= overlapMax) {
                        const overlapSize = overlapMax - overlapMin;
                        const plantRangeSize = plantMax - plantMin;
                        const overlapPercentage = overlapSize / plantRangeSize;
                        const overlapMidpoint = (overlapMin + overlapMax) / 2;
                        const distanceFromIdeal = Math.abs(overlapMidpoint - config.salinity.ideal);
                        
                        const baseScore = overlapPercentage >= 0.3 ? 2 : overlapPercentage * 2;
                        const idealPenalty = Math.min(distanceFromIdeal * 0.01, baseScore * 0.15);
                        score += Math.max(0, baseScore - idealPenalty);
                    }
                    // If no overlap, score remains 0 - vivarium cannot provide required salinity
                }
            } else if (!config.waterBody || !isFullyAquatic) {
                // No water body OR non-aquatic plant in semi-aquatic vivarium - give full points (salinity not applicable)
                maxScore += 2;
                score += 2;
            }
            
            // Special needs (10%)
            maxScore += 10;
            if (inputs.specialNeeds !== 'none') {
                if ((inputs.specialNeeds === 'aquatic' && (type === 'aquarium' || type === 'paludarium')) ||
                    (inputs.specialNeeds === 'epiphytic' && (type === 'aerarium' || type === 'open-terrarium' || type === 'closed-terrarium')) ||
                    (inputs.specialNeeds === 'succulent' && type === 'deserterium') ||
                    (inputs.specialNeeds === 'carnivorous' && (type === 'open-terrarium' || type === 'closed-terrarium' || type === 'paludarium'))) {
                    score += 10;
                } else if ((inputs.specialNeeds === 'bromeliad' || inputs.specialNeeds === 'orchid') && (type === 'open-terrarium' || type === 'closed-terrarium' || type === 'aerarium')) {
                    score += 8;
                }
            } else {
                score += 5;
            }
            
            const percentageScore = (score / maxScore) * 100;
            scores[type] = { score: percentageScore, name: config.name };
        }
        window.__lastVivariumScores = scores;
        
        // Return vivarium types with score >= 70%, sorted by score
        const results = Object.entries(scores)
            .filter(([type, data]) => data.score >= 70)
            .sort((a, b) => b[1].score - a[1].score)
            .map(([type, data]) => data.name);
        
        // Default fallback - determine appropriate vivarium type based on plant characteristics
        if (results.length === 0) {
            // For succulents/desert plants, default to Deserterium or Indoor (never terrariums)
            if (isDesertPlant) {
                // Check if deserterium score exists and is reasonable (even if below 70%)
                const deserteriumScore = scores['deserterium'];
                if (deserteriumScore && deserteriumScore.score >= 50) {
                    return ['Deserterium'];
                } else {
                    return ['Indoor'];
                }
            }
            
            // For epiphytic plants, prefer Aerarium or appropriate terrarium type
            if (isEpiphytic) {
                const aerariumScore = scores['aerarium'];
                if (aerariumScore && aerariumScore.score >= 50) {
                    return ['Aerarium'];
                } else {
                    // Fall through to terrarium selection for epiphytic plants
                    if (inputs.airCirculationRange && inputs.airCirculationRange.ideal <= NUMERIC_SCALES.airCirculation.low.ideal) {
                        return ['Closed Terrarium'];
                    } else {
                        return ['Open Terrarium'];
                    }
                }
            }
            
            // Default terrarium selection based on air circulation
            if (inputs.airCirculationRange && inputs.airCirculationRange.ideal <= NUMERIC_SCALES.airCirculation.low.ideal) {
                return ['Closed Terrarium'];
            } else {
                return ['Open Terrarium'];
            }
        }
        return results;
    } catch (error) {
        console.error('Error calculating vivarium types for plant:', plant.name, error);
        // Fallback: determine appropriate vivarium type based on basic characteristics
        try {
            const inputs = mapPlantToInputs(plant);
            const isDesertPlant = inputs.substrate === 'dry' || inputs.specialNeeds === 'succulent' || 
                                 (Array.isArray(plant.category) && plant.category.map(c => String(c).toLowerCase()).includes('succulent'));
            const isEpiphytic = inputs.substrate === 'epiphytic' || inputs.specialNeeds === 'epiphytic';
            const isAquatic = inputs.substrate === 'aquatic' || inputs.specialNeeds === 'aquatic';
            
            if (isAquatic) {
                return ['Aquarium'];
            } else if (isDesertPlant) {
                return ['Deserterium'];
            } else if (isEpiphytic) {
                return ['Aerarium'];
            } else {
                // Default terrarium based on air circulation
                if (inputs.airCirculationRange && inputs.airCirculationRange.ideal <= NUMERIC_SCALES.airCirculation.low.ideal) {
                    return ['Closed Terrarium'];
                } else {
                    return ['Open Terrarium'];
                }
            }
        } catch (fallbackError) {
            console.error('Fallback calculation also failed:', fallbackError);
            return ['Open Terrarium']; // Ultimate fallback
        }
    }
}

/** Returns suitability scores (0-100) per vivarium type key for a plant. Use for type-aware filtering. */
function getPlantVivariumScores(plant) {
    if (typeof calculatePlantVivariumTypes !== 'function') return {};
    calculatePlantVivariumTypes(plant);
    var s = window.__lastVivariumScores || {};
    return Object.keys(s).reduce(function(acc, k) { acc[k] = s[k].score; return acc; }, {});
}
window.getPlantVivariumScores = getPlantVivariumScores;

function resetAllFilters() {
    // Reset sort
    sortField = 'name';
    sortDirection = 'asc';
    if (sortSelect) {
        sortSelect.value = 'name';
    }
    updateSortDirectionButton();
    
    // Reset advanced filters - must match the original structure exactly
    advancedFilters = createDefaultAdvancedFilters();
    
    // Clear taxonomy filter from URL and ensure it's reset
    const url = new URL(window.location);
    url.searchParams.delete('taxonomyRank');
    url.searchParams.delete('taxonomyName');
    window.history.replaceState({}, '', url);
    
    // Explicitly ensure taxonomy filter is cleared
    advancedFilters.taxonomy.rank = null;
    advancedFilters.taxonomy.name = null;
    
    // Reset checkboxes
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);

    var minRatingPlantsReset = document.getElementById('minRatingPlants');
    if (minRatingPlantsReset) minRatingPlantsReset.value = '';
    
    // Reset all range inputs
    const rangeInputIds = [
        'humidityMin', 'humidityMax', 'lightMin', 'lightMax',
        'tempMin', 'tempMax', 'airCirculationMin', 'airCirculationMax',
        'waterNeedsMin', 'waterNeedsMax', 'difficultyMin', 'difficultyMax',
        'growthRateMin', 'growthRateMax', 'soilPhMin', 'soilPhMax',
        'waterTempMin', 'waterTempMax', 'waterPhMin', 'waterPhMax',
        'waterHardnessMin', 'waterHardnessMax', 'salinityMin', 'salinityMax',
        'waterCirculationMin', 'waterCirculationMax'
    ];
    rangeInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    
    // Reset dual range sliders and displays
    const dualRangeSliders = [
        { minSlider: 'humidityMinSlider', maxSlider: 'humidityMaxSlider', minDisplay: 'humidityMinDisplay', maxDisplay: 'humidityMaxDisplay', maxValue: 100 },
        { minSlider: 'lightMinSlider', maxSlider: 'lightMaxSlider', minDisplay: 'lightMinDisplay', maxDisplay: 'lightMaxDisplay', maxValue: 100 },
        { minSlider: 'tempMinSlider', maxSlider: 'tempMaxSlider', minDisplay: 'tempMinDisplay', maxDisplay: 'tempMaxDisplay', maxValue: 40 },
        { minSlider: 'airCirculationMinSlider', maxSlider: 'airCirculationMaxSlider', minDisplay: 'airCirculationMinDisplay', maxDisplay: 'airCirculationMaxDisplay', maxValue: 100 },
        { minSlider: 'waterNeedsMinSlider', maxSlider: 'waterNeedsMaxSlider', minDisplay: 'waterNeedsMinDisplay', maxDisplay: 'waterNeedsMaxDisplay', maxValue: 100 },
        { minSlider: 'difficultyMinSlider', maxSlider: 'difficultyMaxSlider', minDisplay: 'difficultyMinDisplay', maxDisplay: 'difficultyMaxDisplay', maxValue: 100 },
        { minSlider: 'growthRateMinSlider', maxSlider: 'growthRateMaxSlider', minDisplay: 'growthRateMinDisplay', maxDisplay: 'growthRateMaxDisplay', maxValue: 100 },
        { minSlider: 'soilPhMinSlider', maxSlider: 'soilPhMaxSlider', minDisplay: 'soilPhMinDisplay', maxDisplay: 'soilPhMaxDisplay', maxValue: 100 },
        { minSlider: 'waterTempMinSlider', maxSlider: 'waterTempMaxSlider', minDisplay: 'waterTempMinDisplay', maxDisplay: 'waterTempMaxDisplay', maxValue: 40 },
        { minSlider: 'waterPhMinSlider', maxSlider: 'waterPhMaxSlider', minDisplay: 'waterPhMinDisplay', maxDisplay: 'waterPhMaxDisplay', maxValue: 100 },
        { minSlider: 'waterHardnessMinSlider', maxSlider: 'waterHardnessMaxSlider', minDisplay: 'waterHardnessMinDisplay', maxDisplay: 'waterHardnessMaxDisplay', maxValue: 100 },
        { minSlider: 'salinityMinSlider', maxSlider: 'salinityMaxSlider', minDisplay: 'salinityMinDisplay', maxDisplay: 'salinityMaxDisplay', maxValue: 100 },
        { minSlider: 'waterCirculationMinSlider', maxSlider: 'waterCirculationMaxSlider', minDisplay: 'waterCirculationMinDisplay', maxDisplay: 'waterCirculationMaxDisplay', maxValue: 100 }
    ];
    dualRangeSliders.forEach(({ minSlider, maxSlider, minDisplay, maxDisplay, maxValue }) => {
        const minSliderEl = document.getElementById(minSlider);
        const maxSliderEl = document.getElementById(maxSlider);
        const minDisplayEl = document.getElementById(minDisplay);
        const maxDisplayEl = document.getElementById(maxDisplay);
        if (minSliderEl) minSliderEl.value = '0';
        if (maxSliderEl) maxSliderEl.value = maxValue.toString();
        if (minDisplayEl) minDisplayEl.textContent = '0';
        if (maxDisplayEl) maxDisplayEl.textContent = maxValue.toString();
    });
    
    // Reset classification search
    const classificationSearch = document.getElementById('classificationSearch');
    if (classificationSearch) {
        classificationSearch.value = '';
        // Show all classification labels
        const classificationGroup = document.querySelector('.classification-checkbox-group');
        if (classificationGroup) {
            const labels = classificationGroup.querySelectorAll('.checkbox-label');
            labels.forEach(label => label.classList.remove('hidden'));
        }
    }
    
    // Reset search
    if (searchInput) searchInput.value = '';
    
    // Debug: Log filter state before applying
    console.log('Reset filters - taxonomy filter:', advancedFilters.taxonomy);
    
    // Apply filters - this should show all plants now
    applyAllFilters();
    
    // Debug: Log filtered plants count
    console.log('After reset - filtered plants:', filteredPlants.length, 'total plants:', allPlants.length);
}

/** Canonical rarity: common | uncommon | rare | very-rare (null if unknown). */
function normalizeRarityValue(value) {
    if (value == null || value === '') return null;
    const key = String(value).trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
    if (key === 'veryrare') return 'very-rare';
    if (key === 'common' || key === 'uncommon' || key === 'rare' || key === 'very-rare') return key;
    return null;
}

/** Sort rank 1–4 for rarity; unknown = 0. */
function raritySortRank(value) {
    const n = normalizeRarityValue(value);
    if (!n) return 0;
    return ({ common: 1, uncommon: 2, rare: 3, 'very-rare': 4 })[n] || 0;
}

/** Display label: Very Rare, Common, etc. */
function formatRarityLabel(value) {
    const n = normalizeRarityValue(value);
    if (!n) return value == null ? '' : String(value);
    if (n === 'very-rare') return 'Very Rare';
    return n.charAt(0).toUpperCase() + n.slice(1);
}

function applyAdvancedFilters() {
    // Collect checkbox values
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    advancedFilters.rarity = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'rarity' && cb.checked).map(cb => cb.value);
    advancedFilters.special = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'special' && cb.checked).map(cb => cb.value);
    advancedFilters.classification = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'classification' && cb.checked).map(cb => cb.value);
    advancedFilters.vivariumType = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'vivariumType' && cb.checked).map(cb => cb.value);
    advancedFilters.enclosureSize = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'enclosureSize' && cb.checked).map(cb => cb.value);
    advancedFilters.availability = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'availability' && cb.checked).map(cb => cb.value);
    
    // Collect numeric range values
    const rangeInputs = [
        { min: 'humidityMin', max: 'humidityMax', filter: 'humidity' },
        { min: 'lightMin', max: 'lightMax', filter: 'light' },
        { min: 'tempMin', max: 'tempMax', filter: 'temperature' },
        { min: 'airCirculationMin', max: 'airCirculationMax', filter: 'airCirculation' },
        { min: 'waterNeedsMin', max: 'waterNeedsMax', filter: 'waterNeeds' },
        { min: 'difficultyMin', max: 'difficultyMax', filter: 'difficulty' },
        { min: 'growthRateMin', max: 'growthRateMax', filter: 'growthRate' },
        { min: 'soilPhMin', max: 'soilPhMax', filter: 'soilPh' },
        { min: 'waterTempMin', max: 'waterTempMax', filter: 'waterTemperature' },
        { min: 'waterPhMin', max: 'waterPhMax', filter: 'waterPh' },
        { min: 'waterHardnessMin', max: 'waterHardnessMax', filter: 'waterHardness' },
        { min: 'salinityMin', max: 'salinityMax', filter: 'salinity' },
        { min: 'waterCirculationMin', max: 'waterCirculationMax', filter: 'waterCirculation' }
    ];
    
    rangeInputs.forEach(({ min, max, filter }) => {
        const minInput = document.getElementById(min);
        const maxInput = document.getElementById(max);
        advancedFilters[filter].min = minInput && minInput.value ? parseInt(minInput.value) : null;
        advancedFilters[filter].max = maxInput && maxInput.value ? parseInt(maxInput.value) : null;
    });
    
    applyAllFilters();
}

function applyAllFilters() {
    const canSeeHidden = typeof auth !== 'undefined' && auth && (
        (auth.isOwner && auth.isOwner()) ||
        (auth.isAdmin && auth.isAdmin())
    );
    // Start with all plants, but hide hidden ones for shoppers
    filteredPlants = allPlants ? allPlants.filter(function(p) {
        return canSeeHidden ? true : !p.hidden;
    }) : [];
    
    // Apply search filter first
    if (searchInput) {
        const searchTerm = searchInput.value.toLowerCase().trim();
        if (searchTerm) {
            filteredPlants = filteredPlants.filter(plant => {
                const nameMatch = plant.name?.toLowerCase().includes(searchTerm) || false;
                const scientificMatch = getScientificNameString(plant).toLowerCase().includes(searchTerm);
                const descriptionMatch = plant.description?.toLowerCase().includes(searchTerm) || false;
                const typeMatch = plant.type?.some(t => t.toLowerCase().includes(searchTerm)) || false;
                const commonNamesMatch = plant.commonNames?.some(name => 
                    name.toLowerCase().includes(searchTerm)
                ) || false;
                
                return nameMatch || scientificMatch || descriptionMatch || typeMatch || commonNamesMatch;
            });
        }
    }
    
    // Apply taxonomy filter if set (explicitly check for non-null values)
    if (advancedFilters.taxonomy && 
        advancedFilters.taxonomy.rank !== null && 
        advancedFilters.taxonomy.rank !== undefined &&
        advancedFilters.taxonomy.name !== null && 
        advancedFilters.taxonomy.name !== undefined) {
        filteredPlants = filteredPlants.filter(plant => {
            return plantBelongsToTaxonomy(plant, advancedFilters.taxonomy.rank, advancedFilters.taxonomy.name);
        });
    }
    
    // Apply advanced filters
    // OPTIMIZED: Cache mapPlantToInputs results to avoid repeated calculations
    const inputsCache = new Map();
    filteredPlants = filteredPlants.filter(plant => {
        // Get plant inputs with numeric ranges (cached)
        let inputs = inputsCache.get(plant.id);
        if (!inputs) {
            inputs = mapPlantToInputs(plant);
            inputsCache.set(plant.id, inputs);
        }
        
        // Humidity filter (numeric range)
        if (advancedFilters.humidity.min !== null || advancedFilters.humidity.max !== null) {
            const plantHumidity = inputs.humidityRange || plant.humidityRange;
            if (!plantHumidity) return false;
            const plantMin = plantHumidity.min;
            const plantMax = plantHumidity.max;
            
            if (advancedFilters.humidity.min !== null && plantMax < advancedFilters.humidity.min) {
                return false;
            }
            if (advancedFilters.humidity.max !== null && plantMin > advancedFilters.humidity.max) {
                return false;
            }
        }
        
        // Light filter (numeric range)
        if (advancedFilters.light.min !== null || advancedFilters.light.max !== null) {
            const plantLight = inputs.lightRange || plant.lightRange;
            if (!plantLight) return false;
            const plantMin = plantLight.min;
            const plantMax = plantLight.max;
            
            if (advancedFilters.light.min !== null && plantMax < advancedFilters.light.min) {
                return false;
            }
            if (advancedFilters.light.max !== null && plantMin > advancedFilters.light.max) {
                return false;
            }
        }
        
        // Temperature filter (numeric range)
        if (advancedFilters.temperature.min !== null || advancedFilters.temperature.max !== null) {
            const plantTemp = inputs.temperatureRange || plant.temperatureRange;
            if (plantTemp) {
                const plantMin = plantTemp.min;
                const plantMax = plantTemp.max;
                
                if (advancedFilters.temperature.min !== null && plantMax < advancedFilters.temperature.min) {
                    return false;
                }
                if (advancedFilters.temperature.max !== null && plantMin > advancedFilters.temperature.max) {
                    return false;
                }
            } else {
                // Fallback to text parsing if numeric range not available
            if (!plant.temperature) return false;
            const tempMatch = plant.temperature.match(/(\d+)-(\d+)°C/);
            if (tempMatch) {
                const plantMinTemp = parseInt(tempMatch[1]);
                const plantMaxTemp = parseInt(tempMatch[2]);
                
                if (advancedFilters.temperature.min !== null && plantMaxTemp < advancedFilters.temperature.min) {
                    return false;
                }
                if (advancedFilters.temperature.max !== null && plantMinTemp > advancedFilters.temperature.max) {
                    return false;
                }
            } else {
                    return false; // No valid temperature format found
                }
            }
        }
        
        // Air Circulation filter (numeric range)
        if (advancedFilters.airCirculation.min !== null || advancedFilters.airCirculation.max !== null) {
            const plantAirCirc = inputs.airCirculationRange || plant.airCirculationRange;
            if (!plantAirCirc) return false;
            const plantMin = plantAirCirc.min;
            const plantMax = plantAirCirc.max;
                    
            if (advancedFilters.airCirculation.min !== null && plantMax < advancedFilters.airCirculation.min) {
                        return false;
                    }
            if (advancedFilters.airCirculation.max !== null && plantMin > advancedFilters.airCirculation.max) {
                        return false;
                    }
        }
        
        // Water Needs filter (numeric range)
        if (advancedFilters.waterNeeds.min !== null || advancedFilters.waterNeeds.max !== null) {
            const plantWaterNeeds = inputs.waterNeedsRange || plant.waterNeedsRange;
            if (!plantWaterNeeds) return false;
            const plantMin = plantWaterNeeds.min;
            const plantMax = plantWaterNeeds.max;
            
            if (advancedFilters.waterNeeds.min !== null && plantMax < advancedFilters.waterNeeds.min) {
                return false;
            }
            if (advancedFilters.waterNeeds.max !== null && plantMin > advancedFilters.waterNeeds.max) {
                return false;
            }
        }
        
        // Difficulty filter (numeric range)
        if (advancedFilters.difficulty.min !== null || advancedFilters.difficulty.max !== null) {
            const plantDifficulty = inputs.difficultyRange || plant.difficultyRange;
            if (!plantDifficulty) return false;
            const plantMin = plantDifficulty.min;
            const plantMax = plantDifficulty.max;
            
            if (advancedFilters.difficulty.min !== null && plantMax < advancedFilters.difficulty.min) {
                return false;
            }
            if (advancedFilters.difficulty.max !== null && plantMin > advancedFilters.difficulty.max) {
                return false;
            }
        }
        
        // Growth rate filter (numeric range)
        if (advancedFilters.growthRate.min !== null || advancedFilters.growthRate.max !== null) {
            const plantGrowthRate = inputs.growthRateRange || plant.growthRateRange;
            if (!plantGrowthRate) return false;
            const plantMin = plantGrowthRate.min;
            const plantMax = plantGrowthRate.max;
            
            if (advancedFilters.growthRate.min !== null && plantMax < advancedFilters.growthRate.min) {
                return false;
            }
            if (advancedFilters.growthRate.max !== null && plantMin > advancedFilters.growthRate.max) {
                return false;
            }
        }
        
        // Soil pH filter (numeric range)
        if (advancedFilters.soilPh.min !== null || advancedFilters.soilPh.max !== null) {
            const plantSoilPh = inputs.soilPhRange || plant.soilPhRange;
            if (!plantSoilPh) return false;
            const plantMin = plantSoilPh.min;
            const plantMax = plantSoilPh.max;
            
            if (advancedFilters.soilPh.min !== null && plantMax < advancedFilters.soilPh.min) {
                return false;
            }
            if (advancedFilters.soilPh.max !== null && plantMin > advancedFilters.soilPh.max) {
                return false;
            }
        }
        
        // Water Temperature filter (numeric range) - for aquatic plants
        // Convert filter input from °C (0-40) to percentage (0-100%) for comparison
        // Scale: 0°C = 0%, 40°C = 100%
        if (advancedFilters.waterTemperature.min !== null || advancedFilters.waterTemperature.max !== null) {
            const plantWaterTemp = inputs.waterTemperatureRange || plant.waterTemperatureRange;
            if (!plantWaterTemp) return false;
            const plantMin = plantWaterTemp.min;
            const plantMax = plantWaterTemp.max;
            
            // Convert filter values from °C to percentage
            const filterMinPercent = advancedFilters.waterTemperature.min !== null 
                ? (advancedFilters.waterTemperature.min / 40) * 100 
                : null;
            const filterMaxPercent = advancedFilters.waterTemperature.max !== null 
                ? (advancedFilters.waterTemperature.max / 40) * 100 
                : null;
            
            if (filterMinPercent !== null && plantMax < filterMinPercent) {
                return false;
            }
            if (filterMaxPercent !== null && plantMin > filterMaxPercent) {
                return false;
            }
        }
        
        // Water pH filter (numeric range) - for aquatic plants
        if (advancedFilters.waterPh.min !== null || advancedFilters.waterPh.max !== null) {
            const plantWaterPh = inputs.waterPhRange || plant.waterPhRange;
            if (!plantWaterPh) return false;
            const plantMin = plantWaterPh.min;
            const plantMax = plantWaterPh.max;
            
            if (advancedFilters.waterPh.min !== null && plantMax < advancedFilters.waterPh.min) {
                return false;
            }
            if (advancedFilters.waterPh.max !== null && plantMin > advancedFilters.waterPh.max) {
                return false;
            }
        }
        
        // Water Hardness filter (numeric range) - for aquatic plants
        if (advancedFilters.waterHardness.min !== null || advancedFilters.waterHardness.max !== null) {
            const plantWaterHardness = inputs.waterHardnessRange || plant.waterHardnessRange;
            if (!plantWaterHardness) return false;
            const plantMin = plantWaterHardness.min;
            const plantMax = plantWaterHardness.max;
            
            if (advancedFilters.waterHardness.min !== null && plantMax < advancedFilters.waterHardness.min) {
                return false;
            }
            if (advancedFilters.waterHardness.max !== null && plantMin > advancedFilters.waterHardness.max) {
                return false;
            }
        }
        
        // Salinity filter (numeric range) - for aquatic plants
        if (advancedFilters.salinity.min !== null || advancedFilters.salinity.max !== null) {
            const plantSalinity = inputs.salinityRange || plant.salinityRange;
            if (!plantSalinity) return false;
            const plantMin = plantSalinity.min;
            const plantMax = plantSalinity.max;
            
            if (advancedFilters.salinity.min !== null && plantMax < advancedFilters.salinity.min) {
                return false;
            }
            if (advancedFilters.salinity.max !== null && plantMin > advancedFilters.salinity.max) {
                return false;
            }
        }
        
        // Water Circulation filter (numeric range) - for aquatic plants
        if (advancedFilters.waterCirculation.min !== null || advancedFilters.waterCirculation.max !== null) {
            const plantWaterCirc = inputs.waterCirculationRange || plant.waterCirculationRange;
            if (!plantWaterCirc) return false;
            const plantMin = plantWaterCirc.min;
            const plantMax = plantWaterCirc.max;
            
            if (advancedFilters.waterCirculation.min !== null && plantMax < advancedFilters.waterCirculation.min) {
                return false;
            }
            if (advancedFilters.waterCirculation.max !== null && plantMin > advancedFilters.waterCirculation.max) {
                return false;
            }
        }
        
        // Rarity filter — exact match after normalizing (common/uncommon/rare/very-rare)
        if (advancedFilters.rarity.length > 0) {
            const plantRarity = normalizeRarityValue(plant.rarity);
            if (!plantRarity) return false;
            const matchesRarity = advancedFilters.rarity.some(filterR =>
                normalizeRarityValue(filterR) === plantRarity
            );
            if (!matchesRarity) return false;
        }
        
        // Classification filter - based on Genus (with common names) for most plants
        // Fern and Moss use Phylum level (evolutionarily ancient groups)
        if (advancedFilters.classification.length > 0) {
            const taxonomy = plant.taxonomy || {};
            const phylum = (taxonomy.phylum || '').toLowerCase();
            const phylumClass = (taxonomy.class || '').toLowerCase();
            const genus = (taxonomy.genus || '').toLowerCase();
            
            // Mapping of filter values to Genus names (common names -> scientific Genus)
            // Fern and Moss use Phylum level (evolutionarily ancient), others use Genus
            const genusMap = {
                'orchid': [
                    // Orchidaceae family genera
                    'phalaenopsis', 'masdevallia', 'pleurothallis', 'lepanthes', 'bulbophyllum',
                    'anoectochilus', 'macodes', 'ludisia', 'dossinia', 'goodyera', 'restrepia',
                    'anathallis', 'dendrochilum', 'aspidogyne', 'acianthera', 'platystele',
                    'coelogyne', 'goudaea', 'specklinia'
                ],
                'air plant': [
                    // Bromeliaceae family genera (epiphytes/air plants)
                    'tillandsia', 'wallisia', 'racinaea', 'vriesea', 'aechmea', 'cryptanthus',
                    'catopsis', 'ananas', 'acanthostachys', 'neoregelia'
                ],
                'carnivorous': [
                    // Carnivorous plant genera
                    'nepenthes', 'drosera', 'dionaea', 'sarracenia', 'darlingtonia',
                    'utricularia', 'pinguicula', 'cephalotus', 'byblis', 'genlisea',
                    'aldrovanda', 'roridula', 'heliamphora', 'drosophyllum', 'macrocentrum'
                ],
                'succulent': [
                    // Succulent plant genera
                    'echeveria', 'crassula', 'sedum', 'aloe', 'agave', 'haworthia',
                    'dracaena', 'euphorbia', 'opuntia', 'mammillaria', 'echinocactus',
                    'aeonium', 'adromischus', 'alluaudia', 'adenium', 'dioscorea', 'adenia',
                    'senecio', 'kleinia', 'kroenleinia', 'rhipsalis'
                ],
                'tropical': [
                    // Tropical houseplant genera
                    'anthurium', 'alocasia', 'philodendron', 'monstera', 'syngonium',
                    'aglaonema', 'begonia', 'hoya', 'pilea', 'peperomia', 'hypoestes',
                    'episcia', 'aeschynanthus', 'oxalis', 'tradescantia', 'saintpaulia',
                    'argostemma', 'achimenes', 'albuca', 'asarum', 'arisaema', 'aristolochia',
                    'acalypha', 'epipremnum', 'dischidia', 'medinilla', 'ficus', 'procris',
                    'fittonia', 'streptocarpus', 'ceropegia'
                ]
            };
            
            const matchesClassification = advancedFilters.classification.some(filterClass => {
                const filterLower = filterClass.toLowerCase();
                
                // Handle genus-level filters (format: "genus:anthurium")
                if (filterLower.startsWith('genus:')) {
                    const requestedGenus = filterLower.replace('genus:', '').trim();
                    return genus === requestedGenus;
                }
                
                // Fern: Tracheophyta (vascular) with Polypodiopsida class (true ferns)
                // Use Phylum level - evolutionarily ancient group
                if (filterLower === 'fern') {
                    return phylum === 'tracheophyta' && phylumClass === 'polypodiopsida';
                }
                
                // Moss: Bryophyta phylum (true mosses)
                // Use Phylum level - evolutionarily ancient group
                if (filterLower === 'moss') {
                    return phylum === 'bryophyta';
                }
                
                // Jewel Orchid: Multiple genera grouped together (Anoectochilus, Goodyera, Macodes, Ludisia, Dossinia)
                if (filterLower === 'jewel-orchid' || filterLower === 'jewel orchid') {
                    const jewelOrchidGenera = ['anoectochilus', 'goodyera', 'macodes', 'ludisia', 'dossinia'];
                    return jewelOrchidGenera.includes(genus);
                }
                
                // Other classifications: Use Genus level matching (backward compatibility)
                if (genusMap[filterLower]) {
                    return genusMap[filterLower].includes(genus);
                }
                
                return false;
            });
            if (!matchesClassification) return false;
        }
        
        // Vivarium type filter - use calculated types
        if (advancedFilters.vivariumType.length > 0) {
            const plantVivariumTypes = calculatePlantVivariumTypes(plant);
            if (!Array.isArray(plantVivariumTypes) || plantVivariumTypes.length === 0) return false;
            const matchesVivariumType = advancedFilters.vivariumType.some(filterType => 
                plantVivariumTypes.includes(filterType)
            );
            if (!matchesVivariumType) return false;
        }
        
        // Enclosure size filter - use determineMinimumEnclosureSize function
        // Only considers juvenile size for enclosure requirements
        if (advancedFilters.enclosureSize.length > 0) {
            const enclosureRange = determineMinimumEnclosureSize(plant);
            // Check if the selected enclosure size matches the plant's juvenile size requirement
            const matchesEnclosureSize = advancedFilters.enclosureSize.includes(enclosureRange.size);
            if (!matchesEnclosureSize) return false;
        }
        if (advancedFilters.availability.length > 0) {
            const isInStock = typeof plant.stockQuantity !== 'number' || plant.stockQuantity > 0;
            const isOutOfStock = typeof plant.stockQuantity === 'number' && plant.stockQuantity <= 0;
            const isPreOrder = plant.availability === 'pre-order';
            const matchesAvailability = advancedFilters.availability.some(function(v) {
                if (v === 'in-stock') return isInStock;
                if (v === 'out-of-stock') return isOutOfStock;
                if (v === 'pre-order') return isPreOrder;
                return false;
            });
            if (!matchesAvailability) return false;
        }
        
        // Special characteristics filter
        if (advancedFilters.special.length > 0) {
            const matchesSpecial = advancedFilters.special.some(filterSpecial => {
                const size = (plant.size || '').toLowerCase();
                const growthPattern = (plant.growthPattern || '').toLowerCase();
                const growthHabit = (plant.growthHabit || '').toLowerCase();
                const substrate = (plant.substrate || '').toLowerCase();
                const watering = (plant.watering || '').toLowerCase();
                const humidity = (plant.humidity || '').toLowerCase();
                const description = (plant.description || '').toLowerCase();
                const category = (plant.category || []).map(c => c.toLowerCase());
                const rarity = (plant.rarity || '').toLowerCase();
                
                // Extract size numbers for height-based placement
                const sizeMatch = size.match(/(\d+)\s*-\s*(\d+)\s*cm/i) || size.match(/(\d+)\s*cm/i);
                const maxHeight = sizeMatch ? (sizeMatch[2] ? parseInt(sizeMatch[2]) : parseInt(sizeMatch[1])) : null;
                
                if (filterSpecial === 'Background') {
                    // Tall plants, large size, upright/bushy growth
                    return (maxHeight && maxHeight >= 30) ||
                           size.includes('tall') || size.includes('large') ||
                           growthPattern === 'upright/bushy' ||
                           size.includes('30') || size.includes('40') || size.includes('50') || size.includes('60');
                } else if (filterSpecial === 'Midground') {
                    // Medium-sized plants (15-30cm range)
                    const sizeRangeMatch = size.match(/(\d+)\s*-\s*(\d+)/i);
                    return (maxHeight && maxHeight >= 15 && maxHeight < 30) ||
                           (sizeRangeMatch && parseInt(sizeRangeMatch[2]) >= 15 && parseInt(sizeRangeMatch[2]) < 30) ||
                           size.includes('15-') || size.includes('20-') || size.includes('25-');
                } else if (filterSpecial === 'Front') {
                    // Small plants, mini category, low height (up to 15cm)
                    return category.includes('mini') ||
                           (maxHeight && maxHeight <= 15) ||
                           size.includes('5-10') || size.includes('2-10') || size.includes('small') ||
                           size.includes('low') || size.includes('dwarf') ||
                           size.includes('5-15') || size.includes('10-15');
                } else if (filterSpecial === 'Carpeting') {
                    // Groundcover, spreading, mat-forming
                    return growthPattern.includes('carpet') || growthPattern.includes('creeping') || growthPattern.includes('mat') ||
                           size.includes('carpet') || description.includes('carpet') ||
                           description.includes('groundcover') || description.includes('spreading') ||
                           size.includes('mat') || size.includes('cover');
                } else if (filterSpecial === 'Hanging') {
                    // Vining, trailing, epiphytic, climbing
                    return growthPattern === 'vining' || growthPattern.includes('trailing') || growthPattern.includes('climbing') ||
                           substrate.includes('epiphytic') || growthHabit === 'epiphytic' ||
                           description.includes('epiphytic') || description.includes('hanging') ||
                           description.includes('trailing') || description.includes('vining') ||
                           substrate.includes('mounted') || substrate.includes('attach');
                } else if (filterSpecial === 'Main Piece') {
                    // Large, impressive, rare, or unique plants
                    return (maxHeight && maxHeight >= 40) ||
                           rarity.includes('rare') || rarity.includes('very rare') ||
                           size.includes('large') || size.includes('impressive') ||
                           description.includes('dramatic') || description.includes('striking') ||
                           description.includes('unique') || description.includes('focal');
                } else if (filterSpecial === 'Submerged') {
                    // Fully aquatic, submerged growth
                    return growthHabit === 'aquatic' ||
                           watering.includes('fully aquatic') || watering.includes('submerged') ||
                           humidity.includes('submerged') ||
                           substrate.includes('aquatic') || description.includes('submerged') ||
                           description.includes('fully aquatic');
                } else if (filterSpecial === 'Floating') {
                    // Floating plants on water surface (NOT air plants/epiphytes)
                    // Exclude epiphytic plants (air plants) - these attach to surfaces, not float on water
                    const isEpiphytic = growthHabit === 'epiphytic' ||
                                        substrate.includes('epiphytic') ||
                                        substrate.includes('mounted') ||
                                        description.includes('epiphytic') ||
                                        category.includes('air plant') ||
                                        (plant.taxonomy && plant.taxonomy.genus && ['tillandsia', 'wallisia', 'racinaea', 'vriesea', 'aechmea', 'cryptanthus', 'catopsis', 'ananas', 'acanthostachys', 'neoregelia'].includes(plant.taxonomy.genus.toLowerCase()));
                    
                    // Must have floating characteristics
                    const hasFloatingCharacteristics = substrate.includes('float') || 
                                                       watering.includes('float') ||
                                                       description.includes('floating') ||
                                                       category.includes('floating') ||
                                                       (substrate.includes('no substrate') && (growthHabit === 'aquatic' || (() => {
                                                           const calcTypes = calculatePlantVivariumTypes(plant);
                                                           return calcTypes.includes('Aquarium');
                                                       })()));
                    
                    // Must be water-related (aquatic, or in aquarium/paludarium)
                    const calcTypes = calculatePlantVivariumTypes(plant);
                    const isWaterRelated = growthHabit === 'aquatic' ||
                                          watering.includes('aquatic') ||
                                          watering.includes('water') ||
                                          (calcTypes.includes('Aquarium') || calcTypes.includes('Paludarium') || calcTypes.includes('Riparium'));
                    
                    return !isEpiphytic && hasFloatingCharacteristics && isWaterRelated;
                } else if (filterSpecial === 'Cultivar') {
                    return typeof isPlantCultivar === 'function' ? isPlantCultivar(plant) : false;
                } else if (filterSpecial === 'Variety') {
                    return typeof isPlantVariety === 'function' ? isPlantVariety(plant) : false;
                } else if (filterSpecial === 'Hybrid') {
                    return typeof isPlantHybrid === 'function' ? isPlantHybrid(plant) : /\s+(x|×)\s+/i.test(getScientificNameString(plant));
                } else if (filterSpecial === 'Carnivorous') {
                    // Carnivorous plants - use explicit field from plant data
                    return plant.carnivorous === true;
                }
                return false;
            });
            if (!matchesSpecial) return false;
        }
        
        return true;
    });

    var minRatingEl = document.getElementById('minRatingPlants');
    var minRating = (minRatingEl && minRatingEl.value !== '') ? minRatingEl.value : '';
    var needRating = minRating !== '' || sortField === 'userRatings';

    if (needRating && filteredPlants.length > 0) {
        filterByRatingAndAttach('plant', filteredPlants, minRating).then(function (list) {
            filteredPlants = list;
            filteredPlants = sortPlants(filteredPlants);
            currentPlantsPage = 1;
            renderPlantsPage();
        });
        return;
    }

    // Apply sorting
    filteredPlants = sortPlants(filteredPlants);

    currentPlantsPage = 1;
    renderPlantsPage();
}

// Debounce function for input events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Fetch average rating for each item, attach _ratingAverage (and _ratingCount), filter by minRating if set.
 * Returns Promise<items>. If profileDb missing, returns items unchanged.
 */
function filterByRatingAndAttach(productType, items, minRating) {
    if (!items || !items.length) return Promise.resolve(items);
    if (typeof window.profileDb === 'undefined' || !window.profileDb.getAverageRating) return Promise.resolve(items);
    var min = minRating != null && minRating !== '' ? Math.max(1, Math.min(5, parseInt(minRating, 10))) : 0;
    var promises = items.map(function (item) {
        var id = item.id;
        return window.profileDb.getAverageRating(productType, id).then(function (res) {
            item._ratingAverage = res.average;
            item._ratingCount = res.count;
            item.userRatings = res.average;
            item.rating = res.average;
            return { item: item, average: res.average };
        }).catch(function () {
            item._ratingAverage = 0;
            item._ratingCount = 0;
            item.userRatings = 0;
            item.rating = 0;
            return { item: item, average: 0 };
        });
    });
    return Promise.all(promises).then(function (results) {
        if (min >= 1) {
            return results.filter(function (r) { return r.average >= min; }).map(function (r) { return r.item; });
        }
        return results.map(function (r) { return r.item; });
    });
}

/** Fill average rating on all visible cards. Uses profileDb.getAverageRating. */
function fillCardRatings() {
    if (typeof window.profileDb === 'undefined' || !window.profileDb.getAverageRating) return;
    var grid = document.getElementById('plantsGrid');
    if (!grid) return;
    var els = grid.querySelectorAll('.card-rating');
    els.forEach(function (el) {
        var type = el.getAttribute('data-product-type');
        var id = el.getAttribute('data-product-id');
        if (!type || !id) return;
        window.profileDb.getAverageRating(type, id).then(function (res) {
            if (res.count > 0) {
                el.textContent = res.average + ' \u2605 (' + res.count + ')';
                el.classList.add('card-rating-visible');
            } else {
                el.textContent = '\u2014';
            }
        }).catch(function () { el.textContent = '\u2014'; });
    });
}

// Render plants grid (used for current page slice only when pagination is active)
function renderPlants(plants) {
    if (!plantsGrid) return;
    plantsGrid.innerHTML = '';
    plantCount.textContent = `${plants.length} plant${plants.length !== 1 ? 's' : ''} found`;
    
    if (plants.length === 0) {
        plantsGrid.innerHTML = '<div class="no-results"><p>No plants found matching your criteria.</p></div>';
        return;
    }

    const renderToken = ++currentRenderToken;
    let renderIndex = 0;

    const renderBatch = () => {
        if (renderToken !== currentRenderToken) return;

        const fragment = document.createDocumentFragment();
        const batchLimit = Math.min(renderIndex + PLANT_RENDER_BATCH_SIZE, plants.length);

        for (; renderIndex < batchLimit; renderIndex++) {
            fragment.appendChild(createPlantCard(plants[renderIndex]));
        }

        plantsGrid.appendChild(fragment);

        if (renderIndex < plants.length) {
            // Use setTimeout with 0 delay for faster rendering (allows browser to paint)
            setTimeout(renderBatch, 0);
        } else {
            // Hide loading indicator when done
            const loadingEl = document.getElementById('loading');
            if (loadingEl) {
                loadingEl.classList.add('hidden');
            }
            updateQuickAddButtonsState();
            fillCardRatings();
        }
    };

    // Start rendering immediately (synchronous first batch for instant feedback)
    renderBatch();
    
    // Show loading indicator only if rendering will take time
    if (plants.length > PLANT_RENDER_BATCH_SIZE) {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.classList.remove('hidden');
            setTimeout(() => {
                if (loadingEl) loadingEl.classList.add('hidden');
            }, 100);
        }
    }
}

function renderPlantsPage() {
    const total = filteredPlants.length;
    const totalPages = Math.max(1, Math.ceil(total / plantsPerPage));
    currentPlantsPage = Math.max(1, Math.min(currentPlantsPage, totalPages));
    const start = (currentPlantsPage - 1) * plantsPerPage;
    const pagePlants = filteredPlants.slice(start, start + plantsPerPage);

    renderPlants(pagePlants);

    if (total === 0) {
        if (plantsPagination) {
            plantsPagination.classList.add('hidden');
            plantsPagination.innerHTML = '';
        }
        return;
    }

    if (plantCount) {
        const end = start + pagePlants.length;
        plantCount.textContent = `Showing ${start + 1}–${end} of ${total} plants`;
    }

    if (plantsPagination) {
        plantsPagination.classList.remove('hidden');
        plantsPagination.innerHTML = `
            <div class="pagination-nav">
                <button type="button" class="pagination-btn pagination-prev" ${currentPlantsPage <= 1 ? 'disabled' : ''} aria-label="Previous page">Previous</button>
                <span class="pagination-info">Page ${currentPlantsPage} of ${totalPages}</span>
                <button type="button" class="pagination-btn pagination-next" ${currentPlantsPage >= totalPages ? 'disabled' : ''} aria-label="Next page">Next</button>
            </div>
            <div class="pagination-per-page">
                <label for="plantsPerPageSelect" class="pagination-per-page-label">Show</label>
                <select id="plantsPerPageSelect" class="pagination-per-page-select" aria-label="Cards per page">
                    <option value="12" ${plantsPerPage === 12 ? 'selected' : ''}>12</option>
                    <option value="24" ${plantsPerPage === 24 ? 'selected' : ''}>24</option>
                    <option value="48" ${plantsPerPage === 48 ? 'selected' : ''}>48</option>
                    <option value="96" ${plantsPerPage === 96 ? 'selected' : ''}>96</option>
                </select>
            </div>
        `;
        const prevBtn = plantsPagination.querySelector('.pagination-prev');
        const nextBtn = plantsPagination.querySelector('.pagination-next');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentPlantsPage > 1) {
                    currentPlantsPage--;
                    renderPlantsPage();
                    listView && listView.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentPlantsPage < totalPages) {
                    currentPlantsPage++;
                    renderPlantsPage();
                    listView && listView.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }
        const perPageSelect = plantsPagination.querySelector('#plantsPerPageSelect');
        if (perPageSelect) {
            perPageSelect.addEventListener('change', () => {
                plantsPerPage = parseInt(perPageSelect.value, 10);
                currentPlantsPage = 1;
                renderPlantsPage();
            });
        }
    }
    if (total > 0 && typeof discoverImagesForCurrentPage === 'function') {
        discoverImagesForCurrentPage();
    }
}

let equipmentPerPage = 24;
let currentEquipmentPage = 1;
let filteredEquipment = [];

let allVivariums = [];
let filteredVivariums = [];
let vivariumPerPage = 24;
let currentVivariumPage = 1;
let vivariumSortField = 'name';
let vivariumSortDirection = 'asc';

async function ensureEquipmentLoaded() {
    if (allEquipment && allEquipment.length) return;
    if (typeof window.loadEquipment !== 'function') return;
    const canSeeHidden = typeof auth !== 'undefined' && auth && (
        (auth.isOwner && auth.isOwner()) ||
        (auth.isAdmin && auth.isAdmin())
    );
    allEquipment = await window.loadEquipment();
    window.allEquipment = allEquipment;
    if (allEquipment.length && window.inventoryDb && window.inventoryDb.mergeInventoryIntoPlants) {
        await window.inventoryDb.mergeInventoryIntoPlants(allEquipment);
    }
    filteredEquipment = allEquipment ? allEquipment.filter(function(eq) { return canSeeHidden ? true : !eq.hidden; }) : [];
    mergeEquipmentImagesFromStorage();
    mergeEquipmentEditsFromStorage();
    console.log('📦 Supplies loaded:', allEquipment.length, 'items');
}

async function ensureVivariumsLoaded() {
    if (allVivariums && allVivariums.length) return;
    if (typeof window.loadVivariums !== 'function') return;
    const canSeeHidden = typeof auth !== 'undefined' && auth && (
        (auth.isOwner && auth.isOwner()) ||
        (auth.isAdmin && auth.isAdmin())
    );
    allVivariums = await window.loadVivariums();
    try {
        var customViv = [];
        if (window.supabaseDb && window.supabaseDb.isConfigured()) {
            customViv = await window.supabaseDb.getCustomVivariums();
        } else {
            customViv = JSON.parse(localStorage.getItem('custom_vivariums') || '[]');
        }
        if (Array.isArray(customViv) && customViv.length) allVivariums = (allVivariums || []).concat(customViv);
    } catch (e) { /* ignore */ }
    window.allVivariums = allVivariums;
    if (allVivariums.length && window.inventoryDb && window.inventoryDb.mergeInventoryIntoPlants) {
        await window.inventoryDb.mergeInventoryIntoPlants(allVivariums);
    }
    filteredVivariums = allVivariums ? allVivariums.filter(function(v) {
        var t = (v.type || '').toLowerCase();
        return (canSeeHidden ? true : !v.hidden) && t !== 'indoor' && t !== 'outdoor';
    }) : [];
    mergeVivariumImagesFromStorage();
    mergeVivariumEditsFromStorage();
    console.log('📦 Vivariums loaded:', allVivariums.length, 'items');
}

function setupShopTabs() {
    const tabPlants = document.getElementById('tabPlants');
    const tabEquipment = document.getElementById('tabEquipment');
    const tabVivariums = document.getElementById('tabVivariums');
    const tabBuild = document.getElementById('tabBuild');
    const buildViewEl = document.getElementById('buildView');
    const listViewEl = document.getElementById('listView');
    const mainContentEl = document.querySelector('.main-content');
    const mainLayoutEl = document.querySelector('.main-layout');
    const filtersSidebarEl = document.getElementById('filtersSidebar');
    const filtersContentPlants = document.getElementById('filtersContentPlants');
    const filtersContentEquipment = document.getElementById('filtersContentEquipment');
    const filtersContentVivariums = document.getElementById('filtersContentVivariums');
    const controlPanelReopenEl = document.getElementById('controlPanelReopen');
    if (!tabPlants || !tabEquipment) return;

    function setActiveTab(activeTab, inactive1, inactive2, inactive3) {
        if (activeTab) { activeTab.classList.add('active'); activeTab.setAttribute('aria-selected', 'true'); }
        if (inactive1) { inactive1.classList.remove('active'); inactive1.setAttribute('aria-selected', 'false'); }
        if (inactive2) { inactive2.classList.remove('active'); inactive2.setAttribute('aria-selected', 'false'); }
        if (inactive3) { inactive3.classList.remove('active'); inactive3.setAttribute('aria-selected', 'false'); }
    }
    function showBuildView() {
        if (mainLayoutEl) mainLayoutEl.classList.add('detail-view-active');
        if (mainContentEl) mainContentEl.classList.add('build-view-active');
        if (buildViewEl) { buildViewEl.classList.remove('hidden'); buildViewEl.setAttribute('aria-hidden', 'false'); }
        if (listViewEl) listViewEl.classList.add('hidden');
        if (filtersSidebarEl) filtersSidebarEl.style.display = 'none';
        if (controlPanelReopenEl) controlPanelReopenEl.classList.add('hidden');
        window._buildViewActive = true;
        var navWrap = document.getElementById('navBackToListWrap');
        var navBtn = document.getElementById('navBackToList');
        if (navWrap) { navWrap.classList.remove('nav-back-disabled'); }
        if (navBtn) navBtn.disabled = false;
    }
    function hideBuildView() {
        if (mainLayoutEl) mainLayoutEl.classList.remove('detail-view-active');
        if (mainContentEl) mainContentEl.classList.remove('build-view-active');
        if (buildViewEl) { buildViewEl.classList.add('hidden'); buildViewEl.setAttribute('aria-hidden', 'true'); }
        if (listViewEl) listViewEl.classList.remove('hidden');
        if (filtersSidebarEl) filtersSidebarEl.style.display = '';
        window._buildViewActive = false;
        var navWrap = document.getElementById('navBackToListWrap');
        var navBtn = document.getElementById('navBackToList');
        if (navWrap) navWrap.classList.add('nav-back-disabled');
        if (navBtn) navBtn.disabled = true;
    }
    window._onNavBackFromBuildView = function() {
        hideBuildView();
        if (tabPlants) tabPlants.click();
    };
    function showPlantsFilters() {
        if (filtersContentPlants) { filtersContentPlants.classList.remove('hidden'); filtersContentPlants.setAttribute('aria-hidden', 'false'); }
        if (filtersContentEquipment) { filtersContentEquipment.classList.add('hidden'); filtersContentEquipment.setAttribute('aria-hidden', 'true'); }
        if (filtersContentVivariums) { filtersContentVivariums.classList.add('hidden'); filtersContentVivariums.setAttribute('aria-hidden', 'true'); }
        if (searchInput) searchInput.placeholder = 'Search plants...';
    }
    function showEquipmentFilters() {
        if (filtersContentEquipment) { filtersContentEquipment.classList.remove('hidden'); filtersContentEquipment.setAttribute('aria-hidden', 'false'); }
        if (filtersContentPlants) { filtersContentPlants.classList.add('hidden'); filtersContentPlants.setAttribute('aria-hidden', 'true'); }
        if (filtersContentVivariums) { filtersContentVivariums.classList.add('hidden'); filtersContentVivariums.setAttribute('aria-hidden', 'true'); }
        if (searchInput) searchInput.placeholder = 'Search supplies...';
        document.querySelectorAll('#filtersContentEquipment .filter-group').forEach(function(g) { g.classList.add('collapsed'); });
    }
    function showVivariumFilters() {
        if (filtersContentVivariums) { filtersContentVivariums.classList.remove('hidden'); filtersContentVivariums.setAttribute('aria-hidden', 'false'); }
        if (filtersContentPlants) { filtersContentPlants.classList.add('hidden'); filtersContentPlants.setAttribute('aria-hidden', 'true'); }
        if (filtersContentEquipment) { filtersContentEquipment.classList.add('hidden'); filtersContentEquipment.setAttribute('aria-hidden', 'true'); }
        if (searchInput) searchInput.placeholder = 'Search vivariums...';
        document.querySelectorAll('#filtersContentVivariums .filter-group').forEach(function(g) { g.classList.add('collapsed'); });
    }

    tabPlants.addEventListener('click', () => {
        currentView = 'plants';
        hideBuildView();
        setActiveTab(tabPlants, tabEquipment, tabVivariums, tabBuild);
        if (filtersSidebarEl) filtersSidebarEl.style.display = '';
        showPlantsFilters();
        if (controlPanelReopenEl) {
            if (filtersSidebarEl && filtersSidebarEl.classList.contains('control-panel-collapsed'))
                controlPanelReopenEl.classList.remove('hidden');
            else
                controlPanelReopenEl.classList.add('hidden');
        }
        setSortSelectOptions('plants');
        updateSortDirectionButton();
        currentPlantsPage = 1;
        applyAllFilters();
        if (typeof window.updateLegendButtonVisibility === 'function') window.updateLegendButtonVisibility();
    });
    tabEquipment.addEventListener('click', function() {
        currentView = 'equipment';
        hideBuildView();
        setActiveTab(tabEquipment, tabPlants, tabVivariums, tabBuild);
        if (filtersSidebarEl) filtersSidebarEl.style.display = '';
        showEquipmentFilters();
        if (controlPanelReopenEl) {
            if (filtersSidebarEl && filtersSidebarEl.classList.contains('control-panel-collapsed'))
                controlPanelReopenEl.classList.remove('hidden');
            else
                controlPanelReopenEl.classList.add('hidden');
        }
        setSortSelectOptions('equipment');
        updateSortDirectionButton();
        currentEquipmentPage = 1;
        ensureEquipmentLoaded().then(function() {
            applyEquipmentFilters();
        }).catch(function() { applyEquipmentFilters(); });
        if (typeof window.updateLegendButtonVisibility === 'function') window.updateLegendButtonVisibility();
    });
    if (tabVivariums) {
        tabVivariums.addEventListener('click', function() {
            currentView = 'vivariums';
            hideBuildView();
            setActiveTab(tabVivariums, tabPlants, tabEquipment, tabBuild);
            if (filtersSidebarEl) filtersSidebarEl.style.display = '';
            showVivariumFilters();
            if (controlPanelReopenEl) {
                if (filtersSidebarEl && filtersSidebarEl.classList.contains('control-panel-collapsed'))
                    controlPanelReopenEl.classList.remove('hidden');
                else
                    controlPanelReopenEl.classList.add('hidden');
            }
            setSortSelectOptions('vivariums');
            updateSortDirectionButton();
            currentVivariumPage = 1;
            ensureVivariumsLoaded().then(function() {
                applyVivariumFilters();
            }).catch(function() { applyVivariumFilters(); });
            if (typeof window.updateLegendButtonVisibility === 'function') window.updateLegendButtonVisibility();
        });
    }
    if (tabBuild && buildViewEl) {
        tabBuild.addEventListener('click', () => {
            currentView = 'build';
            setActiveTab(tabBuild, tabPlants, tabEquipment, tabVivariums);
            showBuildView();
            if (typeof window.initBuildVivarium === 'function') window.initBuildVivarium();
        });
    }
    var openBuildLink = document.getElementById('openBuildView');
    if (openBuildLink && tabBuild) {
        openBuildLink.addEventListener('click', function(e) {
            e.preventDefault();
            tabBuild.click();
        });
    }
}

function mergeEquipmentImagesFromStorage() {
    if (!allEquipment || !allEquipment.length) return;
    allEquipment.forEach(function(eq) {
        var id = eq.id;
        if (id == null) return;
        if (!eq.imageUrl) {
            var savedUrl = localStorage.getItem('equipment_' + id + '_imageUrl');
            if (savedUrl) eq.imageUrl = savedUrl;
        }
        if (!eq.images || !eq.images.length) {
            var savedImages = localStorage.getItem('equipment_' + id + '_images');
            if (savedImages) {
                try {
                    var arr = JSON.parse(savedImages);
                    if (Array.isArray(arr) && arr.length) eq.images = arr;
                } catch (e) { /* ignore */ }
            }
        }
        if (eq.images && eq.images.length && !eq.imageUrl) eq.imageUrl = eq.images[0];
    });
}

function mergeVivariumImagesFromStorage() {
    if (!allVivariums || !allVivariums.length) return;
    allVivariums.forEach(function(v) {
        var id = v.id;
        if (id == null) return;
        if (!v.imageUrl) {
            var savedUrl = localStorage.getItem('vivarium_' + id + '_imageUrl');
            if (savedUrl) v.imageUrl = savedUrl;
        }
        if (!v.images || !v.images.length) {
            var savedImages = localStorage.getItem('vivarium_' + id + '_images');
            if (savedImages) {
                try {
                    var arr = JSON.parse(savedImages);
                    if (Array.isArray(arr) && arr.length) v.images = arr;
                } catch (e) { /* ignore */ }
            }
        }
        if (v.images && v.images.length && !v.imageUrl) v.imageUrl = v.images[0];
    });
}

function createEquipmentCard(equipment) {
    const card = document.createElement('div');
    card.className = 'plant-card equipment-card' + (equipment.hidden ? ' product-hidden' : '');
    card.dataset.plantId = equipment.id;
    card.addEventListener('click', (e) => {
        if (e.target.closest('.quick-add-wrap')) return;
        if (e.target.closest('.equipment-edit-icon')) {
            e.preventDefault();
            e.stopPropagation();
            openEquipmentEdit(equipment);
            return;
        }
        if (e.target.closest('.equipment-image-icon')) {
            e.preventDefault();
            e.stopPropagation();
            openEquipmentImageUpload(equipment);
            return;
        }
        showEquipmentDetail(equipment);
    });
    let displayImageUrl = equipment.imageUrl || (equipment.images && equipment.images[0]) || null;
    if (displayImageUrl && imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') displayImageUrl = imageUtils.normalizePlantImagePath(displayImageUrl);
    var equipmentCardImgSrc = displayImageUrl && typeof getCardThumbUrl === 'function' ? getCardThumbUrl(displayImageUrl, getCardThumbWidth()) : displayImageUrl;
    var equipmentCardSrcset = displayImageUrl && typeof getCardThumbSrcset === 'function' ? getCardThumbSrcset(displayImageUrl) : '';
    var equipmentCardSizes = equipmentCardSrcset && typeof getCardThumbSizes === 'function' ? getCardThumbSizes() : '';
    const priceStr = equipment.price != null ? formatPrice(equipment.price) : 'Price on request';
    const available = getAvailableToAdd(equipment.id);
    const quickAddHtml = getQuickAddHtml(equipment, {
        cartQuantity: getCartQuantityForItem(equipment.id),
        unit: equipment.unit,
        maxedClass: available <= 0,
        disabled: typeof equipment.stockQuantity === 'number' && equipment.stockQuantity <= 0
    });
    card.innerHTML = `
        <div class="plant-image-container" data-plant-id="${equipment.id}">
            ${equipmentCardImgSrc ?
                `<img src="${equipmentCardImgSrc}"${equipmentCardSrcset ? ` srcset="${equipmentCardSrcset}" sizes="${equipmentCardSizes}"` : ''} alt="${escapeHtml(equipment.name)}" class="plant-image" loading="lazy" decoding="async" data-plant-id="${equipment.id}" onerror="this.onerror=null;this.style.display='none';this.parentNode.insertAdjacentHTML('afterbegin','<div class=\\'image-placeholder\\'>${PLACEHOLDER_EQUIPMENT_SVG.replace(/'/g, "\\'").replace(/"/g, '&quot;')}</div>')">` :
                '<div class="image-placeholder">' + PLACEHOLDER_EQUIPMENT_SVG + '</div>'
            }
            <div class="card-icons equipment-card-icons">
                <button type="button" class="card-edit-icon equipment-edit-icon" data-equipment-id="${equipment.id}" title="Edit details" aria-label="Edit details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button type="button" class="card-image-icon equipment-image-icon" data-equipment-id="${equipment.id}" title="Add or edit images" aria-label="Add or edit images">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                </button>
            </div>
            <div class="card-price">${priceStr}</div>
        </div>
        <div class="plant-info">
            <div class="plant-name">${escapeHtml(equipment.name)}</div>
            <div class="card-rating" data-product-type="equipment" data-product-id="${equipment.id}" aria-label="Average rating">—</div>
        </div>
        <div class="card-add-wrap">${quickAddHtml}</div>
    `;
    const editBtn = card.querySelector('.equipment-edit-icon');
    if (editBtn) {
        editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            openEquipmentEdit(equipment);
        });
    }
    const imageBtn = card.querySelector('.equipment-image-icon');
    if (imageBtn) {
        imageBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            openEquipmentImageUpload(equipment);
        });
    }
    return card;
}

function sortEquipment(items) {
    if (!items || items.length === 0) return items;
    const ascending = equipmentSortDirection === 'asc';
    return [...items].sort((a, b) => {
        let aVal, bVal;
        switch (equipmentSortField) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                return ascending ? (aVal.localeCompare(bVal)) : (bVal.localeCompare(aVal));
            case 'price':
                aVal = a.price != null && a.price !== '' ? Number(a.price) : -Infinity;
                bVal = b.price != null && b.price !== '' ? Number(b.price) : -Infinity;
                return ascending ? aVal - bVal : bVal - aVal;
            case 'topSeller':
                aVal = Number(a.topSeller ?? a.salesCount ?? 0);
                bVal = Number(b.topSeller ?? b.salesCount ?? 0);
                return ascending ? aVal - bVal : bVal - aVal;
            case 'userRatings':
                aVal = Number(a.userRatings ?? a.rating ?? 0);
                bVal = Number(b.userRatings ?? b.rating ?? 0);
                return ascending ? aVal - bVal : bVal - aVal;
            default:
                return 0;
        }
    });
}

function applyEquipmentFilters() {
    if (!allEquipment || !allEquipment.length) {
        filteredEquipment = [];
        renderEquipmentPage();
        return;
    }
    var canSeeHidden = typeof auth !== 'undefined' && auth && (
        (auth.isOwner && auth.isOwner()) ||
        (auth.isAdmin && auth.isAdmin())
    );
    var q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    var categoryChecks = document.querySelectorAll('.equipment-filter-checkbox[data-filter="equipmentCategory"]:checked');
    var categories = Array.from(categoryChecks).map(function(c) { return c.value; });
    var availabilityChecks = document.querySelectorAll('.equipment-filter-checkbox[data-filter="equipmentAvailability"]:checked');
    var availabilityValues = Array.from(availabilityChecks).map(function(c) { return c.value; });
    var priceMinEl = document.getElementById('equipmentPriceMin');
    var priceMaxEl = document.getElementById('equipmentPriceMax');
    var priceMin = priceMinEl && priceMinEl.value !== '' ? parseFloat(priceMinEl.value) : null;
    var priceMax = priceMaxEl && priceMaxEl.value !== '' ? parseFloat(priceMaxEl.value) : null;

    filteredEquipment = allEquipment.filter(function(eq) {
        if (!canSeeHidden && eq.hidden) return false;
        if (q) {
            var name = (eq.name || '').toLowerCase();
            var desc = (eq.description || '').toLowerCase();
            if (name.indexOf(q) === -1 && desc.indexOf(q) === -1) return false;
        }
        if (categories.length > 0) {
            var cat = (eq.category || '').toLowerCase();
            if (!categories.some(function(c) { return c.toLowerCase() === cat; })) return false;
        }
        if (availabilityValues.length > 0) {
            var eqInStock = typeof eq.stockQuantity !== 'number' || eq.stockQuantity > 0;
            var eqOutOfStock = typeof eq.stockQuantity === 'number' && eq.stockQuantity <= 0;
            var eqPreOrder = eq.availability === 'pre-order';
            var matchesAvail = availabilityValues.some(function(v) {
                if (v === 'in-stock') return eqInStock;
                if (v === 'out-of-stock') return eqOutOfStock;
                if (v === 'pre-order') return eqPreOrder;
                return false;
            });
            if (!matchesAvail) return false;
        }
        if (priceMin != null || priceMax != null) {
            var p = eq.price != null && eq.price !== '' ? parseFloat(eq.price) : null;
            if (p == null) return false;
            if (priceMin != null && p < priceMin) return false;
            if (priceMax != null && p > priceMax) return false;
        }
        return true;
    });
    var minRatingEl = document.getElementById('minRatingEquipment');
    var minRating = (minRatingEl && minRatingEl.value !== '') ? minRatingEl.value : '';
    var needRating = minRating !== '' || equipmentSortField === 'userRatings';
    if (needRating && filteredEquipment.length > 0) {
        filterByRatingAndAttach('equipment', filteredEquipment, minRating).then(function (list) {
            filteredEquipment = list;
            currentEquipmentPage = 1;
            renderEquipmentPage();
        });
        return;
    }
    currentEquipmentPage = 1;
    renderEquipmentPage();
}

function renderEquipmentPage() {
    if (!plantsGrid) return;
    const list = filteredEquipment && filteredEquipment.length ? filteredEquipment : (allEquipment || []);
    const sorted = sortEquipment(list);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / equipmentPerPage));
    currentEquipmentPage = Math.max(1, Math.min(currentEquipmentPage, totalPages));
    const start = (currentEquipmentPage - 1) * equipmentPerPage;
    const pageItems = sorted.slice(start, start + equipmentPerPage);

    plantsGrid.innerHTML = '';
    if (total === 0) {
        plantsGrid.innerHTML = '<div class="no-results"><p>No supplies matching your filters.</p></div>';
        if (plantCount) plantCount.textContent = 'No supplies found';
        if (plantsPagination) { plantsPagination.classList.add('hidden'); plantsPagination.innerHTML = ''; }
        return;
    }

    const fragment = document.createDocumentFragment();
    pageItems.forEach(item => fragment.appendChild(createEquipmentCard(item)));
    plantsGrid.appendChild(fragment);
    fillCardRatings();

    if (plantCount) {
        const end = start + pageItems.length;
        plantCount.textContent = `Showing ${start + 1}–${end} of ${total} supplies`;
    }

    if (plantsPagination) {
        plantsPagination.classList.remove('hidden');
        plantsPagination.innerHTML = `
            <div class="pagination-nav">
                <button type="button" class="pagination-btn pagination-prev" ${currentEquipmentPage <= 1 ? 'disabled' : ''} aria-label="Previous page">Previous</button>
                <span class="pagination-info">Page ${currentEquipmentPage} of ${totalPages}</span>
                <button type="button" class="pagination-btn pagination-next" ${currentEquipmentPage >= totalPages ? 'disabled' : ''} aria-label="Next page">Next</button>
            </div>
            <div class="pagination-per-page">
                <label for="equipmentPerPageSelect" class="pagination-per-page-label">Show</label>
                <select id="equipmentPerPageSelect" class="pagination-per-page-select" aria-label="Cards per page">
                    <option value="12" ${equipmentPerPage === 12 ? 'selected' : ''}>12</option>
                    <option value="24" ${equipmentPerPage === 24 ? 'selected' : ''}>24</option>
                    <option value="48" ${equipmentPerPage === 48 ? 'selected' : ''}>48</option>
                    <option value="96" ${equipmentPerPage === 96 ? 'selected' : ''}>96</option>
                </select>
            </div>
        `;
        const prevBtn = plantsPagination.querySelector('.pagination-prev');
        const nextBtn = plantsPagination.querySelector('.pagination-next');
        if (prevBtn) prevBtn.addEventListener('click', () => {
            if (currentEquipmentPage > 1) { currentEquipmentPage--; renderEquipmentPage(); listView && listView.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
        if (nextBtn) nextBtn.addEventListener('click', () => {
            if (currentEquipmentPage < totalPages) { currentEquipmentPage++; renderEquipmentPage(); listView && listView.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
        const perPageSelect = plantsPagination.querySelector('#equipmentPerPageSelect');
        if (perPageSelect) perPageSelect.addEventListener('change', function() {
            equipmentPerPage = parseInt(perPageSelect.value, 10);
            currentEquipmentPage = 1;
            renderEquipmentPage();
        });
    }
    updateQuickAddButtonsState();
}

function applyVivariumFilters() {
    if (!allVivariums || !allVivariums.length) {
        filteredVivariums = [];
        renderVivariumsPage();
        return;
    }
    var canSeeHidden = typeof auth !== 'undefined' && auth && (
        (auth.isOwner && auth.isOwner()) ||
        (auth.isAdmin && auth.isAdmin())
    );
    var baseList = allVivariums.filter(function(v) {
        var t = (v.type || '').toLowerCase();
        return (canSeeHidden ? true : !v.hidden) && t !== 'indoor' && t !== 'outdoor';
    });
    var q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    var typeChecks = document.querySelectorAll('#filtersContentVivariums input.vivarium-filter-checkbox[data-filter="vivariumType"]:checked');
    var types = Array.from(typeChecks).map(function(c) { return (c.value || '').toLowerCase().replace(/\s+/g, '-'); });
    var availabilityChecks = document.querySelectorAll('#filtersContentVivariums input.vivarium-filter-checkbox[data-filter="vivariumAvailability"]:checked');
    var availabilities = Array.from(availabilityChecks).map(function(c) { return (c.value || '').toLowerCase().replace(/\s+/g, '-'); });
    var priceMinEl = document.getElementById('vivariumPriceMin');
    var priceMaxEl = document.getElementById('vivariumPriceMax');
    var priceMin = priceMinEl && priceMinEl.value !== '' ? parseFloat(priceMinEl.value) : null;
    var priceMax = priceMaxEl && priceMaxEl.value !== '' ? parseFloat(priceMaxEl.value) : null;

    filteredVivariums = baseList.filter(function(v) {
        if (q) {
            var name = (v.name || '').toLowerCase();
            var desc = (v.description || '').toLowerCase();
            if (name.indexOf(q) === -1 && desc.indexOf(q) === -1) return false;
        }
        if (types.length > 0) {
            var t = (v.type || '').toLowerCase();
            if (!types.some(function(c) { return c.toLowerCase() === t; })) return false;
        }
        if (availabilities.length > 0) {
            var avRaw = v.availability;
            if (avRaw == null || avRaw === '') avRaw = 'in-stock';
            var av = String(avRaw).toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
            var matchesAvailability = availabilities.indexOf(av) !== -1;
            if (!matchesAvailability) return false;
        }
        if (priceMin != null || priceMax != null) {
            var p = v.price != null && v.price !== '' ? parseFloat(v.price) : null;
            if (p == null) return false;
            if (priceMin != null && p < priceMin) return false;
            if (priceMax != null && p > priceMax) return false;
        }
        return true;
    });
    var minRatingEl = document.getElementById('minRatingVivariums');
    var minRating = (minRatingEl && minRatingEl.value !== '') ? minRatingEl.value : '';
    var needRating = minRating !== '' || vivariumSortField === 'userRatings';
    if (needRating && filteredVivariums.length > 0) {
        filterByRatingAndAttach('vivarium', filteredVivariums, minRating).then(function (list) {
            filteredVivariums = list;
            currentVivariumPage = 1;
            renderVivariumsPage();
        });
        return;
    }
    currentVivariumPage = 1;
    renderVivariumsPage();
}

function sortVivariums(items) {
    if (!items || items.length === 0) return items;
    var asc = vivariumSortDirection === 'asc';
    return items.slice().sort(function(a, b) {
        var aVal, bVal;
        switch (vivariumSortField) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'price':
                aVal = a.price != null && a.price !== '' ? Number(a.price) : -Infinity;
                bVal = b.price != null && b.price !== '' ? Number(b.price) : -Infinity;
                return asc ? aVal - bVal : bVal - aVal;
            case 'type':
                aVal = (a.type || '').toLowerCase();
                bVal = (b.type || '').toLowerCase();
                return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            case 'userRatings':
                aVal = Number(a.userRatings ?? a._ratingAverage ?? a.rating ?? 0);
                bVal = Number(b.userRatings ?? b._ratingAverage ?? b.rating ?? 0);
                return asc ? aVal - bVal : bVal - aVal;
            default:
                return 0;
        }
    });
}

function createVivariumCard(vivarium) {
    var card = document.createElement('div');
    card.className = 'plant-card vivarium-card' + (vivarium.hidden ? ' product-hidden' : '');
    card.dataset.plantId = vivarium.id;
    card.addEventListener('click', function(e) {
        if (e.target.closest('.quick-add-wrap')) return;
        showVivariumDetail(vivarium);
    });
    var displayImageUrl = vivarium.imageUrl || (vivarium.images && vivarium.images[0]) || null;
    var vivariumCardImgSrc = displayImageUrl && typeof getCardThumbUrl === 'function' ? getCardThumbUrl(displayImageUrl, getCardThumbWidth()) : displayImageUrl;
    var vivariumCardSrcset = displayImageUrl && typeof getCardThumbSrcset === 'function' ? getCardThumbSrcset(displayImageUrl) : '';
    var vivariumCardSizes = vivariumCardSrcset && typeof getCardThumbSizes === 'function' ? getCardThumbSizes() : '';
    var priceStr = vivarium.price != null ? formatPrice(vivarium.price) : 'Price on request';
    var typeLabel = (vivarium.type || '').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    var editSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var imageSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
    card.innerHTML = '<div class="plant-image-container" data-plant-id="' + vivarium.id + '">' +
        (vivariumCardImgSrc ? '<img src="' + escapeHtml(vivariumCardImgSrc) + '"' + (vivariumCardSrcset ? ' srcset="' + escapeHtml(vivariumCardSrcset) + '" sizes="' + escapeHtml(vivariumCardSizes) + '"' : '') + ' alt="' + escapeHtml(vivarium.name) + '" class="plant-image" loading="lazy" decoding="async" data-plant-id="' + vivarium.id + '">' : '<div class="image-placeholder">' + PLACEHOLDER_EQUIPMENT_SVG + '</div>') +
        '<div class="card-icons">' +
        '<button type="button" class="card-edit-icon" title="Edit details" aria-label="Edit details">' + editSvg + '</button>' +
        '<button type="button" class="card-image-icon" title="Add or edit images" aria-label="Add or edit images">' + imageSvg + '</button>' +
        '</div>' +
        '<div class="card-price">' + priceStr + '</div>' +
        '</div>' +
        '<div class="plant-info">' +
        '<div class="plant-name">' + escapeHtml(vivarium.name) + '</div>' +
        '<div class="card-rating" data-product-type="vivarium" data-product-id="' + vivarium.id + '" aria-label="Average rating">—</div>' +
        (typeLabel ? '<div class="plant-product-badges plant-badges"><span class="badge ' + (vivarium.type ? String(vivarium.type).toLowerCase().replace(/\s+/g, '-') : '') + '">' + escapeHtml(typeLabel) + '</span></div>' : '') +
        '</div>';
    var vivariumEditBtn = card.querySelector('.card-edit-icon');
    var vivariumImageBtn = card.querySelector('.card-image-icon');
    if (vivariumEditBtn) vivariumEditBtn.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); if (window.openVivariumEdit) openVivariumEdit(vivarium); });
    if (vivariumImageBtn) vivariumImageBtn.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); openVivariumImageUpload(vivarium); });
    return card;
}

function renderVivariumsPage() {
    if (!plantsGrid) return;
    var list = Array.isArray(filteredVivariums) ? filteredVivariums : (allVivariums || []);
    var sorted = sortVivariums(list);
    var total = sorted.length;
    var totalPages = Math.max(1, Math.ceil(total / vivariumPerPage));
    currentVivariumPage = Math.max(1, Math.min(currentVivariumPage, totalPages));
    var start = (currentVivariumPage - 1) * vivariumPerPage;
    var pageItems = sorted.slice(start, start + vivariumPerPage);

    plantsGrid.innerHTML = '';
    if (total === 0) {
        // Show a single empty-state message in the header, keep the grid empty
        if (plantCount) plantCount.textContent = 'No vivariums found. Add your first vivarium using the edit panel.';
        if (plantsPagination) { plantsPagination.classList.add('hidden'); plantsPagination.innerHTML = ''; }
        return;
    }

    var fragment = document.createDocumentFragment();
    pageItems.forEach(function(item) { fragment.appendChild(createVivariumCard(item)); });
    plantsGrid.appendChild(fragment);
    fillCardRatings();

    if (plantCount) {
        var end = start + pageItems.length;
        plantCount.textContent = 'Showing ' + (start + 1) + '\u2013' + end + ' of ' + total + ' vivariums';
    }

    if (plantsPagination) {
        plantsPagination.classList.remove('hidden');
        plantsPagination.innerHTML = '<div class="pagination-nav">' +
            '<button type="button" class="pagination-btn pagination-prev" ' + (currentVivariumPage <= 1 ? 'disabled' : '') + ' aria-label="Previous page">Previous</button>' +
            '<span class="pagination-info">Page ' + currentVivariumPage + ' of ' + totalPages + '</span>' +
            '<button type="button" class="pagination-btn pagination-next" ' + (currentVivariumPage >= totalPages ? 'disabled' : '') + ' aria-label="Next page">Next</button>' +
            '</div>' +
            '<div class="pagination-per-page">' +
            '<label for="vivariumPerPageSelect" class="pagination-per-page-label">Show</label>' +
            '<select id="vivariumPerPageSelect" class="pagination-per-page-select" aria-label="Cards per page">' +
            '<option value="12"' + (vivariumPerPage === 12 ? ' selected' : '') + '>12</option>' +
            '<option value="24"' + (vivariumPerPage === 24 ? ' selected' : '') + '>24</option>' +
            '<option value="48"' + (vivariumPerPage === 48 ? ' selected' : '') + '>48</option>' +
            '<option value="96"' + (vivariumPerPage === 96 ? ' selected' : '') + '>96</option>' +
            '</select></div>';
        var prevBtn = plantsPagination.querySelector('.pagination-prev');
        var nextBtn = plantsPagination.querySelector('.pagination-next');
        if (prevBtn) prevBtn.addEventListener('click', function() {
            if (currentVivariumPage > 1) { currentVivariumPage--; renderVivariumsPage(); if (listView) listView.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
        if (nextBtn) nextBtn.addEventListener('click', function() {
            if (currentVivariumPage < totalPages) { currentVivariumPage++; renderVivariumsPage(); if (listView) listView.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
        var perPageSelect = plantsPagination.querySelector('#vivariumPerPageSelect');
        if (perPageSelect) perPageSelect.addEventListener('change', function() {
            vivariumPerPage = parseInt(perPageSelect.value, 10);
            currentVivariumPage = 1;
            renderVivariumsPage();
        });
    }
    updateQuickAddButtonsState();
}

// Maintenance tips per vivarium type (for ready-made vivariums—what to do after purchase)
var VIVARIUM_TYPE_CARE_TIPS = {
    'open-terrarium': [
        'Keep the unit in a spot with good air flow; avoid enclosing it in a cabinet or tight corner to prevent mold.',
        'Water only when the top of the substrate feels dry. Use distilled or rainwater if your tap water is hard; avoid overwatering.',
        'Place in bright indirect light. Rotate the unit every couple of weeks so all sides get even light.',
        'Wipe the glass inside and out occasionally with a soft, damp cloth to remove dust and mineral spots.',
        'Remove dead or yellow leaves and any decaying matter as soon as you notice them to keep the environment clean.',
        'If you add fertilizer, use a diluted solution sparingly and only during active growth periods.',
        'Check that no water is pooling at the base; the substrate should drain and not sit in standing water.'
    ],
    'closed-terrarium': [
        'Condensation on the glass is normal. If the glass stays fogged or very wet, lift the lid for an hour or two to let excess moisture out.',
        'Water only when the substrate looks dry and there is little or no condensation—closed units recycle moisture and need very little.',
        'Open the lid briefly every 2–3 weeks to refresh the air and reduce the chance of mold.',
        'Remove any mold, dead leaves, or rotting material as soon as you see it; wipe affected glass with a clean cloth.',
        'Keep the unit out of direct sun to avoid overheating; bright indirect light is ideal.',
        'If the glass is constantly wet, leave the lid off for a few hours until the balance feels right, then close again.'
    ],
    'terrarium': [
        'Check the substrate weekly: water only when the top layer is dry, and never leave standing water in the base.',
        'Wipe the glass periodically to keep it clear and remove any algae or mineral buildup.',
        'Remove dead leaves and debris regularly to keep the environment tidy and reduce pest or mold risk.',
        'Rotate the unit every few weeks for even light and growth.',
        'If the unit has a lid, open it briefly every few weeks to allow fresh air in.'
    ],
    'paludarium': [
        'Run the filter as recommended and perform partial water changes (e.g. 10–20% weekly) to keep water quality good.',
        'Top up evaporated water with dechlorinated water as needed; keep the water level stable.',
        'Wipe the glass above and below the waterline regularly to remove algae and mineral deposits.',
        'Trim overgrown plants so the land and water zones stay clear and plants do not block the view or light.',
        'Check that the land area is not waterlogged; drainage should keep soil above the waterline reasonably dry.',
        'If you have fish or other animals, avoid overfeeding; remove uneaten food and excess waste promptly.',
        'Test water parameters (pH, hardness, ammonia/nitrite if applicable) periodically and adjust as needed.'
    ],
    'riparium': [
        'Top up the water section with dechlorinated water as it evaporates to keep the level stable.',
        'Perform small partial water changes regularly and remove debris from the water to keep it clean.',
        'Wipe the glass and any above-water surfaces to remove dust and mineral buildup.',
        'Trim overgrown marginal plants so they do not block light or topple into the water.',
        'Check that the pump or circulation (if fitted) is running; clear the intake if it gets clogged.',
        'Mist or ensure humidity above the waterline stays adequate so foliage does not dry out.'
    ],
    'aquarium': [
        'Perform partial water changes (e.g. 10–25% weekly) and siphon debris from the substrate to maintain water quality.',
        'Top up evaporated water with dechlorinated water; avoid large swings in temperature or chemistry.',
        'Clean the glass inside regularly to remove algae and keep the view clear.',
        'Trim and remove dead or dying plant material so it does not decay in the water.',
        'Check the filter and pump; clean or replace media as recommended by the manufacturer.',
        'Test water parameters (temperature, pH, ammonia, nitrite, nitrate) on a schedule and correct any issues.',
        'If you have fish, feed in small amounts and remove uneaten food to limit waste and algae.'
    ],
    'desertarium': [
        'Water only when the substrate is fully dry; avoid misting or adding humidity—keep the environment dry.',
        'Wipe the glass occasionally to remove dust and any mineral or salt buildup.',
        'Remove dead leaves or decaying plant matter promptly to prevent rot and pests.',
        'Keep the unit in a well-ventilated spot with strong light; avoid enclosing it in a humid or dark area.',
        'Ensure no water sits in the base or in saucers; let the substrate drain completely after watering.',
        'Rotate the unit periodically so all sides receive light and growth stays even.'
    ],
    'deserterium': [
        'Water only when the substrate is completely dry; keep the environment dry and well lit.',
        'Wipe the glass and remove dead plant material regularly; ensure good air circulation around the unit.'
    ],
    'aerarium': [
        'Mist or soak the mounts 1–2 times per week so the plants do not dry out; let excess water drain away afterward.',
        'Wipe the glass and any mounting surfaces to remove dust and mineral spots.',
        'Remove dead leaves or flowers and check leaf bases and mounts for pests (e.g. scale, mealybugs) periodically.',
        'Keep the unit in a spot with good air circulation and bright indirect light; rotate occasionally for even growth.',
        'If you fertilize, use a diluted foliar or orchid formula sparingly during active growth.'
    ],
    'aererium': [
        'Mist or soak the mounts regularly and let them drain; wipe the glass and check for pests. Keep in bright indirect light with good airflow.'
    ],
    'indoor': [
        'Water when the top of the substrate feels dry; reduce frequency in winter or in low light.',
        'Wipe the glass or leaves as needed to remove dust and keep the unit looking clean.',
        'Rotate the unit every few weeks for even light exposure.',
        'Remove dead leaves and debris; ensure the base or saucer never holds standing water.'
    ],
    'house-plant': [
        'Water when the substrate is partly dry; adjust by season—less in winter, more in summer if the room is warm and bright.',
        'Dust leaves and wipe the container periodically to keep the unit clean.',
        'Remove dead or yellow leaves and avoid leaving the pot sitting in water.',
        'Rotate the unit occasionally so growth stays even on all sides.'
    ],
    'outdoor': [
        'Check water needs regularly; water more in hot or dry spells and less when it is cool or rainy.',
        'Remove dead leaves and debris; protect the unit from strong frost or wind as needed.',
        'Wipe the glass or surfaces to remove dirt, pollen, or mineral buildup.',
        'Move or shade the unit if direct sun is too harsh for the plants inside.'
    ],
    'vivarium': [
        'Check humidity and temperature regularly; top up water sources and adjust ventilation or heating as needed.',
        'Remove waste, uneaten food, and dead plant matter promptly to keep the environment clean.',
        'Wipe the glass and clean any decor or bowls according to the needs of the inhabitants.',
        'Trim overgrown plants and ensure hiding spots and perches remain accessible and clean.'
    ]
};

var COMMON_VIVARIUM_CARE_TIPS = [
    'If plant colours fade or new leaves look pale, move the unit to brighter indirect light; if leaves scorch or bleach, move it farther from direct sun or strong grow lights.',
    'When plants start touching the glass or crowding each other, prune them back with clean scissors to restore airflow and keep views clear.',
    'Remove yellowing or rotting leaves as soon as you see them to prevent mould and pests from spreading.',
    'Check regularly for pests (e.g. aphids, mites, mealybugs); isolate the unit and treat promptly if any are found.',
    'Avoid overwatering: if you see constant condensation or soggy substrate, air the vivarium out and let the top layer dry slightly before watering again.',
    'A small amount of harmless mould, mushrooms, or springtails/isopods is normal in a living ecosystem and helps break down dead leaves.',
    'If mould or mushrooms start to cover healthy plants or hardscape, improve airflow, remove affected pieces, and reduce watering or feeding until it stabilises.'
];

function getVivariumCareTips(typeKey) {
    var baseTips;
    if (!typeKey) {
        baseTips = VIVARIUM_TYPE_CARE_TIPS['open-terrarium'] || VIVARIUM_TYPE_CARE_TIPS['vivarium'] || [];
    } else {
        var key = String(typeKey).toLowerCase().replace(/\s+/g, '-');
        baseTips = VIVARIUM_TYPE_CARE_TIPS[key] || VIVARIUM_TYPE_CARE_TIPS['open-terrarium'] || VIVARIUM_TYPE_CARE_TIPS['vivarium'] || [];
    }
    return baseTips.concat(COMMON_VIVARIUM_CARE_TIPS);
}

function showVivariumDetail(vivarium) {
    var displayImageUrl = vivarium.imageUrl || (vivarium.images && vivarium.images[0]) || null;
    var priceStr = vivarium.price != null ? formatPrice(vivarium.price) : 'Price on request';
    var typeLabel = (vivarium.type || '').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    var av = vivarium.availability || 'in-stock';
    var availabilityLabel = av === 'in-stock' ? 'In Stock' : (av === 'out-of-stock' ? 'Out of Stock' : 'Pre-order');
    var detailEditSvgV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var detailImageSvgV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
    var vivariumGalleryImages = (vivarium.images || []).filter(function(img) { return img && img.trim(); });
    var hasGallery = vivariumGalleryImages.length > 0;
    var descriptionHtml = vivarium.description ? '<p class="description">' + escapeHtml(vivarium.description) + '</p>' : '<p class="description description-empty">No description available.</p>';
    var careTips = Array.isArray(vivarium.careTips) && vivarium.careTips.length
        ? vivarium.careTips
        : getVivariumCareTips(vivarium.type);
    var careTipsListHtml = careTips.map(function(tip) { return '<li style="margin-bottom: 0.3rem;">' + escapeHtml(tip) + '</li>'; }).join('');
    var galleryPage2Html = (function() {
        if (vivariumGalleryImages.length === 0) {
            return '<div class="plant-gallery-modern plant-gallery-empty gallery-no-set-main">' +
                '<div class="plant-gallery-main-row">' +
                '<header class="plant-gallery-header">' +
                '<div class="plant-gallery-header-main"><span class="plant-gallery-label">Gallery</span><h2 class="plant-gallery-item-name">' + escapeHtml(vivarium.name) + '</h2></div>' +
                '</header>' +
                '<div class="plant-gallery-empty-message"><p>No photos yet.</p><p>Use Image in the Manage panel to add photos.</p></div>' +
                '</div></div>';
        }
        var imgs = vivariumGalleryImages;
        var mainUrl = displayImageUrl || imgs[0];
        var thumbHtml = imgs.map(function(img, idx) {
            var escapedPath = img.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return '<button type="button" class="plant-gallery-thumb gallery-thumbnail ' + (idx === 0 ? 'selected' : '') + '" data-img-index="' + idx + '" data-img-path="' + escapedPath + '" onclick="selectGalleryImage(\'' + escapedPath + '\', ' + vivarium.id + ', ' + idx + ', event)" aria-label="Image ' + (idx + 1) + '">' +
                '<span class="plant-gallery-thumb-img"><img src="' + img + '" alt="" loading="lazy" onerror="this.closest(\'.plant-gallery-thumb\').style.display=\'none\'" onload="this.style.display=\'block\'"></span>' +
                '</button>';
        }).join('');
        return '<div class="plant-gallery-modern gallery-no-set-main" id="gallery-page-' + vivarium.id + '">' +
            '<div class="plant-gallery-main-row">' +
            '<header class="plant-gallery-header">' +
            '<div class="plant-gallery-header-main"><span class="plant-gallery-label">Gallery</span><h2 class="plant-gallery-item-name">' + escapeHtml(vivarium.name) + '</h2>' +
            '<span class="plant-gallery-count">' + imgs.length + ' photo' + (imgs.length !== 1 ? 's' : '') + '</span></div>' +
            '</header>' +
            '<div class="plant-gallery-stage" id="gallery-preview-' + vivarium.id + '">' +
            '<button type="button" class="plant-gallery-arrow plant-gallery-prev" onclick="galleryPrevNext(' + vivarium.id + ', -1)" aria-label="Previous image">‹</button>' +
            '<div class="plant-gallery-stage-inner">' +
            '<img id="gallery-preview-img" data-current-index="0" src="' + mainUrl + '" alt="' + escapeHtml(vivarium.name) + '" class="gallery-preview-image">' +
            '</div>' +
            '<button type="button" class="plant-gallery-arrow plant-gallery-next" onclick="galleryPrevNext(' + vivarium.id + ', 1)" aria-label="Next image">›</button>' +
            '<div class="plant-gallery-counter"><span id="gallery-current-num">1</span> / ' + imgs.length + '</div>' +
            '<button type="button" class="plant-gallery-fullscreen-btn" onclick="openGalleryFullscreen(' + vivarium.id + ')" aria-label="View fullscreen">⛶ Fullscreen</button>' +
            '</div>' +
            '</div>' +
            '<div class="gallery-fullscreen-overlay" id="gallery-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Fullscreen image view" onclick="if(event.target === this) closeGalleryFullscreen()">' +
            '<button type="button" class="gallery-fullscreen-close" onclick="closeGalleryFullscreen()" aria-label="Close">×</button>' +
            '<button type="button" class="gallery-fullscreen-arrow gallery-fullscreen-prev" onclick="galleryFullscreenPrevNext(' + vivarium.id + ', -1)" aria-label="Previous">‹</button>' +
            '<img id="gallery-fullscreen-img" src="' + mainUrl + '" alt="' + escapeHtml(vivarium.name) + '" class="gallery-fullscreen-image">' +
            '<button type="button" class="gallery-fullscreen-arrow gallery-fullscreen-next" onclick="galleryFullscreenPrevNext(' + vivarium.id + ', 1)" aria-label="Next">›</button>' +
            '<div class="gallery-fullscreen-counter"><span id="gallery-fullscreen-num">1</span> / ' + imgs.length + '</div>' +
            '</div>' +
            '<div class="plant-gallery-thumbnails-wrap"><div class="plant-gallery-thumbnails">' + thumbHtml + '</div></div>' +
            '</div>';
    })();
    modalBody.innerHTML = '' +
        '<div id="modal-page-1" class="modal-page active plant-product-page">' +
        '<div class="plant-product-hero">' +
        '<div class="plant-product-gallery" onclick="' + (hasGallery ? 'switchModalPage(2, ' + vivarium.id + ')' : '') + '" role="button" tabindex="0">' +
        (displayImageUrl ? '<img src="' + displayImageUrl + '" alt="' + escapeHtml(vivarium.name) + '" class="plant-product-image" onerror="this.style.display=\'none\'">' : '<div class="plant-product-image-placeholder">🪴</div>') +
        (hasGallery ? '<span class="plant-product-gallery-hint">View gallery</span>' : '') +
        '</div>' +
        '<div class="plant-product-meta">' +
        '<h1 class="plant-product-name">' + escapeHtml(vivarium.name) + '</h1>' +
        (typeLabel ? '<div class="plant-product-badges"><span class="badge ' + (vivarium.type ? String(vivarium.type).toLowerCase().replace(/\s+/g, '-') : '') + '">' + escapeHtml(typeLabel) + '</span></div>' : '') +
        '<div class="plant-product-shop">' +
        '<div class="plant-product-price">' + priceStr + '</div>' +
        '<div class="plant-product-stock plant-product-stock-ok">' + escapeHtml(availabilityLabel) + '</div>' +
        '<button type="button" class="plant-product-add-cart btn-add-to-cart" data-plant-id="' + vivarium.id + '">Add to cart</button>' +
        '</div></div></div>' +
        '<section class="plant-product-section">' +
        '<h2 class="plant-product-section-title">Description</h2>' +
        '<div class="plant-detail-description">' + descriptionHtml + '</div>' +
        '</section>' +
        (function() {
            var bc = vivarium._buildConfig;
            if (!bc) return '';
            var eq = window.allEquipment || [];
            function findEq(id) {
                var n = parseInt(id, 10);
                return eq.filter(function(e) { return e && (e.id === n || parseInt(e.id, 10) === n); })[0];
            }
            function supplyCardGrid(label, items) {
                if (!items || !items.length) return '';
                var cards = items.map(function(e) {
                    if (!e) return '';
                    var url = 'index.html?tab=equipment&id=' + encodeURIComponent(e.id);
                    var imgUrl = e.imageUrl || (e.images && e.images[0]) || null;
                    if (imgUrl && imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') {
                        imgUrl = imageUtils.normalizePlantImagePath(imgUrl);
                    }
                    return '<a href="' + url + '" class="plant-card vivarium-content-card vivarium-supply-card">' +
                        '<div class="plant-image-container">' +
                        (imgUrl ? '<img src="' + escapeHtml(imgUrl) + '" alt="" class="plant-image" loading="lazy">' : '<div class="image-placeholder">' + PLACEHOLDER_EQUIPMENT_SVG + '</div>') +
                        '</div>' +
                        '<div class="plant-info"><div class="plant-name">' + escapeHtml(e.name || 'Item') + '</div></div></a>';
                }).filter(Boolean).join('');
                if (!cards) return '';
                return '<div class="vivarium-build-section">' +
                    '<h3 class="vivarium-build-section-title">' + escapeHtml(label) + '</h3>' +
                    '<div class="vivarium-build-grid plants-grid card-size-small">' + cards + '</div>' +
                    '</div>';
            }
            var sections = [];
            if (bc.enclosureId) {
                var enc = findEq(bc.enclosureId);
                if (enc) sections.push(supplyCardGrid('Enclosure', [enc]));
            }
            if (bc.drainageIds && bc.drainageIds.length) {
                sections.push(supplyCardGrid('Drainage', bc.drainageIds.map(findEq).filter(Boolean)));
            }
            if (bc.substrateIds && bc.substrateIds.length) {
                sections.push(supplyCardGrid('Substrate', bc.substrateIds.map(findEq).filter(Boolean)));
            }
            if (bc.hardscapeIds && bc.hardscapeIds.length) {
                sections.push(supplyCardGrid('Hard scape', bc.hardscapeIds.map(findEq).filter(Boolean)));
            }
            if (bc.decorationIds && bc.decorationIds.length) {
                sections.push(supplyCardGrid('Decorations', bc.decorationIds.map(findEq).filter(Boolean)));
            }
            if (bc.accessoryIds && bc.accessoryIds.length) {
                sections.push(supplyCardGrid('Accessories', bc.accessoryIds.map(findEq).filter(Boolean)));
            }
            if (bc.toolIds && bc.toolIds.length) {
                sections.push(supplyCardGrid('Optional tools', bc.toolIds.map(findEq).filter(Boolean)));
            }
            if (!sections.length) return '';
            return '<section class="plant-product-section vivarium-build-contents">' +
                '<h2 class="plant-product-section-title">Build contents</h2>' +
                '<div class="vivarium-build-list">' + sections.join('') + '</div>' +
                '</section>';
        })() +
        (function() {
            var ids = vivarium.plantIds;
            if (!Array.isArray(ids) || ids.length === 0) return '<section class="plant-product-section"><h2 class="plant-product-section-title">Plant content</h2><p class="description description-empty">No plants linked for this vivarium.</p></section>';
            var plantsList = (window.allPlants || window.plantsDatabase || []).filter(function(p) { return p && p.id != null && ids.indexOf(Number(p.id)) !== -1; });
            var order = {};
            ids.forEach(function(id, i) { order[Number(id)] = i; });
            plantsList.sort(function(a, b) { return (order[a.id] || 999) - (order[b.id] || 999); });
            if (!plantsList.length) return '<section class="plant-product-section"><h2 class="plant-product-section-title">Plant content</h2><p class="description description-empty">No matching plants in catalog.</p></section>';
            var cardHtml = plantsList.map(function(p) {
                var url = 'index.html?tab=plants&id=' + encodeURIComponent(p.id);
                var imgUrl = p.imageUrl || (p.images && p.images[0]) || null;
                // Normalize legacy plant image paths and fall back to slug-based path
                if (!imgUrl && typeof scientificNameToSlug === 'function' && typeof getScientificNameString === 'function') {
                    var slug = scientificNameToSlug(getScientificNameString(p));
                    if (slug) imgUrl = 'images/plants/' + slug + '/' + slug + '-1.jpg';
                }
                if (imgUrl && imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') {
                    imgUrl = imageUtils.normalizePlantImagePath(imgUrl);
                }
                var sci = (typeof p.scientificName === 'string') ? p.scientificName : (p.scientificName && p.scientificName.name) ? p.scientificName.name : '';
                return '<a href="' + url + '" class="plant-card vivarium-content-card vivarium-plant-card">' +
                    '<div class="plant-image-container">' +
                    (imgUrl ? '<img src="' + escapeHtml(imgUrl) + '" alt="" class="plant-image" loading="lazy">' : '<div class="image-placeholder">' + PLACEHOLDER_PLANT_SVG + '</div>') +
                    '</div>' +
                    '<div class="plant-info"><div class="plant-name">' + escapeHtml(p.name || sci || 'Plant') + '</div>' +
                    (sci ? '<div class="plant-scientific">' + escapeHtml(sci) + '</div>' : '') + '</div></a>';
            }).join('');
            return '<section class="plant-product-section"><h2 class="plant-product-section-title">Plant content</h2><div class="vivarium-plants-grid plants-grid card-size-small">' + cardHtml + '</div></section>';
        })() +
        (function() {
            // Optional supplies section removed; build contents now shows all components by category.
            return '';
        })() +
        '<section class="plant-product-section">' +
        '<h2 class="plant-product-section-title">Maintenance</h2>' +
        '<ul class="plant-product-care-list">' + careTipsListHtml + '</ul>' +
        '</section>' +
        '<section class="plant-product-section plant-product-reviews-section">' +
        '<div class="product-reviews-widget" data-product-type="vivarium" data-product-id="' + vivarium.id + '" data-product-name="' + escapeHtml(vivarium.name) + '"></div>' +
        '</section></div>' +
        '<div id="modal-page-2" class="modal-page" style="display: none;" data-plant-id="' + vivarium.id + '">' + galleryPage2Html + '</div>';
    var printCareCardSvgV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>';
    var canManageVisibility = typeof auth !== 'undefined' && auth && ((auth.isOwner && auth.isOwner()) || (auth.isAdmin && auth.isAdmin()));
    var vivariumDetailActions = createDetailControlPanel({
        buttonsHtml:
            '<button type="button" class="detail-btn card-edit-icon vivarium-detail-edit" title="Edit details" aria-label="Edit details">' + detailEditSvgV + '<span>Edit details</span></button>' +
            '<button type="button" class="detail-btn card-image-icon vivarium-detail-image" title="Add or edit images" aria-label="Add or edit images">' + detailImageSvgV + '<span>Image</span></button>' +
            '<button type="button" class="detail-btn vivarium-detail-care-card" title="Print care card" aria-label="Print care card">' + printCareCardSvgV + '<span>Print care card</span></button>',
        hideConfig: canManageVisibility ? {
            className: 'vivarium-detail-hide',
            isHidden: !!vivarium.hidden,
            showTitle: 'Show this vivarium in the shop',
            hideTitle: 'Hide this vivarium from shoppers',
            showLabel: 'Show vivarium in shop',
            hideLabel: 'Hide vivarium from shoppers',
            showText: 'Show in shop',
            hideText: 'Hide from shoppers',
            onToggle: function (hideBtn) {
                var nextHidden = !vivarium.hidden;
                vivarium.hidden = nextHidden;
                if (window.inventoryDb && window.inventoryDb.setItem) {
                    window.inventoryDb.setItem(vivarium.id, { hidden: nextHidden }).then(function () {
                        if (typeof applyVivariumFilters === 'function') applyVivariumFilters();
                    });
                } else if (typeof applyVivariumFilters === 'function') {
                    applyVivariumFilters();
                }
                hideBtn.title = nextHidden ? 'Show this vivarium in the shop' : 'Hide this vivarium from shoppers';
                hideBtn.setAttribute('aria-label', nextHidden ? 'Show vivarium in shop' : 'Hide vivarium from shoppers');
                hideBtn.innerHTML = detailHideButtonHtml(nextHidden, 'Show in shop', 'Hide from shoppers');
            }
        } : null
    });
    mountDetailControlPanel(modalBody, vivariumDetailActions);
    var addBtn = modalBody.querySelector('.btn-add-to-cart');
    if (addBtn) addBtn.addEventListener('click', function() {
        if (vivarium._buildConfig && typeof addVivariumBuildToCart === 'function') addVivariumBuildToCart(vivarium);
        else addToCart(vivarium, 1);
    });
    var addWithSuppliesBtn = modalBody.querySelector('.btn-add-vivarium-supplies');
    if (addWithSuppliesBtn) {
        addWithSuppliesBtn.addEventListener('click', function() {
            if (vivarium._buildConfig && typeof addVivariumBuildToCart === 'function') addVivariumBuildToCart(vivarium);
            else addToCart(vivarium, 1);
            var equipment = window.allEquipment || [];
            modalBody.querySelectorAll('.vivarium-supply-checkbox:checked').forEach(function(cb) {
                var id = parseInt(cb.dataset.supplyId, 10);
                var supply = equipment.find(function(e) { return e.id === id; });
                if (supply) addToCart(supply, 1);
            });
        });
    }
    var vivariumDetailEditBtn = vivariumDetailActions.querySelector('.vivarium-detail-edit');
    var vivariumDetailImageBtn = vivariumDetailActions.querySelector('.vivarium-detail-image');
    if (vivariumDetailEditBtn) vivariumDetailEditBtn.addEventListener('click', function() { if (window.openVivariumEdit) openVivariumEdit(vivarium); });
    if (vivariumDetailImageBtn) vivariumDetailImageBtn.addEventListener('click', function() { openVivariumImageUpload(vivarium); });
    var vivariumCareCardBtn = vivariumDetailActions.querySelector('.vivarium-detail-care-card');
    if (vivariumCareCardBtn) vivariumCareCardBtn.addEventListener('click', function() { if (typeof generateVivariumCareCard === 'function') generateVivariumCareCard(vivarium); });
    var vivariumReviewsWidget = modalBody.querySelector('.product-reviews-widget');
    if (vivariumReviewsWidget && typeof window.initProductReviewsWidget === 'function') window.initProductReviewsWidget(vivariumReviewsWidget);
    var navBackWrap = document.getElementById('navBackToListWrap');
    var navBackBtn = document.getElementById('navBackToList');
    if (navBackWrap) { navBackWrap.classList.remove('hidden'); navBackWrap.classList.remove('nav-back-disabled'); }
    if (navBackBtn) navBackBtn.disabled = false;
    if (mainLayout) mainLayout.classList.add('detail-view-active');
    if (typeof window.syncFiltersUiForDetailView === 'function') window.syncFiltersUiForDetailView(true);
    if (filtersSidebarWrapper) filtersSidebarWrapper.style.display = 'none';
    if (mainContent && plantDetailPanel) {
        mainContent.classList.add('list-view-hidden');
        plantDetailPanel.classList.remove('hidden');
        plantDetailPanel.setAttribute('aria-hidden', 'false');
    }
    if (plantModal) plantModal.classList.add('hidden');
    setCatalogSeoUrl('vivarium', vivarium, typeof allVivariums !== 'undefined' ? allVivariums : (window.allVivariums || []));
    document.addEventListener('keydown', handlePlantPanelEscape);
    resetDetailPanelScroll();
}

function showEquipmentDetail(equipment) {
    let displayImageUrl = equipment.imageUrl || (equipment.images && equipment.images[0]) || null;
    if (displayImageUrl && imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') displayImageUrl = imageUtils.normalizePlantImagePath(displayImageUrl);
    const priceStr = equipment.price != null ? formatPrice(equipment.price) : 'Price on request';
    const stock = equipment.stockQuantity;
    const stockHtml = typeof stock === 'number' ? (stock <= 0 ? '<div class="plant-product-stock plant-product-stock-out">Out of stock</div>' : '<div class="plant-product-stock plant-product-stock-ok">In stock: ' + stock + '</div>') : '<div class="plant-product-stock plant-product-stock-untracked">Stock not tracked</div>';
    const eqIsInt = isIntegerUnitQuickAdd(equipment.unit);
    const eqStockMax = (typeof stock === 'number' && stock >= 0) ? stock : 999;
    const detailEditSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const detailImageSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
    const equipmentGalleryImages = (equipment.images || []).filter(img => img && img.trim());
    const normalizedGalleryUrls = (imageUtils && typeof imageUtils.normalizePlantImagePath === 'function')
        ? equipmentGalleryImages.map(function(u) { return imageUtils.normalizePlantImagePath(u); })
        : equipmentGalleryImages;
    const hasGallery = equipmentGalleryImages.length > 0;
    const descriptionHtml = equipment.description ? '<p class="description">' + escapeHtml(equipment.description) + '</p>' : '<p class="description description-empty">No description available.</p>';
    const galleryPage2Html = (() => {
        if (equipmentGalleryImages.length === 0) {
            return `<div class="plant-gallery-modern plant-gallery-empty gallery-no-set-main">
                <div class="plant-gallery-main-row">
                    <header class="plant-gallery-header"><div class="plant-gallery-header-main"><span class="plant-gallery-label">Gallery</span><h2 class="plant-gallery-item-name">${escapeHtml(equipment.name)}</h2></div></header>
                    <div class="plant-gallery-empty-message"><p>No photos yet.</p><p>Use Image in the Manage panel to add photos.</p></div>
                </div>
            </div>`;
        }
        const imgs = normalizedGalleryUrls;
        const mainUrl = displayImageUrl || imgs[0];
        return `<div class="plant-gallery-modern gallery-no-set-main" id="gallery-page-${equipment.id}">
            <div class="plant-gallery-main-row">
                <header class="plant-gallery-header">
                    <div class="plant-gallery-header-main">
                        <span class="plant-gallery-label">Gallery</span>
                        <h2 class="plant-gallery-item-name">${escapeHtml(equipment.name)}</h2>
                        <span class="plant-gallery-count">${imgs.length} photo${imgs.length !== 1 ? 's' : ''}</span>
                    </div>
                </header>
                <div class="plant-gallery-stage" id="gallery-preview-${equipment.id}">
                    <button type="button" class="plant-gallery-arrow plant-gallery-prev" onclick="galleryPrevNext(${equipment.id}, -1)" aria-label="Previous image">‹</button>
                    <div class="plant-gallery-stage-inner">
                        <img id="gallery-preview-img" data-current-index="0" src="${mainUrl}" alt="${escapeHtml(equipment.name)}" class="gallery-preview-image">
                    </div>
                    <button type="button" class="plant-gallery-arrow plant-gallery-next" onclick="galleryPrevNext(${equipment.id}, 1)" aria-label="Next image">›</button>
                    <div class="plant-gallery-counter"><span id="gallery-current-num">1</span> / ${imgs.length}</div>
                    <button type="button" class="plant-gallery-fullscreen-btn" onclick="openGalleryFullscreen(${equipment.id})" aria-label="View fullscreen">⛶ Fullscreen</button>
                </div>
            </div>
            <div class="gallery-fullscreen-overlay" id="gallery-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Fullscreen image view" onclick="if(event.target === this) closeGalleryFullscreen()">
                <button type="button" class="gallery-fullscreen-close" onclick="closeGalleryFullscreen()" aria-label="Close">×</button>
                <button type="button" class="gallery-fullscreen-arrow gallery-fullscreen-prev" onclick="galleryFullscreenPrevNext(${equipment.id}, -1)" aria-label="Previous">‹</button>
                <img id="gallery-fullscreen-img" src="${mainUrl}" alt="${escapeHtml(equipment.name)}" class="gallery-fullscreen-image">
                <button type="button" class="gallery-fullscreen-arrow gallery-fullscreen-next" onclick="galleryFullscreenPrevNext(${equipment.id}, 1)" aria-label="Next">›</button>
                <div class="gallery-fullscreen-counter"><span id="gallery-fullscreen-num">1</span> / ${imgs.length}</div>
            </div>
            <div class="plant-gallery-thumbnails-wrap">
                <div class="plant-gallery-thumbnails">
                    ${imgs.map((img, idx) => {
                        const escapedPath = (img || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        return `<button type="button" class="plant-gallery-thumb gallery-thumbnail ${idx === 0 ? 'selected' : ''}" data-img-index="${idx}" data-img-path="${escapedPath}" onclick="selectGalleryImage('${escapedPath}', ${equipment.id}, ${idx}, event)" aria-label="Image ${idx + 1}">
                        <span class="plant-gallery-thumb-img"><img src="${escapeHtml(img || '')}" alt="" loading="lazy" onerror="this.closest('.plant-gallery-thumb').style.display='none'" onload="this.style.display='block'"></span>
                    </button>`;
                    }).join('')}
                </div>
            </div>
        </div>`;
    })();
    modalBody.innerHTML = `
        <div id="modal-page-1" class="modal-page active plant-product-page">
            <div class="plant-product-hero">
                <div class="plant-product-gallery" onclick="${hasGallery ? 'switchModalPage(2, ' + equipment.id + ')' : ''}" role="button" tabindex="0">
                    ${displayImageUrl ? `<img src="${displayImageUrl}" alt="${escapeHtml(equipment.name)}" class="plant-product-image" onerror="this.style.display='none'">` : '<div class="plant-product-image-placeholder">🔧</div>'}
                    ${hasGallery ? '<span class="plant-product-gallery-hint">View gallery</span>' : ''}
                </div>
                <div class="plant-product-meta">
                    <h1 class="plant-product-name">${escapeHtml(equipment.name)}</h1>
                    <div class="plant-product-shop">
                        <div class="plant-product-price">${priceStr}</div>
                        ${stockHtml}
                        <label for="equipmentCartQty" class="plant-product-label">Quantity${equipment.unit ? ' (' + escapeHtml(equipment.unit) + ')' : ''}</label>
                        <input type="number" id="equipmentCartQty" class="plant-product-qty"
                            value="${(typeof stock === 'number' && stock <= 0) ? '0' : (eqIsInt ? '1' : '0.1')}"
                            min="${(typeof stock === 'number' && stock <= 0) ? '0' : (eqIsInt ? '1' : '0.001')}"
                            max="${eqStockMax}"
                            step="${eqIsInt ? '1' : '0.001'}"
                            aria-label="Quantity"
                            ${typeof stock === 'number' && stock <= 0 ? 'disabled' : ''}>
                        <button type="button" class="plant-product-add-cart btn-add-to-cart" data-plant-id="${equipment.id}" ${typeof stock === 'number' && stock <= 0 ? 'disabled' : ''}>Add to cart</button>
                    </div>
                </div>
            </div>
            <section class="plant-product-section">
                <h2 class="plant-product-section-title">Description</h2>
                <div class="plant-detail-description">${descriptionHtml}</div>
            </section>
            <section class="plant-product-section plant-product-reviews-section">
                <div class="product-reviews-widget" data-product-type="equipment" data-product-id="${equipment.id}" data-product-name="${escapeHtml(equipment.name)}"></div>
            </section>
        </div>
        <div id="modal-page-2" class="modal-page" style="display: none;" data-plant-id="${equipment.id}">
            ${galleryPage2Html}
        </div>
    `;
    var canManageVisibilityEq = typeof auth !== 'undefined' && auth && ((auth.isOwner && auth.isOwner()) || (auth.isAdmin && auth.isAdmin()));
    const equipmentDetailActions = createDetailControlPanel({
        buttonsHtml:
            '<button type="button" class="detail-btn card-edit-icon" title="Edit details" aria-label="Edit details">' + detailEditSvg + '<span>Edit details</span></button>' +
            '<button type="button" class="detail-btn card-image-icon" title="Add or edit images" aria-label="Add or edit images">' + detailImageSvg + '<span>Image</span></button>',
        hideConfig: canManageVisibilityEq ? {
            className: 'equipment-detail-hide',
            isHidden: !!equipment.hidden,
            showTitle: 'Show this supply in the shop',
            hideTitle: 'Hide this supply from shoppers',
            showLabel: 'Show supply in shop',
            hideLabel: 'Hide supply from shoppers',
            showText: 'Show in shop',
            hideText: 'Hide from shoppers',
            onToggle: function (hideBtn) {
                var nextHidden = !equipment.hidden;
                equipment.hidden = nextHidden;
                if (window.inventoryDb && window.inventoryDb.setItem) {
                    window.inventoryDb.setItem(equipment.id, { hidden: nextHidden }).then(function () {
                        if (typeof applyEquipmentFilters === 'function') applyEquipmentFilters();
                        if (typeof updateQuickAddButtonsState === 'function') updateQuickAddButtonsState();
                    });
                } else {
                    if (typeof applyEquipmentFilters === 'function') applyEquipmentFilters();
                    if (typeof updateQuickAddButtonsState === 'function') updateQuickAddButtonsState();
                }
                hideBtn.title = nextHidden ? 'Show this supply in the shop' : 'Hide this supply from shoppers';
                hideBtn.setAttribute('aria-label', nextHidden ? 'Show supply in shop' : 'Hide supply from shoppers');
                hideBtn.innerHTML = detailHideButtonHtml(nextHidden, 'Show in shop', 'Hide from shoppers');
            }
        } : null
    });
    mountDetailControlPanel(modalBody, equipmentDetailActions);
    const equipmentDetailEditBtn = equipmentDetailActions.querySelector('.card-edit-icon');
    const equipmentDetailImageBtn = equipmentDetailActions.querySelector('.card-image-icon');
    if (equipmentDetailEditBtn) equipmentDetailEditBtn.addEventListener('click', function() { openEquipmentEdit(equipment); });
    if (equipmentDetailImageBtn) equipmentDetailImageBtn.addEventListener('click', function() { openEquipmentImageUpload(equipment); });
    const addBtn = modalBody.querySelector('.btn-add-to-cart');
    const qtySelect = modalBody.querySelector('#equipmentCartQty');
    if (addBtn && qtySelect) {
        addBtn.addEventListener('click', () => {
            const isInt = isIntegerUnitQuickAdd(equipment.unit);
            const raw = parseFloat(qtySelect.value);
            const qty = isNaN(raw) || raw <= 0 ? (isInt ? 1 : 0.1) : (isInt ? Math.round(raw) : raw);
            addToCart(equipment, qty);
        });
    }
    const equipmentReviewsWidget = modalBody.querySelector('.product-reviews-widget');
    if (equipmentReviewsWidget && typeof window.initProductReviewsWidget === 'function') window.initProductReviewsWidget(equipmentReviewsWidget);
    const navBackWrap = document.getElementById('navBackToListWrap');
    const navBackBtn = document.getElementById('navBackToList');
    if (navBackWrap) { navBackWrap.classList.remove('hidden'); navBackWrap.classList.remove('nav-back-disabled'); }
    if (navBackBtn) navBackBtn.disabled = false;
    if (mainLayout) mainLayout.classList.add('detail-view-active');
    if (typeof window.syncFiltersUiForDetailView === 'function') window.syncFiltersUiForDetailView(true);
    if (filtersSidebarWrapper) filtersSidebarWrapper.style.display = 'none';
    if (mainContent && plantDetailPanel) {
        mainContent.classList.add('list-view-hidden');
        plantDetailPanel.classList.remove('hidden');
        plantDetailPanel.setAttribute('aria-hidden', 'false');
    }
    if (plantModal) plantModal.classList.add('hidden');
    setCatalogSeoUrl('supply', equipment, typeof allEquipment !== 'undefined' ? allEquipment : (window.allEquipment || []));
    document.addEventListener('keydown', handlePlantPanelEscape);
    resetDetailPanelScroll();
}

let equipmentEditing = null;

window.handleEquipmentEditClick = function(btn) {
    var id = parseInt(btn.getAttribute('data-equipment-id'), 10);
    if (isNaN(id)) return;
    var list = window.allEquipment || [];
    var equip = list.find(function(e) { return e.id === id; });
    if (equip && window.openEquipmentEdit) window.openEquipmentEdit(equip);
};

function showEditPage(type) {
    document.documentElement.classList.remove('edit-loading-on');
    var editPage = document.getElementById('editPage');
    if (!editPage) return;
    document.querySelectorAll('.edit-page-panel').forEach(function(p) { p.classList.remove('active'); });
    var panel = document.getElementById('editPanel' + (type === 'plant' ? 'Plant' : type === 'equipment' ? 'Equipment' : 'Vivarium'));
    if (panel) panel.classList.add('active');
    editPage.classList.remove('hidden');
    editPage.setAttribute('aria-hidden', 'false');
    document.body.classList.add('edit-page-visible');
}

function hideEditPage() {
    var editPage = document.getElementById('editPage');
    if (editPage) {
        editPage.classList.add('hidden');
        editPage.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('edit-page-visible');
    var params = new URLSearchParams(window.location.search);
    if (params.has('edit') || params.has('add')) {
        params.delete('edit');
        params.delete('add');
        params.delete('id');
        var newSearch = params.toString();
        var url = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
        window.history.replaceState({}, '', url);
    }
}

function openEquipmentEdit(equipment) {
    var isNew = !equipment || equipment.id == null;
    equipmentEditing = isNew ? { id: null, name: '', description: '', imageUrl: '', images: [], price: null, size: '', unit: '', stockQuantity: 0, reorderLevel: undefined } : equipment;
    var nameEl = document.getElementById('equipmentEditName');
    var nameRow = document.getElementById('equipmentEditNameRow');
    var nameInput = document.getElementById('equipmentEditNameInput');
    var titleEl = document.getElementById('editPageTitle');
    if (titleEl) titleEl.textContent = isNew ? 'Add supply' : 'Edit supply';
    if (nameEl) nameEl.style.display = 'none';
    if (nameRow) nameRow.style.display = '';
    if (nameInput) { nameInput.value = equipmentEditing.name || ''; nameInput.style.display = ''; }
    function fillFields(inv) {
        var descEl = document.getElementById('equipmentEditDescription');
        var sizeEl = document.getElementById('equipmentEditSize');
        var priceEl = document.getElementById('equipmentEditPrice');
        var costEl = document.getElementById('equipmentEditCost');
        var marginPctEl = document.getElementById('equipmentEditMarginPct');
        var stockEl = document.getElementById('equipmentEditStock');
        var reorderEl = document.getElementById('equipmentEditReorder');
        if (descEl) descEl.value = (inv && inv.description != null) ? inv.description : (equipmentEditing.description != null ? equipmentEditing.description : '');
        if (sizeEl) sizeEl.value = (inv && inv.size != null) ? inv.size : (equipmentEditing.size != null ? equipmentEditing.size : '');
        var unitEl = document.getElementById('equipmentEditUnit');
        if (unitEl) unitEl.value = (inv && inv.unit != null && inv.unit !== '') ? inv.unit : (equipmentEditing.unit != null ? equipmentEditing.unit : '');
        var price = (inv && inv.price != null) ? inv.price : (equipmentEditing.price != null ? equipmentEditing.price : null);
        var cost = (inv && inv.costPrice != null) ? inv.costPrice : (equipmentEditing.costPrice != null ? equipmentEditing.costPrice : null);
        if (costEl) costEl.value = cost != null ? cost : '';
        var marginPct = (price != null && price > 0 && cost != null) ? ((price - cost) / price * 100) : '';
        if (marginPctEl) marginPctEl.value = marginPct !== '' ? Number(marginPct).toFixed(1) : '';
        if (priceEl) priceEl.value = (price != null ? Number(price).toFixed(2) : '');
        if (stockEl) stockEl.value = (inv && inv.quantityInStock != null) ? inv.quantityInStock : (equipmentEditing.stockQuantity != null ? equipmentEditing.stockQuantity : 0);
        if (reorderEl) reorderEl.value = (inv && inv.reorderLevel != null) ? inv.reorderLevel : (equipmentEditing.reorderLevel != null ? equipmentEditing.reorderLevel : '');
        var categoryEl = document.getElementById('equipmentEditCategory');
        if (categoryEl) {
            var cat = (inv && inv.category != null && inv.category !== '')
                ? inv.category
                : (equipmentEditing.category != null && equipmentEditing.category !== '' ? equipmentEditing.category : '');
            categoryEl.value = String(cat);
        }
    }
    function updateEquipmentPriceFromCostMargin() {
        var costEl = document.getElementById('equipmentEditCost');
        var marginPctEl = document.getElementById('equipmentEditMarginPct');
        var priceEl = document.getElementById('equipmentEditPrice');
        if (!priceEl) return;
        var c = costEl && costEl.value.trim() !== '' ? parseFloat(costEl.value) : NaN;
        var m = marginPctEl && marginPctEl.value.trim() !== '' ? parseFloat(marginPctEl.value) : NaN;
        if (!isNaN(c) && !isNaN(m) && m < 100) priceEl.value = roundSellPrice(c / (1 - m / 100)).toFixed(2);
        else if (isNaN(c)) priceEl.value = '';
    }
    if (!isNew && window.inventoryDb) {
        window.inventoryDb.getItem(equipmentEditing.id).then(fillFields).catch(function() { fillFields(null); });
    } else {
        fillFields(null);
    }
    var costEl = document.getElementById('equipmentEditCost');
    var marginPctEl = document.getElementById('equipmentEditMarginPct');
    if (costEl) costEl.addEventListener('input', updateEquipmentPriceFromCostMargin);
    if (marginPctEl) marginPctEl.addEventListener('input', updateEquipmentPriceFromCostMargin);
    var q = isNew ? 'add=equipment' : 'edit=equipment&id=' + equipmentEditing.id;
    window.history.replaceState({}, '', window.location.pathname + '?' + q + (window.location.hash || ''));
    showEditPage('equipment');
}
window.openEquipmentEdit = openEquipmentEdit;

function closeEquipmentEditModal() {
    equipmentEditing = null;
    hideEditPage();
    if (window.self !== window.top) try { window.parent.postMessage({ type: 'invAddOverlayClose' }, '*'); } catch (e) {}
}

var vivariumEditing = null;

function refreshVivariumEditPlantOptions() {
    if (!vivariumEditing) return;
    var searchInput = document.getElementById('vivariumEditPlantSearch');
    var tbody = document.getElementById('vivariumEditPlantTableBody');
    if (!tbody) return;
    var q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    var plants = window.allPlants || window.plantsDatabase || [];
    var filtered = q ? plants.filter(function(p) {
        var name = (p.name || '').toLowerCase();
        var sci = (typeof p.scientificName === 'string') ? (p.scientificName || '').toLowerCase() : (p.scientificName && p.scientificName.name ? String(p.scientificName.name).toLowerCase() : '');
        var matchName = name.indexOf(q) !== -1 || sci.indexOf(q) !== -1;
        if (matchName) return true;
        var commonNames = p.commonNames;
        if (Array.isArray(commonNames)) {
            for (var i = 0; i < commonNames.length; i++) {
                if (String(commonNames[i] || '').toLowerCase().indexOf(q) !== -1) return true;
            }
        }
        return false;
    }) : plants;
    var selectedIds = vivariumEditing.plantIds || [];
    var commonName = function(p) {
        if (p.name) return p.name;
        if (Array.isArray(p.commonNames) && p.commonNames.length) return p.commonNames[0];
        return '—';
    };
    var scientificName = function(p) {
        if (typeof p.scientificName === 'string') return p.scientificName || '—';
        if (p.scientificName && p.scientificName.name) return p.scientificName.name;
        return '—';
    };
    var imageUrlForTooltip = function(p) {
        if (p.imageUrl) return p.imageUrl;
        if (p.images && p.images.length) return p.images[0];
        return '';
    };
    tbody.innerHTML = filtered.map(function(p) {
        var id = p.id;
        var sel = selectedIds.indexOf(Number(id)) !== -1;
        var imgUrl = imageUrlForTooltip(p);
        var dataImg = imgUrl ? (' data-plant-image="' + escapeHtml(imgUrl) + '"') : '';
        return '<tr' + dataImg + '><td class="vivarium-plant-td-include"><input type="checkbox" class="vivarium-plant-checkbox" value="' + encodeURIComponent(id) + '"' + (sel ? ' checked' : '') + '></td><td>' + escapeHtml(commonName(p)) + '</td><td>' + escapeHtml(scientificName(p)) + '</td></tr>';
    }).join('');
}

function refreshVivariumEditSupplyOptions() {
    if (!vivariumEditing) return;
    var searchInput = document.getElementById('vivariumEditSupplySearch');
    var supplyIdsEl = document.getElementById('vivariumEditSupplyIds');
    if (!supplyIdsEl) return;
    var q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    var supplies = window.allEquipment || [];
    var filtered = q ? supplies.filter(function(s) {
        var name = (s.name || '').toLowerCase();
        return name.indexOf(q) !== -1;
    }) : supplies;
    var selectedIds = vivariumEditing.supplyIds || [];
    supplyIdsEl.innerHTML = filtered.map(function(s) {
        var id = s.id;
        var sel = selectedIds.indexOf(Number(id)) !== -1;
        return '<option value="' + encodeURIComponent(id) + '"' + (sel ? ' selected' : '') + '>' + escapeHtml(s.name || 'Supply #' + id) + '</option>';
    }).join('');
}

function openVivariumEdit(vivarium) {
    var isNew = !vivarium || vivarium.id == null;
    vivariumEditing = isNew ? { id: null, name: '', description: '', imageUrl: '', images: [], price: null, type: 'open-terrarium', availability: 'in-stock', plantIds: [], supplyIds: [], careTips: [] } : vivarium;
    if (!Array.isArray(vivariumEditing.plantIds)) vivariumEditing.plantIds = [];
    if (!Array.isArray(vivariumEditing.supplyIds)) vivariumEditing.supplyIds = [];
    var titleEl = document.getElementById('editPageTitle');
    if (titleEl) titleEl.textContent = isNew ? 'Add vivarium' : 'Edit vivarium';
    var nameEl = document.getElementById('vivariumEditName');
    var descEl = document.getElementById('vivariumEditDescription');
    var maintEl = document.getElementById('vivariumEditMaintenance');
    var priceEl = document.getElementById('vivariumEditPrice');
    var costEl = document.getElementById('vivariumEditCost');
    var marginPctEl = document.getElementById('vivariumEditMarginPct');
    var typeEl = document.getElementById('vivariumEditType');
    var availabilityEl = document.getElementById('vivariumEditAvailability');
    if (nameEl) nameEl.value = vivariumEditing.name || '';
    if (descEl) descEl.value = vivariumEditing.description || '';
    if (maintEl) {
        var existingTips = Array.isArray(vivariumEditing.careTips) && vivariumEditing.careTips.length
            ? vivariumEditing.careTips
            : ((typeof getVivariumCareTips === 'function') ? getVivariumCareTips(vivariumEditing.type || 'open-terrarium') : []);
        maintEl.value = existingTips.join('\n');
    }
    function fillVivariumPriceFields(inv) {
        var price = vivariumEditing.price != null ? vivariumEditing.price : (inv && inv.price != null ? inv.price : null);
        var cost = (inv && inv.costPrice != null) ? inv.costPrice : null;
        if (costEl) costEl.value = cost != null ? cost : '';
        var marginPct = (price != null && price > 0 && cost != null) ? ((price - cost) / price * 100) : '';
        if (marginPctEl) marginPctEl.value = marginPct !== '' ? Number(marginPct).toFixed(1) : '';
        if (priceEl) priceEl.value = (price != null ? Number(price).toFixed(2) : '');
    }
    function updateVivariumPriceFromCostMargin() {
        if (!priceEl) return;
        var c = costEl && costEl.value.trim() !== '' ? parseFloat(costEl.value) : NaN;
        var m = marginPctEl && marginPctEl.value.trim() !== '' ? parseFloat(marginPctEl.value) : NaN;
        if (!isNaN(c) && !isNaN(m) && m < 100) priceEl.value = roundSellPrice(c / (1 - m / 100)).toFixed(2);
        else if (isNaN(c)) priceEl.value = '';
    }
    if (!isNew && window.inventoryDb && vivariumEditing.id != null) {
        window.inventoryDb.getItem(vivariumEditing.id).then(fillVivariumPriceFields).catch(function() { fillVivariumPriceFields(null); });
    } else {
        fillVivariumPriceFields(null);
    }
    if (costEl) costEl.addEventListener('input', updateVivariumPriceFromCostMargin);
    if (marginPctEl) marginPctEl.addEventListener('input', updateVivariumPriceFromCostMargin);
    if (typeEl) typeEl.value = vivariumEditing.type || 'open-terrarium';
    if (availabilityEl) availabilityEl.value = vivariumEditing.availability || 'in-stock';
    var searchInput = document.getElementById('vivariumEditPlantSearch');
    if (searchInput) searchInput.value = '';
    var tip = document.getElementById('vivariumPlantImageTooltip');
    if (tip) { tip.classList.remove('show'); var img = tip.querySelector('img'); if (img) img.src = ''; }
    refreshVivariumEditPlantOptions();
    var searchSupplyInput = document.getElementById('vivariumEditSupplySearch');
    if (searchSupplyInput) searchSupplyInput.value = '';
    refreshVivariumEditSupplyOptions();
    var q = isNew ? 'add=vivarium' : 'edit=vivarium&id=' + vivariumEditing.id;
    window.history.replaceState({}, '', window.location.pathname + '?' + q + (window.location.hash || ''));
    showEditPage('vivarium');
}
window.openVivariumEdit = openVivariumEdit;

function closeVivariumEditModal() {
    vivariumEditing = null;
    hideEditPage();
    if (window.self !== window.top) try { window.parent.postMessage({ type: 'invAddOverlayClose' }, '*'); } catch (e) {}
}

function saveVivariumEdit() {
    if (!vivariumEditing) return;
    var nameEl = document.getElementById('vivariumEditName');
    var descEl = document.getElementById('vivariumEditDescription');
    var maintEl = document.getElementById('vivariumEditMaintenance');
    var priceEl = document.getElementById('vivariumEditPrice');
    var costEl = document.getElementById('vivariumEditCost');
    var marginPctEl = document.getElementById('vivariumEditMarginPct');
    var typeEl = document.getElementById('vivariumEditType');
    var availabilityEl = document.getElementById('vivariumEditAvailability');
    var name = nameEl && nameEl.value.trim() !== '' ? nameEl.value.trim() : (vivariumEditing.name || 'New vivarium');
    var description = descEl ? descEl.value.trim() : '';
    var careTips = maintEl && maintEl.value ? maintEl.value.split(/\r?\n/).map(function(t){ return t.trim(); }).filter(Boolean) : [];
    var cost = costEl && costEl.value.trim() !== '' ? parseFloat(costEl.value) : undefined;
    var marginPct = marginPctEl && marginPctEl.value.trim() !== '' ? parseFloat(marginPctEl.value) : NaN;
    var price;
    if (cost != null && !isNaN(cost) && !isNaN(marginPct) && marginPct < 100) {
        price = roundSellPrice(cost / (1 - marginPct / 100));
    } else {
        var priceNum = priceEl && priceEl.value.trim() !== '' ? parseFloat(priceEl.value) : null;
        price = priceNum != null && !isNaN(priceNum) ? roundSellPrice(priceNum) : vivariumEditing.price;
        if (price != null) price = roundSellPrice(price);
    }
    var type = typeEl && typeEl.value ? typeEl.value : vivariumEditing.type;
    var availability = availabilityEl && availabilityEl.value ? availabilityEl.value : 'in-stock';
    var plantIds = Array.isArray(vivariumEditing.plantIds) ? vivariumEditing.plantIds.slice() : [];
    var supplyIdsEl = document.getElementById('vivariumEditSupplyIds');
    var supplyIds = [];
    if (supplyIdsEl) {
        [].forEach.call(supplyIdsEl.selectedOptions, function(opt) {
            var n = Number(opt.value);
            if (!isNaN(n)) supplyIds.push(n);
        });
    }
    vivariumEditing.name = name;
    vivariumEditing.description = description || undefined;
    vivariumEditing.price = price;
    vivariumEditing.type = type;
    vivariumEditing.availability = availability;
    vivariumEditing.plantIds = plantIds;
    vivariumEditing.supplyIds = supplyIds;
    var isNew = vivariumEditing.id == null;
    var id = vivariumEditing.id;
    var saveVivariumCatalogPromise = Promise.resolve();
    if (isNew) {
        var list = allVivariums || [];
        if (window.supabaseDb && window.supabaseDb.isConfigured() && window.supabaseDb.getNextVivariumId) {
            saveVivariumCatalogPromise = window.supabaseDb.getNextVivariumId().then(function(nextId) {
                id = nextId;
                vivariumEditing.id = id;
                vivariumEditing.imageUrl = vivariumEditing.imageUrl || '';
                vivariumEditing.images = Array.isArray(vivariumEditing.images) ? vivariumEditing.images : [];
                list.push(vivariumEditing);
                allVivariums = list;
                window.allVivariums = list;
                return window.supabaseDb.createVivariumInCatalog(vivariumEditing);
            }).catch(function() {
                var maxId = list.length ? Math.max.apply(null, list.map(function(v) { return v.id || 0; })) : 60000;
                id = Math.max(60001, maxId + 1);
                vivariumEditing.id = id;
                vivariumEditing.imageUrl = '';
                vivariumEditing.images = [];
                list.push(vivariumEditing);
                allVivariums = list;
                window.allVivariums = list;
            });
        } else {
            var maxId = list.length ? Math.max.apply(null, list.map(function(v) { return v.id || 0; })) : 60000;
            id = Math.max(60001, maxId + 1);
            vivariumEditing.id = id;
            vivariumEditing.imageUrl = '';
            vivariumEditing.images = [];
            list.push(vivariumEditing);
            allVivariums = list;
            window.allVivariums = list;
            try {
                var custom = JSON.parse(localStorage.getItem('custom_vivariums') || '[]');
                if (!Array.isArray(custom)) custom = [];
                custom.push(vivariumEditing);
                localStorage.setItem('custom_vivariums', JSON.stringify(custom));
            } catch (e) { }
        }
        if (typeof syncToRepo === 'function') syncToRepo();
    } else {
        if (window.supabaseDb && window.supabaseDb.isConfigured() && window.supabaseDb.updateVivariumInCatalog) {
            saveVivariumCatalogPromise = window.supabaseDb.updateVivariumInCatalog(id, vivariumEditing).catch(function() {});
        }
        try {
            localStorage.setItem('vivarium_' + id + '_edit', JSON.stringify({ name: name, description: description || undefined, price: price, type: type, availability: availability, plantIds: plantIds, supplyIds: supplyIds, careTips: careTips.length ? careTips : undefined }));
            if (typeof syncToRepo === 'function') syncToRepo();
        } catch (e) { /* ignore */ }
    }
    if (window.inventoryDb && window.inventoryDb.setItem) {
        saveVivariumCatalogPromise.then(function() {
            var itemId = vivariumEditing.id != null ? vivariumEditing.id : id;
            return window.inventoryDb.setItem(itemId, {
                name: name,
                description: description || undefined,
                price: price,
                costPrice: cost,
                quantityInStock: vivariumEditing.quantityInStock,
                reorderLevel: vivariumEditing.reorderLevel
            });
        }).then(function() {
            if (window.inventoryDb.mergeInventoryIntoPlants && allVivariums) return window.inventoryDb.mergeInventoryIntoPlants(allVivariums);
        }).then(function() {
            closeVivariumEditModal();
            if (isNew && typeof applyVivariumFilters === 'function') applyVivariumFilters();
            else if (typeof renderVivariumsPage === 'function') renderVivariumsPage();
        }).catch(function() {
            closeVivariumEditModal();
            if (isNew && typeof applyVivariumFilters === 'function') applyVivariumFilters();
            else if (typeof renderVivariumsPage === 'function') renderVivariumsPage();
        });
    } else {
        saveVivariumCatalogPromise.then(function() {
            closeVivariumEditModal();
            if (isNew && typeof applyVivariumFilters === 'function') applyVivariumFilters();
            else if (typeof renderVivariumsPage === 'function') renderVivariumsPage();
        });
    }
}

function mergeVivariumEditsFromStorage() {
    if (!allVivariums || !allVivariums.length) return;
    allVivariums.forEach(function(v) {
        var id = v.id;
        if (id == null) return;
        try {
            var raw = localStorage.getItem('vivarium_' + id + '_edit');
            if (!raw) return;
            var edit = JSON.parse(raw);
            if (edit.name != null) v.name = edit.name;
            if (edit.description != null) v.description = edit.description;
            if (edit.price != null) v.price = edit.price;
            if (edit.type != null) v.type = edit.type;
            if (edit.availability != null) v.availability = edit.availability;
            if (edit.plantIds != null && Array.isArray(edit.plantIds)) v.plantIds = edit.plantIds;
            if (edit.supplyIds != null && Array.isArray(edit.supplyIds)) v.supplyIds = edit.supplyIds;
            if (edit.careTips != null && Array.isArray(edit.careTips)) v.careTips = edit.careTips;
        } catch (e) { /* ignore */ }
    });
}

function mergeEquipmentEditsFromStorage() {
    if (!allEquipment || !allEquipment.length) return;
    // When Supabase catalog/inventory is the source of truth, do not let stale
    // localStorage edits override category (that wrongly moved items between build steps).
    var supabaseOwnsCategory = window.supabaseDb && window.supabaseDb.isConfigured && window.supabaseDb.isConfigured();
    allEquipment.forEach(function(eq) {
        var id = eq.id;
        if (id == null) return;
        try {
            var raw = localStorage.getItem('equipment_' + id + '_edit');
            if (!raw) return;
            var edit = JSON.parse(raw);
            if (edit.name != null) eq.name = edit.name;
            if (edit.description != null) eq.description = edit.description;
            if (edit.size != null) eq.size = edit.size;
            if (edit.unit != null) eq.unit = edit.unit;
            if (!supabaseOwnsCategory && edit.category != null) eq.category = edit.category;
            if (edit.price != null) eq.price = edit.price;
            if (edit.costPrice != null) eq.costPrice = edit.costPrice;
            if (edit.stockQuantity != null) eq.stockQuantity = edit.stockQuantity;
            if (edit.reorderLevel != null) eq.reorderLevel = edit.reorderLevel;
        } catch (e) { /* ignore */ }
    });
}

// --- Equipment / Vivarium images modal (add/edit images and gallery) ---
var currentEquipmentForImages = null;
var currentEquipmentImageFiles = [];
var currentEquipmentImageUrls = [];
var currentImageModalPrefix = 'equipment_';

function openEquipmentImageUpload(equipment) {
    if (!equipment) return;
    currentImageModalPrefix = 'equipment_';
    currentEquipmentForImages = equipment;
    currentEquipmentImageFiles = [];
    currentEquipmentImageUrls = [];
    var savedImages = localStorage.getItem('equipment_' + equipment.id + '_images');
    if (savedImages) {
        try {
            var arr = JSON.parse(savedImages);
            if (Array.isArray(arr)) currentEquipmentImageUrls = arr.slice();
        } catch (e) { /* ignore */ }
    }
    if (currentEquipmentImageUrls.length === 0 && (equipment.images && equipment.images.length)) {
        currentEquipmentImageUrls = equipment.images.slice();
    }
    if (currentEquipmentImageUrls.length === 0 && equipment.imageUrl) {
        currentEquipmentImageUrls = [equipment.imageUrl];
    }
    var nameEl = document.getElementById('equipmentImageModalName');
    if (nameEl) nameEl.textContent = equipment.name || 'Equipment';
    var titleEl = document.getElementById('equipmentImageModalTitle');
    if (titleEl) titleEl.textContent = 'Equipment images';
    var modal = document.getElementById('equipmentImageModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
    }
    var fileInput = document.getElementById('equipmentFileInput');
    if (fileInput) fileInput.value = '';
    var urlInput = document.getElementById('equipmentImageUrlInput');
    if (urlInput) urlInput.value = '';
    updateEquipmentImageGallery();
    document.addEventListener('paste', handleEquipmentImagePaste);
}

function openVivariumImageUpload(vivarium) {
    if (!vivarium) return;
    currentImageModalPrefix = 'vivarium_';
    currentEquipmentForImages = vivarium;
    currentEquipmentImageFiles = [];
    currentEquipmentImageUrls = [];
    var savedImages = localStorage.getItem('vivarium_' + vivarium.id + '_images');
    if (savedImages) {
        try {
            var arr = JSON.parse(savedImages);
            if (Array.isArray(arr)) currentEquipmentImageUrls = arr.slice();
        } catch (e) { /* ignore */ }
    }
    if (currentEquipmentImageUrls.length === 0 && (vivarium.images && vivarium.images.length)) {
        currentEquipmentImageUrls = vivarium.images.slice();
    }
    if (currentEquipmentImageUrls.length === 0 && vivarium.imageUrl) {
        currentEquipmentImageUrls = [vivarium.imageUrl];
    }
    var nameEl = document.getElementById('equipmentImageModalName');
    if (nameEl) nameEl.textContent = vivarium.name || 'Vivarium';
    var titleEl = document.getElementById('equipmentImageModalTitle');
    if (titleEl) titleEl.textContent = 'Vivarium images';
    var modal = document.getElementById('equipmentImageModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
    }
    var fileInput = document.getElementById('equipmentFileInput');
    if (fileInput) fileInput.value = '';
    var urlInput = document.getElementById('equipmentImageUrlInput');
    if (urlInput) urlInput.value = '';
    updateEquipmentImageGallery();
    document.addEventListener('paste', handleEquipmentImagePaste);
}

function handleEquipmentImagePaste(e) {
    var modal = document.getElementById('equipmentImageModal');
    if (!modal || !modal.classList.contains('show')) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var imageItems = Array.from(items).filter(function(item) { return item.type.startsWith('image/'); });
    if (imageItems.length === 0) return;
    e.preventDefault();
    imageItems.forEach(function(item) {
        var blob = item.getAsFile();
        if (blob) {
            var file = new File([blob], 'pasted-image-' + Date.now() + '.png', { type: blob.type });
            currentEquipmentImageFiles.push(file);
        }
    });
    updateEquipmentImageGallery();
}

function updateEquipmentImageGallery() {
    var emptyEl = document.getElementById('equipmentDragDropEmpty');
    var galleryEl = document.getElementById('equipmentDragDropGallery');
    var countEl = document.getElementById('equipmentDragDropCount');
    var gridEl = document.getElementById('equipmentDragDropGalleryGrid');
    if (!emptyEl || !galleryEl || !gridEl) return;
    var total = currentEquipmentImageFiles.length + currentEquipmentImageUrls.length;
    if (total === 0) {
        emptyEl.style.display = 'block';
        galleryEl.style.display = 'none';
        if (countEl) countEl.textContent = '0';
        return;
    }
    emptyEl.style.display = 'none';
    galleryEl.style.display = 'block';
    if (countEl) countEl.textContent = String(total);
    gridEl.innerHTML = '';
    var index = 0;
    currentEquipmentImageFiles.forEach(function(file) {
        var item = document.createElement('div');
        item.className = 'drag-drop-gallery-item';
        var idx = index;
        item.dataset.index = String(idx);
        item.dataset.type = 'file';
        var img = document.createElement('img');
        var reader = new FileReader();
        reader.onload = function(e) { img.src = e.target.result; };
        reader.readAsDataURL(file);
        var numBadge = document.createElement('div');
        numBadge.className = 'image-number';
        numBadge.textContent = '#' + (idx + 1);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (function(i) { return function(e) { e.preventDefault(); e.stopPropagation(); removeEquipmentImageAtIndex(i); }; })(idx);
        item.appendChild(img);
        item.appendChild(numBadge);
        item.appendChild(removeBtn);
        if (gridEl && gridEl.parentNode) gridEl.appendChild(item);
        index++;
    });
    currentEquipmentImageUrls.forEach(function(url) {
        var item = document.createElement('div');
        item.className = 'drag-drop-gallery-item';
        var idx = index;
        item.dataset.index = String(idx);
        item.dataset.type = 'url';
        var img = document.createElement('img');
        img.src = url;
        img.onerror = function() { img.style.background = '#eee'; img.alt = 'Failed to load'; };
        var numBadge = document.createElement('div');
        numBadge.className = 'image-number';
        numBadge.textContent = '#' + (idx + 1);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (function(i) { return function(e) { e.preventDefault(); e.stopPropagation(); removeEquipmentImageAtIndex(i); }; })(idx);
        item.appendChild(img);
        item.appendChild(numBadge);
        item.appendChild(removeBtn);
        if (gridEl && gridEl.parentNode) gridEl.appendChild(item);
        index++;
    });
}

function removeEquipmentImageAtIndex(i) {
    if (i < currentEquipmentImageFiles.length) {
        currentEquipmentImageFiles.splice(i, 1);
    } else {
        currentEquipmentImageUrls.splice(i - currentEquipmentImageFiles.length, 1);
    }
    updateEquipmentImageGallery();
}

function clearEquipmentImageGallery() {
    currentEquipmentImageFiles = [];
    currentEquipmentImageUrls = [];
    var fileInput = document.getElementById('equipmentFileInput');
    if (fileInput) fileInput.value = '';
    updateEquipmentImageGallery();
}

function syncEquipmentOrVivariumImagesToSupabase() {
    if (!currentEquipmentForImages || !window.supabaseDb || !window.supabaseDb.isConfigured()) return;
    var id = currentEquipmentForImages.id;
    var prefix = currentImageModalPrefix || 'equipment_';
    var imgs = currentEquipmentForImages.images;
    var imgUrl = currentEquipmentForImages.imageUrl;
    if (prefix === 'vivarium_') {
        var fullIdx = allVivariums && allVivariums.findIndex(function (v) { return parseInt(v.id, 10) === parseInt(id, 10); });
        if (fullIdx >= 0) { allVivariums[fullIdx].images = imgs; allVivariums[fullIdx].imageUrl = imgUrl; }
        window.supabaseDb.updateVivariumInCatalog(id, currentEquipmentForImages);
    } else {
        var fullIdx = allEquipment && allEquipment.findIndex(function (e) { return Number(e.id) === Number(id); });
        if (fullIdx >= 0) { allEquipment[fullIdx].images = imgs; allEquipment[fullIdx].imageUrl = imgUrl; }
        window.supabaseDb.updateEquipmentInCatalog(id, currentEquipmentForImages);
    }
}

function saveEquipmentImages() {
    if (!currentEquipmentForImages) return;
    var id = currentEquipmentForImages.id;
    var urls = currentEquipmentImageUrls.slice();
    var files = currentEquipmentImageFiles;
    var prefix = currentImageModalPrefix || 'equipment_';
    var saveBtn = document.getElementById('equipmentImageSaveBtn');
    var supabase = window.supabaseDb && window.supabaseDb.isConfigured();
    var uploadToStorage = supabase && window.supabaseDb.uploadToStorage;

    if (files.length > 0 && uploadToStorage && (prefix === 'equipment_' || prefix === 'vivarium_')) {
        saveBtn.textContent = '⏳ Uploading...';
        saveBtn.disabled = true;
        var basePath = (prefix === 'vivarium_' ? 'Vivariums/' : 'supplies/equipment-') + id + '/';
        // Use repo-style numbered filenames: 1.jpg, 2.jpg, ... (same as migrated content)
        var usedNumbers = new Set();
        (urls || []).forEach(function (u) {
            if (typeof u !== 'string') return;
            var m = u.match(/\/(\d+)\.(jpg|jpeg|png|gif|webp)$/i);
            if (m) { var n = parseInt(m[1], 10); if (!isNaN(n)) usedNumbers.add(n); }
        });
        function getExt(file) {
            if (file.name) {
                var match = file.name.toLowerCase().match(/\.(jpe?g|png|gif|webp)$/);
                if (match) return match[1].replace('jpeg', 'jpg');
            }
            return (file.type && file.type.indexOf('png') !== -1) ? 'png' : 'jpg';
        }
        var nextNum = 1;
        var uploads = files.map(function (file) {
            while (usedNumbers.has(nextNum)) nextNum++;
            var ext = getExt(file);
            var fileName = nextNum + '.' + ext;
            usedNumbers.add(nextNum);
            nextNum++;
            return uploadToStorage(file, basePath + fileName);
        });
        Promise.all(uploads).then(function (uploadedUrls) {
            var existingHttp = urls.filter(isHttpUrl);
            var all = existingHttp.concat(uploadedUrls);
            if (all.length === 0) {
                localStorage.removeItem(prefix + id + '_images');
                localStorage.removeItem(prefix + id + '_imageUrl');
                currentEquipmentForImages.images = [];
                currentEquipmentForImages.imageUrl = '';
            } else {
                localStorage.setItem(prefix + id + '_images', JSON.stringify(all));
                localStorage.setItem(prefix + id + '_imageUrl', all[0]);
                currentEquipmentForImages.images = all;
                currentEquipmentForImages.imageUrl = all[0];
            }
            syncEquipmentOrVivariumImagesToSupabase();
            saveBtn.textContent = '💾 Save';
            saveBtn.disabled = false;
            closeEquipmentImageModal();
            if (prefix === 'vivarium_') { if (typeof renderVivariumsPage === 'function') renderVivariumsPage(); } else if (typeof renderEquipmentPage === 'function') renderEquipmentPage();
        }).catch(function () {
            saveBtn.textContent = '💾 Save';
            saveBtn.disabled = false;
            closeEquipmentImageModal();
        });
        return;
    }

    if (files.length > 0 && (prefix === 'equipment_' || prefix === 'vivarium_') && (typeof saveEquipmentImageFilesToFolder === 'function' || typeof saveVivariumImageFilesToFolder === 'function')) {
        saveBtn.textContent = '⏳ Saving to folder...';
        saveBtn.disabled = true;
        var savePromise = prefix === 'vivarium_'
            ? saveVivariumImageFilesToFolder(currentEquipmentForImages, files)
            : saveEquipmentImageFilesToFolder(currentEquipmentForImages, files);
        savePromise.then(function(result) {
            saveBtn.textContent = '💾 Save';
            saveBtn.disabled = false;
            if (result.success && result.savedPaths && result.savedPaths.length > 0) {
                currentEquipmentForImages.images = result.savedPaths;
                currentEquipmentForImages.imageUrl = result.savedPaths[0];
                localStorage.setItem(prefix + id + '_images', JSON.stringify(result.savedPaths));
                localStorage.setItem(prefix + id + '_imageUrl', result.savedPaths[0]);
                if (prefix === 'vivarium_') {
                    if (typeof allVivariums !== 'undefined' && Array.isArray(allVivariums)) {
                        var vIdx = allVivariums.findIndex(function(v) { return v.id === id; });
                        if (vIdx >= 0) allVivariums[vIdx] = currentEquipmentForImages;
                    }
                    syncEquipmentOrVivariumImagesToSupabase();
                    closeEquipmentImageModal();
                    if (typeof renderVivariumsPage === 'function') renderVivariumsPage();
                } else {
                    if (typeof allEquipment !== 'undefined' && Array.isArray(allEquipment)) {
                        var idx = allEquipment.findIndex(function(e) { return e.id === id; });
                        if (idx >= 0) allEquipment[idx] = currentEquipmentForImages;
                    }
                    window.allEquipment = allEquipment;
                    syncEquipmentOrVivariumImagesToSupabase();
                    closeEquipmentImageModal();
                    if (typeof renderEquipmentPage === 'function') renderEquipmentPage();
                }
            } else {
                var toDataUrl = (window.uploadUtils && window.uploadUtils.fileToDataUrl) || function(file) {
                    return new Promise(function(resolve, reject) {
                        var reader = new FileReader();
                        reader.onload = function(e) { resolve(e.target.result); };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                };
                Promise.all(files.map(toDataUrl)).then(function(dataUrls) {
                    var all = urls.concat(dataUrls);
                    localStorage.setItem(prefix + id + '_images', JSON.stringify(all));
                    localStorage.setItem(prefix + id + '_imageUrl', all[0]);
                    currentEquipmentForImages.images = all;
                    currentEquipmentForImages.imageUrl = all[0];
                    syncEquipmentOrVivariumImagesToSupabase();
                    closeEquipmentImageModal();
                    if (prefix === 'vivarium_') {
                        if (typeof renderVivariumsPage === 'function') renderVivariumsPage();
                    } else if (typeof renderEquipmentPage === 'function') {
                        renderEquipmentPage();
                    }
                });
            }
        }).catch(function() {
            saveBtn.textContent = '💾 Save';
            saveBtn.disabled = false;
            closeEquipmentImageModal();
        });
        return;
    }

    var toDataUrl = (window.uploadUtils && window.uploadUtils.fileToDataUrl) || function(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };
    Promise.all(files.map(toDataUrl)).then(function(dataUrls) {
        var all = urls.concat(dataUrls);
        if (all.length === 0) {
            localStorage.removeItem(prefix + id + '_images');
            localStorage.removeItem(prefix + id + '_imageUrl');
            currentEquipmentForImages.images = [];
            currentEquipmentForImages.imageUrl = '';
        } else {
            localStorage.setItem(prefix + id + '_images', JSON.stringify(all));
            localStorage.setItem(prefix + id + '_imageUrl', all[0]);
            currentEquipmentForImages.images = all;
            currentEquipmentForImages.imageUrl = all[0];
        }
        syncEquipmentOrVivariumImagesToSupabase();
        closeEquipmentImageModal();
        if (prefix === 'vivarium_') {
            if (typeof renderVivariumsPage === 'function') renderVivariumsPage();
        } else if (typeof renderEquipmentPage === 'function') {
            renderEquipmentPage();
        }
    }).catch(function() {
        closeEquipmentImageModal();
    });
}

function closeEquipmentImageModal() {
    currentEquipmentForImages = null;
    currentEquipmentImageFiles = [];
    currentEquipmentImageUrls = [];
    currentImageModalPrefix = 'equipment_';
    document.removeEventListener('paste', handleEquipmentImagePaste);
    var modal = document.getElementById('equipmentImageModal');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
    }
    if (window.self !== window.top) try { window.parent.postMessage({ type: 'invAddOverlayClose' }, '*'); } catch (e) {}
}

// --- Plant images modal (add/edit images and gallery, like equipment) ---
var currentPlantForImages = null;
var currentPlantImageFiles = [];
var currentPlantImageUrls = [];

function openPlantImageUpload(plant) {
    if (!plant) return;
    currentPlantForImages = plant;
    currentPlantImageFiles = [];
    currentPlantImageUrls = [];
    var expectedSlug = scientificNameToSlug(getScientificNameString(plant));
    var validPrefixes = expectedSlug ? ['images/plants/' + expectedSlug + '/', 'images/' + expectedSlug + '/'] : [];
    function urlBelongsToPlant(url) {
        if (!url || typeof url !== 'string') return false;
        if (validPrefixes.length === 0) return true;
        return validPrefixes.some(function(p) { return url.indexOf(p) === 0; });
    }
    var savedImages = localStorage.getItem('plant_' + plant.id + '_images');
    if (savedImages) {
        try {
            var arr = JSON.parse(savedImages);
            if (Array.isArray(arr)) {
                currentPlantImageUrls = arr.filter(urlBelongsToPlant);
                if (currentPlantImageUrls.length !== arr.length) {
                    localStorage.removeItem('plant_' + plant.id + '_images');
                    localStorage.removeItem('plant_' + plant.id + '_imageUrl');
                    localStorage.removeItem('plant_' + plant.id + '_maxImage');
                }
            }
        } catch (e) { /* ignore */ }
    }
    if (currentPlantImageUrls.length === 0 && (plant.images && plant.images.length)) {
        currentPlantImageUrls = plant.images.filter(urlBelongsToPlant);
        if (currentPlantImageUrls.length === 0) currentPlantImageUrls = plant.images.slice();
    }
    if (currentPlantImageUrls.length === 0 && plant.imageUrl) currentPlantImageUrls = [plant.imageUrl];
    var nameEl = document.getElementById('plantImageModalName');
    if (nameEl) nameEl.textContent = plant.name || (getScientificNameString(plant) || 'Plant');
    var modal = document.getElementById('plantImageModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
    }
    var fileInput = document.getElementById('plantFileInput');
    if (fileInput) fileInput.value = '';
    var urlInput = document.getElementById('plantImageUrlInput');
    if (urlInput) urlInput.value = '';
    updatePlantImageGallery();
    document.addEventListener('paste', handlePlantImagePaste);
}

function handlePlantImagePaste(e) {
    var modal = document.getElementById('plantImageModal');
    if (!modal || !modal.classList.contains('show')) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var imageItems = Array.from(items).filter(function(item) { return item.type.startsWith('image/'); });
    if (imageItems.length === 0) return;
    e.preventDefault();
    imageItems.forEach(function(item) {
        var blob = item.getAsFile();
        if (blob) {
            var file = new File([blob], 'pasted-image-' + Date.now() + '.png', { type: blob.type });
            currentPlantImageFiles.push(file);
        }
    });
    updatePlantImageGallery();
}

function updatePlantImageGallery() {
    var emptyEl = document.getElementById('plantDragDropEmpty');
    var galleryEl = document.getElementById('plantDragDropGallery');
    var countEl = document.getElementById('plantDragDropCount');
    var gridEl = document.getElementById('plantDragDropGalleryGrid');
    if (!emptyEl || !galleryEl || !gridEl) return;
    var total = currentPlantImageFiles.length + currentPlantImageUrls.length;
    if (total === 0) {
        emptyEl.style.display = 'block';
        galleryEl.style.display = 'none';
        if (countEl) countEl.textContent = '0';
        return;
    }
    emptyEl.style.display = 'none';
    galleryEl.style.display = 'block';
    if (countEl) countEl.textContent = String(total);
    gridEl.innerHTML = '';
    var index = 0;
    currentPlantImageFiles.forEach(function(file) {
        var item = document.createElement('div');
        item.className = 'drag-drop-gallery-item';
        var idx = index;
        item.dataset.index = String(idx);
        var img = document.createElement('img');
        var reader = new FileReader();
        reader.onload = function(e) { img.src = e.target.result; };
        reader.readAsDataURL(file);
        var numBadge = document.createElement('div');
        numBadge.className = 'image-number';
        numBadge.textContent = '#' + (idx + 1);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (function(i) { return function(e) { e.preventDefault(); e.stopPropagation(); removePlantImageAtIndex(i); }; })(idx);
        item.appendChild(img);
        item.appendChild(numBadge);
        item.appendChild(removeBtn);
        if (gridEl && gridEl.parentNode) gridEl.appendChild(item);
        index++;
    });
    currentPlantImageUrls.forEach(function(url) {
        var item = document.createElement('div');
        item.className = 'drag-drop-gallery-item';
        var idx = index;
        item.dataset.index = String(idx);
        var img = document.createElement('img');
        img.src = url;
        img.onerror = function() { img.style.background = '#eee'; img.alt = 'Failed to load'; };
        var numBadge = document.createElement('div');
        numBadge.className = 'image-number';
        numBadge.textContent = '#' + (idx + 1);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (function(i) { return function(e) { e.preventDefault(); e.stopPropagation(); removePlantImageAtIndex(i); }; })(idx);
        item.appendChild(img);
        item.appendChild(numBadge);
        item.appendChild(removeBtn);
        if (gridEl && gridEl.parentNode) gridEl.appendChild(item);
        index++;
    });
}

function removePlantImageAtIndex(i) {
    if (i < currentPlantImageFiles.length) {
        currentPlantImageFiles.splice(i, 1);
    } else {
        currentPlantImageUrls.splice(i - currentPlantImageFiles.length, 1);
    }
    updatePlantImageGallery();
}

function clearPlantImageGallery() {
    currentPlantImageFiles = [];
    currentPlantImageUrls = [];
    var fileInput = document.getElementById('plantFileInput');
    if (fileInput) fileInput.value = '';
    updatePlantImageGallery();
}

function isHttpUrl(s) { return typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://')); }

function savePlantImages() {
    if (!currentPlantForImages) return;
    var id = currentPlantForImages.id;
    var urls = currentPlantImageUrls.slice();
    var files = currentPlantImageFiles;
    var supabase = window.supabaseDb && window.supabaseDb.isConfigured();
    var uploadToStorage = supabase && window.supabaseDb.uploadToStorage;
    var plantImageSaveBtn = document.getElementById('plantImageSaveBtn');

    function deleteRemovedPlantImagesFromStorage(newList) {
        var old = (currentPlantForImages && currentPlantForImages.images) ? currentPlantForImages.images.slice() : [];
        var removed = old.filter(function(u) { return newList.indexOf(u) === -1; });
        var del = window.supabaseDb && window.supabaseDb.deleteFromStorage;
        if (!del) return Promise.resolve();
        return Promise.all(removed.filter(function(u) {
            return typeof u === 'string' && (u.indexOf('http://') === 0 || u.indexOf('https://') === 0) && u.indexOf('supabase') !== -1;
        }).map(function(u) { return window.supabaseDb.deleteFromStorage(u).catch(function() {}); }));
    }

    function applyPlantImageResult(all) {
        var list = window.allPlants || window.plantsDatabase;
        var canonical = list && list.find(function(p) { return p && Number(p.id) === Number(id); });
        if (all.length === 0) {
            localStorage.removeItem('plant_' + id + '_images');
            localStorage.removeItem('plant_' + id + '_imageUrl');
            localStorage.removeItem('plant_' + id + '_maxImage');
            if (currentPlantForImages) { currentPlantForImages.images = []; currentPlantForImages.imageUrl = ''; }
            if (canonical) { canonical.images = []; canonical.imageUrl = ''; }
            if (typeof updatePlantCardImage === 'function') updatePlantCardImage(id, null);
        } else {
            localStorage.setItem('plant_' + id + '_images', JSON.stringify(all));
            localStorage.setItem('plant_' + id + '_imageUrl', all[0]);
            if (currentPlantForImages) { currentPlantForImages.images = all; currentPlantForImages.imageUrl = all[0]; }
            if (canonical) { canonical.images = all.slice(); canonical.imageUrl = all[0]; }
            if (typeof updatePlantCardImage === 'function') updatePlantCardImage(id, all[0]);
        }
        if (supabase && window.inventoryDb && window.inventoryDb.setItem) {
            var forInv = all.filter(isHttpUrl);
            if (forInv.length) window.inventoryDb.setItem(id, { images: forInv, imageUrl: forInv[0] });
        }
        closePlantImageModal();
        if (typeof applyAllFilters === 'function') applyAllFilters();
    }

    if (files.length > 0 && uploadToStorage) {
        plantImageSaveBtn.textContent = '⏳ Uploading...';
        plantImageSaveBtn.disabled = true;
        var slug = scientificNameToSlug(getScientificNameString(currentPlantForImages));
        if (!slug) slug = 'plant-' + id;
        var existingUrls = urls.slice();
        var usedNumbers = new Set();
        existingUrls.forEach(function (u) {
            var m = (u && u.match(/-(\d+)\.(jpg|jpeg|png|gif|webp)$/i));
            if (m) { var n = parseInt(m[1], 10); if (!isNaN(n)) usedNumbers.add(n); }
        });
        var nextNum = 1;
        function getExt(file) {
            if (file.name) {
                var match = file.name.toLowerCase().match(/\.(jpe?g|png|gif|webp)$/);
                if (match) return match[1].replace('jpeg', 'jpg');
            }
            return (file.type && file.type.indexOf('png') !== -1) ? 'png' : 'jpg';
        }
        var uploads = files.map(function (file) {
            while (usedNumbers.has(nextNum)) nextNum++;
            var ext = getExt(file);
            var objectPath = 'plants/' + slug + '/' + slug + '-' + nextNum + '.' + ext;
            usedNumbers.add(nextNum);
            nextNum++;
            return uploadToStorage(file, objectPath);
        });
        Promise.all(uploads).then(function (result) {
            var uploadedUrls = Array.isArray(result) ? result.filter(function(u) { return typeof u === 'string' && u.length; }) : [];
            var existingHttp = urls.filter(isHttpUrl);
            var all = existingHttp.concat(uploadedUrls);
            if (all.length === 0 && existingHttp.length === 0 && uploadedUrls.length === 0) {
                plantImageSaveBtn.textContent = '💾 Save';
                plantImageSaveBtn.disabled = false;
                if (typeof quickAddShowToast === 'function') quickAddShowToast('Upload failed: no URLs returned.');
                return;
            }
            var updatedPlant = Object.assign({}, currentPlantForImages, { images: all, imageUrl: all.length ? all[0] : '' });
            // Generate and upload thumb.jpg for taxonomy tree (main image = thumbnail)
            if (supabase && uploadToStorage && all.length > 0 && slug) {
                generateThumbnailBlobFromUrl(all[0]).then(function (blob) {
                    var file = new File([blob], 'thumb.jpg', { type: 'image/jpeg' });
                    return uploadToStorage(file, 'plants/' + slug + '/thumb.jpg');
                }).catch(function () { /* non-fatal */ });
            }
            deleteRemovedPlantImagesFromStorage(all).then(function() {
                var catalogPromise = (supabase && window.supabaseDb && window.supabaseDb.updatePlantInCatalog)
                    ? window.supabaseDb.updatePlantInCatalog(id, updatedPlant)
                    : Promise.resolve();
                catalogPromise.then(function() {
                    applyPlantImageResult(all);
                    if (typeof updatePlantCardImage === 'function') updatePlantCardImage(id, all.length ? all[0] : null);
                }).catch(function(err) {
                    applyPlantImageResult(all);
                    if (typeof updatePlantCardImage === 'function') updatePlantCardImage(id, all.length ? all[0] : null);
                    if (typeof quickAddShowToast === 'function') quickAddShowToast('Images saved locally; catalog update failed.');
                });
            });
        }).catch(function (err) {
            plantImageSaveBtn.textContent = '💾 Save';
            plantImageSaveBtn.disabled = false;
            var msg = (err && err.message) ? err.message : 'Upload failed';
            if (typeof quickAddShowToast === 'function') quickAddShowToast(msg);
            else alert(msg);
        });
        return;
    }

    if (files.length > 0 && typeof savePlantImageFilesToFolder === 'function') {
        plantImageSaveBtn.textContent = '⏳ Saving to folder...';
        plantImageSaveBtn.disabled = true;
        savePlantImageFilesToFolder(currentPlantForImages, files).then(function(result) {
            plantImageSaveBtn.textContent = '💾 Save';
            plantImageSaveBtn.disabled = false;
            var all;
            if (result.success && result.savedPaths && result.savedPaths.length > 0) {
                all = result.savedPaths;
                var updatedPlant = Object.assign({}, currentPlantForImages, { images: all, imageUrl: all.length ? all[0] : '' });
                deleteRemovedPlantImagesFromStorage(all).then(function() {
                    applyPlantImageResult(all);
                    if (supabase && window.supabaseDb && window.supabaseDb.updatePlantInCatalog) window.supabaseDb.updatePlantInCatalog(id, updatedPlant);
                    if (typeof updatePlantCardImage === 'function') updatePlantCardImage(id, updatedPlant.imageUrl);
                });
            } else {
                var toDataUrl = (window.uploadUtils && window.uploadUtils.fileToDataUrl) || function(file) {
                    return new Promise(function(resolve, reject) {
                        var reader = new FileReader();
                        reader.onload = function(e) { resolve(e.target.result); };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                };
                Promise.all(files.map(toDataUrl)).then(function(dataUrls) {
                    all = urls.concat(dataUrls);
                    var updatedPlant = Object.assign({}, currentPlantForImages, { images: all, imageUrl: all.length ? all[0] : '' });
                    deleteRemovedPlantImagesFromStorage(all).then(function() {
                        applyPlantImageResult(all);
                        if (supabase && window.supabaseDb && window.supabaseDb.updatePlantInCatalog) window.supabaseDb.updatePlantInCatalog(id, updatedPlant);
                    });
                });
            }
        }).catch(function() {
            plantImageSaveBtn.textContent = '💾 Save';
            plantImageSaveBtn.disabled = false;
            closePlantImageModal();
        });
        return;
    }

    var toDataUrl = (window.uploadUtils && window.uploadUtils.fileToDataUrl) || function(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };
    Promise.all(files.map(toDataUrl)).then(function(dataUrls) {
        var all = urls.concat(dataUrls);
        var updatedPlant = Object.assign({}, currentPlantForImages, { images: all, imageUrl: all.length ? all[0] : '' });
        deleteRemovedPlantImagesFromStorage(all).then(function() {
            applyPlantImageResult(all);
            if (supabase && window.supabaseDb && window.supabaseDb.updatePlantInCatalog) window.supabaseDb.updatePlantInCatalog(id, updatedPlant);
        });
    }).catch(function() {
        closePlantImageModal();
    });
}

function closePlantImageModal() {
    currentPlantForImages = null;
    currentPlantImageFiles = [];
    currentPlantImageUrls = [];
    document.removeEventListener('paste', handlePlantImagePaste);
    var modal = document.getElementById('plantImageModal');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
    }
    if (window.self !== window.top) try { window.parent.postMessage({ type: 'invAddOverlayClose' }, '*'); } catch (e) {}
}

function saveEquipmentEdit() {
    if (!equipmentEditing) return;
    var nameInput = document.getElementById('equipmentEditNameInput');
    var descEl = document.getElementById('equipmentEditDescription');
    var sizeEl = document.getElementById('equipmentEditSize');
    var unitEl = document.getElementById('equipmentEditUnit');
    var priceEl = document.getElementById('equipmentEditPrice');
    var costEl = document.getElementById('equipmentEditCost');
    var stockEl = document.getElementById('equipmentEditStock');
    var reorderEl = document.getElementById('equipmentEditReorder');
    var descVal = descEl && descEl.value.trim() !== '' ? descEl.value.trim() : undefined;
    var sizeVal = sizeEl && sizeEl.value.trim() !== '' ? sizeEl.value.trim() : undefined;
    var unitVal = unitEl && unitEl.value && unitEl.value.trim() !== '' ? unitEl.value.trim() : undefined;
    var categoryEl = document.getElementById('equipmentEditCategory');
    var categoryVal = categoryEl && categoryEl.value && categoryEl.value.trim() !== '' ? categoryEl.value.trim() : undefined;
    var cost = costEl && costEl.value.trim() !== '' ? parseFloat(costEl.value) : undefined;
    var marginPctEl = document.getElementById('equipmentEditMarginPct');
    var marginPct = marginPctEl && marginPctEl.value.trim() !== '' ? parseFloat(marginPctEl.value) : NaN;
    var price;
    if (cost != null && !isNaN(cost) && !isNaN(marginPct) && marginPct < 100) {
        price = roundSellPrice(cost / (1 - marginPct / 100));
    } else {
        var priceNum = priceEl && priceEl.value.trim() !== '' ? parseFloat(priceEl.value) : NaN;
        price = !isNaN(priceNum) ? roundSellPrice(priceNum) : (equipmentEditing.price != null ? roundSellPrice(equipmentEditing.price) : undefined);
    }
    var stock = stockEl && stockEl.value.trim() !== '' ? parseFloat(stockEl.value) : 0;
    var reorder = reorderEl && reorderEl.value.trim() !== '' ? parseFloat(reorderEl.value) : undefined;
    var nameVal = (nameInput && nameInput.value && nameInput.value.trim()) ? nameInput.value.trim() : (equipmentEditing.name || 'New equipment');
    equipmentEditing.description = descVal;
    equipmentEditing.name = nameVal;
    equipmentEditing.size = sizeVal;
    equipmentEditing.unit = unitVal;
    equipmentEditing.category = categoryVal;
    equipmentEditing.price = price;
    equipmentEditing.stockQuantity = (typeof stock === 'number' && !isNaN(stock)) ? stock : 0;
    equipmentEditing.reorderLevel = (reorder != null && !isNaN(reorder)) ? reorder : undefined;
    var isNew = equipmentEditing.id == null;
    var id = equipmentEditing.id;
    var saveCatalogPromise = Promise.resolve();
    if (isNew) {
        var list = allEquipment || [];
        if (window.supabaseDb && window.supabaseDb.isConfigured() && window.supabaseDb.getNextEquipmentId) {
            saveCatalogPromise = window.supabaseDb.getNextEquipmentId().then(function(nextId) {
                id = nextId;
                equipmentEditing.id = id;
                equipmentEditing.imageUrl = equipmentEditing.imageUrl || '';
                equipmentEditing.images = Array.isArray(equipmentEditing.images) ? equipmentEditing.images : [];
                list.push(equipmentEditing);
                allEquipment = list;
                window.allEquipment = list;
                return window.supabaseDb.createEquipmentInCatalog(equipmentEditing);
            }).then(function() {
                if (typeof quickAddShowToast === 'function') quickAddShowToast('Saved to catalog. Item will appear for all visitors.');
            }).catch(function() {
                var maxId = list.length ? Math.max.apply(null, list.map(function(e) { return e.id || 0; })) : 50000;
                id = Math.max(50001, maxId + 1);
                equipmentEditing.id = id;
                equipmentEditing.imageUrl = '';
                equipmentEditing.images = [];
                list.push(equipmentEditing);
                allEquipment = list;
                window.allEquipment = list;
            });
        } else {
            var maxId = list.length ? Math.max.apply(null, list.map(function(e) { return e.id || 0; })) : 50000;
            id = Math.max(50001, maxId + 1);
            equipmentEditing.id = id;
            equipmentEditing.imageUrl = '';
            equipmentEditing.images = [];
            list.push(equipmentEditing);
            allEquipment = list;
            window.allEquipment = list;
            try {
                var custom = JSON.parse(localStorage.getItem('custom_equipment') || '[]');
                if (!Array.isArray(custom)) custom = [];
                custom.push(equipmentEditing);
                localStorage.setItem('custom_equipment', JSON.stringify(custom));
                if (typeof quickAddShowToast === 'function') quickAddShowToast('Saved in this browser only. Set up Supabase (see docs) to see it on other devices and in Supplies.');
            } catch (e) { }
        }
        if (typeof syncToRepo === 'function') syncToRepo();
    } else {
        if (window.supabaseDb && window.supabaseDb.isConfigured() && window.supabaseDb.updateEquipmentInCatalog) {
            saveCatalogPromise = window.supabaseDb.updateEquipmentInCatalog(id, equipmentEditing).then(function() {
                if (typeof quickAddShowToast === 'function') quickAddShowToast('Saved to catalog.');
            }).catch(function() {});
        }
        try {
            localStorage.setItem('equipment_' + id + '_edit', JSON.stringify({
                name: nameVal,
                description: descVal,
                size: sizeVal,
                unit: unitVal,
                category: categoryVal,
                price: price,
                costPrice: isNaN(cost) ? undefined : cost,
                quantityInStock: (typeof stock === 'number' && !isNaN(stock)) ? stock : equipmentEditing.stockQuantity,
                reorderLevel: (reorder != null && !isNaN(reorder)) ? reorder : equipmentEditing.reorderLevel
            }));
            if (typeof syncToRepo === 'function') syncToRepo();
        } catch (e) { /* ignore */ }
    }
    if (window.inventoryDb) {
        saveCatalogPromise.then(function() {
            var itemId = equipmentEditing.id != null ? equipmentEditing.id : id;
            return window.inventoryDb.setItem(itemId, {
                name: nameVal,
                description: descVal,
                size: sizeVal,
                unit: unitVal,
                category: categoryVal,
                price: price,
                costPrice: isNaN(cost) ? undefined : cost,
                quantityInStock: (typeof stock === 'number' && !isNaN(stock)) ? stock : 0,
                reorderLevel: (reorder != null && !isNaN(reorder)) ? reorder : undefined
            });
        }).then(function() {
            return window.inventoryDb.mergeInventoryIntoPlants(allEquipment || []);
        }).then(function() {
            closeEquipmentEditModal();
            if (isNew && typeof applyEquipmentFilters === 'function') applyEquipmentFilters();
            else if (typeof renderEquipmentPage === 'function') renderEquipmentPage();
            if (typeof updateQuickAddButtonsState === 'function') updateQuickAddButtonsState();
        }).catch(function() {
            closeEquipmentEditModal();
            if (isNew && typeof applyEquipmentFilters === 'function') applyEquipmentFilters();
            else if (typeof renderEquipmentPage === 'function') renderEquipmentPage();
        });
    } else {
        saveCatalogPromise.then(function() {
            closeEquipmentEditModal();
            if (isNew && typeof applyEquipmentFilters === 'function') applyEquipmentFilters();
            else if (typeof renderEquipmentPage === 'function') renderEquipmentPage();
            if (typeof updateQuickAddButtonsState === 'function') updateQuickAddButtonsState();
        });
    }
}

// Create plant card element
function createPlantCard(plant) {
    const card = document.createElement('div');
    card.className = 'plant-card' + (plant.hidden ? ' product-hidden' : '');
    card.addEventListener('click', (e) => {
        if (e.target.closest('.quick-add-wrap')) return;
        if (e.target.closest('.plant-card-icons') || e.target.closest('.card-icons') || e.target.closest('.image-edit-icon') || e.target.closest('.plant-image-icon') || e.target.closest('.card-edit-icon') || e.target.closest('.card-image-icon')) return;
        showPlantModal(plant);
    });
    
    const isHybrid = typeof isPlantHybrid === 'function' ? isPlantHybrid(plant) : /\s+(x|×)\s+/i.test(getScientificNameString(plant));
    const isCultivar = typeof isPlantCultivar === 'function' ? isPlantCultivar(plant) : false;
    const isVariety = typeof isPlantVariety === 'function' ? isPlantVariety(plant) : false;
    // Detect carnivorous plants - use explicit field from plant data
    const isCarnivorous = plant.carnivorous === true;
    
    // Detect aquatic plants
    const category = (plant.category || []).map(c => c.toLowerCase());
    const plantType = (plant.plantType || '').toLowerCase();
    const growthHabit = (plant.growthHabit || '').toLowerCase();
    const substrate = (plant.substrate || '').toLowerCase();
    const specialNeeds = (plant.specialNeeds || '').toLowerCase();
    
    const isAquatic = category.includes('aquatic') ||
                      plantType.includes('aquatic') ||
                      growthHabit === 'aquatic' ||
                      substrate.includes('aquatic') ||
                      specialNeeds === 'aquatic';
    
    
    // Calculate vivarium types using mathematical logic instead of stored AI-based types
    // OPTIMIZED: Cache vivarium types calculation (called multiple times per plant)
    let calculatedVivariumTypes = plant._cachedVivariumTypes;
    if (!calculatedVivariumTypes) {
        calculatedVivariumTypes = calculatePlantVivariumTypes(plant);
        plant._cachedVivariumTypes = calculatedVivariumTypes; // Cache for reuse
    }
    // Build badges array - include vivarium types plus special badges
    const badgeArray = [];
    
    // Add vivarium type badges
    calculatedVivariumTypes.forEach(v => {
        const displayName = String(v).split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        const cls = String(v).toLowerCase().replace(/\s+/g,'-');
        badgeArray.push(`<span class="badge ${cls}">${displayName}</span>`);
    });
    
    // Add special badges (cultivar, hybrid, carnivorous, aquatic) to the badges div
    if (isCultivar) {
        badgeArray.push(`<span class="badge cultivar">Cultivar</span>`);
    }
    if (isVariety) {
        badgeArray.push(`<span class="badge variety">Variety</span>`);
    }
    if (isHybrid) {
        badgeArray.push(`<span class="badge hybrid">Hybrid</span>`);
    }
    if (isCarnivorous) {
        badgeArray.push(`<span class="badge carnivorous">Carnivorous</span>`);
    }
    if (isAquatic) {
        badgeArray.push(`<span class="badge aquatic">Aquatic</span>`);
    }
    
    const badges = badgeArray.join('');
    
    // Ensure imageUrl exists - use first image from images array if available
    // Priority: imageUrl > images[0] > slug-1.jpg > placeholder
    let displayImageUrl = plant.imageUrl;
    
    // Only use if it exists and is not empty
    if (!displayImageUrl || !displayImageUrl.trim()) {
        displayImageUrl = null;
    }
    
    // If no imageUrl but images array exists, use first image (if any)
    if (!displayImageUrl && plant.images && plant.images.length > 0) {
        displayImageUrl = plant.images[0];
        plant.imageUrl = displayImageUrl;
    }
    // As a final fallback, optimistically point to slug-1.jpg inside the plant's folder.
    // If the file doesn't exist, handleImageError will replace it with a placeholder.
    if (!displayImageUrl) {
        const slug = scientificNameToSlug(getScientificNameString(plant));
        if (slug) displayImageUrl = `images/plants/${slug}/${slug}-1.jpg`;
    }
    // Normalize legacy paths (images/slug/ -> images/plants/slug/) so cards show after move
    if (displayImageUrl && imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') {
        displayImageUrl = imageUtils.normalizePlantImagePath(displayImageUrl);
    }
    // If Supabase is not configured and this is a Supabase URL, clear it so handleImageError
    // falls back to the placeholder — same behaviour for every plant.
    if (displayImageUrl && /supabase\.co\/storage\//i.test(displayImageUrl) && !window.SUPABASE_URL) {
        displayImageUrl = null;
    }
    // Use resized thumbnail for card (much faster on mobile)
    var cardImgSrc = displayImageUrl && typeof getCardThumbUrl === 'function'
        ? getCardThumbUrl(displayImageUrl, getCardThumbWidth())
        : displayImageUrl;
    var cardImgSrcset = displayImageUrl && typeof getCardThumbSrcset === 'function'
        ? getCardThumbSrcset(displayImageUrl)
        : '';
    var cardImgSizes = cardImgSrcset && typeof getCardThumbSizes === 'function' ? getCardThumbSizes() : '';
    // Create a unique identifier for this card to help with updates
    card.dataset.plantId = plant.id;
    
    // Add hybrid class if it's a hybrid
    if (isHybrid) {
        card.classList.add('hybrid-plant');
    }
    
    // Add carnivorous class if it's carnivorous
    if (isCarnivorous) {
        card.classList.add('carnivorous-plant');
    }
    
    // Add aquatic class if it's aquatic
    if (isAquatic) {
        card.classList.add('aquatic-plant');
    }
    
    card.innerHTML = `
        <div class="plant-image-container" data-plant-id="${plant.id}">
            ${isCarnivorous ? `
                <div class="carnivorous-icon" title="Carnivorous Plant">
                    <img src="images/carnivorous-icon.png" alt="Carnivorous" />
                </div>
            ` : ''}
            ${cardImgSrc ?
                `<img src="${cardImgSrc}"${cardImgSrcset ? ` srcset="${cardImgSrcset}" sizes="${cardImgSizes}"` : ''} alt="${plant.name}" class="plant-image" loading="lazy" decoding="async" onerror="this.onerror=null; handleImageError(this, ${plant.id})" data-plant-id="${plant.id}">` :
                `<div class="image-placeholder">${PLACEHOLDER_PLANT_SVG}</div>`
            }
            <div class="card-icons plant-card-icons">
                <button type="button" class="card-edit-icon image-edit-icon" title="Edit details" aria-label="Edit details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button type="button" class="card-image-icon plant-image-icon" title="Add or edit images" aria-label="Add or edit images">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                </button>
            </div>
            <div class="care-card-icon" onclick="event.stopPropagation(); generateCareCard(${plant.id})" title="Generate printable care card">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9V2h12v7"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <path d="M6 14h12v8H6z"/>
                </svg>
            </div>
            <div class="card-price">${formatPlantPrice(plant)}</div>
        </div>
        <div class="plant-info">
            <div class="plant-name">${plant.name}</div>
            <div class="plant-scientific">${getScientificNameString(plant)}</div>
            <div class="card-rating" data-product-type="plant" data-product-id="${plant.id}" aria-label="Average rating">—</div>
            <div class="plant-badges">${badges}</div>
        </div>
        <div class="card-add-wrap">${getQuickAddHtml(plant, {
                cartQuantity: getCartQuantityForItem(plant.id),
                unit: plant.unit,
                maxedClass: getAvailableToAdd(plant.id) === 0,
                disabled: typeof plant.stockQuantity === 'number' && plant.stockQuantity <= 0
            })}</div>
    `;
    const editBtn = card.querySelector('.card-edit-icon, .image-edit-icon');
    if (editBtn) {
        editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            openImageUpload(plant.id);
        });
    }
    const plantImageBtn = card.querySelector('.card-image-icon, .plant-image-icon');
    if (plantImageBtn) {
        plantImageBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            openPlantImageUpload(plant);
        });
    }
    return card;
}

// Helper function to determine minimum enclosure size based on plant characteristics
// Moved outside showPlantModal so it can be used in filtering
function determineMinimumEnclosureSize(plant) {
    const size = (plant.size || '').toLowerCase();
    
    // Enclosure size definitions (0-100% scale)
    const enclosureSizes = {
        'tiny': { min: 0, max: 16.67, height: '0-5 cm' },
        'small': { min: 16.67, max: 33.33, height: '5-15 cm' },
        'medium': { min: 33.33, max: 50, height: '15-30 cm' },
        'large': { min: 50, max: 66.67, height: '30-60 cm' },
        'xlarge': { min: 66.67, max: 90, height: '60-180 cm' },
        'open': { min: 90, max: 100, height: '180+ cm' }
    };
    
    // Substrate takes 30% of enclosure height, leaving 70% usable space
    const SUBSTRATE_PERCENTAGE = 0.30;
    const USABLE_HEIGHT_PERCENTAGE = 0.70;
    
    // Calculate padding: 20% of plant size, minimum 2 cm
    function calculatePadding(plantSize) {
        return Math.max(plantSize * 0.20, 2);
    }
    
    // Helper function to determine enclosure size category from required enclosure height in cm
    function getEnclosureCategory(requiredEnclosureHeightCm) {
        if (requiredEnclosureHeightCm <= 5) return 'tiny';
        if (requiredEnclosureHeightCm > 5 && requiredEnclosureHeightCm <= 15) return 'small';
        if (requiredEnclosureHeightCm > 15 && requiredEnclosureHeightCm <= 30) return 'medium';
        if (requiredEnclosureHeightCm > 30 && requiredEnclosureHeightCm <= 60) return 'large';
        if (requiredEnclosureHeightCm > 60 && requiredEnclosureHeightCm <= 180) return 'xlarge';
        if (requiredEnclosureHeightCm > 180) return 'open';
        return 'small'; // default
    }
    
    // Extract size range from size string - use only juvenile (minimum) size for enclosure calculation
    if (size.includes('cm') && size.match(/[\d.]+/)) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            const juvenileSize = parseFloat(numbers[0]); // Only use minimum (juvenile) size
            
            // Calculate padding space (20% of plant size)
            const padding = calculatePadding(juvenileSize);
            
            // Calculate required enclosure height: (plant height / usable height percentage) + padding
            // Since substrate takes 30%, we need: (plantHeight / 0.7) + padding
            const requiredEnclosureHeight = (juvenileSize / USABLE_HEIGHT_PERCENTAGE) + padding;
            
            // Determine enclosure size based on calculated required height
            const enclosureCategory = getEnclosureCategory(requiredEnclosureHeight);
            
            return {
                minSize: enclosureCategory,
                maxSize: enclosureCategory,
                size: enclosureCategory,
                ...enclosureSizes[enclosureCategory]
            };
        }
    }
    
    // Handle meters if present - use only juvenile (minimum) size
    if (size.includes('m') && size.match(/[\d.]+/)) {
        const numbers = size.match(/[\d.]+/g);
        if (numbers && numbers.length > 0) {
            const juvenileSize = parseFloat(numbers[0]) * 100; // Convert to cm, use only minimum
            
            // Calculate padding space (20% of plant size)
            const padding = calculatePadding(juvenileSize);
            
            // Calculate required enclosure height: (plant height / usable height percentage) + padding
            const requiredEnclosureHeight = (juvenileSize / USABLE_HEIGHT_PERCENTAGE) + padding;
            
            // Determine enclosure size based on calculated required height
            const enclosureCategory = getEnclosureCategory(requiredEnclosureHeight);
            
            return {
                minSize: enclosureCategory,
                maxSize: enclosureCategory,
                size: enclosureCategory,
                ...enclosureSizes[enclosureCategory]
            };
        }
    }
    
    // Default to small if size cannot be determined
    return { 
        minSize: 'small', 
        maxSize: 'small', 
        size: 'small', 
        ...enclosureSizes.small 
    };
}

/** Fetch full plant blob when list payload was slim (missing gallery / description). */
async function hydratePlantFromCatalog(plant) {
    if (!plant || !plant._catalogSlim) return plant;
    if (!window.supabaseDb || typeof window.supabaseDb.getPlantFromCatalog !== 'function') return plant;
    try {
        var full = await window.supabaseDb.getPlantFromCatalog(plant.id);
        if (!full) return plant;
        var keepPrice = plant.price;
        var keepStock = plant.stockQuantity;
        var keepUnit = plant.unit;
        Object.keys(full).forEach(function (k) { plant[k] = full[k]; });
        if (keepPrice != null && keepPrice !== '') plant.price = keepPrice;
        if (keepStock != null && keepStock !== '') plant.stockQuantity = keepStock;
        if (keepUnit != null && keepUnit !== '') plant.unit = keepUnit;
        delete plant._catalogSlim;
        if (window.inventoryDb && typeof window.inventoryDb.mergeInventoryIntoPlants === 'function') {
            window.inventoryDb.mergeInventoryIntoPlants([plant]);
        }
    } catch (e) { /* keep slim plant */ }
    return plant;
}
window.hydratePlantFromCatalog = hydratePlantFromCatalog;

var DETAIL_EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
var DETAIL_IMAGE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
var DETAIL_STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
var DETAIL_EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
var DETAIL_EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

function detailHideButtonHtml(isHidden, showText, hideText) {
    var icon = isHidden ? DETAIL_EYE_SVG : DETAIL_EYE_OFF_SVG;
    var label = isHidden ? (showText || 'Show in shop') : (hideText || 'Hide from shoppers');
    return icon + '<span>' + label + '</span>';
}

/** Build staff "Manage" control panel (Edit / Image / optional Set as main / Hide). */
function createDetailControlPanel(options) {
    options = options || {};
    var panel = document.createElement('div');
    panel.className = 'detail-control-panel detail-actions detail-actions-fixed';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Staff controls');
    var label = document.createElement('span');
    label.className = 'detail-control-panel-label';
    label.textContent = 'Manage';
    var actions = document.createElement('div');
    actions.className = 'detail-control-panel-actions';
    actions.innerHTML = options.buttonsHtml || '';
    if (options.setMainPlantId != null) {
        var setMainBtn = document.createElement('button');
        setMainBtn.type = 'button';
        setMainBtn.className = 'detail-btn plant-detail-set-main gallery-view-only';
        setMainBtn.title = 'Set the currently previewed gallery image as the main photo';
        setMainBtn.setAttribute('aria-label', 'Set as main image');
        setMainBtn.setAttribute('data-gallery-only', 'true');
        setMainBtn.innerHTML = DETAIL_STAR_SVG + '<span>Set as main</span>';
        setMainBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof setAsMainImageFromPreview === 'function') setAsMainImageFromPreview(options.setMainPlantId);
        });
        actions.appendChild(setMainBtn);
    }
    if (options.hideConfig) {
        var hc = options.hideConfig;
        var hideBtn = document.createElement('button');
        hideBtn.type = 'button';
        hideBtn.className = 'detail-btn detail-hide ' + (hc.className || '');
        hideBtn.title = hc.isHidden ? hc.showTitle : hc.hideTitle;
        hideBtn.setAttribute('aria-label', hc.isHidden ? hc.showLabel : hc.hideLabel);
        hideBtn.innerHTML = detailHideButtonHtml(!!hc.isHidden, hc.showText, hc.hideText);
        hideBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof hc.onToggle === 'function') hc.onToggle(hideBtn);
        });
        actions.appendChild(hideBtn);
    }
    // Keep manage clicks from bubbling into the gallery/card
    actions.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.detail-btn')) e.stopPropagation();
    });
    panel.appendChild(label);
    panel.appendChild(actions);
    return panel;
}

/**
 * Place control panel as the right rail of the gallery row when present,
 * and mirror a linked clone (without Set as main) on the details page.
 */
function mountDetailControlPanel(modalBody, panel) {
    if (!modalBody || !panel) return;
    var page1 = modalBody.querySelector('#modal-page-1');
    var gallery = modalBody.querySelector('.plant-gallery-modern');

    function wireClonedPanel(clone) {
        var edit = clone.querySelector('.card-edit-icon, .plant-detail-edit, .vivarium-detail-edit');
        var image = clone.querySelector('.card-image-icon, .plant-detail-image, .vivarium-detail-image');
        var hide = clone.querySelector('.detail-hide');
        var care = clone.querySelector('.vivarium-detail-care-card');
        var srcEdit = panel.querySelector('.card-edit-icon, .plant-detail-edit, .vivarium-detail-edit');
        var srcImage = panel.querySelector('.card-image-icon, .plant-detail-image, .vivarium-detail-image');
        var srcHide = panel.querySelector('.detail-hide');
        var srcCare = panel.querySelector('.vivarium-detail-care-card');
        if (edit && srcEdit) edit.addEventListener('click', function () { srcEdit.click(); });
        if (image && srcImage) image.addEventListener('click', function () { srcImage.click(); });
        if (care && srcCare) care.addEventListener('click', function () { srcCare.click(); });
        if (hide && srcHide) hide.addEventListener('click', function () {
            srcHide.click();
            hide.title = srcHide.title;
            hide.setAttribute('aria-label', srcHide.getAttribute('aria-label') || '');
            hide.innerHTML = srcHide.innerHTML;
        });
    }

    if (gallery) {
        var mainRow = gallery.querySelector('.plant-gallery-main-row');
        if (mainRow) mainRow.appendChild(panel);
        else {
            var header = gallery.querySelector('.plant-gallery-header');
            if (header) header.insertAdjacentElement('afterend', panel);
            else gallery.insertBefore(panel, gallery.firstChild);
        }
        if (page1) {
            var clone = panel.cloneNode(true);
            clone.classList.add('detail-control-panel-page1');
            clone.querySelectorAll('.gallery-view-only, [data-gallery-only="true"]').forEach(function (el) {
                el.remove();
            });
            page1.insertBefore(clone, page1.firstChild);
            wireClonedPanel(clone);
        }
        return;
    }
    if (page1) {
        page1.insertBefore(panel, page1.firstChild);
        return;
    }
    modalBody.insertBefore(panel, modalBody.firstChild);
}

// Show plant modal with detailed information
async function showPlantModal(plant) {
    // If we arrived via direct URL (tab=plants&id=...), remove startup-hiding class
    if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('detail-startup');
    }
    await hydratePlantFromCatalog(plant);
    // Check localStorage first for saved image order (user's preference)
    let savedImages = null;
    let savedImageUrl = null;
    try {
        const savedImagesStr = localStorage.getItem(`plant_${plant.id}_images`);
        const savedImageUrlStr = localStorage.getItem(`plant_${plant.id}_imageUrl`);
        if (savedImagesStr) {
            savedImages = JSON.parse(savedImagesStr);
            savedImageUrl = savedImageUrlStr;
        }
    } catch (e) {
        // Silent - localStorage parsing failed
    }
    
    // Single source: when Supabase is configured, use only catalog (loaded from Supabase). No localStorage or file discovery.
    var useSupabaseOnly = !!(typeof window !== 'undefined' && window.SUPABASE_URL);
    if (useSupabaseOnly) {
        plant.imageUrl = (plant.images && plant.images.length > 0) ? (plant.imageUrl || plant.images[0]) : (plant.imageUrl || null);
        if (!(Array.isArray(plant.images) && plant.images.length > 0)) plant.images = plant.images || [];
    } else {
        let discovered = await getPlantImages(plant);
        var catalogImageCount = Array.isArray(plant.images) ? plant.images.length : 0;
        if (catalogImageCount > 0) {
            plant.imageUrl = plant.imageUrl || (plant.images && plant.images[0]) || null;
        } else if (discovered.images && discovered.images.length > 0) {
            plant.images = discovered.images;
            plant.imageUrl = discovered.imageUrl || discovered.images[0];
        } else if (savedImages && Array.isArray(savedImages) && savedImages.length > 0) {
            plant.images = savedImages;
            plant.imageUrl = savedImageUrl || savedImages[0];
        } else {
            plant.images = plant.images || [];
            plant.imageUrl = plant.imageUrl || (plant.images && plant.images[0]) || null;
        }
    }
    
    // Ensure no duplicates
    if (plant.images && plant.images.length > 0) {
        plant.images = ensureUniqueImages(plant.images);
    }
    
    // Build candidate list for background gallery expansion (slug-1..20); do NOT await — modal opens instantly
    var _galleryExpansionCandidates = null;
    if (plant.images && plant.images.length >= 1 && typeof window !== 'undefined' && window.SUPABASE_URL) {
        var _firstImg = plant.images[0];
        if (typeof _firstImg === 'string' && _firstImg.length > 0) {
            var _cleanFirst = _firstImg.split('?')[0].split('#')[0];
            var _plantsPath = '/plants/';
            var _idxPl = _cleanFirst.toLowerCase().indexOf(_plantsPath);
            if (_idxPl !== -1) {
                var _afterPlants = _cleanFirst.substring(_idxPl + _plantsPath.length);
                var _segs = _afterPlants.split('/').filter(Boolean);
                if (_segs.length >= 1) {
                    var _slug = _segs[0];
                    var _prefix = _cleanFirst.substring(0, _idxPl + _plantsPath.length);
                    var _ext = 'jpg';
                    var _extM = _cleanFirst.match(/\.(jpg|jpeg|png|gif|webp)(?:\?|#|$)/i);
                    if (_extM) _ext = _extM[1].toLowerCase().replace('jpeg', 'jpg');
                    var _basePath = _prefix + _slug;
                    var _candidates = plant.images.slice();
                    for (var _ci = _candidates.length + 1; _ci <= 20; _ci++) {
                        _candidates.push(_basePath + '/' + _slug + '-' + _ci + '.' + _ext);
                    }
                    if (_candidates.length > plant.images.length) {
                        _galleryExpansionCandidates = { plantId: plant.id, candidates: _candidates };
                    }
                }
            }
        }
    }
    
    // Set display image (normalize legacy paths for plants folder)
    let displayImageUrl = plant.imageUrl || (plant.images && plant.images.length > 0 ? plant.images[0] : null);
    if (displayImageUrl && imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') {
        displayImageUrl = imageUtils.normalizePlantImagePath(displayImageUrl);
    }
    
    // Helper function to create enclosure size scale visualization
    function createEnclosureSizeScale(plant) {
        const enclosureRange = determineMinimumEnclosureSize(plant);
        const sizes = ['tiny', 'small', 'medium', 'large', 'xlarge', 'open'];
        const sizeLabels = {
            'tiny': { label: 'Tiny', height: '0-5 cm' },
            'small': { label: 'Small', height: '5-15 cm' },
            'medium': { label: 'Medium', height: '15-30 cm' },
            'large': { label: 'Large', height: '30-60 cm' },
            'xlarge': { label: 'X-Large', height: '60-180 cm' },
            'open': { label: 'Open', height: '180+ cm' }
        };
        
        // Find the indices of the min and max enclosure sizes
        const minIndex = sizes.indexOf(enclosureRange.minSize);
        const maxIndex = sizes.indexOf(enclosureRange.maxSize);
        
        // Generate scale segments
        let scaleHTML = '<div class="enclosure-size-scale">';
        scaleHTML += '<div class="enclosure-size-track">';
        
        sizes.forEach((size, index) => {
            // Highlight if this size is within the range (inclusive)
            const isInRange = index >= minIndex && index <= maxIndex;
            const sizeInfo = sizeLabels[size];
            
            scaleHTML += `
                <div class="enclosure-size-segment ${isInRange ? 'minimum' : ''}">
                    <div class="enclosure-size-label">${sizeInfo.label}</div>
                    <div class="enclosure-size-height">${sizeInfo.height}</div>
                </div>
            `;
        });
        
        scaleHTML += '</div></div>';
        
        return scaleHTML;
    }
    
    // Helper function to create a requirement scale visualization
    // Fixed global scale (same for all plants); shows this plant's threshold range (local min–max) and ideal marker on that scale
    function createRequirementScale(label, range) {
        if (!range || range.min === undefined || range.max === undefined) {
            return `
                <div class="info-item">
                    <div class="info-item-label">${label}</div>
                    <div class="info-item-value">N/A</div>
                </div>`;
        }
        
        const min = Number(range.min);
        const max = Number(range.max);
        const ideal = range.ideal !== undefined ? Number(range.ideal) : (min + max) / 2;
        
        // Global scale: 0–100 for percentage-based; positions are % of this fixed scale
        const minPct = Math.max(0, Math.min(100, min));
        const maxPct = Math.max(0, Math.min(100, max));
        const idealPct = Math.max(0, Math.min(100, ideal));
        
        let tickMarks = '';
        for (let i = 0; i <= 100; i += 10) {
            tickMarks += `<div class="requirement-scale-tick" style="left: ${i}%;"></div>`;
        }
        
        // Global scale labels (fixed for all plants)
        let leftLabel = '0%';
        let rightLabel = '100%';
        let idealLabel = '';
        
        if (label === 'Temperature') {
            leftLabel = '0°C';
            rightLabel = '50°C';
            idealLabel = ((ideal / 100) * 50).toFixed(0) + '°C';
        } else if (label === 'Difficulty Level') {
            leftLabel = 'Easy';
            rightLabel = 'Hard';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Soil pH' || label === 'Water pH') {
            leftLabel = 'pH 0';
            rightLabel = 'pH 14';
            idealLabel = ((ideal / 100) * 14).toFixed(1);
        } else if (label === 'Water Circulation') {
            leftLabel = 'Still';
            rightLabel = 'Strong Current';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Water Temperature') {
            leftLabel = '0°C';
            rightLabel = '50°C';
            idealLabel = ((ideal / 100) * 50).toFixed(0) + '°C';
        } else if (label === 'Water Hardness') {
            leftLabel = '0 dGH';
            rightLabel = '30 dGH';
            idealLabel = ((ideal / 100) * 30).toFixed(1) + ' dGH';
        } else if (label === 'Salinity') {
            leftLabel = 'Fresh';
            rightLabel = 'Marine';
            const idealSal = (ideal / 100) * 40;
            idealLabel = ideal <= 5 ? 'Fresh' : idealSal.toFixed(1) + ' ppt';
        } else if (label === 'Light' || label === 'Light Requirements') {
            leftLabel = 'Darkness';
            rightLabel = 'Direct Sunlight';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Air Circulation') {
            leftLabel = 'Still';
            rightLabel = 'Constant Flow';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Watering' || label === 'Water Needs') {
            leftLabel = 'Drought';
            rightLabel = 'Moist';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Growth Rate') {
            leftLabel = 'Very Slow';
            rightLabel = 'Very Fast';
            idealLabel = ideal.toFixed(0) + '%';
        } else {
            idealLabel = ideal.toFixed(0) + '%';
        }
        
        return `
            <div class="info-item requirement-scale-item">
                <div class="info-item-label">${label}</div>
                <div class="requirement-scale-container">
                    <div class="requirement-scale-track">
                        ${tickMarks}
                        <div class="requirement-scale-range" style="left: ${minPct}%; width: ${maxPct - minPct}%;"></div>
                        <div class="requirement-scale-ideal" style="left: ${idealPct}%;">
                            <span class="requirement-scale-ideal-label">${idealLabel}</span>
                        </div>
                    </div>
                    <div class="requirement-scale-labels">
                        <span class="requirement-scale-value">${leftLabel}</span>
                        <span class="requirement-scale-value">${rightLabel}</span>
                    </div>
                </div>
            </div>`;
    }
    
    // Get plant inputs for scales
    const plantInputs = mapPlantToInputs(plant);
    // Use canonical plant from DB for text fields so description/careTips are never missing
    const plantForText = (typeof window !== 'undefined' && window.plantsDatabase) ? (window.plantsDatabase.find(p => p.id === plant.id) || plant) : plant;
    const descRaw = plantForText && (plantForText.description != null) ? String(plantForText.description).trim() : '';
    const descriptionHtml = descRaw ? '<p class="description">' + escapeHtml(descRaw) + '</p>' : '<p class="description description-empty">No description available.</p>';
    const careTipsListHtml = (plantForText && Array.isArray(plantForText.careTips) ? plantForText.careTips : [])
        .map(tip => '<li style="margin-bottom: 0.3rem;">' + escapeHtml(tip) + '</li>').join('');
    
    modalBody.innerHTML = `
        <!-- Page 1: Product information layout -->
        <div id="modal-page-1" class="modal-page active plant-product-page">
            <div class="plant-product-hero">
                <div class="plant-product-gallery" onclick="switchModalPage(2, ${plant.id})" role="button" tabindex="0">
                    ${displayImageUrl ? 
                        `<img src="${displayImageUrl}" alt="${plant.name}" class="plant-product-image" onerror="this.style.display='none'">` :
                        `<div class="plant-product-image-placeholder">🌿</div>`
                    }
                    <span class="plant-product-gallery-hint">View gallery</span>
                </div>
                <div class="plant-product-meta">
                    <h1 class="plant-product-name">${escapeHtml(plant.name)}</h1>
                    <p class="plant-product-scientific">${escapeHtml(getScientificNameString(plant))}</p>
                    ${(() => {
                        if (!plant.commonNames || !Array.isArray(plant.commonNames) || plant.commonNames.length === 0) return '';
                        const processedNames = []; const seen = new Set();
                        for (const name of plant.commonNames) {
                            if (!name || typeof name !== 'string') continue;
                            const parts = name.split(/\s+or\s+/i);
                            for (let part of parts) {
                                part = part.trim();
                                if (!part) continue;
                                const lowerPart = part.toLowerCase();
                                if (!seen.has(lowerPart)) { seen.add(lowerPart); processedNames.push(part); }
                            }
                        }
                        const filteredNames = processedNames.filter(n => 
                            n.toLowerCase() !== plant.name.toLowerCase() && n.toLowerCase() !== getScientificNameString(plant).toLowerCase()
                        );
                        return filteredNames.length > 0 ? `<p class="plant-product-common">${filteredNames.map(n => escapeHtml(n)).join(', ')}</p>` : '';
                    })()}
                    <div class="plant-product-badges">
                        ${(() => {
                            const calculatedTypes = calculatePlantVivariumTypes(plant);
                            let html = calculatedTypes.map(v => {
                                const displayName = String(v).split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                                return `<span class="badge ${String(v).toLowerCase().replace(/\s+/g,'-')}">${displayName}</span>`;
                            }).join('');
                            if (typeof isPlantCultivar === 'function' && isPlantCultivar(plant)) html += '<span class="badge cultivar">Cultivar</span>';
                            if (typeof isPlantVariety === 'function' && isPlantVariety(plant)) html += '<span class="badge variety">Variety</span>';
                            if (typeof isPlantHybrid === 'function' && isPlantHybrid(plant)) html += '<span class="badge hybrid">Hybrid</span>';
                            return html;
                        })()}
                    </div>
                    <div class="plant-product-enclosure">
                        <span class="plant-product-label">Minimum enclosure height</span>
                        ${createEnclosureSizeScale(plant)}
                    </div>
                    <div class="plant-product-shop">
                        <div class="plant-product-price">${formatPlantPrice(plant)}</div>
                        ${(() => {
                            const stock = plant.stockQuantity;
                            if (typeof stock !== 'number') return '<div class="plant-product-stock plant-product-stock-untracked">Stock not tracked</div>';
                            const reorder = plant.reorderLevel != null ? plant.reorderLevel : 0;
                            let status = 'ok', label = 'In stock: ' + stock;
                            if (stock <= 0) { status = 'out'; label = 'Out of stock'; }
                            else if (stock <= reorder) { status = 'low'; label = 'Low stock: ' + stock; }
                            return '<div class="plant-product-stock plant-product-stock-' + status + '">' + label + '</div>';
                        })()}
                        <label for="modalCartQty" class="plant-product-label">Quantity${plant.unit ? ' (' + escapeHtml(plant.unit) + ')' : ''}</label>
                        <input type="number" id="modalCartQty" class="plant-product-qty"
                            value="${(typeof plant.stockQuantity === 'number' && plant.stockQuantity <= 0) ? '0' : (isIntegerUnitQuickAdd(plant.unit) ? '1' : '0.1')}"
                            min="${(typeof plant.stockQuantity === 'number' && plant.stockQuantity <= 0) ? '0' : (isIntegerUnitQuickAdd(plant.unit) ? '1' : '0.001')}"
                            max="${(typeof plant.stockQuantity === 'number' && plant.stockQuantity >= 0) ? plant.stockQuantity : 999}"
                            step="${isIntegerUnitQuickAdd(plant.unit) ? '1' : '0.001'}"
                            aria-label="Quantity"
                            ${typeof plant.stockQuantity === 'number' && plant.stockQuantity <= 0 ? 'disabled' : ''}>
                        <button type="button" class="plant-product-add-cart btn-add-to-cart" data-plant-id="${plant.id}" ${typeof plant.stockQuantity === 'number' && plant.stockQuantity <= 0 ? 'disabled' : ''}>Add to cart</button>
                    </div>
                </div>
            </div>
            <section class="plant-product-section">
                <h2 class="plant-product-section-title">Description</h2>
                <div class="plant-detail-description">${descriptionHtml}</div>
            </section>
            <section class="plant-product-section">
                <h2 class="plant-product-section-title">Care tips</h2>
                <ul class="plant-product-care-list">${careTipsListHtml}</ul>
            </section>
            <section class="plant-product-section plant-product-section-info">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                    <h2 class="plant-product-section-title" style="margin: 0;">Plant information</h2>
                    <a href="definitions.html" class="plant-product-definitions-link">Definitions</a>
                </div>
                <!-- Group 1: Plant Details -->
                <div class="info-group">
                    <h4 class="info-group-title">Plant details</h4>
                    <div class="info-grid">
                        ${(() => {
                            const rows = [];
                            const addRow = (label, value) => {
                                if (value !== undefined && value !== null && String(value).trim() !== '') {
                                    rows.push(`
                        <div class="info-item">
                            <div class="info-item-label">${label}</div>
                            <div class="info-item-value">${value}</div>
                        </div>`);
                                }
                            };
                            const classification = (() => {
                                if (typeof isPlantCultivar === 'function' && isPlantCultivar(plant)) return 'Cultivar';
                                if (typeof isPlantVariety === 'function' && isPlantVariety(plant)) return 'Variety';
                                if (typeof isPlantHybrid === 'function' && isPlantHybrid(plant)) {
                                    if (typeof isIntergenericHybrid === 'function' && isIntergenericHybrid(plant)) return 'Hybrid (intergeneric)';
                                    if (typeof isInterspecificHybrid === 'function' && isInterspecificHybrid(plant)) return 'Hybrid (interspecific)';
                                    return 'Hybrid';
                                }
                                return 'Species';
                            })();
                            addRow('Classification', classification);
                            if (typeof isPlantHybrid === 'function' && isPlantHybrid(plant) && typeof getHybridParentNames === 'function') {
                                const parents = getHybridParentNames(plant);
                                if (parents && parents.length >= 2) {
                                    addRow('Parent 1', parents[0]);
                                    addRow('Parent 2', parents[1]);
                                }
                            }
                            addRow('Plant Type', plant.plantType);
                            addRow('Size', plant.size);
                            addRow('Substrate', plant.substrate);
                            addRow('Rarity', formatRarityLabel(plant.rarity));
                            addRow('Hazard', plant.hazard);
                            addRow('Flowering Period', plant.floweringPeriod);
                            addRow('Colors', plant.colors);
                            addRow('Natural Habitat', plant.growthHabit);
                            addRow('Growth Pattern', plant.growthPattern);
                            addRow('Propagation', plant.propagation);
                            return rows.join('');
                        })()}
                    </div>
                </div>
                
                <!-- Group 3: Requirements Details -->
                <div class="info-group">
                    <h4 class="info-group-title">Requirements</h4>
                    <div class="info-grid">
                        ${createRequirementScale(
                            'Difficulty Level',
                            plantInputs.difficultyRange
                        )}
                        ${createRequirementScale(
                            'Light Requirements',
                            plantInputs.lightRange || plant.lightRange
                        )}
                        ${createRequirementScale(
                            'Humidity',
                            plantInputs.humidityRange || plant.humidityRange
                        )}
                        ${createRequirementScale(
                            'Temperature',
                            plantInputs.temperatureRange
                        )}
                        ${createRequirementScale(
                            'Air Circulation',
                            plantInputs.airCirculationRange || plant.airCirculationRange
                        )}
                        ${createRequirementScale(
                            'Watering',
                            plantInputs.waterNeedsRange || plant.waterNeedsRange
                        )}
                        ${createRequirementScale(
                            'Growth Rate',
                            plantInputs.growthRateRange || plant.growthRateRange
                        )}
                        ${plantInputs.soilPhRange ? createRequirementScale(
                            'Soil pH',
                            plantInputs.soilPhRange
                        ) : ''}
                    </div>
                </div>
                
                ${(plantInputs.substrate === 'aquatic' || plantInputs.specialNeeds === 'aquatic' || plant.substrateType === 'aquatic') && (plantInputs.waterPhRange || plantInputs.waterCirculationRange || plantInputs.waterHardnessRange || plantInputs.salinityRange || plantInputs.waterTemperatureRange || plant.waterCirculationRange || plant.waterPhRange || plant.waterHardnessRange || plant.salinityRange || plant.waterTemperatureRange) ? `
                <!-- Group 4: Submerged Details (for aquatic plants) -->
                <div class="info-group submerged-details">
                    <h4 class="info-group-title">Submerged Details</h4>
                    <div class="info-grid">
                        ${createRequirementScale(
                            'Water Temperature',
                            plantInputs.waterTemperatureRange
                        )}
                        ${createRequirementScale(
                            'Water pH',
                            plantInputs.waterPhRange || plant.waterPhRange
                        )}
                        ${createRequirementScale(
                            'Water Hardness',
                            plantInputs.waterHardnessRange || plant.waterHardnessRange
                        )}
                        ${createRequirementScale(
                            'Salinity',
                            plantInputs.salinityRange || plant.salinityRange
                        )}
                        ${createRequirementScale(
                            'Water Circulation',
                            plantInputs.waterCirculationRange || plant.waterCirculationRange
                        )}
                    </div>
                </div>
                ` : ''}
                
                ${(() => {
                    // Check if there are any safety concerns
                    const isToxic = plant.toxicity && plant.toxicity.toLowerCase().includes('toxic');
                    const hasPoisonHazard = plant.poisonHazard && plant.poisonHazard !== 'None' && plant.poisonHazard.toLowerCase() !== 'none';
                    const hasAllergyConcern = plant.allergiesPotential && (
                        plant.allergiesPotential.toLowerCase().includes('moderate') || 
                        plant.allergiesPotential.toLowerCase().includes('high')
                    );
                    const hasSafetyConcerns = isToxic || hasPoisonHazard || hasAllergyConcern;
                    
                    if (!hasSafetyConcerns) return '';
                    
                    // Build safety concerns text
                    const concerns = [];
                    if (isToxic) concerns.push(`Toxic: ${plant.toxicity}`);
                    if (hasPoisonHazard) concerns.push(`Poison Hazard: ${plant.poisonHazard}`);
                    if (hasAllergyConcern) concerns.push(`Allergies: ${plant.allergiesPotential}`);
                    
                    return `
                    <div class="info-item safety-info-item" style="grid-column: 1 / -1; margin-top: 1rem;">
                        <div class="info-item-label">⚠️ Safety</div>
                        <div class="info-item-value">${concerns.map(c => escapeHtml(c)).join(' • ')}</div>
                    </div>
                    `;
                })()}
            </section>

            ${plant.taxonomy ? `
            <section class="plant-product-section">
                <h2 class="plant-product-section-title">Scientific classification</h2>
                ${plant.taxonomyLink ? `
                    <p style="margin-bottom: 0.75rem; font-size: 0.9rem;">
                        <a href="${plant.taxonomyLink}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-color); text-decoration: none;">
                            🔗 View full taxonomy on Open Tree of Life →
                        </a>
                    </p>
                ` : ''}
                <div class="taxonomy-hierarchy" id="taxonomy-hierarchy-${plant.id}">
                    ${(() => {
                        // Define hierarchical order from largest (top) to most specific (bottom)
                        const hierarchy = [
                            'kingdom', 'subkingdom', 'infrakingdom',
                            'superphylum', 'superdivision', 'phylum', 'division', 'subphylum', 'subdivision', 'infraphylum',
                            'superclass', 'class', 'subclass', 'infraclass',
                            'superorder', 'order', 'suborder', 'infraorder',
                            'superfamily', 'family', 'subfamily', 'tribe', 'subtribe',
                            'genus', 'subgenus', 'section', 'series',
                            'species', 'subspecies', 'variety', 'form', 'cultivar'
                        ];
                        
                        let html = '';
                        for (const level of hierarchy) {
                            if (plant.taxonomy[level]) {
                                // Determine indentation level (0 = no indent, higher = more indent)
                                let indentLevel = 0;
                                if (level.startsWith('sub') || level.startsWith('infra') || level.startsWith('super')) {
                                    indentLevel = 1;
                                }
                                if (level.includes('subsub') || level === 'tribe' || level === 'subtribe') {
                                    indentLevel = 2;
                                }
                                if (level === 'section' || level === 'series') {
                                    indentLevel = 3;
                                }
                                if (level === 'subspecies' || level === 'variety' || level === 'form' || level === 'cultivar') {
                                    indentLevel = 4;
                                }
                                
                                const label = level.charAt(0).toUpperCase() + level.slice(1).replace(/([A-Z])/g, ' $1').trim();
                                const taxonomicName = plant.taxonomy[level];
                                
                                html += `
                                    <div class="taxonomy-level" data-level="${indentLevel}" style="padding-left: ${indentLevel * 0.75}rem; margin-bottom: 0.2rem;">
                                        <span class="taxonomy-label" style="font-size: 0.75rem;">${label}:</span>
                                        <a href="#" class="taxonomy-link" 
                                           data-taxon-name="${taxonomicName}" 
                                           data-taxon-rank="${level}"
                                           style="color: var(--accent-color); text-decoration: none; font-size: 0.75rem; cursor: pointer;"
                                           title="Loading Catalogue of Life link...">
                                            ${taxonomicName}
                                        </a>
                                    </div>
                                `;
                            }
                        }
                        return html;
                    })()}
                </div>
            </section>
        ` : ''}
            <section class="plant-product-section plant-product-reviews-section">
                <div class="product-reviews-widget" data-product-type="plant" data-product-id="${plant.id}" data-product-name="${escapeHtml(plant.name)}"></div>
            </section>
        </div>

        <!-- Page 2: Gallery View (hidden by default) -->
        <div id="modal-page-2" class="modal-page" style="display: none;" data-plant-id="${plant.id}">
            ${(function() {
                const raw = (plant.images || []).filter(img => img && img.trim());
                const valid = (imageUtils && imageUtils.normalizePlantImagePath) ? raw.map(img => imageUtils.normalizePlantImagePath(img)) : raw;
                const hasNumbered = valid.some(path => /-\d+\.(jpg|jpeg|png|webp)$/i.test(path));
                const galleryImages = hasNumbered ? valid.filter(path => !/\/thumb\.(jpg|jpeg|png|webp)$/i.test(path)) : valid;
                return galleryImages.length > 0 ? `
                <div class="plant-gallery-modern" id="gallery-page-${plant.id}">
                    <div class="plant-gallery-main-row">
                        <header class="plant-gallery-header">
                            <div class="plant-gallery-header-main">
                                <span class="plant-gallery-label">Gallery</span>
                                <h2 class="plant-gallery-item-name">${escapeHtml(plant.name)}</h2>
                                ${plant.scientificName ? '<p class="plant-gallery-scientific-name">' + escapeHtml(plant.scientificName) + '</p>' : ''}
                                <span class="plant-gallery-count">${galleryImages.length} photo${galleryImages.length !== 1 ? 's' : ''}</span>
                            </div>
                        </header>
                        <div class="plant-gallery-stage" id="gallery-preview-${plant.id}">
                            <button type="button" class="plant-gallery-arrow plant-gallery-prev" onclick="galleryPrevNext(${plant.id}, -1)" aria-label="Previous image">‹</button>
                            <div class="plant-gallery-stage-inner" style="position:relative;">
                                <div class="gallery-img-loading" id="gallery-preview-loading">Loading...</div>
                                ${displayImageUrl ? 
                                    `<img id="gallery-preview-img" data-current-index="0" src="${getCardThumbUrl(displayImageUrl, 1600, 88)}" data-original-src="${getFullResUrl(displayImageUrl)}" alt="${plant.name}" class="gallery-preview-image" onload="var l=document.getElementById('gallery-preview-loading');if(l)l.classList.add('hidden')" onerror="var l=document.getElementById('gallery-preview-loading');if(l)l.classList.add('hidden')">` :
                                    `<div class="plant-gallery-placeholder">🌿</div>`
                                }
                            </div>
                            <button type="button" class="plant-gallery-arrow plant-gallery-next" onclick="galleryPrevNext(${plant.id}, 1)" aria-label="Next image">›</button>
                            <div class="plant-gallery-counter"><span id="gallery-current-num">1</span> / ${galleryImages.length}</div>
                            <button type="button" class="plant-gallery-fullscreen-btn" onclick="openGalleryFullscreen(${plant.id})" aria-label="View fullscreen">⛶ Fullscreen</button>
                        </div>
                    </div>
                    <div class="gallery-fullscreen-overlay" id="gallery-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Fullscreen image view" onclick="if(event.target === this) closeGalleryFullscreen()">
                        <div class="gallery-img-loading" id="gallery-fullscreen-loading">Loading...</div>
                        <button type="button" class="gallery-fullscreen-close" onclick="closeGalleryFullscreen()" aria-label="Close">×</button>
                        <button type="button" class="gallery-fullscreen-arrow gallery-fullscreen-prev" onclick="galleryFullscreenPrevNext(${plant.id}, -1)" aria-label="Previous">‹</button>
                        <img id="gallery-fullscreen-img" src="${displayImageUrl || ''}" alt="${escapeHtml(plant.name)}" class="gallery-fullscreen-image" onload="var l=document.getElementById('gallery-fullscreen-loading');if(l)l.classList.add('hidden')" onerror="var l=document.getElementById('gallery-fullscreen-loading');if(l)l.classList.add('hidden')">
                        <button type="button" class="gallery-fullscreen-arrow gallery-fullscreen-next" onclick="galleryFullscreenPrevNext(${plant.id}, 1)" aria-label="Next">›</button>
                        <div class="gallery-fullscreen-counter"><span id="gallery-fullscreen-num">1</span> / ${galleryImages.length}</div>
                    </div>
                    <div class="plant-gallery-thumbnails-wrap">
                        <div class="plant-gallery-thumbnails">
                            ${galleryImages.map((img, idx) => {
                                const escapedPath = img.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                                const isMain = idx === 0;
                                return `
                                <button type="button" class="plant-gallery-thumb gallery-thumbnail ${idx === 0 ? 'selected' : ''}" data-img-index="${idx}" data-img-path="${escapedPath}" onclick="selectGalleryImage('${escapedPath}', ${plant.id}, ${idx}, event)" aria-label="Image ${idx + 1}">
                                    <span class="plant-gallery-thumb-img"><img src="${getCardThumbUrl(img, 280, 82)}" alt="" loading="lazy" onerror="this.closest('.plant-gallery-thumb').style.display='none'" onload="this.style.display='block'"></span>
                                    ${isMain ? '<span class="plant-gallery-thumb-badge" title="Main image">⭐</span>' : ''}
                                    <button type="button" class="delete-image-btn plant-gallery-thumb-delete" onclick="event.stopPropagation(); event.preventDefault(); deleteImageFromGallery(${plant.id}, ${idx}, '${escapedPath}');" title="Remove image" aria-label="Remove image">×</button>
                                </button>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            ` : `
                <div class="plant-gallery-modern plant-gallery-empty">
                    <div class="plant-gallery-main-row">
                        <header class="plant-gallery-header">
                            <div class="plant-gallery-header-main">
                                <span class="plant-gallery-label">Gallery</span>
                                <h2 class="plant-gallery-item-name">${escapeHtml(plant.name)}</h2>
                                ${plant.scientificName ? '<p class="plant-gallery-scientific-name">' + escapeHtml(plant.scientificName) + '</p>' : ''}
                            </div>
                        </header>
                        <div class="plant-gallery-empty-message">
                            <p>No photos yet.</p>
                            <p>Use Image in the Manage panel to add photos.</p>
                        </div>
                    </div>
                </div>
            `;
            })()}
        </div>
    `;
    
    const addToCartBtn = modalBody.querySelector('.btn-add-to-cart');
    const modalCartQty = modalBody.querySelector('#modalCartQty');
    if (addToCartBtn && modalCartQty) {
        addToCartBtn.addEventListener('click', () => {
            const isInt = isIntegerUnitQuickAdd(plant.unit);
            const raw = parseFloat(modalCartQty.value);
            const qty = isNaN(raw) || raw <= 0 ? (isInt ? 1 : 0.1) : (isInt ? Math.round(raw) : raw);
            addToCart(plant, qty);
        });
    }
    const canManageVisibilityPlant = typeof auth !== 'undefined' && auth && ((auth.isOwner && auth.isOwner()) || (auth.isAdmin && auth.isAdmin()));
    const plantHasGalleryImages = !!(plant.images && plant.images.filter(function (img) { return img && String(img).trim(); }).length);
    const plantDetailActions = createDetailControlPanel({
        buttonsHtml:
            '<button type="button" class="detail-btn card-edit-icon plant-detail-edit" title="Edit details" aria-label="Edit details">' + DETAIL_EDIT_SVG + '<span>Edit details</span></button>' +
            '<button type="button" class="detail-btn card-image-icon plant-detail-image" title="Add or edit images" aria-label="Add or edit images">' + DETAIL_IMAGE_SVG + '<span>Image</span></button>',
        setMainPlantId: plantHasGalleryImages ? plant.id : null,
        hideConfig: canManageVisibilityPlant ? {
            className: 'plant-detail-hide',
            isHidden: !!plant.hidden,
            showTitle: 'Show this plant in the shop',
            hideTitle: 'Hide this plant from shoppers',
            showLabel: 'Show plant in shop',
            hideLabel: 'Hide plant from shoppers',
            showText: 'Show in shop',
            hideText: 'Hide from shoppers',
            onToggle: function (hideBtn) {
                var nextHidden = !plant.hidden;
                plant.hidden = nextHidden;
                if (window.inventoryDb && window.inventoryDb.setItem) {
                    window.inventoryDb.setItem(plant.id, { hidden: nextHidden }).then(function () {
                        if (typeof applyAllFilters === 'function') applyAllFilters();
                    });
                } else if (typeof applyAllFilters === 'function') {
                    applyAllFilters();
                }
                hideBtn.title = nextHidden ? 'Show this plant in the shop' : 'Hide this plant from shoppers';
                hideBtn.setAttribute('aria-label', nextHidden ? 'Show plant in shop' : 'Hide plant from shoppers');
                hideBtn.innerHTML = detailHideButtonHtml(nextHidden, 'Show in shop', 'Hide from shoppers');
            }
        } : null
    });
    mountDetailControlPanel(modalBody, plantDetailActions);
    const plantDetailEditBtn = plantDetailActions.querySelector('.plant-detail-edit');
    const plantDetailImageBtn = plantDetailActions.querySelector('.plant-detail-image');
    if (plantDetailEditBtn) plantDetailEditBtn.addEventListener('click', () => { openImageUpload(plant.id); });
    if (plantDetailImageBtn) plantDetailImageBtn.addEventListener('click', () => { openPlantImageUpload(plant); });
    const plantReviewsWidget = modalBody.querySelector('.product-reviews-widget');
    if (plantReviewsWidget && typeof window.initProductReviewsWidget === 'function') window.initProductReviewsWidget(plantReviewsWidget);
    
    // If description was missing from in-memory data (e.g. old bundle cache), fetch from JSON file
    if (!descRaw && plant.scientificName) {
        const slug = scientificNameToSlug(getScientificNameString(plant));
        fetch('data/plants-merged/' + slug + '.json')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(filePlant) {
                if (!filePlant || !filePlant.description) return;
                var el = document.getElementById('modalBody');
                if (!el || !el.querySelector) return;
                var descEl = el.querySelector('.plant-detail-description');
                if (descEl) descEl.innerHTML = '<p class="description">' + escapeHtml(String(filePlant.description).trim()) + '</p>';
            })
            .catch(function() {});
    }
    
    // Show plant detail panel (replaces list view); no modal overlay
    const navBackWrap = document.getElementById('navBackToListWrap');
    const navBackBtn = document.getElementById('navBackToList');
    if (navBackWrap) {
        navBackWrap.classList.remove('hidden');
        navBackWrap.classList.remove('nav-back-disabled');
    }
    if (navBackBtn) navBackBtn.disabled = false;
    if (mainLayout) mainLayout.classList.add('detail-view-active');
    if (typeof window.syncFiltersUiForDetailView === 'function') window.syncFiltersUiForDetailView(true);
    if (filtersSidebarWrapper) filtersSidebarWrapper.style.display = 'none';
    if (mainContent && plantDetailPanel) {
        mainContent.classList.add('list-view-hidden');
        plantDetailPanel.classList.remove('hidden');
        plantDetailPanel.setAttribute('aria-hidden', 'false');
    }
    if (plantModal) {
        plantModal.classList.add('hidden');
        plantModal.setAttribute('aria-hidden', 'true');
    }
    setCatalogSeoUrl('plant', plant, typeof allPlants !== 'undefined' ? allPlants : []);
    document.addEventListener('keydown', handlePlantPanelEscape);
    resetDetailPanelScroll();

    // Inject JSON-LD Product structured data so search engines can index price,
    // availability, and image for each plant viewed. Removed when panel closes.
    (function injectProductJsonLd(p) {
        var existing = document.getElementById('product-jsonld');
        if (existing) existing.remove();
        var price = (p.price != null && !isNaN(Number(p.price))) ? Number(p.price).toFixed(2) : null;
        var availability = (typeof p.stockQuantity === 'number' && p.stockQuantity <= 0)
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock';
        var img = p.imageUrl || (p.images && p.images[0]) || '';
        var seoPath = getCatalogSeoPath('plant', p, typeof allPlants !== 'undefined' ? allPlants : []);
        var ld = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: p.name || '',
            description: (p.description || '').slice(0, 500),
            image: img ? [img] : [],
            brand: { '@type': 'Brand', name: 'Vivarium Store' },
            offers: {
                '@type': 'Offer',
                priceCurrency: 'KWD',
                availability: availability,
                url: 'https://vivarium-store.com' + seoPath
            }
        };
        if (price) ld.offers.price = price;
        if (p.scientificName) ld.alternateName = p.scientificName;
        var s = document.createElement('script');
        s.type = 'application/ld+json';
        s.id = 'product-jsonld';
        s.textContent = JSON.stringify(ld);
        document.head.appendChild(s);
    })(plant);

    // Background gallery expansion: probe extra candidate URLs and patch gallery DOM without blocking modal open
    if (_galleryExpansionCandidates) {
        (function(expansionData) {
            var pId = expansionData.plantId;
            var cands = expansionData.candidates;
            Promise.all(cands.map(function(url) {
                return new Promise(function(resolve) {
                    var img = new Image();
                    img.onload = function() { resolve(url); };
                    img.onerror = function() { resolve(null); };
                    img.src = url;
                });
            })).then(function(results) {
                var verified = results.filter(Boolean);
                var p = allPlants.find(function(x) { return x && x.id === pId; });
                if (p) p.images = verified;
                // Patch gallery thumbnails in the DOM (page 2)
                var gallery = document.getElementById('gallery-page-' + pId);
                if (!gallery || !verified.length) return;
                var thumbsWrap = gallery.querySelector('.plant-gallery-thumbnails');
                if (!thumbsWrap) return;
                var existingPaths = Array.from(thumbsWrap.querySelectorAll('.plant-gallery-thumb[data-img-path]'))
                    .map(function(b) { return b.getAttribute('data-img-path'); });
                var added = 0;
                verified.forEach(function(url, idx) {
                    if (existingPaths.indexOf(url) !== -1) return;
                    var escaped = url.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'plant-gallery-thumb gallery-thumbnail';
                    btn.setAttribute('data-img-index', idx);
                    btn.setAttribute('data-img-path', escaped);
                    btn.setAttribute('aria-label', 'Image ' + (idx + 1));
                    btn.setAttribute('onclick', "selectGalleryImage('" + escaped + "', " + pId + ", " + idx + ", event)");
                    btn.innerHTML = '<span class="plant-gallery-thumb-img"><img src="' + url + '" alt="" loading="lazy" onerror="this.closest(\'.plant-gallery-thumb\').style.display=\'none\'" onload="this.style.display=\'block\'"></span><button type="button" class="delete-image-btn plant-gallery-thumb-delete" onclick="event.stopPropagation(); event.preventDefault(); deleteImageFromGallery(' + pId + ', ' + idx + ', \'' + escaped + '\');" title="Remove image" aria-label="Remove image">×</button>';
                    thumbsWrap.appendChild(btn);
                    added++;
                });
                if (added > 0) {
                    var countEl = gallery.querySelector('.plant-gallery-count');
                    var total = thumbsWrap.querySelectorAll('.plant-gallery-thumb').length;
                    if (countEl) countEl.textContent = total + ' photo' + (total !== 1 ? 's' : '');
                    var totalCountEl = gallery.querySelector('#gallery-current-num');
                    if (totalCountEl) { var counterDiv = totalCountEl.closest('.plant-gallery-counter'); if (counterDiv) counterDiv.innerHTML = '<span id="gallery-current-num">1</span> / ' + total; }
                }
            }).catch(function() {});
        })(_galleryExpansionCandidates);
    }

    // Load Catalogue of Life links for taxonomy hierarchy
    if (plant.taxonomy) {
        loadColTaxonomyLinks(plant.id);
    }
}

// Get Catalogue of Life taxon ID from name and rank using COL API
async function getColTaxonId(name, rank) {
    if (!name || !rank) return null;
    
    // Use a cache to avoid repeated API calls
    const cacheKey = `col-id-${rank}-${name}`;
    if (window.colTaxonIdCache && window.colTaxonIdCache.has(cacheKey)) {
        return window.colTaxonIdCache.get(cacheKey);
    }
    
    // Initialize cache if it doesn't exist
    if (!window.colTaxonIdCache) {
        window.colTaxonIdCache = new Map();
    }
    
    try {
        // Map rank to Catalogue of Life compatible format
        const rankMap = {
            'kingdom': 'kingdom',
            'phylum': 'phylum',
            'division': 'phylum',
            'class': 'class',
            'order': 'order',
            'family': 'family',
            'genus': 'genus',
            'species': 'species'
        };
        
        const colRank = rankMap[rank];
        if (!colRank) return null;
        
        // Search by name and rank using COL API
        let searchUrl = `https://api.checklistbank.org/dataset/312578/nameusage/search?q=${encodeURIComponent(name)}&rank=${colRank}&limit=5`;
        
        let response = await fetch(searchUrl);
        if (response.ok) {
            const data = await response.json();
            if (data.result && Array.isArray(data.result) && data.result.length > 0) {
                // Find exact match by name
                const exactMatch = data.result.find(r => {
                    const usage = r.usage || r;
                    const usageName = usage.name?.scientificName || usage.name?.uninomial || usage.name?.name;
                    return usageName && usageName.toLowerCase() === name.toLowerCase();
                });
                
                if (exactMatch) {
                    const usage = exactMatch.usage || exactMatch;
                    const taxonId = usage.id || exactMatch.id;
                    if (taxonId) {
                        window.colTaxonIdCache.set(cacheKey, taxonId);
                        return taxonId;
                    }
                }
                
                // If no exact match, use first result
                const firstResult = data.result[0];
                const usage = firstResult.usage || firstResult;
                const taxonId = usage.id || firstResult.id;
                if (taxonId) {
                    window.colTaxonIdCache.set(cacheKey, taxonId);
                    return taxonId;
                }
            }
        }
        
        // Fallback: try without rank filter
        searchUrl = `https://api.checklistbank.org/dataset/312578/nameusage/search?q=${encodeURIComponent(name)}&limit=5`;
        response = await fetch(searchUrl);
        if (response.ok) {
            const data = await response.json();
            if (data.result && Array.isArray(data.result) && data.result.length > 0) {
                // Find match by name and rank
                const match = data.result.find(r => {
                    const usage = r.usage || r;
                    const usageName = usage.name?.scientificName || usage.name?.uninomial || usage.name?.name;
                    const usageRank = usage.name?.rank || r.rank;
                    return usageName && usageName.toLowerCase() === name.toLowerCase() && 
                           usageRank && usageRank.toLowerCase() === colRank.toLowerCase();
                });
                
                if (match) {
                    const usage = match.usage || match;
                    const taxonId = usage.id || match.id;
                    if (taxonId) {
                        window.colTaxonIdCache.set(cacheKey, taxonId);
                        return taxonId;
                    }
                }
            }
        }
        
        return null;
    } catch (error) {
        console.warn(`Failed to get Catalogue of Life taxon ID for ${rank} ${name}:`, error);
        return null;
    }
}

// Get GBIF species key from name using GBIF API
async function getGbifSpeciesKey(name) {
    if (!name) return null;
    
    // Use a cache to avoid repeated API calls
    const cacheKey = `gbif-key-${name}`;
    if (window.gbifSpeciesKeyCache && window.gbifSpeciesKeyCache.has(cacheKey)) {
        return window.gbifSpeciesKeyCache.get(cacheKey);
    }
    
    // Initialize cache if it doesn't exist
    if (!window.gbifSpeciesKeyCache) {
        window.gbifSpeciesKeyCache = new Map();
    }
    
    try {
        // Use GBIF species match API
        const matchUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}&rank=SPECIES&kingdom=Plantae`;
        const response = await fetch(matchUrl);
        
        if (response.ok) {
            const data = await response.json();
            // Check if we got a good match
            if (data.matchType && data.matchType !== 'NONE' && data.usageKey) {
                const speciesKey = data.usageKey;
                window.gbifSpeciesKeyCache.set(cacheKey, speciesKey);
                return speciesKey;
            }
        }
        
        return null;
    } catch (error) {
        console.warn(`Failed to get GBIF species key for ${name}:`, error);
        return null;
    }
}

// Load Catalogue of Life links for taxonomy hierarchy (with GBIF fallback for species)
async function loadColTaxonomyLinks(plantId) {
    const taxonomyHierarchy = document.getElementById(`taxonomy-hierarchy-${plantId}`);
    if (!taxonomyHierarchy) return;
    
    const taxonomyLinks = taxonomyHierarchy.querySelectorAll('.taxonomy-link');
    
    // Process links in parallel with a small delay to avoid overwhelming the API
    for (const link of taxonomyLinks) {
        const name = link.getAttribute('data-taxon-name');
        const rank = link.getAttribute('data-taxon-rank');
        
        if (!name || !rank) continue;
        
        // Fetch taxon ID from COL
        const taxonId = await getColTaxonId(name, rank);
        
        if (taxonId) {
            // Update link with direct taxon page URL
            link.href = `https://www.catalogueoflife.org/data/taxon/${taxonId}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = `View ${name} on Catalogue of Life`;
        } else if (rank === 'species') {
            // For species rank, try GBIF as fallback
            const gbifKey = await getGbifSpeciesKey(name);
            if (gbifKey) {
                link.href = `https://www.gbif.org/species/${gbifKey}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.title = `View ${name} on GBIF`;
            } else {
                // Fallback to COL search URL
                link.href = `https://www.catalogueoflife.org/search?q=${encodeURIComponent(name)}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.title = `Search for ${name} on Catalogue of Life`;
            }
        } else {
            // Fallback to COL search URL for non-species ranks
            link.href = `https://www.catalogueoflife.org/search?q=${encodeURIComponent(name)}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = `Search for ${name} on Catalogue of Life`;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// Switch between modal pages
function switchModalPage(pageNum, plantId) {
    if (pageNum !== 2) closeGalleryFullscreen();
    document.querySelectorAll('.modal-page').forEach(page => {
        page.style.display = 'none';
        page.classList.remove('active');
    });
    const targetPage = document.getElementById(`modal-page-${pageNum}`);
    if (targetPage) {
        targetPage.style.display = pageNum === 2 ? 'block' : 'contents';
        targetPage.classList.add('active');
    }
}

// Update gallery photo count after thumbnails load/fail (hides blank placeholders, corrects counter)
function galleryUpdateCount(plantId) {
    var gallery = document.getElementById('gallery-page-' + plantId);
    if (!gallery) return;
    var allThumbs = gallery.querySelectorAll('.plant-gallery-thumb');
    var visible = 0;
    allThumbs.forEach(function(btn) { if (btn.style.display !== 'none') visible++; });
    var photoCountEl = document.getElementById('gallery-photo-count-' + plantId);
    if (photoCountEl) photoCountEl.textContent = visible + ' photo' + (visible !== 1 ? 's' : '');
    var totalEl = document.getElementById('gallery-total-count-' + plantId);
    if (totalEl) totalEl.textContent = visible;
    var fullscreenTotalEl = document.getElementById('gallery-fullscreen-total-' + plantId);
    if (fullscreenTotalEl) fullscreenTotalEl.textContent = visible;
}

// Select gallery image to display in large preview
function selectGalleryImage(imagePath, plantId, imageIndex, event) {
    
    const previewImg = document.getElementById('gallery-preview-img');
    if (previewImg) {
        var loadingEl = document.getElementById('gallery-preview-loading');
        // Clear immediately so old image disappears before new one loads
        previewImg.src = '';
        previewImg.style.visibility = 'hidden';
        if (loadingEl) loadingEl.classList.remove('hidden');
        previewImg.onload = function() {
            previewImg.style.visibility = 'visible';
            if (loadingEl) loadingEl.classList.add('hidden');
        };
        previewImg.onerror = function() {
            previewImg.style.visibility = 'visible';
            if (loadingEl) loadingEl.classList.add('hidden');
        };
        previewImg.src = (typeof getCardThumbUrl === 'function') ? getCardThumbUrl(imagePath, 1600, 88) : imagePath;
        previewImg.setAttribute('data-original-src', typeof getFullResUrl === 'function' ? getFullResUrl(imagePath) : imagePath);
        previewImg.setAttribute('data-current-index', imageIndex);
    }
    
    const counterEl = document.getElementById('gallery-current-num');
    if (counterEl) counterEl.textContent = String(imageIndex + 1);
    
    syncGalleryFullscreenImage();
    
    document.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
        thumb.classList.remove('selected');
        if (thumb.getAttribute('data-img-index') === String(imageIndex)) thumb.classList.add('selected');
    });
    if (event && event.currentTarget) event.currentTarget.classList.add('selected');
}

// Previous/next image in gallery
function galleryPrevNext(plantId, delta) {
    const previewImg = document.getElementById('gallery-preview-img');
    if (!previewImg) return;
    const thumbnails = document.querySelectorAll('.plant-gallery-thumb[data-img-path]');
    if (thumbnails.length === 0) return;
    const current = parseInt(previewImg.getAttribute('data-current-index') || '0', 10);
    let next = current + delta;
    if (next < 0) next = thumbnails.length - 1;
    if (next >= thumbnails.length) next = 0;
    const path = thumbnails[next].getAttribute('data-img-path');
    if (path) selectGalleryImage(path.replace(/&quot;/g, '"'), plantId, next, null);
    syncGalleryFullscreenImage();
}

function openGalleryFullscreen(plantId) {
    const previewImg = document.getElementById('gallery-preview-img');
    const overlay = document.getElementById('gallery-fullscreen-overlay');
    const fsImg = document.getElementById('gallery-fullscreen-img');
    const fsNum = document.getElementById('gallery-fullscreen-num');
    if (!overlay || !fsImg) return;
    if (previewImg && previewImg.src) {
        var fsLoading = document.getElementById('gallery-fullscreen-loading');
        if (fsLoading) fsLoading.classList.remove('hidden');
        var fsPreviewFallback = previewImg.src;
        fsImg.onload = function() { if (fsLoading) fsLoading.classList.add('hidden'); };
        fsImg.onerror = function() {
            if (fsLoading) fsLoading.classList.add('hidden');
            if (fsImg.src !== fsPreviewFallback) fsImg.src = fsPreviewFallback;
        };
        fsImg.src = previewImg.getAttribute('data-original-src') || previewImg.src;
        fsImg.alt = previewImg.alt || '';
    }
    if (fsNum) {
        const curr = document.getElementById('gallery-current-num');
        fsNum.textContent = curr ? curr.textContent : '1';
    }
    overlay.classList.add('gallery-fullscreen-open');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', galleryFullscreenKeydown);
}

function closeGalleryFullscreen() {
    const overlay = document.getElementById('gallery-fullscreen-overlay');
    if (!overlay) return;
    overlay.classList.remove('gallery-fullscreen-open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', galleryFullscreenKeydown);
}

function galleryFullscreenKeydown(e) {
    if (e.key === 'Escape') {
        closeGalleryFullscreen();
        e.preventDefault();
    }
}

function galleryFullscreenPrevNext(plantId, delta) {
    galleryPrevNext(plantId, delta);
    syncGalleryFullscreenImage();
}

function syncGalleryFullscreenImage() {
    const overlay = document.getElementById('gallery-fullscreen-overlay');
    if (!overlay || !overlay.classList.contains('gallery-fullscreen-open')) return;
    const previewImg = document.getElementById('gallery-preview-img');
    const fsImg = document.getElementById('gallery-fullscreen-img');
    const fsNum = document.getElementById('gallery-fullscreen-num');
    const currNum = document.getElementById('gallery-current-num');
    if (previewImg && fsImg) {
        var fsLoading = document.getElementById('gallery-fullscreen-loading');
        // Clear immediately so old image doesn't linger
        var syncFallback = previewImg.src;
        fsImg.style.visibility = 'hidden';
        fsImg.src = '';
        if (fsLoading) fsLoading.classList.remove('hidden');
        fsImg.onload = function() { fsImg.style.visibility = 'visible'; if (fsLoading) fsLoading.classList.add('hidden'); };
        fsImg.onerror = function() {
            fsImg.style.visibility = 'visible';
            if (fsLoading) fsLoading.classList.add('hidden');
            if (fsImg.src !== syncFallback) fsImg.src = syncFallback;
        };
        fsImg.src = previewImg.getAttribute('data-original-src') || previewImg.src;
    }
    if (fsNum && currNum) fsNum.textContent = currNum.textContent;
}

// Set the currently displayed preview image as main
function setAsMainImageFromPreview(plantId) {
    const previewImg = document.getElementById('gallery-preview-img');
    if (!previewImg) return;
    
    const currentIndex = parseInt(previewImg.getAttribute('data-current-index') || '0');
    setAsMainImage(plantId, currentIndex);
}

// Load plant images from external sources
async function loadPlantImages() {
    // DISABLED: Automatic image loading causes console flooding with ERR_CONNECTION_REFUSED
    // Images are now loaded on-demand only:
    // - When displayed in cards (browser handles naturally with onerror handler)
    // - When user opens a plant modal
    // - When user uploads new images
    
    loading.classList.remove('hidden');
    
    // Just render plants - let browser handle image loading naturally
    renderPlantsPage();
    
    loading.classList.add('hidden');
    return; // Early return - no automatic image verification
    
    /* Previous automatic verification code disabled:
    const imagePromises = allPlants.map((plant) => {
        // ... verification code that caused network flooding ...
    });
    
    await Promise.allSettled(imagePromises);
    loading.classList.add('hidden');
    */
}

// Update individual plant card image
// NOTE: We no longer run network discovery here; this function only ensures
// cards reflect whatever images are already known on the plant objects.
function discoverImagesForCurrentPage() {
    if (!filteredPlants || filteredPlants.length === 0) return;
    const total = filteredPlants.length;
    const totalPages = Math.max(1, Math.ceil(total / plantsPerPage));
    const page = Math.max(1, Math.min(currentPlantsPage, totalPages));
    const start = (page - 1) * plantsPerPage;
    const pagePlants = filteredPlants.slice(start, start + plantsPerPage);
    pagePlants.forEach(function (plant) {
        if (plant && (plant.imageUrl || (plant.images && plant.images.length))) {
            var url = plant.imageUrl || plant.images[0];
            if (url && /supabase\.co\/storage\/v1\/object\/public\//i.test(url) && !window.SUPABASE_URL && !plantHasBucketImages(plant)) url = null;
            updatePlantCardImage(plant.id, url);
        }
    });
}

function updatePlantCardImage(plantId, imageUrl) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant) return;

    // Clear card to placeholder when no image
    if (!imageUrl) {
        plant.imageUrl = null;
        plant.images = [];
        const cards = document.querySelectorAll('.plant-image-container[data-plant-id="' + plantId + '"]');
        cards.forEach(function(container) {
            const img = container.querySelector('.plant-image');
            if (img) {
                const placeholder = document.createElement('div');
                placeholder.className = 'image-placeholder';
                placeholder.innerHTML = (typeof PLACEHOLDER_PLANT_SVG !== 'undefined' ? PLACEHOLDER_PLANT_SVG : '');
                img.parentNode.replaceChild(placeholder, img);
            }
        });
        return;
    }

    if (imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') {
        imageUrl = imageUtils.normalizePlantImagePath(imageUrl);
    }
    if (imageUrl && /supabase\.co\/storage\/v1\/object\/public\//i.test(imageUrl) && !window.SUPABASE_URL && !plantHasBucketImages(plant)) {
        imageUrl = null;
    }
    if (!imageUrl) {
        plant.imageUrl = null;
        plant.images = plant.images || [];
        const cards = document.querySelectorAll('.plant-image-container[data-plant-id="' + plantId + '"]');
        cards.forEach(function(container) {
            const img = container.querySelector('.plant-image');
            if (img) {
                const placeholder = document.createElement('div');
                placeholder.className = 'image-placeholder';
                placeholder.innerHTML = (typeof PLACEHOLDER_PLANT_SVG !== 'undefined' ? PLACEHOLDER_PLANT_SVG : '');
                img.parentNode.replaceChild(placeholder, img);
            }
        });
        return;
    }
    // Update the plant object
    plant.imageUrl = imageUrl;
    if (!plant.images) {
        plant.images = [];
    }
    if (!plant.images.includes(imageUrl)) {
        plant.images.unshift(imageUrl); // Add to beginning
    }
    
    // Find and update the card by data attribute
    const cards = document.querySelectorAll(`[data-plant-id="${plantId}"]`);
    if (cards.length > 0) {
        cards.forEach(card => {
            const imgElement = card.querySelector('.plant-image');
            const imgContainer = card.closest('.plant-image-container') || card.querySelector('.plant-image-container');
            
            var thumbUrl = (typeof getCardThumbUrl === 'function' ? getCardThumbUrl(imageUrl, getCardThumbWidth()) : null) || imageUrl;
            if (imgElement) {
                imgElement.src = thumbUrl;
                imgElement.style.display = 'block';
            } else if (imgContainer) {
                // Replace placeholder with image and keep edit/details + care-card + price (quick-add is in card-add-wrap at card bottom)
                const carnivorousHtml = plant.carnivorous ? `
                <div class="carnivorous-icon" title="Carnivorous Plant">
                    <img src="images/carnivorous-icon.png" alt="Carnivorous" />
                </div>
            ` : '';
                imgContainer.innerHTML = `${carnivorousHtml}
            <img src="${thumbUrl}" alt="${plant.name}" class="plant-image" loading="lazy" onerror="this.onerror=null; handleImageError(this, ${plantId})" data-plant-id="${plantId}">
            <div class="card-icons plant-card-icons">
                <button type="button" class="card-edit-icon image-edit-icon" title="Edit details" aria-label="Edit details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button type="button" class="card-image-icon plant-image-icon" title="Add or edit images" aria-label="Add or edit images">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                </button>
            </div>
            <div class="care-card-icon" onclick="event.stopPropagation(); generateCareCard(${plantId})" title="Generate printable care card">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9V2h12v7"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <path d="M6 14h12v8H6z"/>
                </svg>
            </div>
            <div class="card-price">${formatPlantPrice(plant)}</div>`;
                var editBtn = imgContainer.querySelector('.card-edit-icon, .image-edit-icon');
                if (editBtn) {
                    editBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        openImageUpload(plantId);
                    });
                }
                var plantImageBtn = imgContainer.querySelector('.card-image-icon, .plant-image-icon');
                if (plantImageBtn) {
                    plantImageBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        openPlantImageUpload(plant);
                    });
                }
            }
        });
    }
    
    // Silent - card image update successful
}

// Fetch plant image from multiple sources
async function fetchPlantImage(plant) {
    var sources = (typeof plantImageSources !== 'undefined' && plantImageSources)
        || (typeof window !== 'undefined' && window.plantImageSources)
        || { defaultImageSearchTerms: {}, directImageUrls: {} };
    // Method 1: Check for direct image URL first (if available)
    if (sources.directImageUrls && sources.directImageUrls[plant.id]) {
        const directUrl = sources.directImageUrls[plant.id];
        if (await testImageUrl(directUrl)) {
            return directUrl;
        }
    }
    
    // Method 2: Try Unsplash Source API (no key needed, but may have CORS/availability issues)
    const searchTerms = [
        getScientificNameString(plant),
        `${plant.name} plant`,
        (sources.defaultImageSearchTerms && sources.defaultImageSearchTerms[plant.id]) || plant.name
    ];
    
    for (const term of searchTerms) {
        try {
            // Unsplash Source - free, no API key required
            const unsplashUrl = `https://source.unsplash.com/600x400/?${encodeURIComponent(term)},plant,terrarium`;
            if (await testImageUrl(unsplashUrl)) {
                return unsplashUrl;
            }
        } catch (e) {
            // Continue to next method
        }
        
        // Alternative: Use placeholder image service that allows dynamic images
        // For production, integrate with:
        // - Unsplash API (free, requires API key): https://unsplash.com/developers
        // - Pixabay API (free with key): https://pixabay.com/api/docs/
        // - PlantNet API (free, requires registration): https://plantnet.org/
        // - iNaturalist API (free, open source): https://api.inaturalist.org/
    }
    
    // Method 3: Try Wikimedia Commons (some images are freely accessible)
    try {
        const wikiSearch = encodeURIComponent(`${getScientificNameString(plant)} plant`);
        // Note: This requires API call to Wikimedia, which needs backend due to CORS
        // For client-side, we'd need a proxy or use their OEmbed service
    } catch (e) {}
    
    // If all methods fail, return null (will use placeholder emoji)
    return null;
}

// For production use, consider implementing backend API endpoint that:
// 1. Fetches images from multiple sources (Unsplash API, PlantNet, iNaturalist)
// 2. Caches images to reduce API calls
// 3. Handles CORS issues
// Example backend endpoint: GET /api/plant-image/:plantId

// Handle image loading errors - silent mode to avoid console flooding
let imageErrorCount = 0;
let imageErrorsLogged = false;

// Track failed image loads to prevent repeated attempts
const failedImageCache = new Set();

function handleImageError(imgElement, plantId) {
    // Prevent console spam by silently handling errors
    const currentSrc = imgElement.src;
    console.warn('[plant-images] handleImageError: image failed to load', { plantId: plantId, failedSrc: currentSrc, isFullUrl: /^https?:/i.test(currentSrc) });
    if (typeof window._plantImageDiagnosticDone === 'undefined') {
        window._plantImageDiagnosticDone = true;
        console.log('[plant-images] FULL URL (copy and open in new tab to test):', currentSrc);
        fetch(currentSrc, { method: 'GET', mode: 'no-cors' }).then(function () {
            console.log('[plant-images] no-cors fetch completed (cannot read status). Try opening the URL above in a new tab.');
        }).catch(function (e) {
            console.warn('[plant-images] Fetch failed:', e.message);
        });
        fetch(currentSrc, { method: 'HEAD' }).then(function (r) {
            console.log('[plant-images] HEAD request status:', r.status, r.statusText, '— 403 = bucket private or CORS; 404 = wrong path; 200 = OK (then img may be blocked by CORS).');
        }).catch(function (e) {
            console.warn('[plant-images] HEAD request failed (often CORS from Netlify to Supabase). Fix: Supabase Dashboard → Storage → vivarium-assets → set Public ON, and add your site origin to CORS allowed origins.');
        });
    }

    // If we've already tried this image and it failed, don't try again
    if (failedImageCache.has(currentSrc)) {
        // Show placeholder immediately without trying again
        if (imgElement.parentElement) {
            imgElement.style.display = 'none';
            if (!imgElement.parentElement.querySelector('.image-placeholder')) {
                const placeholder = document.createElement('div');
                placeholder.className = 'image-placeholder';
                placeholder.textContent = '🌿';
                imgElement.parentElement.appendChild(placeholder);
            }
        }
        return;
    }
    
    // Mark this image as failed
    failedImageCache.add(currentSrc);
    const plant = allPlants.find(p => p.id === plantId);

    // If the failed src is a Supabase render/image transform URL, fall back to the original object/public URL
    if (imgElement && currentSrc && /supabase\.co\/storage\/v1\/render\/image\/public\//i.test(currentSrc)) {
        var originalUrl = (imgElement.getAttribute('data-full-src') || currentSrc)
            .replace(/\/storage\/v1\/render\/image\/public\//i, '/storage/v1/object/public/')
            .replace(/\?.*$/, '');
        if (originalUrl && !failedImageCache.has(originalUrl)) {
            imgElement.onerror = function () {
                failedImageCache.add(originalUrl);
                handleImageError(imgElement, plantId);
            };
            imgElement.src = originalUrl;
            return;
        }
    }

    // 400 from Supabase often means object not found; catalog may list .jpg but bucket has .webp
    if (imgElement && currentSrc && /supabase\.co\/storage\/v1\/object\/public\//i.test(currentSrc) && /\.jpe?g$/i.test(currentSrc)) {
        var webpUrl = currentSrc.replace(/\.jpe?g$/i, '.webp');
        if (!failedImageCache.has(webpUrl)) {
            imgElement.onerror = function () {
                failedImageCache.add(webpUrl);
                handleImageError(imgElement, plantId);
            };
            imgElement.src = webpUrl;
            if (plant) {
                plant.imageUrl = webpUrl;
                if (plant.images && Array.isArray(plant.images)) {
                    var idx = plant.images.findIndex(function (u) { return u === currentSrc || (u && u.replace(/\.jpe?g$/i, '.webp') === webpUrl); });
                    if (idx >= 0) plant.images[idx] = webpUrl;
                    else if (!plant.images.includes(webpUrl)) plant.images.unshift(webpUrl);
                }
            }
            return;
        }
    }
    
    if (!imgElement || !plant) return;
    
    // Track errors silently, only log once after initial load
    imageErrorCount++;
    if (imageErrorsLogged) {
        // After initial load, be completely silent
        // Just show placeholder without logging
    }
    
    // currentSrc already declared above, use it
    const fullPath = currentSrc.includes(window.location.origin) 
        ? currentSrc.replace(window.location.origin + '/', '')
        : currentSrc;
    
    // Silently remove invalid image from plant's images array
    if (plant.images && plant.images.includes(fullPath)) {
        plant.images = plant.images.filter(img => img !== fullPath);
    }
    if (plant.imageUrl === fullPath) {
        plant.imageUrl = '';
    }
    
    // Check if there are other images in the images array to try
    if (plant.images && plant.images.length > 0) {
        // Find current image index (handle both full URL and relative path)
        const currentIndex = plant.images.findIndex(img => 
            img === fullPath || 
            img === currentSrc || 
            currentSrc.includes(img) ||
            fullPath.includes(img.split('/').pop())
        );
        
        if (currentIndex >= 0 && currentIndex < plant.images.length - 1) {
            // Try next image in array (silently) - but only if not already failed
            let nextImage = plant.images[currentIndex + 1];
            if (imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') nextImage = imageUtils.normalizePlantImagePath(nextImage);
            console.log('[plant-images] handleImageError: trying next image in array', { plantId: plantId, nextImage: nextImage });
            if (!failedImageCache.has(nextImage) && !nextImage.includes(window.location.origin + nextImage)) {
                imgElement.onerror = () => handleImageError(imgElement, plantId);
                imgElement.src = nextImage;
                plant.imageUrl = nextImage;
                return; // Don't show placeholder yet, try next image
            }
        } else if (currentIndex < 0 && plant.images.length > 0) {
            // Current image not in array, try first from array
            let nextImage = plant.images[0];
            if (imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') nextImage = imageUtils.normalizePlantImagePath(nextImage);
            console.log('[plant-images] handleImageError: trying first image from array', { plantId: plantId, nextImage: nextImage });
            if (!failedImageCache.has(nextImage)) {
                imgElement.onerror = () => handleImageError(imgElement, plantId);
                imgElement.src = nextImage;
                plant.imageUrl = nextImage;
                return;
            }
        }
    }
    
    // Try checking localStorage for more images
    try {
        const savedImages = localStorage.getItem(`plant_${plantId}_images`);
        if (savedImages) {
            const parsedImages = JSON.parse(savedImages);
            if (parsedImages && parsedImages.length > 0) {
                // Try first image from localStorage that's different
                for (const saved of parsedImages) {
                    const savedImg = (imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') ? imageUtils.normalizePlantImagePath(saved) : saved;
                    if (savedImg !== fullPath && savedImg !== currentSrc && !failedImageCache.has(savedImg)) {
                        imgElement.onerror = () => handleImageError(imgElement, plantId);
                        imgElement.src = savedImg;
                        plant.imageUrl = savedImg;
                        // Update plant's images array
                        if (!plant.images) {
                            plant.images = [];
                        }
                        if (!plant.images.includes(savedImg)) {
                            plant.images.push(savedImg);
                        }
                        return;
                    }
                }
            }
        }
    } catch (e) {
        // Silent - localStorage check failed
    }
    
    // Try conventional fallback: if failed src was slug-1.jpg, try thumb.jpg in same folder (images/plants/slug/)
    const slugMatch = fullPath.match(/^images\/(?:plants\/)?([^/]+)\/[^/]+-1\.(jpg|jpeg|png|webp)$/i);
    if (slugMatch) {
        const fallbackPath = `images/plants/${slugMatch[1]}/thumb.jpg`;
        if (!failedImageCache.has(fallbackPath)) {
            imgElement.onerror = () => handleImageError(imgElement, plantId);
            imgElement.src = fallbackPath;
            if (plant) {
                plant.imageUrl = fallbackPath;
                if (!plant.images) plant.images = [];
                if (!plant.images.includes(fallbackPath)) plant.images.unshift(fallbackPath);
            }
            return;
        }
    }
    
    // No more images to try, show placeholder silently
    if (imgElement.parentElement) {
        const placeholder = document.createElement('div');
        placeholder.className = 'image-placeholder';
        placeholder.textContent = '🌿';
        imgElement.style.display = 'none'; // Hide broken image
        if (!imgElement.parentElement.querySelector('.image-placeholder')) {
            imgElement.parentElement.appendChild(placeholder);
        }
    }
}

// Test if an image URL is accessible
function testImageUrl(url) {
    return new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
            resolve(false);
        }, 3000);
        
        img.onload = () => {
            clearTimeout(timeout);
            resolve(true);
        };
        
        img.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
        };
        
        img.src = url;
    });
}

// Gallery Lightbox
function openGalleryLightbox(plantId, imageIndex) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant || !plant.images || !plant.images[imageIndex]) return;
    
    // Create lightbox
    const lightbox = document.createElement('div');
    lightbox.className = 'gallery-lightbox';
    lightbox.innerHTML = `
        <div class="lightbox-content">
            <span class="lightbox-close">&times;</span>
            <img src="${plant.images[imageIndex]}" alt="${plant.name}">
            <div class="lightbox-nav">
                ${imageIndex > 0 ? `<button class="lightbox-btn lightbox-prev" onclick="changeGalleryImage(${plantId}, ${imageIndex - 1})">‹</button>` : ''}
                <span class="lightbox-counter">${imageIndex + 1} / ${plant.images.length}</span>
                ${imageIndex < plant.images.length - 1 ? `<button class="lightbox-btn lightbox-next" onclick="changeGalleryImage(${plantId}, ${imageIndex + 1})">›</button>` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(lightbox);
    
    // Store current index on lightbox element
    lightbox.dataset.currentIndex = imageIndex;
    lightbox.dataset.plantId = plantId;
    
    // Keyboard navigation
    const handleKey = (e) => {
        const currentIdx = parseInt(lightbox.dataset.currentIndex);
        if (e.key === 'Escape') {
            closeLightbox();
        }
        else if (e.key === 'ArrowLeft' && currentIdx > 0) {
            changeGalleryImage(plantId, currentIdx - 1);
        }
        else if (e.key === 'ArrowRight' && currentIdx < plant.images.length - 1) {
            changeGalleryImage(plantId, currentIdx + 1);
        }
    };
    
    function closeLightbox() {
        document.removeEventListener('keydown', handleKey);
        lightbox.remove();
    }
    
    document.addEventListener('keydown', handleKey);
    
    // Close handlers
    const closeBtn = lightbox.querySelector('.lightbox-close');
    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });
}

function changeGalleryImage(plantId, imageIndex) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant || !plant.images || !plant.images[imageIndex]) return;
    
    const lightbox = document.querySelector('.gallery-lightbox');
    if (!lightbox) return;
    
    // Update stored index
    lightbox.dataset.currentIndex = imageIndex;
    
    const img = lightbox.querySelector('img');
    const counter = lightbox.querySelector('.lightbox-counter');
    const nav = lightbox.querySelector('.lightbox-nav');
    
    img.src = plant.images[imageIndex];
    counter.textContent = `${imageIndex + 1} / ${plant.images.length}`;
    
    // Update navigation buttons
    nav.innerHTML = `
        ${imageIndex > 0 ? `<button class="lightbox-btn lightbox-prev" onclick="changeGalleryImage(${plantId}, ${imageIndex - 1})">‹</button>` : ''}
        <span class="lightbox-counter">${imageIndex + 1} / ${plant.images.length}</span>
        ${imageIndex < plant.images.length - 1 ? `<button class="lightbox-btn lightbox-next" onclick="changeGalleryImage(${plantId}, ${imageIndex + 1})">›</button>` : ''}
    `;
}

// Download image from gallery
async function downloadGalleryImage(plantId, imageIndex) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant || !plant.images || !plant.images[imageIndex]) {
        console.error('❌ Image not found');
        return;
    }
    
    let imageUrl = plant.images[imageIndex];
    
    // Handle relative paths - convert to absolute URL if needed
    if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
        // Relative path - use current origin
        if (imageUrl.startsWith('/')) {
            imageUrl = window.location.origin + imageUrl;
        } else {
            imageUrl = window.location.origin + '/' + imageUrl;
        }
    }
    
    try {
        // Fetch the image
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        
        // Generate filename from plant name and index
        const scientificNameStr = getScientificNameString(plant);
        const plantSlug = scientificNameStr 
            ? scientificNameStr.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
            : plant.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        // Get file extension from URL or default to jpg
        const urlPath = plant.images[imageIndex].split('/').pop();
        const urlExt = urlPath.includes('.') ? urlPath.split('.').pop().split('?')[0] : 'jpg';
        const ext = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExt.toLowerCase()) ? urlExt.toLowerCase() : 'jpg';
        const filename = `${plantSlug}-${imageIndex + 1}.${ext}`;
        
        // Create download link
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
        
        console.log(`✅ Downloaded: ${filename}`);
    } catch (error) {
        console.error('Download error:', error);
        console.error('Image URL:', imageUrl);
        console.error('Original path:', plant.images[imageIndex]);
        console.error(`❌ Failed to download image: ${error.message}. URL: ${imageUrl}`);
    }
}

// Delete image from gallery and file system
async function deleteImageFromGallery(plantId, imageIndex, imgPath) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant || !plant.images || imageIndex >= plant.images.length) {
        console.error('❌ Plant or image not found');
        return;
    }
    
    const imageToDelete = plant.images[imageIndex];
    if (!imageToDelete) {
        console.error('❌ Image path not found');
        return;
    }
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete this image?\n\n${imageToDelete}\n\nThis will permanently delete the file.`)) {
        return;
    }
    
    try {
        var supabase = window.supabaseDb && window.supabaseDb.isConfigured && window.supabaseDb.isConfigured();
        var isSupabaseStorageUrl = typeof imageToDelete === 'string' && (imageToDelete.indexOf('supabase.co/storage') !== -1 || (imageToDelete.startsWith('http') && imageToDelete.indexOf('/storage/v1/object/') !== -1));

        // Delete from Supabase Storage when on hosted site (image is a Supabase URL)
        if (supabase && isSupabaseStorageUrl && window.supabaseDb.deleteFromStorage) {
            await window.supabaseDb.deleteFromStorage(imageToDelete);
        }

        // Delete file from local file system if we have folder access (local only)
        let fileDeleted = false;
        if (imageToDelete.startsWith('images/')) {
            // Ensure we have folder access
            if (!imagesFolderHandle) {
                console.warn('⚠️ No folder access - requesting access to delete file...');
                // Try to get folder access automatically
                const hasAccess = await ensureFolderAccess();
                if (!hasAccess) {
                    const proceed = confirm('⚠️ Folder access is required to delete the file from disk.\n\n' +
                        'Click OK to select the folder now, or Cancel to continue (file will only be removed from the list).');
                    if (proceed) {
                        await selectImagesFolder();
                    }
                }
            }
            
            // Try to delete the file
            if (imagesFolderHandle) {
                try {
                    // Parse the image path: images/plants/folder-name/filename.jpg or images/folder-name/filename.jpg
                    const pathParts = imageToDelete.split('/').filter(Boolean);
                    if (pathParts.length >= 2) {
                        const fileName = pathParts[pathParts.length - 1];
                        const dirParts = pathParts.slice(1, -1);
                        console.log(`🗑️ Attempting to delete: ${dirParts.join('/')}/${fileName}`);
                        var deleteHandle = imagesFolderHandle;
                        for (var di = 0; di < dirParts.length; di++) {
                            deleteHandle = await deleteHandle.getDirectoryHandle(dirParts[di]);
                        }
                        await deleteHandle.removeEntry(fileName);
                        fileDeleted = true;
                        console.log(`✅ Successfully deleted file from disk: ${imageToDelete}`);
                    } else {
                        console.warn('⚠️ Invalid image path format:', imageToDelete);
                    }
                } catch (fileError) {
                    console.error('❌ Failed to delete file from disk:', fileError);
                    console.error('   Error details:', fileError.message);
                    console.error('   File path:', imageToDelete);
                    // Ask user if they want to continue without deleting the file
                    const continueAnyway = confirm('⚠️ Could not delete the file from disk:\n\n' +
                        fileError.message + '\n\n' +
                        'Do you want to continue and remove it from the list anyway?\n\n' +
                        '(The file will remain in your images folder)');
                    if (!continueAnyway) {
                        console.log('❌ User cancelled deletion');
                        return; // Abort the deletion
                    }
                }
            } else {
                console.warn('⚠️ No folder access available - file will not be deleted from disk');
                console.warn('   The image will be removed from the list but the file will remain in your images folder');
            }
        } else {
            console.warn('⚠️ Image path does not start with "images/" - skipping file deletion');
        }
        
        // Remove from images array
        const wasMainImage = imageIndex === 0;
        plant.images.splice(imageIndex, 1);
        plant.images = ensureUniqueImages(plant.images);
        
        // If it was the main image, also delete the thumbnail and set the next one as main
        if (wasMainImage) {
            // Delete thumbnail if it exists
            if (imagesFolderHandle && imageToDelete.startsWith('images/')) {
                try {
                    const pathParts = imageToDelete.split('/');
                    if (pathParts.length >= 3) {
                        const folderName = pathParts[1];
                        const plantFolderHandle = await imagesFolderHandle.getDirectoryHandle(folderName);
                        try {
                            await plantFolderHandle.removeEntry('thumb.jpg');
                            console.log('✅ Also deleted thumbnail (thumb.jpg)');
                        } catch (thumbError) {
                            // Thumbnail might not exist, that's okay
                            console.log('ℹ️ Thumbnail not found or already deleted');
                        }
                    }
                } catch (thumbDeleteError) {
                    console.warn('⚠️ Could not delete thumbnail:', thumbDeleteError.message);
                }
            }
            
            // Set the next image as main (if available)
            if (plant.images.length > 0) {
                plant.imageUrl = plant.images[0];
                // Regenerate thumbnail for the new main image
                if (imagesFolderHandle) {
                    try {
                        const pathParts = plant.imageUrl.split('/');
                        if (pathParts.length >= 3) {
                            const folderName = pathParts[1];
                            const fileName = pathParts[2];
                            const plantFolderHandle = await imagesFolderHandle.getDirectoryHandle(folderName);
                            const fileHandle = await plantFolderHandle.getFileHandle(fileName);
                            const file = await fileHandle.getFile();
                            const blob = await file.blob();
                            await generateThumbnailFromBlob(blob, plantFolderHandle, folderName);
                        }
                    } catch (thumbGenError) {
                        console.warn('⚠️ Could not regenerate thumbnail for new main image:', thumbGenError.message);
                    }
                }
            } else {
                plant.imageUrl = '';
            }
        } else if (plant.images.length === 0) {
            plant.imageUrl = '';
        }
        
        // Update localStorage
        try {
            if (plant.images.length > 0) {
                localStorage.setItem(`plant_${plantId}_images`, JSON.stringify(plant.images));
                if (plant.imageUrl) {
                    localStorage.setItem(`plant_${plantId}_imageUrl`, plant.imageUrl);
                }
            } else {
                localStorage.removeItem(`plant_${plantId}_images`);
                localStorage.removeItem(`plant_${plantId}_imageUrl`);
            }
        } catch (e) {
            console.warn('Could not update localStorage:', e);
        }

        // Update Supabase plants_catalog so delete persists on hosted site
        if (supabase && window.supabaseDb && window.supabaseDb.updatePlantInCatalog) {
            var updatedPlant = Object.assign({}, plant);
            window.supabaseDb.updatePlantInCatalog(plantId, updatedPlant);
        }
        
        // Refresh the modal to update gallery and other views
        showPlantModal(plant);
        
        // Update main grid card if visible
        const card = document.querySelector(`.plant-card[data-plant-id="${plantId}"]`);
        if (card) {
            const cardImg = card.querySelector('.plant-image');
            if (cardImg && plant.imageUrl) {
                cardImg.src = plant.imageUrl + '?refresh=' + Date.now();
            } else if (cardImg) {
                cardImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7wn4y6PC90ZXh0Pjwvc3ZnPg==';
            }
        }
        
        console.log('✅ Image deleted successfully');
    } catch (error) {
        console.error('❌ Error deleting image:', error);
        alert('Error deleting image: ' + error.message);
    }
}

// Assign next sequential plant ID for new plants (id null/undefined)
function getNextPlantId() {
    var db = (typeof window !== 'undefined' && window.plantsDatabase) ? window.plantsDatabase : [];
    var maxId = 0;
    for (var i = 0; i < db.length; i++) {
        var n = db[i].id;
        if (typeof n === 'number' && n > maxId) maxId = n;
    }
    return maxId + 1;
}

// Save plant data to JSON file (persists changes across page refreshes)
// Returns true if file was written, false otherwise (e.g. no folder access)
async function savePlantToJsonFile(plant) {
    if (!plant || !getScientificNameString(plant)) {
        console.warn('⚠️ Cannot save plant: missing scientific name');
        return false;
    }
    if (plant.id == null || plant.id === undefined) {
        plant.id = getNextPlantId();
    }
    try {
        let plantsFolderHandle = plantsMergedFolderHandle;
        
        if (plantsFolderHandle) {
            const folderName = scientificNameToSlug(getScientificNameString(plant));
            if (!folderName) {
                console.warn('⚠️ Cannot generate filename from scientific name');
                return false;
            }
            
            const filename = `${folderName}.json`;
            
            try {
                const plantDataToSave = { ...plant };
                delete plantDataToSave._filename;
                delete plantDataToSave._filePath;
                
                const jsonContent = JSON.stringify(plantDataToSave, null, 2) + '\n';
                
                const fileHandle = await plantsFolderHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(jsonContent);
                await writable.close();
                
                try {
                    localStorage.setItem('plant_edit_' + plant.id, jsonContent.trim());
                    if (typeof syncToRepo === 'function') syncToRepo();
                } catch (e) { /* ignore */ }
                console.log(`✅ Saved plant JSON: data/plants-merged/${filename}`);
                return true;
            } catch (fileError) {
                console.warn('⚠️ Could not save plant JSON file:', fileError.message);
                return false;
            }
        } else {
            try {
                const plantDataToSave = { ...plant };
                delete plantDataToSave._filename;
                delete plantDataToSave._filePath;
                localStorage.setItem('plant_edit_' + plant.id, JSON.stringify(plantDataToSave, null, 2));
                if (typeof syncToRepo === 'function') syncToRepo();
            } catch (e) { /* ignore */ }
            console.log('ℹ️ Plant JSON not saved to file (folder access not available). Edits stored in browser for this session.');
            return false;
        }
    } catch (error) {
        console.warn('⚠️ Error saving plant JSON:', error.message);
        return false;
    }
}

// Remove image from gallery when it fails to load (silent)
function removeImageFromGallery(plantId, imgPath, index) {
    // Mark this image as failed to prevent retries
    failedImageCache.add(imgPath);
    
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant) return;
    
    // Remove from array (silently)
    if (plant.images) {
        plant.images = plant.images.filter(img => img !== imgPath);
    }
    
    // Update localStorage (silently)
    try {
        if (plant.images && plant.images.length > 0) {
            plant.images = ensureUniqueImages(plant.images);
            localStorage.setItem(`plant_${plantId}_images`, JSON.stringify(plant.images));
        } else {
            localStorage.removeItem(`plant_${plantId}_images`);
        }
        if (typeof syncToRepo === 'function') syncToRepo();
    } catch (e) {
        // Silent - localStorage update failed
    }
    
    // Update display (silently hide)
    const gallery = document.getElementById(`gallery-${plantId}`);
    if (gallery) {
        const item = gallery.querySelector(`[data-img-path="${imgPath}"]`) || 
                     gallery.querySelector(`[data-image-index="${index}"]`);
        if (item) {
            item.style.display = 'none';
            // Remove after delay to avoid layout shift
            setTimeout(() => item.remove(), 100);
        }
        updateGalleryCount(plantId);
    }
}

// Update gallery count after images fail to load
function updateGalleryCount(plantId) {
    const gallery = document.getElementById(`gallery-${plantId}`);
    if (gallery) {
        const visibleItems = gallery.querySelectorAll('.gallery-item').length;
        const header = gallery.closest('.modal-section')?.querySelector('h3');
        if (header && visibleItems >= 0) {
            header.textContent = `Photo Gallery (${visibleItems} ${visibleItems === 1 ? 'image' : 'images'})`;
        }
    }
}

// Refresh and verify images for a specific plant
async function refreshPlantImages(plantId) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant) return;
    
    // Preserve current images before verification (in case verification fails)
    const currentImages = [...(plant.images || [])];
    const currentImageUrl = plant.imageUrl;
    
    // Show loading
    const gallery = document.getElementById(`gallery-${plantId}`);
    if (gallery) {
        gallery.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">🔄 Scanning images...</div>';
    }
    
    // Verify all existing images (but don't remove all if check fails)
    await verifyPlantImages(plant);
    
    // If verification removed all images, restore from localStorage as fallback
    if ((!plant.images || plant.images.length === 0) && currentImages.length > 0) {
        try {
            const savedImages = localStorage.getItem(`plant_${plantId}_images`);
            if (savedImages) {
                const parsed = JSON.parse(savedImages);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    plant.images = parsed;
                    if (!plant.imageUrl && parsed[0]) {
                        plant.imageUrl = parsed[0];
                    }
                }
            } else {
                // Restore from currentImages as last resort
                plant.images = currentImages;
                if (!plant.imageUrl && currentImageUrl) {
                    plant.imageUrl = currentImageUrl;
                }
            }
        } catch (e) {
            // If localStorage fails, restore from currentImages
            plant.images = currentImages;
            if (!plant.imageUrl && currentImageUrl) {
                plant.imageUrl = currentImageUrl;
            }
        }
    }
    
    // Scan for new images
    if (plant.imageUrl && plant.imageUrl.includes('/')) {
        const pathParts = plant.imageUrl.split('/');
        if (pathParts.length >= 3 && pathParts[0] === 'images') {
            const plantFolderName = pathParts[1];
            const { existingImages } = await scanExistingImages(plantFolderName, plant);
            
            // Merge verified images with existing ones (no duplicates)
            const allImages = [...new Set([...(plant.images || []), ...existingImages])];
            
            // Verify each one actually exists, but keep originals if verification fails
            const verified = [];
            const verifiedSet = new Set();
            const unverified = [];
            const unverifiedSet = new Set();
            
            for (const img of allImages) {
                if (verifiedSet.has(img) || unverifiedSet.has(img)) continue; // Skip duplicates
                
                const exists = await checkImageExists(img);
                if (exists) {
                    verified.push(img);
                    verifiedSet.add(img);
                } else if (currentImages.includes(img)) {
                    // Keep unverified images if they were in the original list
                        unverified.push(img);
                    unverifiedSet.add(img);
                }
            }
            
            // Use verified images, but fall back to unverified if no verified images found
            if (verified.length > 0) {
                plant.images = verified;
            } else if (unverified.length > 0) {
                // Keep unverified images rather than showing empty gallery
                plant.images = unverified;
            } else {
                // Last resort: keep current images
                plant.images = currentImages.length > 0 ? currentImages : (plant.images || []);
            }
            
            // Update localStorage only if we have images
            if (plant.images && plant.images.length > 0) {
                try {
                    plant.images = ensureUniqueImages(plant.images);
                    localStorage.setItem(`plant_${plantId}_images`, JSON.stringify(plant.images));
                } catch (e) {
                    console.log(`Could not save images for plant ${plantId}:`, e);
                }
            }
        }
    }
    
    // Ensure we have images to display
    if (!plant.images || plant.images.length === 0) {
        // Restore from localStorage as final fallback
        try {
            const savedImages = localStorage.getItem(`plant_${plantId}_images`);
            if (savedImages) {
                const parsed = JSON.parse(savedImages);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    plant.images = parsed;
                }
            }
        } catch (e) {
            // Silent fallback
        }
    }
    
    // Refresh the modal
    showPlantModal(plant);
}

// Copy scientific name to clipboard
async function copyScientificNameToClipboard(scientificName, element) {
    try {
        await navigator.clipboard.writeText(scientificName);
        
        // Visual feedback
        const originalText = element.textContent;
        element.textContent = '✓ Copied!';
        element.style.background = 'rgba(76, 175, 80, 0.2)';
        element.style.color = '#4caf50';
        
        // Reset after 2 seconds
        setTimeout(() => {
            element.textContent = originalText;
            element.style.background = 'rgba(74, 144, 226, 0.1)';
            element.style.color = 'var(--primary-color)';
        }, 2000);
        
        console.log(`✅ Copied "${scientificName}" to clipboard`);
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = scientificName;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            const originalText = element.textContent;
            element.textContent = '✓ Copied!';
            element.style.background = 'rgba(76, 175, 80, 0.2)';
            element.style.color = '#4caf50';
            setTimeout(() => {
                element.textContent = originalText;
                element.style.background = 'rgba(74, 144, 226, 0.1)';
                element.style.color = 'var(--primary-color)';
            }, 2000);
        } catch (fallbackErr) {
            console.error('Fallback copy failed:', fallbackErr);
        }
        document.body.removeChild(textArea);
    }
}

// Generate 60x60 thumbnail blob from an image URL (for Supabase thumb.jpg upload; taxonomy tree uses main image as thumb)
function resizeImageBlobToMaxDimension(blob, maxDim) {
    return new Promise(function (resolve, reject) {
        var img = new Image();
        var url = URL.createObjectURL(blob);
        img.onload = function () {
            URL.revokeObjectURL(url);
            var w = img.naturalWidth;
            var h = img.naturalHeight;
            if (w <= maxDim && h <= maxDim) {
                resolve(blob);
                return;
            }
            var scale = maxDim / Math.max(w, h);
            var newW = Math.round(w * scale);
            var newH = Math.round(h * scale);
            var canvas = document.createElement('canvas');
            canvas.width = newW;
            canvas.height = newH;
            canvas.getContext('2d').drawImage(img, 0, 0, newW, newH);
            canvas.toBlob(function (resized) {
                resized ? resolve(resized) : reject(new Error('toBlob failed'));
            }, 'image/jpeg', 0.92);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
    });
}

function generateThumbnailBlobFromUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return Promise.reject(new Error('imageUrl required'));
    return new Promise(function (resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            try {
                var canvas = document.createElement('canvas');
                canvas.width = 60;
                canvas.height = 60;
                var ctx = canvas.getContext('2d');
                var scale = Math.max(60 / img.width, 60 / img.height);
                var scaledWidth = img.width * scale;
                var scaledHeight = img.height * scale;
                var x = (60 - scaledWidth) / 2;
                var y = (60 - scaledHeight) / 2;
                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                canvas.toBlob(function (blob) {
                    if (blob) resolve(blob);
                    else reject(new Error('toBlob failed'));
                }, 'image/jpeg', 0.85);
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = function () { reject(new Error('Image load failed')); };
        img.src = imageUrl;
    });
}

// Generate 60x60 thumbnail from an image blob (used during upload)
async function generateThumbnailFromBlob(imageBlob, plantFolderHandle, plantFolderName) {
    try {
        // Create image from blob
        const img = new Image();
        const imageUrl = URL.createObjectURL(imageBlob);
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
        });
        
        // Create canvas and resize to 60x60
        const canvas = document.createElement('canvas');
        canvas.width = 60;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        
        // Calculate scaling to cover (crop to fill) - maintain aspect ratio
        const scale = Math.max(60 / img.width, 60 / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const x = (60 - scaledWidth) / 2;
        const y = (60 - scaledHeight) / 2;
        
        // Draw image with cover fit (crop to fill)
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
        
        // Convert to blob
        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
        });
        
        // Clean up object URL
        URL.revokeObjectURL(imageUrl);
        
        // Save thumbnail using File System Access API
        if (plantFolderHandle) {
            const thumbFileHandle = await plantFolderHandle.getFileHandle('thumb.jpg', { create: true });
            const writable = await thumbFileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            
            console.log(`✅ Thumbnail generated and saved: images/${plantFolderName}/thumb.jpg`);
        }
    } catch (error) {
        console.warn('⚠️ Could not generate thumbnail from blob:', error.message);
        throw error;
    }
}

// Generate 60x60 thumbnail for a plant's main image (browser-side)
async function generateThumbnailForPlant(plant, imagePath) {
    if (!plant || !imagePath || !getScientificNameString(plant)) {
        return;
    }
    
    try {
        // Convert scientific name to slug (use global scientificNameToSlug)
        const folderName = (typeof scientificNameToSlug === 'function' ? scientificNameToSlug(getScientificNameString(plant)) : null);
        if (!folderName) return;
        
        // Load the image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imagePath;
        });
        
        // Create canvas and resize to 60x60
        const canvas = document.createElement('canvas');
        canvas.width = 60;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        
        // Calculate scaling to cover (crop to fill) - maintain aspect ratio
        const scale = Math.max(60 / img.width, 60 / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const x = (60 - scaledWidth) / 2;
        const y = (60 - scaledHeight) / 2;
        
        // Draw image with cover fit (crop to fill)
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
        
        // Convert to blob
        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
        });
        
        // Save using File System Access API if available
        if (window.showDirectoryPicker) {
            try {
                // Get or request images folder access
                if (!imagesFolderHandle) {
                    imagesFolderHandle = await window.showDirectoryPicker();
                }
                
                const plantFolderHandle = await imagesFolderHandle.getDirectoryHandle(folderName, { create: true });
                const thumbFileHandle = await plantFolderHandle.getFileHandle('thumb.jpg', { create: true });
                const writable = await thumbFileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`✅ Generated thumbnail: images/${folderName}/thumb.jpg`);
            } catch (error) {
                console.warn('⚠️ Could not save thumbnail (File System Access API not available or denied):', error.message);
                // Fallback: try to download it
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${folderName}-thumb.jpg`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } else {
            // Fallback: download the thumbnail
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${folderName}-thumb.jpg`;
            a.click();
            URL.revokeObjectURL(url);
            console.log(`💾 Thumbnail ready for download: ${folderName}-thumb.jpg (save to images/${folderName}/thumb.jpg)`);
        }
    } catch (error) {
        console.warn('⚠️ Could not generate thumbnail:', error.message);
    }
}

// Set image as main (swap with first image)
async function setAsMainImage(plantId, imageIndex) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant || !plant.images || imageIndex >= plant.images.length || imageIndex < 0) {
        return;
    }
    
    const selectedImage = plant.images[imageIndex];
    
    // Check if this image is already the main image
    if (plant.imageUrl === selectedImage || (imageIndex === 0 && plant.imageUrl === plant.images[0])) {
        console.log('ℹ️ This image is already the main image');
        return;
    }
    
    // Find the current main image index (the one matching imageUrl, or index 0 if no imageUrl)
    let mainImageIndex = 0;
    if (plant.imageUrl) {
        const mainIndex = plant.images.findIndex(img => img === plant.imageUrl);
        if (mainIndex >= 0) {
            mainImageIndex = mainIndex;
        }
    }
    
    // If clicking on the current main image, do nothing
    if (imageIndex === mainImageIndex) {
        console.log('ℹ️ This image is already the main image');
        return;
    }
    
    const mainImage = plant.images[mainImageIndex];
    
    // Extract folder and filenames from paths
    const getPathParts = (imgPath) => {
        const parts = imgPath.split('/');
        if (parts.length >= 3 && parts[0] === 'images') {
            return {
                folder: parts[1],
                filename: parts[2],
                fullPath: imgPath
            };
        }
        return null;
    };
    
    const mainParts = getPathParts(mainImage);
    const selectedParts = getPathParts(selectedImage);
    
    if (!mainParts || !selectedParts) {
        console.error('Could not parse image paths');
        console.error('❌ Error: Could not parse image paths. Please ensure images are in the images/[plant-name]/ folder structure.');
        return;
    }
    
    // Extract numbers from filenames (e.g., "plant-1.jpg" -> 1)
    const getImageNumber = (filename) => {
        const match = filename.match(/-(\d+)\.(jpg|jpeg|png|webp)$/i);
        return match ? parseInt(match[1]) : null;
    };
    
    const mainNumber = getImageNumber(mainParts.filename);
    const selectedNumber = getImageNumber(selectedParts.filename);
    
    if (mainNumber === null || selectedNumber === null) {
        console.error('Could not extract image numbers from filenames');
        console.error('❌ Error: Images must follow the naming pattern: [plant-name]-[number].jpg');
        return;
    }
    
    // Automatically proceed without confirmation
    console.log(`Setting image ${selectedNumber} as the main image (moving to position 1)`);
    
    try {
        // Move selected image to position 0 (first position)
        // First ensure no duplicates exist
        plant.images = ensureUniqueImages(plant.images);
        
        const selectedImagePath = plant.images[imageIndex];
        plant.images.splice(imageIndex, 1); // Remove from current position
        plant.images.unshift(selectedImagePath); // Add to beginning
        
        // Ensure still no duplicates after move
        plant.images = ensureUniqueImages(plant.images);
        
        // Update imageUrl to point to new main image (now at index 0)
        // This ensures the selected image becomes the main image
        plant.imageUrl = plant.images[0];
        
        // Debug log
        console.log('🔄 Image moved to index 0:', plant.images[0]);
        console.log('🔄 plant.imageUrl set to:', plant.imageUrl);
        
        // Save to localStorage
        try {
            plant.images = ensureUniqueImages(plant.images);
            localStorage.setItem(`plant_${plantId}_images`, JSON.stringify(plant.images));
            if (plant.imageUrl) {
                localStorage.setItem(`plant_${plantId}_imageUrl`, plant.imageUrl);
            }
        } catch (e) {
            console.log('Could not save to localStorage:', e);
        }
        
        // Generate thumbnail for the new main image
        await generateThumbnailForPlant(plant, plant.imageUrl);
        // When using Supabase, upload thumb.jpg so taxonomy tree shows the new main image
        var supabaseUpload = window.supabaseDb && window.supabaseDb.isConfigured && window.supabaseDb.uploadToStorage;
        if (supabaseUpload && plant.imageUrl) {
            var slugSetMain = scientificNameToSlug(getScientificNameString(plant)) || ('plant-' + plantId);
            generateThumbnailBlobFromUrl(plant.imageUrl).then(function (blob) {
                var file = new File([blob], 'thumb.jpg', { type: 'image/jpeg' });
                return window.supabaseDb.uploadToStorage(file, 'plants/' + slugSetMain + '/thumb.jpg');
            }).catch(function () {});
        }
        // Try to rename actual files using File System Access API
        if (imagesFolderHandle && mainParts.folder === selectedParts.folder) {
            try {
                const plantFolderHandle = await imagesFolderHandle.getDirectoryHandle(mainParts.folder);
                
                // Create temporary names to avoid conflicts
                const tempMainName = `${mainParts.folder}-temp-${Date.now()}-${mainNumber}.jpg`;
                const tempSelectedName = `${selectedParts.folder}-temp-${Date.now()}-${selectedNumber}.jpg`;
                
                // Step 1: Rename main to temp-main
                const mainFileHandle = await plantFolderHandle.getFileHandle(mainParts.filename);
                await mainFileHandle.move(tempMainName);
                
                // Step 2: Rename selected to main (selected image becomes the 1st image)
                const selectedFileHandle = await plantFolderHandle.getFileHandle(selectedParts.filename);
                await selectedFileHandle.move(mainParts.filename);
                
                // Step 3: Rename temp-main to selected (old main takes the selected image's old name)
                const tempMainFileHandle = await plantFolderHandle.getFileHandle(tempMainName);
                await tempMainFileHandle.move(selectedParts.filename);
                
                // Update paths in images array to reflect new filenames
                // The selected image (now at index 0) should have the main filename (plant-1.jpg)
                plant.images[0] = `images/${mainParts.folder}/${mainParts.filename}`;
                
                // Find where the old main image ended up after the move
                // When we remove selected: if selected < main, main shifts down by 1; if selected > main, main stays
                // When we add selected at 0: everything shifts up by 1
                // So: if selected < main: main ends at (mainImageIndex - 1) + 1 = mainImageIndex
                //     if selected > main: main ends at mainImageIndex + 1
                const oldMainNewIndex = imageIndex < mainImageIndex ? mainImageIndex : mainImageIndex + 1;
                if (oldMainNewIndex < plant.images.length && oldMainNewIndex > 0) {
                    plant.images[oldMainNewIndex] = `images/${selectedParts.folder}/${selectedParts.filename}`;
                }
                
                // Ensure imageUrl points to the new main image (index 0)
                plant.imageUrl = plant.images[0];
                
                console.log('✅ Files renamed successfully - selected image is now the 1st image');
            } catch (fsError) {
                console.warn('Could not rename files (File System Access API):', fsError);
                console.log('📝 Image order updated in memory and localStorage. To rename files, select the images folder again.');
            }
        } else {
            // No folder handle - just update in memory/localStorage
            console.log('📝 Image order updated in memory and localStorage. File renaming requires folder access.');
            console.log('💡 Tip: Use "Select Images Folder" in upload modal to enable file renaming.');
        }
        
        // Ensure plant.imageUrl is set to the first image (the new main image)
        plant.imageUrl = plant.images[0];
        
        // Also update the plant in window.plantsDatabase so taxonomy tree sees the change
        if (typeof window !== 'undefined' && window.plantsDatabase) {
            const dbPlant = window.plantsDatabase.find(p => p.id === plantId);
            if (dbPlant) {
                dbPlant.imageUrl = plant.imageUrl;
                dbPlant.images = [...plant.images]; // Copy array to ensure it's updated
            }
        }
        
        // Update images in the modal without resetting the page
        // Update the main image in Page 1 (widget view) - multiple selectors to ensure we find it
        const refreshTimestamp = '?refresh=' + Date.now();
        const newImageUrl = plant.imageUrl + refreshTimestamp;
        
        console.log('🔄 Updating widget view with new main image:', plant.imageUrl);
        
        // Update modal-plant-image (widget view on Page 1) - search in modal body to find even if hidden
        const modalBody = document.getElementById('modalBody');
        if (modalBody) {
            // Update widget view image (Page 1)
            const widgetImages = modalBody.querySelectorAll('.modal-plant-image');
            console.log('🔄 Found', widgetImages.length, 'modal-plant-image elements in widget view');
            widgetImages.forEach(img => {
                img.src = newImageUrl;
                img.style.display = 'block';
                img.onerror = null; // Reset error handler
            });
            
            // Also update any image containers in the widget view (more specific)
            const widgetImageContainers = modalBody.querySelectorAll('.modal-image-widget img');
            widgetImageContainers.forEach(img => {
                if (img.classList.contains('modal-plant-image') || img.classList.contains('gallery-preview-image')) {
                    img.src = newImageUrl;
                    img.style.display = 'block';
                }
            });
        }
        
        // Re-render the gallery section to show new order with star icon
        // Find gallery container - search in modal body to find even if on hidden page
        let galleryContainer = null;
        if (modalBody) {
            galleryContainer = modalBody.querySelector('.plant-gallery');
        }
        // Fallback: try direct query
        if (!galleryContainer) {
            galleryContainer = document.querySelector('.plant-gallery');
        }
        
        if (galleryContainer && plant.images && plant.images.length > 0) {
            const plantName = plant.name || 'Plant';
            // Ensure no duplicates
            plant.images = ensureUniqueImages(plant.images);
            
            console.log('🔄 Re-rendering gallery with', plant.images.length, 'images');
            console.log('🔄 First image (main):', plant.images[0]);
            
            galleryContainer.innerHTML = plant.images.map((img, idx) => {
                const escapedPath = img.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                // Main image is always at index 0
                const isMain = idx === 0;
                return `
                <div class="gallery-item gallery-thumbnail ${idx === 0 ? 'selected' : ''}" data-img-index="${idx}" data-img-path="${escapedPath}" onclick="selectGalleryImage('${escapedPath}', ${plant.id}, ${idx}, event)" style="cursor: pointer; position: relative;">
                    ${isMain ? '<div class="main-image-badge" title="Main image">⭐</div>' : ''}
                <button class="delete-image-btn" onclick="event.stopPropagation(); deleteImageFromGallery(${plant.id}, ${idx}, '${escapedPath}');" title="Delete this image" style="position: absolute; top: 6px; right: 6px; background: rgba(211, 47, 47, 0.9); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 16px; line-height: 1; z-index: 3; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">×</button>
                <img src="${img}" alt="${plantName} - Image ${idx + 1}" loading="lazy" 
                         onerror="this.style.display='none';" 
                         onload="this.style.display='block';"
                         style="display: block;">
                </div>
            `;
            }).join('');
            
            // Ensure the first thumbnail is selected and visible
            const firstThumbnail = galleryContainer.querySelector('.gallery-thumbnail[data-img-index="0"]');
            if (firstThumbnail) {
                galleryContainer.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
                    thumb.classList.remove('selected');
                });
                firstThumbnail.classList.add('selected');
                console.log('✅ First thumbnail selected and star icon should be visible');
            } else {
                console.warn('⚠️ Could not find first thumbnail after re-render');
            }
        } else {
            console.warn('⚠️ Gallery container not found or no images available');
        }
        
        // Update the gallery preview in Page 2 if it's displayed
        const galleryPreviewImg = document.getElementById('gallery-preview-img');
        if (galleryPreviewImg) {
            galleryPreviewImg.src = newImageUrl;
            galleryPreviewImg.setAttribute('data-current-index', '0');
            console.log('✅ Gallery preview updated');
        }
        
        // Update main grid card if visible
        const card = document.querySelector(`.plant-card[data-plant-id="${plantId}"]`);
        if (card) {
            const cardImg = card.querySelector('.plant-image');
            if (cardImg) {
                cardImg.src = newImageUrl;
                cardImg.onerror = function() {
                    this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7wn4y6PC90ZXh0Pjwvc3ZnPg==';
                };
                console.log('✅ Main grid card image updated');
            }
        }
        
        console.log('✅ Main image updated successfully - widget view, gallery, and card should all show the new main image');
        
    } catch (error) {
        console.error('Error setting main image:', error);
        console.error('❌ Error setting main image:', error.message);
        
        // Revert changes if file operation failed but we already updated the array
        // Restore original order by moving image back
        const movedImage = plant.images.shift(); // Remove from index 0
        if (movedImage) {
            plant.images.splice(imageIndex, 0, movedImage); // Insert back at original position
        }
        if (mainImageIndex === 0) {
            plant.imageUrl = plant.images[0];
        } else {
            plant.imageUrl = plant.images[mainImageIndex];
        }
        showPlantModal(plant);
    }
}

/** Export current supplies catalog (equipment.json + custom + merged images) to JSON file. Run on local site then replace data/equipment.json with the downloaded file. */
function exportSuppliesCatalog() {
    var list = window.allEquipment || [];
    var out = list.map(function(eq) {
        return {
            id: eq.id,
            name: eq.name,
            description: eq.description || '',
            imageUrl: eq.imageUrl || '',
            images: Array.isArray(eq.images) ? eq.images : [],
            price: eq.price,
            category: eq.category || ''
        };
    });
    var json = JSON.stringify(out, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'equipment.json';
    a.click();
    URL.revokeObjectURL(a.href);
    console.log('Exported', out.length, 'supplies to equipment.json');
    return json;
}
window.exportSuppliesCatalog = exportSuppliesCatalog;

/** One-time helper: migrate existing localStorage equipment images to disk under images/supplies/equipment-{id}/ and update paths. */
async function migrateEquipmentImagesToFiles() {
    if (typeof saveEquipmentImageFilesToFolder !== 'function') {
        console.warn('saveEquipmentImageFilesToFolder not available');
        return;
    }
    if (!allEquipment || !allEquipment.length) {
        console.warn('No equipment loaded. Open the main page so supplies load first.');
        return;
    }
    function isDataUrl(str) {
        return typeof str === 'string' && str.startsWith('data:');
    }
    async function dataUrlToBlob(dataUrl) {
        try {
            const res = await fetch(dataUrl);
            return await res.blob();
        } catch (e) {
            return null;
        }
    }
    let migratedCount = 0;
    for (let i = 0; i < allEquipment.length; i++) {
        const eq = allEquipment[i];
        if (!eq || eq.id == null) continue;
        let raw = null;
        try {
            raw = localStorage.getItem('equipment_' + eq.id + '_images');
        } catch (e) { /* ignore */ }
        if (!raw) continue;
        let arr;
        try {
            arr = JSON.parse(raw);
        } catch (e) {
            continue;
        }
        if (!Array.isArray(arr) || !arr.length) continue;
        const files = [];
        for (let j = 0; j < arr.length; j++) {
            const src = arr[j];
            if (!src || typeof src !== 'string') continue;
            if (src.startsWith('images/')) {
                // Already a file path, keep as-is
                continue;
            }
            let blob = null;
            if (isDataUrl(src)) {
                blob = await dataUrlToBlob(src);
            } else {
                try {
                    const resp = await fetch(src);
                    if (resp.ok) blob = await resp.blob();
                } catch (e) { /* ignore */ }
            }
            if (!blob) continue;
            const extMatch = (blob.type || '').match(/jpeg|jpg|png|gif|webp/i);
            const ext = extMatch ? (extMatch[0].toLowerCase() === 'jpeg' ? '.jpg' : '.' + extMatch[0].toLowerCase()) : '.jpg';
            const file = new File([blob], 'migrated-' + eq.id + '-' + (files.length + 1) + ext, { type: blob.type || 'image/jpeg' });
            files.push(file);
        }
        if (!files.length) continue;
        try {
            const result = await saveEquipmentImageFilesToFolder(eq, files);
            if (result && result.success) {
                migratedCount++;
                console.log('✅ Migrated images for equipment id', eq.id);
            }
        } catch (e) {
            console.warn('⚠️ Failed to migrate images for equipment id', eq.id, e.message);
        }
    }
    console.log('Migration complete. Supplies with images written to disk:', migratedCount);
}
window.migrateEquipmentImagesToFiles = migrateEquipmentImagesToFiles;

// Make functions globally accessible
window.refreshPlantImages = refreshPlantImages;
window.removeImageFromGallery = removeImageFromGallery;
window.deleteImageFromGallery = deleteImageFromGallery;
window.setAsMainImage = setAsMainImage;
window.openGalleryLightbox = openGalleryLightbox;
window.downloadGalleryImage = downloadGalleryImage;

// Verify images array contains only existing images
async function verifyPlantImages(plant) {
    if (!plant.images || plant.images.length === 0) return;
    
    const verifiedImages = [];
    for (const imgPath of plant.images) {
        const exists = await checkImageExists(imgPath);
        if (exists) {
            verifiedImages.push(imgPath);
        }
    }
    
    // Update plant images with only verified ones
    if (verifiedImages.length !== plant.images.length) {
        plant.images = verifiedImages;
        
        // Update primary image if it was removed
        if (plant.imageUrl && !verifiedImages.includes(plant.imageUrl)) {
            plant.imageUrl = verifiedImages.length > 0 ? verifiedImages[0] : (plant.images && plant.images.length > 0 ? plant.images[0] : '');
        }
        
        // Ensure imageUrl is set if we have images but no primary
        if (!plant.imageUrl && verifiedImages.length > 0) {
            plant.imageUrl = verifiedImages[0];
        }
        
        // Update localStorage only if we have verified images
        if (verifiedImages.length > 0) {
            try {
                const uniqueVerified = ensureUniqueImages(verifiedImages);
                localStorage.setItem(`plant_${plant.id}_images`, JSON.stringify(uniqueVerified));
            } catch (e) {
                console.log(`Could not update images for plant ${plant.id}:`, e);
            }
        }
    } else {
        // Even if all verified, ensure imageUrl is set
        if (!plant.imageUrl && verifiedImages.length > 0) {
            plant.imageUrl = verifiedImages[0];
        }
    }
}

// Make functions globally accessible
// Make functions globally accessible for onclick handlers
window.openImageUpload = openImageUpload;
window.saveImage = saveImage;
window.downloadGalleryImage = downloadGalleryImage;
window.openGalleryLightbox = openGalleryLightbox;
window.changeGalleryImage = changeGalleryImage;
window.clearDragDropGallery = clearDragDropGallery;
window.generateCareCard = generateCareCard;
// - PlantNet API (for plant identification and images)
// - Custom scraping service (backend required due to CORS)

// For better image fetching, consider using Unsplash API with access key:
async function fetchPlantImageWithAPI(plant) {
    // Example using Unsplash API (requires ACCESS_KEY)
    // const ACCESS_KEY = 'YOUR_UNSPLASH_ACCESS_KEY';
    // const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(plant.scientificName)}&client_id=${ACCESS_KEY}&per_page=1`;
    // const response = await fetch(url);
    // const data = await response.json();
    // return data.results[0]?.urls?.regular || null;
}

// Generate printable care card for a plant (A6 size)
function generateCareCard(plantId) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant) {
        console.error('Plant not found:', plantId);
        return;
    }
    
    // Get plant image
    const plantImageUrl = plant.imageUrl || (plant.images && plant.images.length > 0 ? plant.images[0] : null);
    
    // Get plant inputs for scales
    const plantInputs = mapPlantToInputs(plant);
    
    // Calculate suitable vivarium types for badges
    const calculatedTypes = calculatePlantVivariumTypes(plant);
    let badgesHTML = '';
    if (calculatedTypes && calculatedTypes.length > 0) {
        badgesHTML = calculatedTypes.map(v => {
            const displayName = String(v).split('-').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            const badgeClass = String(v).toLowerCase().replace(/\s+/g, '-');
            return `<span class="care-badge ${badgeClass}">${displayName}</span>`;
        }).join('');
    }
    
    // Helper function to create requirement scale (same as in modal)
    function createCareCardScale(label, range) {
        if (!range || range.min === undefined || range.max === undefined) {
            return '';
        }
        
        const min = range.min;
        const max = range.max;
        const ideal = range.ideal !== undefined ? range.ideal : (min + max) / 2;
        
        // Generate tick marks every 10%
        let tickMarks = '';
        for (let i = 0; i <= 100; i += 10) {
            tickMarks += `<div class="care-scale-tick" style="left: ${i}%;"></div>`;
        }
        
        // Determine scale labels based on requirement type
        let leftLabel = '0%';
        let rightLabel = '100%';
        let idealLabel = '';
        
        if (label === 'Temperature') {
            leftLabel = '0°C';
            rightLabel = '50°C';
            const idealTemp = (ideal / 100) * 50;
            idealLabel = idealTemp.toFixed(0) + '°C';
        } else if (label === 'Difficulty Level') {
            leftLabel = 'Easy';
            rightLabel = 'Hard';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Soil pH' || label === 'Water pH') {
            leftLabel = 'pH 0';
            rightLabel = 'pH 14';
            const idealPh = (ideal / 100) * 14;
            idealLabel = idealPh.toFixed(1);
        } else if (label === 'Water Circulation') {
            leftLabel = 'Still';
            rightLabel = 'Strong Current';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Water Temperature') {
            leftLabel = '0°C';
            rightLabel = '50°C';
            const idealTemp = (ideal / 100) * 50;
            idealLabel = idealTemp.toFixed(0) + '°C';
        } else if (label === 'Water Hardness') {
            leftLabel = '0 dGH';
            rightLabel = '30 dGH';
            const idealGH = (ideal / 100) * 30;
            idealLabel = idealGH.toFixed(1) + ' dGH';
        } else if (label === 'Salinity') {
            leftLabel = 'Fresh';
            rightLabel = 'Marine';
            const idealSal = (ideal / 100) * 40;
            if (ideal <= 5) {
                idealLabel = 'Fresh';
            } else {
                idealLabel = idealSal.toFixed(1) + ' ppt';
            }
        } else if (label === 'Light Requirements' || label === 'Light') {
            leftLabel = 'Darkness';
            rightLabel = 'Direct Sunlight';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Air Circulation') {
            leftLabel = 'Still';
            rightLabel = 'Constant Flow';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Watering' || label === 'Water Needs') {
            leftLabel = 'Drought';
            rightLabel = 'Moist';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Growth Rate') {
            leftLabel = 'Very Slow';
            rightLabel = 'Very Fast';
            idealLabel = ideal.toFixed(0) + '%';
        } else {
            idealLabel = ideal.toFixed(0) + '%';
        }
        
        // Constrain ideal label positioning to stay within track bounds
        let labelTransform = 'translateX(-50%)';
        let labelLeft = '50%';
        if (ideal <= 5) {
            // Near left edge - align left
            labelTransform = 'translateX(0)';
            labelLeft = '0';
        } else if (ideal >= 95) {
            // Near right edge - align right
            labelTransform = 'translateX(-100%)';
            labelLeft = '100%';
        }
        
        return `
            <div class="care-scale-item">
                <div class="care-scale-label">${label}</div>
                <div class="care-scale-container">
                    <div class="care-scale-track-wrapper">
                        <div class="care-scale-track">
                            ${tickMarks}
                            <div class="care-scale-range" style="left: ${min}%; width: ${max - min}%;"></div>
                            <div class="care-scale-ideal" style="left: ${ideal}%;">
                                <span class="care-scale-ideal-label" style="left: ${labelLeft}; transform: ${labelTransform};">${idealLabel}</span>
                            </div>
                        </div>
                        <div class="care-scale-labels">
                            <span class="care-scale-value">${leftLabel}</span>
                            <span class="care-scale-value">${rightLabel}</span>
                        </div>
                    </div>
                </div>
            </div>`;
    }
    
    // Build plant details HTML in a grid format
    let plantDetailsHTML = '';
    const details = [];
    const addDetail = (label, value) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            details.push({ label, value });
        }
    };
    
    addDetail('Plant Type', plant.plantType);
    addDetail('Size', plant.size);
    addDetail('Substrate', plant.substrate);
    addDetail('Rarity', formatRarityLabel(plant.rarity));
    addDetail('Hazard', plant.hazard);
    addDetail('Flowering Period', plant.floweringPeriod);
    addDetail('Colors', plant.colors);
    addDetail('Natural Habitat', plant.growthHabit);
    addDetail('Growth Pattern', plant.growthPattern);
    addDetail('Propagation', plant.propagation);
    
    // Create grid layout (2 columns)
    details.forEach(({ label, value }) => {
        plantDetailsHTML += `
            <div class="care-detail-item">
                <span class="care-detail-label">${label}:</span>
                <span class="care-detail-value">${value}</span>
            </div>`;
    });
    
    // Build scales HTML - include all scales from widgets view
    let scalesHTML = '';
    
    // Difficulty Level (first in widgets view)
    if (plantInputs.difficultyRange) {
        scalesHTML += createCareCardScale('Difficulty Level', plantInputs.difficultyRange);
    }
    
    // Main requirement scales
    const scaleLabels = [
        { key: 'lightRange', label: 'Light Requirements' },
        { key: 'humidityRange', label: 'Humidity' },
        { key: 'temperatureRange', label: 'Temperature' },
        { key: 'airCirculationRange', label: 'Air Circulation' },
        { key: 'waterNeedsRange', label: 'Watering' },
        { key: 'growthRateRange', label: 'Growth Rate' }
    ];
    
    scaleLabels.forEach(({ key, label }) => {
        const range = plantInputs[key] || plant[key];
        if (range) {
            scalesHTML += createCareCardScale(label, range);
        }
    });
    
    // Add pH scale if available
    if (plantInputs.soilPhRange || plant.soilPhRange) {
        scalesHTML += createCareCardScale('Soil pH', plantInputs.soilPhRange || plant.soilPhRange);
    }
    
    // Add aquatic scales if applicable
    const isAquatic = plantInputs.substrate === 'aquatic' || plantInputs.specialNeeds === 'aquatic' || plant.substrateType === 'aquatic';
    if (isAquatic) {
        if (plantInputs.waterTemperatureRange || plant.waterTemperatureRange) {
            scalesHTML += createCareCardScale('Water Temperature', plantInputs.waterTemperatureRange || plant.waterTemperatureRange);
        }
        if (plantInputs.waterPhRange || plant.waterPhRange) {
            scalesHTML += createCareCardScale('Water pH', plantInputs.waterPhRange || plant.waterPhRange);
        }
        if (plantInputs.waterHardnessRange || plant.waterHardnessRange) {
            scalesHTML += createCareCardScale('Water Hardness', plantInputs.waterHardnessRange || plant.waterHardnessRange);
        }
        if (plantInputs.salinityRange || plant.salinityRange) {
            scalesHTML += createCareCardScale('Salinity', plantInputs.salinityRange || plant.salinityRange);
        }
        if (plantInputs.waterCirculationRange || plant.waterCirculationRange) {
            scalesHTML += createCareCardScale('Water Circulation', plantInputs.waterCirculationRange || plant.waterCirculationRange);
        }
    }
    
    // Plant page URL for QR code (same origin + hash so it works on localhost and hosted site)
    let base = window.location.origin + (window.location.pathname || '/');
    if (base.endsWith('.html')) base = base.replace(/\/[^/]*$/, '/');
    else if (!base.endsWith('/')) base = base.replace(/\/[^/]*$/, '') + '/';
    const plantPageUrl = base + '#' + plantId;
    const qrImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=96x96&margin=1&data=' + encodeURIComponent(plantPageUrl);

    // Create HTML content
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Care Card - ${plant.name}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        @page {
            size: A5 portrait;
            margin: 0;
        }
        
        @media print {
            @page {
                size: A5 portrait;
                margin: 0;
            }
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            width: 148mm;
            height: 210mm;
            padding: 5mm;
            background: white;
            color: #2c3e50;
            line-height: 1.2;
            margin: 0;
        }
        
        .care-card {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 3mm;
        }
        
        .care-top-section {
            display: flex;
            gap: 2mm;
            margin-bottom: 2mm;
        }
        
        .care-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 1mm;
            margin-top: auto;
            padding-top: 1.5mm;
            justify-content: center;
        }
        
        .care-badge {
            display: inline-block;
            padding: 1.4mm 2.8mm;
            font-size: 7pt;
            font-weight: 600;
            border-radius: 3px;
            text-transform: uppercase;
        }
        
        .care-badge.terrarium,
        .care-badge.open-terrarium {
            background-color: #d4ed6e;
            color: #5a6e2f;
        }
        
        .care-badge.closed-terrarium {
            background-color: #6b8e23;
            color: #ffffff;
        }
        
        .care-badge.aquarium {
            background-color: #1a4d7a;
            color: #b8d4f0;
        }
        
        .care-badge.deserterium,
        .care-badge.desertarium {
            background-color: #e6d5b8;
            color: #8b6914;
        }
        
        .care-badge.aerarium,
        .care-badge.aererium {
            background-color: #b3d9ff;
            color: #1e4d72;
        }
        
        .care-badge.paludarium {
            background-color: #1b4332;
            color: #d1f4e0;
        }
        
        .care-badge.riparium {
            background-color: #0d9488;
            color: #ccfbf1;
        }
        
        .care-badge.indoor,
        .care-badge.house-plant {
            background-color: #c94a4a;
            color: #ffffff;
        }
        
        .care-badge.outdoor {
            background-color: #8b6914;
            color: #ffffff;
        }
        
        .care-badge.vivarium {
            background-color: #d1ecf1;
            color: #0c5460;
        }
        
        .care-qr-row {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 2mm;
            margin-top: 2mm;
            padding-top: 2mm;
            border-top: 1px solid #eee;
        }
        .care-qr-label {
            font-size: 7pt;
            color: #7f8c8d;
            text-align: right;
        }
        .care-qr-container img {
            display: block;
            width: 20mm;
            height: 20mm;
        }
        
        .care-left-section {
            width: 50%;
            display: flex;
            flex-direction: column;
            min-width: 0;
            height: calc((148mm - 6mm - 2mm) / 2);
            justify-content: space-between;
        }
        
        .care-name {
            font-size: 14pt;
            font-weight: 600;
            color: #4a90e2;
            margin-bottom: 0.5mm;
            line-height: 1.1;
        }
        
        .care-scientific {
            font-size: 10.5pt;
            font-style: italic;
            color: #7f8c8d;
            line-height: 1.1;
            margin-bottom: 3mm;
        }
        
        .care-image-container {
            width: calc((148mm - 6mm - 2mm) / 2);
            aspect-ratio: 1;
            border-radius: 3px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8f9fa;
            flex-shrink: 0;
        }
        
        .care-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .care-details {
            margin-bottom: 0;
            margin-top: 1mm;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
        }
        
        .care-content {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
        }
        
        .care-scales-section {
            flex: 1;
            margin-top: 1.5mm;
            padding-top: 1.5mm;
            min-height: 0;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        
        .care-details-grid {
            display: flex;
            flex-direction: column;
            gap: 0.5mm;
            font-size: 7.7pt;
        }
        
        .care-detail-item {
            display: flex;
            justify-content: space-between;
            line-height: 1.1;
        }
        
        .care-detail-label {
            font-weight: 600;
            color: #2c3e50;
            margin-right: 1mm;
            flex-shrink: 0;
        }
        
        .care-detail-value {
            color: #34495e;
            text-align: right;
            flex: 1;
        }
        
        .care-scales {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 0;
            min-height: 0;
            justify-content: space-between;
        }
        
        .care-scale-item {
            flex: 1 1 auto;
            display: grid;
            grid-template-columns: 35mm 1fr;
            align-items: center;
            gap: 2mm;
            min-height: 0;
        }
        
        .care-scale-label {
            font-size: 7.7pt;
            font-weight: 600;
            color: #2c3e50;
            line-height: 1;
        }
        
        .care-scale-container {
            width: calc((148mm - 6mm - 2mm) / 2);
            max-width: calc((148mm - 6mm - 2mm) / 2);
            min-width: calc((148mm - 6mm - 2mm) / 2);
            display: flex;
            flex-direction: column;
            gap: 0.3mm;
            padding-top: 12px;
            position: relative;
            align-items: flex-end;
            justify-self: end;
        }
        
        .care-scale-track-wrapper {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 0.3mm;
        }
        
        .care-scale-track {
            position: relative;
            width: 100%;
            height: 4px;
            background: linear-gradient(to right, 
                #e8f5e9 0%, 
                #c8e6c9 25%, 
                #a5d6a7 50%, 
                #81c784 75%, 
                #66bb6a 100%);
            border-radius: 2px;
            overflow: visible;
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.1);
        }
        
        .care-scale-tick {
            position: absolute;
            top: 0;
            width: 0.5px;
            height: 4px;
            background: rgba(0, 0, 0, 0.15);
            transform: translateX(-50%);
            z-index: 1;
        }
        
        .care-scale-range {
            position: absolute;
            top: 0;
            height: 100%;
            background: linear-gradient(to right, 
                rgba(45, 80, 22, 0.3) 0%, 
                rgba(74, 124, 42, 0.5) 50%, 
                rgba(45, 80, 22, 0.3) 100%);
            border-radius: 2px;
            border: 0.5px solid rgba(45, 80, 22, 0.4);
            box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.15);
        }
        
        .care-scale-ideal {
            position: absolute;
            top: -0.5px;
            width: 1.5px;
            height: 5px;
            background: #4a90e2;
            border-radius: 1px;
            box-shadow: 0 0 2px rgba(74, 144, 226, 0.6);
            transform: translateX(-50%);
            z-index: 2;
        }
        
        .care-scale-ideal-label {
            position: absolute;
            top: -12px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 7pt;
            font-weight: 600;
            color: #4a90e2;
            white-space: nowrap;
            z-index: 3;
            line-height: 1;
            max-width: 12mm;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .care-scale-ideal[style*="left: 0%"] .care-scale-ideal-label,
        .care-scale-ideal[style*="left: 0%;"] .care-scale-ideal-label {
            left: 0;
            transform: translateX(0);
        }
        
        .care-scale-ideal[style*="left: 100%"] .care-scale-ideal-label,
        .care-scale-ideal[style*="left: 100%;"] .care-scale-ideal-label {
            left: 100%;
            transform: translateX(-100%);
        }
        
        .care-scale-labels {
            display: flex;
            justify-content: space-between;
            font-size: 7pt;
            color: #7f8c8d;
            margin-top: 0.2mm;
            line-height: 1;
        }
        
        .care-scale-value {
            font-weight: 600;
            color: #2c3e50;
        }
        
        @media print {
            body {
                margin: 0;
                padding: 5mm;
            }
            
            .care-card {
                page-break-inside: avoid;
                padding: 3mm;
            }
            
            /* Force colors to print */
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            
            /* Ensure background colors print */
            .care-scale-track,
            .care-scale-range,
            .care-scale-ideal,
            .care-badge {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
        }
    </style>
</head>
<body>
        <div class="care-card">
        <div class="care-top-section">
            <div class="care-left-section">
                <div class="care-name">${plant.name}${plant.commonNames && plant.commonNames.length > 0 && plant.commonNames[0].toLowerCase() !== plant.name.toLowerCase() ? ` (${plant.commonNames[0]})` : ''}</div>
                <div class="care-scientific">${getScientificNameString(plant)}</div>
                ${plantDetailsHTML ? `<div class="care-details"><div class="care-details-grid">${plantDetailsHTML}</div></div>` : ''}
            </div>
            ${plantImageUrl ? `<div class="care-image-container"><img src="${plantImageUrl}" alt="${plant.name}" class="care-image" onerror="this.style.display='none';"></div>` : ''}
        </div>
        <div class="care-content">
            <div class="care-scales-section">
                <div class="care-scales">
                    ${scalesHTML}
                </div>
            </div>
        </div>
        ${badgesHTML ? `<div class="care-badges">${badgesHTML}</div>` : ''}
        <div class="care-qr-row">
            <span class="care-qr-label">Scan for plant page</span>
            <div class="care-qr-container"><img src="${qrImageUrl}" alt="QR code" width="96" height="96"></div>
        </div>
    </div>
    <script>
        window.onload = function() {
            // Auto-print after a short delay
            setTimeout(function() {
                window.print();
            }, 500);
        };
    </script>
</body>
</html>`;
    
    // Open in new window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

function generateVivariumCareCard(vivarium) {
    if (!vivarium || !vivarium.id) return;
    var name = vivarium.name || 'Vivarium';
    var imageUrl = vivarium.imageUrl || (vivarium.images && vivarium.images[0]) || null;
    if (imageUrl && imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') {
        imageUrl = imageUtils.normalizePlantImagePath(imageUrl);
    }
    var plants = window.allPlants || window.plantsDatabase || [];
    var plantIds = vivarium.plantIds || (vivarium._buildConfig && vivarium._buildConfig.plantIds) || [];
    var plantItems = [];
    if (Array.isArray(plantIds) && plantIds.length) {
        var order = {};
        plantIds.forEach(function(id, i) { order[Number(id)] = i; });
        plantItems = plants.filter(function(p) {
            return p && p.id != null && plantIds.indexOf(Number(p.id)) !== -1;
        }).sort(function(a, b) {
            return (order[a.id] || 999) - (order[b.id] || 999);
        });
    }
    var plantsCardsHtml = '';
    if (plantItems.length) {
        plantsCardsHtml = plantItems.map(function(p) {
            var url = 'index.html?tab=plants&id=' + encodeURIComponent(p.id);
            var imgUrl = p.imageUrl || (p.images && p.images[0]) || null;
            if (!imgUrl && typeof scientificNameToSlug === 'function' && typeof getScientificNameString === 'function') {
                var slug = scientificNameToSlug(getScientificNameString(p));
                if (slug) imgUrl = 'images/plants/' + slug + '/' + slug + '-1.jpg';
            }
            if (imgUrl && imageUtils && typeof imageUtils.normalizePlantImagePath === 'function') {
                imgUrl = imageUtils.normalizePlantImagePath(imgUrl);
            }
            var sci = (typeof p.scientificName === 'string') ? p.scientificName : (p.scientificName && p.scientificName.name) ? p.scientificName.name : '';
            return '<a href="' + url + '" class="plant-card vivarium-content-card vivarium-plant-card">' +
                '<div class="plant-image-container">' +
                (imgUrl ? '<img src="' + escapeHtml(imgUrl) + '" alt="" class="plant-image" loading="lazy">' : '<div class="image-placeholder">' + PLACEHOLDER_PLANT_SVG + '</div>') +
                '</div>' +
                '<div class="plant-info"><div class="plant-name">' + escapeHtml(p.name || sci || 'Plant') + '</div>' +
                (sci ? '<div class="plant-scientific">' + escapeHtml(sci) + '</div>' : '') + '</div></a>';
        }).join('');
    }
    var careTips = Array.isArray(vivarium.careTips) && vivarium.careTips.length
        ? vivarium.careTips
        : ((typeof getVivariumCareTips === 'function') ? getVivariumCareTips(vivarium.type) : []);
    if (!Array.isArray(careTips)) careTips = [];
    var careTipsHtml = careTips.length
        ? '<ul class="vivarium-care-tips-list">' + careTips.map(function(t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('') + '</ul>'
        : '<p class="vivarium-care-no-tips">No specific maintenance tips available.</p>';
    var base = window.location.origin + (window.location.pathname || '/');
    if (base.endsWith('.html')) base = base.replace(/\/[^/]*$/, '/');
    else if (!base.endsWith('/')) base = base.replace(/\/[^/]*$/, '') + '/';
    var vivariumPageUrl = base + 'index.html?tab=vivariums&id=' + encodeURIComponent(vivarium.id);
    var qrImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&margin=1&data=' + encodeURIComponent(vivariumPageUrl);
    var plantsSectionHtml = plantItems.length
        ? '<div class="vivarium-care-section-title">Plants in this vivarium</div><div class="vivarium-care-plants-grid">' + plantsCardsHtml + '</div>'
        : '<div class="vivarium-care-section-title">Plants in this vivarium</div><p class="vivarium-care-no-plants">No plants listed.</p>';
    var htmlContent = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Care Card - ' + escapeHtml(name) + '</title><style>' +
        '@page{size:A4 portrait;margin:6mm;}' +
        '*{margin:0;padding:0;box-sizing:border-box;}' +
        'body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#fff;color:#111;}' +
        '.vivarium-care-card{max-width:190mm;background:#fff;border-radius:4px;border:1px solid #ddd;box-shadow:none;padding:6mm 7mm;margin:0 auto;}' +
        '.vivarium-care-header{display:flex;gap:4mm;align-items:flex-start;margin-bottom:4mm;}' +
        '.vivarium-care-title-block{flex:1;}' +
        '.vivarium-care-name{font-size:13pt;font-weight:700;margin-bottom:1mm;}' +
        '.vivarium-care-subtitle{font-size:8pt;color:#666;}' +
        '.vivarium-care-image{width:28mm;height:28mm;object-fit:cover;border-radius:3px;border:1px solid #e0e0e0;background:#fafafa;}' +
        '.vivarium-care-body{display:flex;flex-direction:column;gap:4mm;}' +
        '.vivarium-care-column{flex:1;min-width:0;}' +
        '.vivarium-care-section-title{font-size:9pt;font-weight:600;margin-bottom:1.5mm;border-bottom:1px solid #eee;padding-bottom:1mm;}' +
        '.vivarium-care-plants-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2mm;margin-top:1.5mm;}' +
        '.plant-card{border:1px solid #e3e3e3;border-radius:3px;overflow:hidden;background:#fafafa;text-decoration:none;color:inherit;display:flex;flex-direction:column;}' +
        '.plant-image-container{width:100%;padding-top:55%;position:relative;background:#f0f0f0;overflow:hidden;}' +
        '.plant-image-container img.plant-image{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;}' +
        '.image-placeholder{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#bbb;}' +
        '.plant-info{padding:1.5mm 2mm;}' +
        '.plant-name{font-size:7.5pt;font-weight:600;margin-bottom:0.5mm;}' +
        '.plant-scientific{font-size:6.5pt;color:#666;font-style:italic;}' +
        '.vivarium-care-no-plants{font-size:7.5pt;color:#666;margin-top:2mm;}' +
        '.vivarium-care-tips-list{margin-top:1.5mm;padding-left:4mm;font-size:7.5pt;}' +
        '.vivarium-care-tips-list li{margin-bottom:1mm;}' +
        '.vivarium-care-footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:4mm;font-size:7pt;color:#666;}' +
        '.vivarium-care-qr{text-align:right;}' +
        '.vivarium-care-qr img{display:block;margin-left:auto;border:1px solid #e0e0e0;border-radius:3px;background:#fff;}' +
        '.vivarium-care-qr-label{margin-top:1mm;}' +
        '@media print{body{background:#fff;} .vivarium-care-card{border-color:#ccc;page-break-inside:avoid;}}' +
        '</style></head><body>' +
        '<div class="vivarium-care-card">' +
        '<div class="vivarium-care-header">' +
        '<div class="vivarium-care-title-block"><div class="vivarium-care-name">' + escapeHtml(name) + '</div>' +
        '<div class="vivarium-care-subtitle">Care card</div></div>' +
        (imageUrl ? '<img src="' + escapeHtml(imageUrl) + '" alt="" class="vivarium-care-image" onerror="this.style.display=\'none\'">' : '') +
        '</div>' +
        '<div class="vivarium-care-body">' +
        '<div class="vivarium-care-column vivarium-care-column-plants">' + plantsSectionHtml + '</div>' +
        '<div class="vivarium-care-column vivarium-care-column-tips"><div class="vivarium-care-section-title">Maintenance</div>' + careTipsHtml + '</div>' +
        '</div>' +
        '<div class="vivarium-care-footer">' +
        '<div class="vivarium-care-footer-text">Scan the QR code to view this vivarium online.</div>' +
        '<div class="vivarium-care-qr"><span class="vivarium-care-qr-label">Vivarium page</span><img src="' + qrImageUrl + '" alt="QR code" width="120" height="120"></div>' +
        '</div>' +
        '</div></body></html>';
    var printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(function() { printWindow.print(); }, 400);
}
window.generateVivariumCareCard = generateVivariumCareCard;

