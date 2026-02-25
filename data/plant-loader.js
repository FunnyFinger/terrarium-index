// Plant Data Loader
// Dynamically loads plant data from modular JSON files
// Falls back to data.js if modular files are not available

// Note: plantsDatabase is declared in data.js, we'll just use it here

function applyPlantEditOverlays(plantsArray) {
    if (!plantsArray || typeof localStorage === 'undefined') return;
    for (let i = 0; i < plantsArray.length; i++) {
        const key = 'plant_edit_' + plantsArray[i].id;
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    // Remove faulty overlay: id 2 is Acanthostachys pitcairnioides (Pineapple Bromeliad), not Baby's Tears
                    if (plantsArray[i].id === 2) {
                        const name = (parsed.name || '').trim();
                        const sci = (typeof parsed.scientificName === 'string' ? parsed.scientificName : (parsed.scientificName && parsed.scientificName.name)) || '';
                        if (name === "Baby's Tears" || sci.indexOf('Soleirolia') !== -1) {
                            localStorage.removeItem(key);
                            continue;
                        }
                    }
                    // Merge overlay onto original; never overwrite with undefined or empty for description/careTips
                    const base = plantsArray[i];
                    const merged = { ...base };
                    for (const k of Object.keys(parsed)) {
                        const v = parsed[k];
                        if (v === undefined || v === null) continue;
                        if (k === 'description' && (v === '' || (typeof v === 'string' && !v.trim()))) continue;
                        if (k === 'careTips' && (!Array.isArray(v) || v.length === 0)) continue;
                        merged[k] = v;
                    }
                    plantsArray[i] = merged;
                }
            }
        } catch (e) { /* ignore */ }
    }
}

/** Cache-friendly version for plant data (bump when bundle is rebuilt). Per-file fallback uses this too. */
const PLANTS_DATA_VERSION = 1;

/**
 * Load all plant data from modular structure.
 * Prefers single bundle.json (one request); falls back to per-file loading.
 */
async function loadAllPlants() {
    // Check if running from file:// protocol (fetch won't work)
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        console.warn('⚠️ Running from file:// protocol - fetch() will not work.');
        console.warn('Please serve the files from a web server (e.g., python -m http.server 8000)');
        return [];
    }

    try {
        console.log('🌱 Loading plant data...');
        let bundleVersion = PLANTS_DATA_VERSION;
        const fetchOpts = { cache: 'default' };
        try {
            const versionResp = await fetch('data/plants-merged/version.json', { cache: 'default' });
            if (versionResp.ok) {
                const v = await versionResp.json();
                if (v && typeof v.version === 'number') bundleVersion = v.version;
            }
        } catch (_) { /* use default */ }
        const q = `?v=${bundleVersion}`;

        // 1) Try single bundle first (one request, cacheable)
        const bundleUrl = `data/plants-merged/bundle.json?v=${bundleVersion}`;
        const bundleResp = await fetch(bundleUrl, { cache: 'default' });
        if (bundleResp.ok) {
            const bundle = await bundleResp.json();
            const plants = bundle.plants || bundle;
            const list = Array.isArray(plants) ? plants : [];
            if (list.length > 0) {
                const sorted = list.sort((a, b) => (a.id || 0) - (b.id || 0));
                const deduped = sorted.filter((p, i, arr) => p && p.id != null && arr.findIndex(x => x.id === p.id) === i);
                plantsDatabase.length = 0;
                plantsDatabase.push(...deduped);
                applyPlantEditOverlays(plantsDatabase);
                if (typeof window !== 'undefined') window.plantsDatabase = plantsDatabase;
                console.log(`✅ Loaded ${plantsDatabase.length} plants from bundle (1 request)`);
                return plantsDatabase;
            }
        }

        // 2) Fallback: load from index + per-file (cache-friendly version)
        console.log('📋 Bundle not found, loading from index...');
        const mergedIndexResp = await fetch('data/plants-merged/index.json' + q, fetchOpts);
        if (mergedIndexResp.ok) {
            const mergedIndex = await mergedIndexResp.json();
            const files = mergedIndex.plants || [];
            console.log(`📋 Index lists ${files.length} plant files`);

            const loadedPlants = [];
            let failedCount = 0;
            const BATCH_SIZE = 50;
            const BATCH_DELAY = 10;

            for (let i = 0; i < files.length; i += BATCH_SIZE) {
                const batch = files.slice(i, i + BATCH_SIZE);
                const batchPromises = batch.map(async (file) => {
                    try {
                        const plantResp = await fetch(`data/plants-merged/${file}${q}`, fetchOpts);
                        if (plantResp.ok) {
                            const plant = await plantResp.json();
                            return { success: true, plant };
                        }
                        if (failedCount < 5) console.warn(`⚠️ Failed to load ${file}: HTTP ${plantResp.status}`);
                        return { success: false };
                    } catch (err) {
                        if (failedCount < 5) console.error(`❌ Error loading ${file}:`, err.message);
                        return { success: false };
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach((r) => {
                    if (r.success) loadedPlants.push(r.plant);
                    else failedCount++;
                });
                if (i + BATCH_SIZE < files.length) await new Promise((r) => setTimeout(r, BATCH_DELAY));
            }

            if (loadedPlants.length > 0) {
                const sortedPlants = loadedPlants.sort((a, b) => a.id - b.id);
                const deduped = sortedPlants.filter((p, i, arr) => p && p.id != null && arr.findIndex(x => x.id === p.id) === i);
                plantsDatabase.length = 0;
                plantsDatabase.push(...deduped);
                applyPlantEditOverlays(plantsDatabase);
                if (typeof window !== 'undefined') window.plantsDatabase = plantsDatabase;
                console.log(`✅ Loaded ${plantsDatabase.length} plants from plants-merged${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
                return plantsDatabase;
            }
            if (failedCount > 0) console.warn(`⚠️ Failed to load ${failedCount} plant files`);
        }

        // 3) Fallback: category-based modular structure
        const indexResponse = await fetch('data/plants/index.json' + q, fetchOpts);
        if (indexResponse.ok) {
            const index = await indexResponse.json();
            const loadedPlants = [];
            for (const category of index.categories || []) {
                try {
                    const catIndexResponse = await fetch(`data/plants/${category}/index.json${q}`, fetchOpts);
                    if (catIndexResponse.ok) {
                        const catIndex = await catIndexResponse.json();
                        for (const plantFile of catIndex.plants || []) {
                            try {
                                const plantResponse = await fetch(`data/plants/${category}/${plantFile}${q}`, fetchOpts);
                                if (plantResponse.ok) loadedPlants.push(await plantResponse.json());
                            } catch (_) {}
                        }
                    }
                } catch (_) {}
            }
            if (loadedPlants.length > 0) {
                const sortedPlants = loadedPlants.sort((a, b) => a.id - b.id);
                const deduped = sortedPlants.filter((p, i, arr) => p && p.id != null && arr.findIndex(x => x.id === p.id) === i);
                plantsDatabase.length = 0;
                plantsDatabase.push(...deduped);
                applyPlantEditOverlays(plantsDatabase);
                if (typeof window !== 'undefined') window.plantsDatabase = plantsDatabase;
                console.log(`✅ Loaded ${plantsDatabase.length} plants from category index`);
                return plantsDatabase;
            }
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
        plantsDatabase.length = 0;
        plantsDatabase.push(...globalPlants);
        applyPlantEditOverlays(plantsDatabase);
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
                if (typeof plantsDatabase !== 'undefined') {
                    plantsDatabase.length = 0;
                    plantsDatabase.push(...globalPlants);
                    applyPlantEditOverlays(plantsDatabase);
                }
                if (typeof window !== 'undefined') {
                    window.plantsDatabase = plantsDatabase || globalPlants;
                }
                console.log(`✅ Loaded ${globalPlants.length} plants from data.js`);
                resolve(plantsDatabase || globalPlants);
            }
        }, 100);
        
        // Timeout after 2 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            const globalPlants = (typeof window !== 'undefined' && window.plantsDatabase) || 
                                (typeof plantsDatabase !== 'undefined' ? plantsDatabase : []);
            const finalPlants = Array.isArray(globalPlants) ? globalPlants : [];
            
            if (typeof plantsDatabase !== 'undefined' && finalPlants.length > 0) {
                plantsDatabase.length = 0;
                plantsDatabase.push(...finalPlants);
                applyPlantEditOverlays(plantsDatabase);
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
