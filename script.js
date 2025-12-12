// Main application logic
let allPlants = [];
let filteredPlants = [];

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

const PLANT_RENDER_BATCH_SIZE = 60; // Increased for faster initial render
let currentRenderToken = 0;

// Convert scientific name to slug (matching folder naming convention)
function scientificNameToSlug(scientificName) {
    if (!scientificName) return null;
    // Handle both string and object formats
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

// Load plants from modular structure or fallback to data.js
async function initializePlants() {
    console.log('Initializing plants...');
    
    // Wait a bit for scripts to load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Priority 1: Check if modular loader has populated window.plantsDatabase
    if (typeof window !== 'undefined' && window.plantsDatabase && Array.isArray(window.plantsDatabase) && window.plantsDatabase.length > 0) {
        allPlants = [...window.plantsDatabase];
        console.log(`✅ Loaded ${allPlants.length} plants from modular loader`);
        filteredPlants = [...allPlants];
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
                allPlants = [...window.plantsDatabase];
                console.log(`✅ Loaded ${allPlants.length} plants from window.plantsDatabase (event)`);
            } else if (e.detail?.plants && Array.isArray(e.detail.plants) && e.detail.plants.length > 0) {
                allPlants = [...e.detail.plants];
                console.log(`✅ Loaded ${allPlants.length} plants from event detail`);
            } else if (typeof plantsDatabase !== 'undefined' && Array.isArray(plantsDatabase) && plantsDatabase.length > 0) {
                allPlants = [...plantsDatabase];
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
            allPlants = [...window.plantsDatabase];
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
                allPlants = [...window.plantsDatabase];
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
                    allPlants = [...window.plantsDatabase];
                    console.log(`✅ Loaded ${allPlants.length} plants (final timeout fallback)`);
                } else if (typeof plantsDatabase !== 'undefined' && Array.isArray(plantsDatabase) && plantsDatabase.length > 0) {
                    allPlants = [...plantsDatabase];
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
            allPlants = [...window.plantsDatabase];
            console.log(`✅ Loaded ${allPlants.length} plants (final check after promise)`);
        }
    }
    
    filteredPlants = [...allPlants];
    
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
                allPlants = [...window.plantsDatabase];
                filteredPlants = [...allPlants];
                console.log(`✅ Loaded ${allPlants.length} plants (delayed retry)`);
                initializeUI();
            }
        }, 2000);
    }
}

async function initializeUI() {
    console.log('🎨 Initializing UI...');
    
    // Read taxonomy filter from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const taxonomyRank = urlParams.get('taxonomyRank');
    const taxonomyName = urlParams.get('taxonomyName');
    
    if (taxonomyRank && taxonomyName) {
        advancedFilters.taxonomy.rank = taxonomyRank;
        advancedFilters.taxonomy.name = taxonomyName;
        console.log(`🌳 Taxonomy filter applied: ${taxonomyRank} = ${taxonomyName}`);
    }
    
    console.log(`📊 Plants ready: ${allPlants.length} plants`);
    
    // First: Quickly load images from localStorage (fast synchronous check)
    // This ensures images are available when cards render
    // OPTIMIZED: Do a quick synchronous pass first, then validate async
    let imagesLoadedCount = 0;
    allPlants.forEach(plant => {
        try {
            const savedImages = localStorage.getItem(`plant_${plant.id}_images`);
            const savedImageUrl = localStorage.getItem(`plant_${plant.id}_imageUrl`);
            if (savedImages) {
                const parsedImages = JSON.parse(savedImages);
                if (Array.isArray(parsedImages) && parsedImages.length > 0) {
                    plant.images = parsedImages;
                    if (savedImageUrl && parsedImages.includes(savedImageUrl)) {
                        plant.imageUrl = savedImageUrl;
                    } else {
                        plant.imageUrl = parsedImages[0];
                    }
                    imagesLoadedCount++;
                } else {
                    if (!plant.images) plant.images = [];
                }
            } else {
                if (!plant.images) plant.images = [];
            }
        } catch (e) {
            // Silent - just initialize empty arrays
            if (!plant.images) plant.images = [];
        }
    });
    console.log(`📦 Quick-loaded ${imagesLoadedCount} plant images from localStorage`);
    
    // Second: Apply filters and render IMMEDIATELY (images are now available)
    applyAllFilters();
    
    // Third: Validate images from localStorage in background (update if needed)
    // OPTIMIZED: Start after initial render to not block UI
    setTimeout(() => {
        loadImagesFromLocalStorage(allPlants).then(() => {
            console.log('📦 Image validation from localStorage complete');
            // Update plant cards with validated images (only if changed)
            filteredPlants.forEach(plant => {
                if (plant.imageUrl) {
                    updatePlantCardImage(plant.id, plant.imageUrl);
                }
            });
        }).catch(err => {
            console.warn('⚠️ Image validation error:', err);
        });
    }, 200); // Small delay to let UI render first
    
    // Third: Discover images for plants without saved images (deferred, low priority)
    // This runs AFTER initial render so users see content immediately
    // OPTIMIZED: Wait longer and only discover for plants truly missing images
    setTimeout(async () => {
        // Wait for localStorage validation to complete first
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const plantsNeedingImages = allPlants.filter(plant => {
            if (!plant.images) {
                plant.images = [];
            }
            // Skip if already has valid images
            return !plant.images || plant.images.length === 0;
        });
        
        if (plantsNeedingImages.length === 0) {
            console.log('✅ All plants already have images - skipping discovery');
            return;
        }
        
        console.log(`🔍 Discovering images for ${plantsNeedingImages.length} plants without saved images (deferred background)...`);
        
        // Process in larger batches with better parallelization
        const BATCH_SIZE = 20; // Increased from 10
        for (let i = 0; i < plantsNeedingImages.length; i += BATCH_SIZE) {
            const batch = plantsNeedingImages.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async (plant) => {
                try {
                    // Skip if we already know this plant has no images (maxImage = 0 or null)
                    const maxImageKey = `plant_${plant.id}_maxImage`;
                    const savedMaxImage = localStorage.getItem(maxImageKey);
                    if (savedMaxImage === '0' || savedMaxImage === null) {
                        return; // Skip plants we know have no images
                    }
                    
                    const discovered = await getPlantImages(plant);
                    
                    if (discovered.images.length > 0) {
                        // Use discovered order
                        plant.images = discovered.images;
                        plant.imageUrl = discovered.imageUrl;
                        
                        // Find highest image number to store as maxImage limit
                        let highestNumber = 0;
                        for (const imgPath of discovered.images) {
                            const match = imgPath.match(/-(\d+)\./);
                            if (match) {
                                const num = parseInt(match[1], 10);
                                if (num > highestNumber) {
                                    highestNumber = num;
                                }
                            }
                        }
                        
                        // Save to localStorage for future use
                        try {
                            localStorage.setItem(`plant_${plant.id}_images`, JSON.stringify(plant.images));
                            if (plant.imageUrl) {
                                localStorage.setItem(`plant_${plant.id}_imageUrl`, plant.imageUrl);
                            }
                            // Store maxImage to prevent checking beyond it next time
                            if (highestNumber > 0) {
                                localStorage.setItem(`plant_${plant.id}_maxImage`, highestNumber.toString());
                            }
                        } catch (e) {
                            // Silent - localStorage update failed
                        }
                        
                        // Update only the specific plant card (more efficient than full re-render)
                        if (plant.imageUrl) {
                            updatePlantCardImage(plant.id, plant.imageUrl);
                        }
                    } else {
                        // Mark as having no images to skip future checks
                        try {
                            localStorage.setItem(maxImageKey, '0');
                        } catch (e) {
                            // Silent
                        }
                    }
                } catch (err) {
                    // Silent - individual plant discovery failures
                }
            });
            
            await Promise.all(batchPromises);
            
            // Smaller delay between batches
            if (i + BATCH_SIZE < plantsNeedingImages.length) {
                await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 100ms
            }
        }
        
        console.log('✅ Image discovery complete for all plants');
    }, 2000); // Wait 2 seconds after initial render to ensure UI is fully loaded
    
    // Note: Image scanning is now disabled on page load to prevent console flooding
    // Images will be checked only when:
    // - User opens a plant modal (gallery refresh)
    // - User manually triggers refresh
    // - User uploads a new image
}
let sortField = 'scientific';
let sortDirection = 'asc';

// DOM Elements
const plantsGrid = document.getElementById('plantsGrid');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const sortSelect = document.getElementById('sortSelect');
const sortDirectionBtn = document.getElementById('sortDirectionBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const filterToggle = document.getElementById('filterToggle');
const filtersSidebar = document.getElementById('filtersSidebar');
const plantCount = document.getElementById('plantCount');
const loading = document.getElementById('loading');
const plantModal = document.getElementById('plantModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.querySelector('.close');

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

const uploadUtils = window.uploadUtils;
if (!uploadUtils) {
    throw new Error('upload.js must be loaded before script.js');
}

uploadUtils.init({
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
    setPlantsMergedFolderHandle: (handle) => { plantsMergedFolderHandle = handle; }
});

const {
    setupUploadListeners,
    selectImagesFolder,
    checkStoredFolder,
    ensureFolderAccess,
    openImageUpload,
    updateUploadGallery,
    removeImageFromUploadGallery,
    updateDragDropGallery,
    clearDragDropGallery,
    closeUploadModalFunc,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    loadImageFromUrl,
    saveImage,
    saveSingleImage,
    fileToDataUrl,
    blobToDataUrl
} = uploadUtils;

// Initialize
// Navigation functionality
function initNavigation() {
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    const mainNav = document.querySelector('.main-nav');
    
    // Mobile menu toggle
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navToggle.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
        
        // Close menu when clicking on a link
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navToggle.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navToggle.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    }
    
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize navigation
    initNavigation();
    setupEventListeners();
    setupUploadListeners();
    
    // Load plants (from modular structure or data.js)
    await initializePlants();
    
    // Images are now handled gracefully - browser will show placeholders for missing images
    // No need to aggressively clear all images on page load
    imageErrorsLogged = true;
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

// Event Listeners
function setupEventListeners() {
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
        // Also add real-time search on input change
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
    
    // Sort select
    if (sortSelect) {
        sortSelect.addEventListener('change', handleSort);
    }
    
    // Sort direction button
    if (sortDirectionBtn) {
        sortDirectionBtn.addEventListener('click', handleSortDirection);
        updateSortDirectionButton();
    }
    
    // Filter toggle button
    if (filterToggle && filtersSidebar) {
        filterToggle.addEventListener('click', () => {
            filtersSidebar.classList.toggle('visible');
            filterToggle.classList.toggle('active');
        });
    }
    
    // Reset filters button
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetAllFilters);
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
    
    closeModal.addEventListener('click', () => {
        plantModal.classList.remove('show');
        plantModal.classList.add('hidden');
    });
    
    plantModal.addEventListener('click', (e) => {
        if (e.target === plantModal) {
            plantModal.classList.remove('show');
            plantModal.classList.add('hidden');
        }
    });
}

// Search functionality
function handleSearch() {
    if (!searchInput) return;
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

// Sort functionality
function handleSort() {
    if (!sortSelect) return;
    sortField = sortSelect.value;
    applyAllFilters();
}

function handleSortDirection() {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    updateSortDirectionButton();
    applyAllFilters();
}

function updateSortDirectionButton() {
    if (!sortDirectionBtn) return;
    const icon = sortDirectionBtn.querySelector('.sort-icon');
    
    if (sortDirection === 'asc') {
        sortDirectionBtn.classList.remove('active-desc');
        if (icon) icon.textContent = '↑';
    } else {
        sortDirectionBtn.classList.add('active-desc');
        if (icon) icon.textContent = '↓';
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
                // Handle both lowercase and capitalized rarity values
                const rarityOrder = { 
                    'common': 1, 'Common': 1,
                    'uncommon': 2, 'Uncommon': 2,
                    'rare': 3, 'Rare': 3,
                    'very rare': 4, 'Very Rare': 4, 'veryrare': 4
                };
                const aRarity = (a.rarity || '').toLowerCase();
                const bRarity = (b.rarity || '').toLowerCase();
                aVal = rarityOrder[aRarity] || 0;
                bVal = rarityOrder[bRarity] || 0;
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

// Calculate vivarium types for a plant using mathematical logic
function calculatePlantVivariumTypes(plant) {
    try {
        // Vivarium type definitions with natural language descriptions and numeric scales
        const VIVARIUM_TYPES = {
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

function applyAdvancedFilters() {
    // Collect checkbox values
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    advancedFilters.rarity = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'rarity' && cb.checked).map(cb => cb.value);
    advancedFilters.special = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'special' && cb.checked).map(cb => cb.value);
    advancedFilters.classification = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'classification' && cb.checked).map(cb => cb.value);
    advancedFilters.vivariumType = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'vivariumType' && cb.checked).map(cb => cb.value);
    advancedFilters.enclosureSize = Array.from(checkboxes).filter(cb => cb.dataset.filter === 'enclosureSize' && cb.checked).map(cb => cb.value);
    
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
    // Start with all plants
    filteredPlants = [...allPlants];
    
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
        
        // Rarity filter
        if (advancedFilters.rarity.length > 0) {
            if (!plant.rarity) return false;
            const plantRarity = String(plant.rarity).toLowerCase();
            const matchesRarity = advancedFilters.rarity.some(filterR => 
                plantRarity.includes(filterR.toLowerCase())
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
                } else if (filterSpecial === 'Hybrid') {
                    // Hybrid plants: scientific names containing " x " or " × " with spaces
                    const scientific = getScientificNameString(plant);
                    return /\s+(x|×)\s+/i.test(scientific);
                } else if (filterSpecial === 'Carnivorous') {
                    // Carnivorous plants
            const category = (plant.category || []).map(c => c.toLowerCase());
            const name = (plant.name || '').toLowerCase();
            const scientificName = getScientificNameString(plant).toLowerCase();
            const description = (plant.description || '').toLowerCase();
            const genus = plant.taxonomy && plant.taxonomy.genus ? plant.taxonomy.genus.toLowerCase() : '';
            
            // Known carnivorous plant genera
            const carnivorousGenera = [
                'nepenthes', 'drosera', 'dionaea', 'sarracenia', 'utricularia', 'pinguicula',
                'cephalotus', 'byblis', 'genlisea', 'aldrovanda', 'roridula', 'heliamphora',
                'drosophyllum', 'macrocentrum', 'darlingtonia'
            ];
            
                    return category.includes('carnivorous') ||
                                 name.includes('pitcher') || name.includes('sundew') ||
                                 name.includes('bladderwort') || name.includes('venus') ||
                                 name.includes('butterwort') || name.includes('corkscrew') ||
                                 scientificName.includes('pitcher') || scientificName.includes('sundew') ||
                                 description.includes('carnivorous') || description.includes('insectivorous') ||
                                 carnivorousGenera.includes(genus);
                }
                return false;
            });
            if (!matchesSpecial) return false;
        }
        
        return true;
    });
    
    // Apply sorting
    filteredPlants = sortPlants(filteredPlants);
    
    renderPlants(filteredPlants);
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

// Render plants grid
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
            const loading = document.getElementById('loading');
            if (loading) {
                loading.classList.add('hidden');
            }
        }
    };

    // Start rendering immediately (synchronous first batch for instant feedback)
    renderBatch();
    
    // Show loading indicator only if rendering will take time
    if (plants.length > PLANT_RENDER_BATCH_SIZE) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.remove('hidden');
            // Hide after first batch renders
            setTimeout(() => {
                if (loading) loading.classList.add('hidden');
            }, 100);
        }
    }
}

// Create plant card element
function createPlantCard(plant) {
    const card = document.createElement('div');
    card.className = 'plant-card';
    card.addEventListener('click', () => showPlantModal(plant));
    
    // Detect hybrids: scientific names containing " x " or " × " with spaces before and after
    // This ensures names like "rex" (which contains "x") are not incorrectly tagged
    const scientific = getScientificNameString(plant);
    // Only match " x " or " × " with spaces on both sides
    const isHybrid = /\s+(x|×)\s+/i.test(scientific);
    
    // Detect carnivorous plants - only check plantType field and category for reliability
    const category = (plant.category || []).map(c => c.toLowerCase());
    const plantType = (plant.plantType || '').toLowerCase();
    const genus = plant.taxonomy && plant.taxonomy.genus ? plant.taxonomy.genus.toLowerCase() : '';
    
    // Known carnivorous plant genera
    const carnivorousGenera = [
        'nepenthes', 'drosera', 'dionaea', 'sarracenia', 'utricularia', 'pinguicula',
        'cephalotus', 'byblis', 'genlisea', 'aldrovanda', 'roridula', 'heliamphora',
        'drosophyllum', 'macrocentrum', 'darlingtonia'
    ];
    
    const isCarnivorous = category.includes('carnivorous') ||
                          plantType.includes('carnivorous') ||
                          carnivorousGenera.includes(genus);
    
    // Detect aquatic plants
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
    
    // Add special badges (hybrid, carnivorous, aquatic) to the badges div
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
    // Priority: imageUrl > images[0] > placeholder
    let displayImageUrl = plant.imageUrl;
    
    // Only use if it exists and is not empty
    if (!displayImageUrl || !displayImageUrl.trim()) {
        displayImageUrl = null;
    }
    
    // If no imageUrl but images array exists, use first image (if any)
    // Note: We're not checking if file exists - browser will handle that with onerror
    if (!displayImageUrl && plant.images && plant.images.length > 0) {
        displayImageUrl = plant.images[0];
        plant.imageUrl = displayImageUrl;
    }
    
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <!-- Venus flytrap trap with teeth -->
                        <path d="M12 3C9 3 7 5 7 9c0 1.5 0.5 2.5 1.5 3.5L12 18l3.5-5.5c1-1 1.5-2 1.5-3.5 0-4-2-6-5-6z" fill="currentColor" opacity="0.3"/>
                        <path d="M12 3C9 3 7 5 7 9c0 1.5 0.5 2.5 1.5 3.5L12 18l3.5-5.5c1-1 1.5-2 1.5-3.5 0-4-2-6-5-6z"/>
                        <!-- Teeth on the trap -->
                        <path d="M9 8l-1 1M10 9l-1 1M11 10l-1 1M13 10l1 1M14 9l1 1M15 8l1 1"/>
                        <!-- Bug/fly being caught -->
                        <circle cx="12" cy="9" r="1.5" fill="currentColor"/>
                        <path d="M10.5 9l-1-1M13.5 9l1-1M12 7.5v-1"/>
                    </svg>
                </div>
            ` : ''}
            ${displayImageUrl ? 
                `<img src="${displayImageUrl}" alt="${plant.name}" class="plant-image" loading="lazy" onerror="this.onerror=null; handleImageError(this, ${plant.id})" data-plant-id="${plant.id}">` :
                `<div class="image-placeholder">🌿</div>`
            }
            <div class="image-edit-icon" onclick="event.stopPropagation(); openImageUpload(${plant.id})">
                <svg viewBox="0 0 24 24">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
            </div>
            <div class="care-card-icon" onclick="event.stopPropagation(); generateCareCard(${plant.id})" title="Generate printable care card">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9V2h12v7"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <path d="M6 14h12v8H6z"/>
                </svg>
            </div>
        </div>
        <div class="plant-info">
            <div class="plant-name">${plant.name}</div>
            <div class="plant-scientific">${getScientificNameString(plant)}</div>
            <div class="plant-badges">${badges}</div>
        </div>
    `;
    
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

// Show plant modal with detailed information
async function showPlantModal(plant) {
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
    
    // Discover images from folder to get complete list
    // Skip discovery if we have localStorage data to avoid 404 errors for known missing images
    let discovered = { images: [], imageUrl: null };
    if (!savedImages || !Array.isArray(savedImages) || savedImages.length === 0) {
        // Only discover if we don't have localStorage data (avoids unnecessary 404s)
        discovered = await getPlantImages(plant);
    }
    
    if (savedImages && Array.isArray(savedImages) && savedImages.length > 0) {
        // Validate that saved images match the expected folder structure
        const folderName = scientificNameToSlug(getScientificNameString(plant));
        const allPathsValid = savedImages.every(img => {
            if (!img || typeof img !== 'string') return false;
            // Check if path matches expected format: images/folderName/folderName-number.jpg
            const expectedPattern = new RegExp(`^images/${folderName}/${folderName}-\\d+\\.(jpg|jpeg|png|gif|webp)$`, 'i');
            return expectedPattern.test(img);
        });
        
        if (allPathsValid) {
            // Use saved order (user's preference) - this preserves the order when user sets main image
            plant.images = savedImages;
            plant.imageUrl = savedImageUrl || (savedImages.length > 0 ? savedImages[0] : null);
            
            // Skip discovery merge when we have localStorage - trust the saved data
            // This prevents 404 errors from checking images we already know don't exist
            // New images will be discovered on next page load if localStorage is cleared
            
            console.log(`[Modal] Using saved image order from localStorage (${plant.images.length} images)`);
        } else {
            // Invalid paths detected - clear cache and use discovered images
            console.warn(`⚠️ [Modal] Invalid image paths detected for ${plant.scientificName}, clearing cache and using discovered images...`);
            try {
                localStorage.removeItem(`plant_${plant.id}_images`);
                localStorage.removeItem(`plant_${plant.id}_imageUrl`);
            } catch (e) {
                // Silent - localStorage removal failed
            }
            // Fall through to use discovered images
            if (discovered.images.length > 0) {
                plant.images = discovered.images;
                plant.imageUrl = discovered.imageUrl;
                
                // Save to localStorage for future use
                try {
                    localStorage.setItem(`plant_${plant.id}_images`, JSON.stringify(plant.images));
                    if (plant.imageUrl) {
                        localStorage.setItem(`plant_${plant.id}_imageUrl`, plant.imageUrl);
                    }
                } catch (e) {
                    // Silent - localStorage update failed
                }
            }
        }
    } else if (discovered.images.length > 0) {
        // No saved order - use discovered order
        plant.images = discovered.images;
        plant.imageUrl = discovered.imageUrl;
        
        // Save to localStorage for future use
        try {
            localStorage.setItem(`plant_${plant.id}_images`, JSON.stringify(plant.images));
            if (plant.imageUrl) {
                localStorage.setItem(`plant_${plant.id}_imageUrl`, plant.imageUrl);
            }
        } catch (e) {
            // Silent - localStorage update failed
        }
        
        console.log(`[Modal] Using discovered image order from folder (${plant.images.length} images)`);
    } else {
        // No images found - ensure arrays are initialized
        if (!plant.images) {
            plant.images = [];
        }
    }
    
    // Ensure no duplicates
    if (plant.images && plant.images.length > 0) {
        plant.images = ensureUniqueImages(plant.images);
    }
    
    // Set display image
    let displayImageUrl = plant.imageUrl || (plant.images && plant.images.length > 0 ? plant.images[0] : null);
    
    // Debug: Log plant images
    console.log(`[Modal] Plant: ${plant.name} (ID: ${plant.id})`);
    console.log(`[Modal] Scientific name: ${getScientificNameString(plant)}`);
    console.log(`[Modal] Discovered ${discovered.images.length} images from folder`);
    console.log(`[Modal] imageUrl: ${displayImageUrl}`);
    console.log(`[Modal] images array:`, plant.images);
    console.log(`[Modal] images count: ${plant.images ? plant.images.length : 0}`);
    
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
    function createRequirementScale(label, range) {
        if (!range || range.min === undefined || range.max === undefined) {
            return `
                <div class="info-item">
                    <div class="info-item-label">${label}</div>
                    <div class="info-item-value">N/A</div>
                </div>`;
        }
        
        const min = range.min;
        const max = range.max;
        const ideal = range.ideal !== undefined ? range.ideal : (min + max) / 2;
        
        // Generate tick marks every 10%
        let tickMarks = '';
        for (let i = 0; i <= 100; i += 10) {
            tickMarks += `<div class="requirement-scale-tick" style="left: ${i}%;"></div>`;
        }
        
        // Determine scale labels based on requirement type
        let leftLabel = '0%';
        let rightLabel = '100%';
        let idealLabel = '';
        
        if (label === 'Temperature') {
            leftLabel = '0°C';
            rightLabel = '50°C';
            // Convert percentage back to °C (0% = 0°C, 100% = 50°C)
            const idealTemp = (ideal / 100) * 50;
            idealLabel = idealTemp.toFixed(0) + '°C';
        } else if (label === 'Difficulty Level') {
            leftLabel = 'Easy';
            rightLabel = 'Hard';
            idealLabel = ideal.toFixed(0) + '%';
        } else if (label === 'Soil pH' || label === 'Water pH') {
            leftLabel = 'pH 0';
            rightLabel = 'pH 14';
            // Convert percentage back to pH (0% = pH 0, 100% = pH 14)
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
            const idealSal = (ideal / 100) * 40; // 0-40 ppt
            if (ideal <= 5) {
                idealLabel = 'Fresh';
            } else if (ideal <= 75) {
                idealLabel = idealSal.toFixed(1) + ' ppt';
            } else {
                idealLabel = idealSal.toFixed(1) + ' ppt';
            }
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
            // For other scales (humidity, etc.)
            idealLabel = ideal.toFixed(0) + '%';
        }
        
        return `
            <div class="info-item requirement-scale-item">
                <div class="info-item-label">${label}</div>
                <div class="requirement-scale-container">
                    <div class="requirement-scale-track">
                        ${tickMarks}
                        <div class="requirement-scale-range" style="left: ${min}%; width: ${max - min}%;"></div>
                        <div class="requirement-scale-ideal" style="left: ${ideal}%;">
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
    
    modalBody.innerHTML = `
        <!-- Page 1: Information View -->
        <div id="modal-page-1" class="modal-page active">
            <!-- Column 1, Row 1: Name -->
            <div class="modal-section modal-widget widget-span-1 widget-row-1">
                <h2 class="modal-plant-name" style="margin: 0; font-size: 1.6rem; color: var(--primary-color); line-height: 1.2;">${plant.name}</h2>
                <h3 class="modal-plant-scientific" style="margin: 0.3rem 0 0 0; font-size: 1rem; color: var(--text-light); font-style: italic; font-weight: normal; line-height: 1.2;">${getScientificNameString(plant)}</h3>
                ${(() => {
                    if (!plant.commonNames || !Array.isArray(plant.commonNames) || plant.commonNames.length === 0) {
                        return '';
                    }
                    
                    // Process common names: remove duplicates (case-insensitive), split on "or", and clean up
                    const processedNames = [];
                    const seen = new Set();
                    
                    for (const name of plant.commonNames) {
                        if (!name || typeof name !== 'string') continue;
                        
                        // Split on " or " (with spaces) to separate multiple names
                        const parts = name.split(/\s+or\s+/i);
                        
                        for (let part of parts) {
                            part = part.trim();
                            if (!part) continue;
                            
                            // Remove duplicates (case-insensitive)
                            const lowerPart = part.toLowerCase();
                            if (!seen.has(lowerPart)) {
                                seen.add(lowerPart);
                                processedNames.push(part);
                            }
                        }
                    }
                    
                    // Remove the main plant name if it's in common names (avoid duplication)
                    const filteredNames = processedNames.filter(n => 
                        n.toLowerCase() !== plant.name.toLowerCase() && 
                        n.toLowerCase() !== getScientificNameString(plant).toLowerCase()
                    );
                    
                    return filteredNames.length > 0 
                        ? `<p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: var(--text-light); line-height: 1.4;">${filteredNames.join(', ')}</p>`
                        : '';
                })()}
            </div>
            
            <!-- Column 2, Row 1: Suitable For -->
            <div class="modal-section modal-widget widget-span-1 widget-row-1">
                <h3>Suitable For</h3>
                <div class="plant-badges">
                    ${(() => {
                        const calculatedTypes = calculatePlantVivariumTypes(plant);
                        return calculatedTypes
                        .map(v => {
                            const displayName = String(v).split('-').map(word => 
                                word.charAt(0).toUpperCase() + word.slice(1)
                            ).join(' ');
                            return `<span class="badge ${String(v).toLowerCase().replace(/\s+/g,'-')}">${displayName}</span>`;
                        })
                        .join('');
                    })()}
                </div>
                <div style="margin-top: 1rem;">
                    <div class="info-item-label" style="margin-bottom: 0.5rem;">Minimum Enclosure Height</div>
                    ${createEnclosureSizeScale(plant)}
                </div>
            </div>
            
            <!-- Column 3, Rows 1-4: Plant Information (full height) -->
            <div class="modal-section modal-widget widget-span-1 widget-row-4">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <h3 style="margin: 0; font-size: 1.05rem; padding-bottom: 0.25rem; border-bottom: 2px solid var(--border-color);">Plant Information</h3>
                    <a href="definitions.html" style="font-size: 0.8rem; color: var(--primary-color); text-decoration: none; font-weight: 600;">ℹ️</a>
                </div>
                
                <!-- Group 1: Plant Details -->
                <div class="info-group">
                    <h4 class="info-group-title">Plant Details</h4>
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
                            addRow('Plant Type', plant.plantType);
                            addRow('Size', plant.size);
                            addRow('Substrate', plant.substrate);
                            addRow('Rarity', plant.rarity);
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
                    <h4 class="info-group-title">Requirements Details</h4>
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
                    <div class="info-item" style="grid-column: 1 / -1; background: #fff3cd; border-left: 4px solid #ffc107; margin-top: 1rem;">
                        <div class="info-item-label">⚠️ Safety</div>
                        <div class="info-item-value" style="color: #856404;">${concerns.join(' • ')}</div>
                    </div>
                    `;
                })()}
            </div>
            
            <!-- Column 4, Rows 1-2: Image (top right) -->
            <div class="modal-section modal-widget widget-span-1 widget-row-2 modal-image-widget" style="position: relative; padding: 0; overflow: hidden; cursor: pointer;" onclick="switchModalPage(2, ${plant.id})">
                <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: stretch;">
                ${displayImageUrl ? 
                    `<img src="${displayImageUrl}" alt="${plant.name}" class="modal-plant-image" onerror="this.style.display='none'">` :
                        `<div class="image-placeholder" style="width: 100%; height: 100%; min-height: 300px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 4rem; background: var(--bg-color);">🌿</div>`
                }
                <div class="image-gallery-hint" style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; pointer-events: none;">
                    🖼️ Click to view gallery
                </div>
            </div>
            </div>
            
            <!-- Column 1, Rows 2-4: Description -->
            <div class="modal-section modal-widget widget-span-1 widget-row-3">
                <h3>Description</h3>
                <p class="description">${plant.description}</p>
            </div>
            
            <!-- Column 2, Rows 2-4: Care Tips -->
            <div class="modal-section modal-widget widget-span-1 widget-row-3">
                <h3>Care Tips</h3>
                <ul class="requirements-list" style="margin: 0; padding-left: 1.25rem; font-size: 0.85rem; line-height: 1.4;">
                    ${plant.careTips.map(tip => `<li style="margin-bottom: 0.3rem;">${tip}</li>`).join('')}
                </ul>
            </div>

            ${plant.taxonomy ? `
            <!-- Column 4, Rows 3-4: Scientific Classification -->
            <div class="modal-section modal-widget widget-span-1 widget-row-2">
                <h3>Scientific Classification</h3>
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
            </div>
        ` : ''}
        
        </div>

        <!-- Page 2: Gallery View (hidden by default) -->
        <div id="modal-page-2" class="modal-page" style="display: none;">
            ${plant.images && plant.images.length > 0 && plant.images.some(img => img && img.trim()) ? `
                <!-- Gallery Grid - Left side -->
                <div class="modal-section modal-widget widget-span-2 widget-row-4" id="gallery-page-${plant.id}">
                    <h3 style="margin: 0 0 1rem 0;">Photo Gallery (${plant.images.filter(img => img && img.trim()).length} images)</h3>
                    <div class="plant-gallery">
                        ${plant.images.filter(img => img && img.trim()).map((img, idx) => {
                            const escapedPath = img.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                            // Main image is always at index 0
                            const isMain = idx === 0;
                            return `
                            <div class="gallery-item gallery-thumbnail ${idx === 0 ? 'selected' : ''}" data-img-index="${idx}" data-img-path="${escapedPath}" onclick="selectGalleryImage('${escapedPath}', ${plant.id}, ${idx}, event)" style="cursor: pointer; position: relative;">
                                ${isMain ? '<div class="main-image-badge" title="Main image">⭐</div>' : ''}
                                <button class="delete-image-btn" onclick="event.stopPropagation(); deleteImageFromGallery(${plant.id}, ${idx}, '${escapedPath}');" title="Delete this image" style="position: absolute; top: 6px; right: 6px; background: rgba(211, 47, 47, 0.9); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 16px; line-height: 1; z-index: 3; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">×</button>
                                <img src="${img}" alt="${plant.name} - Image ${idx + 1}" loading="lazy" 
                                     onerror="this.style.display='none';" 
                                     onload="this.style.display='block';"
                                     style="display: block;">
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
                
                <!-- Large Image Preview - Right side -->
                <div class="modal-section modal-widget widget-span-2 widget-row-4 modal-image-widget" id="gallery-preview-${plant.id}" style="position: relative; padding: 0; overflow: hidden; background: #000;">
                    <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                    ${displayImageUrl ? 
                        `<img id="gallery-preview-img" data-current-index="0" src="${displayImageUrl}" alt="${plant.name}" class="gallery-preview-image" style="max-width: 100%; max-height: 100%; object-fit: contain;">` :
                            `<div class="image-placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 6rem; background: var(--bg-color);">🌿</div>`
                    }
                    <button type="button" class="gallery-set-main-btn" onclick="event.preventDefault(); event.stopPropagation(); setAsMainImageFromPreview(${plant.id})" aria-label="Set current preview image as main">
                        ⭐ Set as Main
                    </button>
                </div>
                </div>
            ` : `
                <div class="modal-section modal-widget widget-span-4 widget-row-1">
                    <h3>Photo Gallery</h3>
                    <p style="color: #888; font-style: italic;">No images available. Use the upload button above to add images.</p>
                </div>
            `}
        </div>
    `;
    
    plantModal.classList.remove('hidden');
    plantModal.classList.add('show');
    
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
    console.log(`[Modal] Switching to page ${pageNum}`);
    
    // Hide all pages
    document.querySelectorAll('.modal-page').forEach(page => {
        page.style.display = 'none';
        page.classList.remove('active');
    });
    
    // Show selected page
    const targetPage = document.getElementById(`modal-page-${pageNum}`);
    if (targetPage) {
        targetPage.style.display = 'contents'; // Use 'contents' to maintain grid flow
        targetPage.classList.add('active');
    }
}

// Select gallery image to display in large preview
function selectGalleryImage(imagePath, plantId, imageIndex, event) {
    console.log(`[Gallery] Selected image: ${imagePath}, index: ${imageIndex}`);
    
    const previewImg = document.getElementById('gallery-preview-img');
    if (previewImg) {
        previewImg.src = imagePath;
        previewImg.setAttribute('data-current-index', imageIndex);
    }
    
    // Highlight selected thumbnail
    document.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
        thumb.classList.remove('selected');
    });
    if (event && event.currentTarget) {
    event.currentTarget.classList.add('selected');
    } else {
        // Fallback: find the thumbnail by data attribute
        const thumbnails = document.querySelectorAll('.gallery-thumbnail');
        thumbnails.forEach(thumb => {
            if (thumb.getAttribute('data-img-index') === String(imageIndex)) {
                thumb.classList.add('selected');
            }
        });
    }
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
    // The onerror handlers will show placeholders for missing images
    renderPlants(filteredPlants);
    
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
function updatePlantCardImage(plantId, imageUrl) {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant || !imageUrl) {
        // Silent - don't log missing plant/card updates
        return;
    }
    
    // Update the plant object
    if (plant) {
        plant.imageUrl = imageUrl;
        if (!plant.images) {
            plant.images = [];
        }
        if (!plant.images.includes(imageUrl)) {
            plant.images.unshift(imageUrl); // Add to beginning
        }
    }
    
    // Find and update the card by data attribute
    const cards = document.querySelectorAll(`[data-plant-id="${plantId}"]`);
    if (cards.length > 0) {
        cards.forEach(card => {
            const imgElement = card.querySelector('.plant-image');
            const imgContainer = card.closest('.plant-image-container') || card.querySelector('.plant-image-container');
            
            if (imgElement) {
                imgElement.src = imageUrl;
                imgElement.style.display = 'block';
            } else if (imgContainer) {
                // Replace placeholder with image
                imgContainer.innerHTML = `<img src="${imageUrl}" alt="${plant.name}" class="plant-image" loading="lazy" onerror="this.onerror=null; handleImageError(this, ${plantId})" data-plant-id="${plantId}">`;
            }
        });
    }
    
    // Silent - card image update successful
}

// Fetch plant image from multiple sources
async function fetchPlantImage(plant) {
    // Method 1: Check for direct image URL first (if available)
    if (plantImageSources.directImageUrls && plantImageSources.directImageUrls[plant.id]) {
        const directUrl = plantImageSources.directImageUrls[plant.id];
        if (await testImageUrl(directUrl)) {
            return directUrl;
        }
    }
    
    // Method 2: Try Unsplash Source API (no key needed, but may have CORS/availability issues)
    const searchTerms = [
        getScientificNameString(plant),
        `${plant.name} plant`,
        plantImageSources.defaultImageSearchTerms[plant.id] || plant.name
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
            const nextImage = plant.images[currentIndex + 1];
            if (!failedImageCache.has(nextImage) && !nextImage.includes(window.location.origin + nextImage)) {
                imgElement.onerror = () => handleImageError(imgElement, plantId);
                imgElement.src = nextImage;
                plant.imageUrl = nextImage;
                return; // Don't show placeholder yet, try next image
            }
        } else if (currentIndex < 0 && plant.images.length > 0) {
            // Current image not in array, try first from array
            const nextImage = plant.images[0];
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
                for (const savedImg of parsedImages) {
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
    if (!confirm(`Are you sure you want to delete this image?\n\n${imageToDelete}\n\nThis will permanently delete the file from your images folder.`)) {
        return;
    }
    
    try {
        // Delete file from file system if we have folder access
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
                    // Parse the image path: images/folder-name/filename.jpg
                    const pathParts = imageToDelete.split('/');
                    if (pathParts.length >= 3) {
                        const folderName = pathParts[1];
                        const fileName = pathParts[2];
                        
                        console.log(`🗑️ Attempting to delete: ${folderName}/${fileName}`);
                        const plantFolderHandle = await imagesFolderHandle.getDirectoryHandle(folderName);
                        await plantFolderHandle.removeEntry(fileName);
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

// Save plant data to JSON file (persists changes across page refreshes)
async function savePlantToJsonFile(plant) {
    if (!plant || !getScientificNameString(plant)) {
        console.warn('⚠️ Cannot save plant: missing scientific name');
        return;
    }
    
    try {
        // Get plants-merged folder handle
        let plantsFolderHandle = plantsMergedFolderHandle;
        
        // If we have folder access, save the JSON file
        if (plantsFolderHandle) {
            const folderName = scientificNameToSlug(getScientificNameString(plant));
            if (!folderName) {
                console.warn('⚠️ Cannot generate filename from scientific name');
                return;
            }
            
            const filename = `${folderName}.json`;
            
            try {
                // Create a clean copy of plant data (remove internal properties)
                const plantDataToSave = { ...plant };
                delete plantDataToSave._filename;
                delete plantDataToSave._filePath;
                
                // Convert to JSON string with proper formatting
                const jsonContent = JSON.stringify(plantDataToSave, null, 2) + '\n';
                
                // Save to file
                const fileHandle = await plantsFolderHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(jsonContent);
                await writable.close();
                
                console.log(`✅ Saved plant JSON: data/plants-merged/${filename}`);
            } catch (fileError) {
                console.warn('⚠️ Could not save plant JSON file:', fileError.message);
            }
        } else {
            // Try alternative: if we have imagesFolderHandle, we can try to navigate to parent
            // But File System Access API doesn't allow going up directories easily
            // So we'll just log that JSON won't be saved
            console.log('ℹ️ Plant JSON not saved to file (folder access not available). Changes are saved in localStorage only.');
            console.log('💡 To enable JSON file saving, select the Terrarium_index folder when prompted.');
        }
    } catch (error) {
        console.warn('⚠️ Error saving plant JSON:', error.message);
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
        // Convert scientific name to slug
        function scientificNameToSlug(scientificName) {
            if (!scientificName) return null;
            // Handle both string and object formats
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
        
        const folderName = scientificNameToSlug(getScientificNameString(plant));
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
    addDetail('Rarity', plant.rarity);
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

