// Plant Data Loader
// Dynamically loads plant data from modular JSON files
// Falls back to data.js if modular files are not available

// Note: plantsDatabase is declared in data.js, we'll just use it here

/**
 * Load all plant data from modular structure
 * This function tries to load from JSON files first, then falls back to data.js
 */
async function loadAllPlants() {
    // Check if running from file:// protocol (fetch won't work)
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        console.warn('⚠️ Running from file:// protocol - fetch() will not work.');
        console.warn('Please serve the files from a web server (e.g., python -m http.server 8000)');
        
        // Return empty array - will fall back to data.js if available
        return [];
    }
    
    try {
        console.log('🌱 Attempting to load plants from JSON files...');
        // Check if we have a merged index first (flat folder), else fallback to category index
        const cacheBuster = '?v=' + Date.now();
        const mergedIndexUrl = 'data/plants-merged/index.json' + cacheBuster;
        const mergedIndexResp = await fetch(mergedIndexUrl);
        if (mergedIndexResp.ok) {
            const mergedIndex = await mergedIndexResp.json();
            const files = mergedIndex.plants || [];
            console.log(`📋 Index lists ${files.length} plant files`);
            
            // Test fetch first file to verify connectivity
            if (files.length > 0) {
                const testUrl = `data/plants-merged/${files[0]}${cacheBuster}`;
                const testResp = await fetch(testUrl);
                console.log(`🔍 Test fetch: ${files[0]} - Status: ${testResp.status} ${testResp.ok ? 'OK' : 'FAILED'}`);
                if (!testResp.ok) {
                    console.error(`❌ Cannot access plant files! First file returned: ${testResp.status} ${testResp.statusText}`);
                    console.error(`   URL tested: ${testUrl}`);
                }
            }
            
            const loadedPlants = [];
            let failedCount = 0;
            
            // Load files in batches to avoid overwhelming the server
            // Increased batch size and reduced delay for faster loading
            const BATCH_SIZE = 50; // Increased from 20 to 50
            const BATCH_DELAY = 10; // Reduced from 50ms to 10ms
            
            for (let i = 0; i < files.length; i += BATCH_SIZE) {
                const batch = files.slice(i, i + BATCH_SIZE);
                const batchPromises = batch.map(async (file) => {
                    try {
                        const plantUrl = `data/plants-merged/${file}${cacheBuster}`;
                        const plantResp = await fetch(plantUrl);
                        if (plantResp.ok) {
                            const plant = await plantResp.json();
                            return { success: true, plant };
                        } else {
                            if (failedCount < 5) { // Log first 5 failures for debugging
                                console.warn(`⚠️ Failed to load ${file}: HTTP ${plantResp.status}`);
                            }
                            return { success: false };
                        }
                    } catch (err) {
                        if (failedCount < 5) { // Log first 5 errors for debugging
                            console.error(`❌ Error loading ${file}:`, err.message);
                        }
                        return { success: false };
                    }
                });
                
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(result => {
                    if (result.success) {
                        loadedPlants.push(result.plant);
                    } else {
                        failedCount++;
                    }
                });
                
                // Small delay between batches to avoid rate limiting
                if (i + BATCH_SIZE < files.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
            
            if (failedCount > 0) {
                console.warn(`⚠️ Failed to load ${failedCount} plant files (showing first 5 errors above)`);
            }
            if (loadedPlants.length > 0) {
                const sortedPlants = loadedPlants.sort((a, b) => a.id - b.id);
                plantsDatabase.length = 0;
                plantsDatabase.push(...sortedPlants);
                if (typeof window !== 'undefined') {
                    window.plantsDatabase = plantsDatabase;
                }
                console.log(`✅ Loaded ${plantsDatabase.length} plants from plants-merged${failedCount > 0 ? ` (${failedCount} files not found - likely merged/removed)` : ''}`);
                return plantsDatabase;
            } else {
                console.warn(`⚠️ No plants loaded! Index lists ${files.length} files but none were found.`);
            }
        }

        // Fallback: category-based modular structure
        const indexResponse = await fetch('data/plants/index.json' + cacheBuster);
        console.log('Index response status:', indexResponse.status, indexResponse.ok);
        
        if (indexResponse.ok) {
            const index = await indexResponse.json();
            console.log('📋 Found index with', index.categories?.length || 0, 'categories');
            const loadedPlants = [];
            
            // Try loading from each category
            for (const category of index.categories || []) {
                try {
                    console.log(`📁 Loading category: ${category}`);
                    // Check if category has index (with cache busting)
                    const catIndexResponse = await fetch(`data/plants/${category}/index.json${cacheBuster}`);
                    if (catIndexResponse.ok) {
                        const catIndex = await catIndexResponse.json();
                        console.log(`  Found ${catIndex.plants?.length || 0} plants in ${category}`);
                        // Load each plant in category
                        for (const plantFile of catIndex.plants || []) {
                            try {
                                const plantResponse = await fetch(`data/plants/${category}/${plantFile}${cacheBuster}`);
                                if (plantResponse.ok) {
                                    const plant = await plantResponse.json();
                                    loadedPlants.push(plant);
                                } else {
                                    console.warn(`  ⚠️ Failed to load ${plantFile}: HTTP ${plantResponse.status}`);
                                }
                            } catch (err) {
                                console.warn(`  ⚠️ Failed to load ${plantFile}:`, err.message);
                            }
                        }
                    } else {
                        console.warn(`  ⚠️ Category ${category} index not found: HTTP ${catIndexResponse.status}`);
                    }
                } catch (err) {
                    console.warn(`  ⚠️ Error loading category ${category}:`, err.message);
                    continue;
                }
            }
            
            console.log(`📊 Total plants loaded: ${loadedPlants.length}`);
            
            if (loadedPlants.length > 0) {
                // Sort by ID and update the global plantsDatabase
                const sortedPlants = loadedPlants.sort((a, b) => a.id - b.id);
                
                // Clear and populate the existing plantsDatabase array
                plantsDatabase.length = 0;
                plantsDatabase.push(...sortedPlants);
                
                console.log(`✅ Successfully loaded ${plantsDatabase.length} plants from modular files`);
                
                // Make available globally
                if (typeof window !== 'undefined') {
                    window.plantsDatabase = plantsDatabase;
                }
                return plantsDatabase;
            } else {
                console.warn('⚠️ No plants loaded from JSON files (array is empty)');
            }
        } else {
            console.warn(`⚠️ Index file not found or error: HTTP ${indexResponse.status}`);
        }
    } catch (err) {
        console.error('❌ Error loading modular plant files:', err);
        console.log('Falling back to data.js...');
    }
    
    // Fallback: Use global plantsDatabase from data.js (loaded via script tag)
    // Access via window.plantsDatabase or global plantsDatabase variable
    const globalPlants = (typeof window !== 'undefined' && window.plantsDatabase) || 
                        (typeof plantsDatabase !== 'undefined' ? plantsDatabase : null);
    
    if (globalPlants && Array.isArray(globalPlants) && globalPlants.length > 0) {
        // Update the existing plantsDatabase array
        plantsDatabase.length = 0;
        plantsDatabase.push(...globalPlants);
        if (typeof window !== 'undefined') {
            window.plantsDatabase = plantsDatabase;
        }
        console.log(`✅ Using ${plantsDatabase.length} plants from data.js`);
        return plantsDatabase;
    }
    
    // If still nothing, wait a bit for data.js to load
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            const globalPlants = (typeof window !== 'undefined' && window.plantsDatabase) || 
                                (typeof plantsDatabase !== 'undefined' ? plantsDatabase : null);
            
            if (globalPlants && Array.isArray(globalPlants) && globalPlants.length > 0) {
                clearInterval(checkInterval);
                // Update the existing array (plantsDatabase is const in data.js)
                if (typeof plantsDatabase !== 'undefined') {
                    plantsDatabase.length = 0;
                    plantsDatabase.push(...globalPlants);
                }
                if (typeof window !== 'undefined') {
                    window.plantsDatabase = globalPlants;
                }
                console.log(`✅ Loaded ${globalPlants.length} plants from data.js`);
                resolve(globalPlants);
            }
        }, 100);
        
        // Timeout after 2 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            const globalPlants = (typeof window !== 'undefined' && window.plantsDatabase) || 
                                (typeof plantsDatabase !== 'undefined' ? plantsDatabase : []);
            const finalPlants = Array.isArray(globalPlants) ? globalPlants : [];
            
            // Update existing plantsDatabase if it exists
            if (typeof plantsDatabase !== 'undefined' && finalPlants.length > 0) {
                plantsDatabase.length = 0;
                plantsDatabase.push(...finalPlants);
            }
            
            if (finalPlants.length === 0) {
                console.warn('⚠️ No plant data loaded!');
            }
            resolve(finalPlants);
        }, 2000);
    });
}

// Auto-load when script executes
if (typeof window !== 'undefined') {
    // Start loading immediately
    loadAllPlants().then(plants => {
        console.log(`Plant loader finished: ${plants.length} plants loaded`);
        
        // Make sure it's available globally
        if (typeof window !== 'undefined') {
            window.plantsDatabase = plants;
        }
        
        // Dispatch event when plants are loaded
        const event = new CustomEvent('plantsLoaded', { 
            detail: { plants, count: plants.length } 
        });
        window.dispatchEvent(event);
        
        // Also try dispatching after a short delay in case listeners weren't ready
        setTimeout(() => {
            window.dispatchEvent(event);
        }, 100);
    }).catch(err => {
        console.error('Error loading plants:', err);
        // Dispatch event with empty array so UI can handle it
        window.dispatchEvent(new CustomEvent('plantsLoaded', { 
            detail: { plants: [], count: 0 } 
        }));
    });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadAllPlants, plantsDatabase };
}
