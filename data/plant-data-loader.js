// Plant Data Loader
// Loads plant data from modular JSON files or falls back to data.js

let plantsDatabase = [];

/**
 * Load plant data from individual JSON files
 * Falls back to global plantsDatabase if JSON files are not available
 */
async function loadPlantData() {
    try {
        // Try to load from index file
        const indexResponse = await fetch('data/plants/index.json');
        if (indexResponse.ok) {
            const index = await indexResponse.json();
            const loadedPlants = [];
            
            // Load plants from each category
            for (const category of index.categories) {
                try {
                    // Try to load category index
                    const categoryResponse = await fetch(`data/plants/${category}/index.json`);
                    if (categoryResponse.ok) {
                        const categoryIndex = await categoryResponse.json();
                        for (const plantFile of categoryIndex.plants) {
                            try {
                                const plantResponse = await fetch(`data/plants/${category}/${plantFile}`);
                                if (plantResponse.ok) {
                                    const plant = await plantResponse.json();
                                    loadedPlants.push(plant);
                                }
                            } catch (err) {
                                console.warn(`Failed to load plant ${plantFile} from ${category}:`, err);
                            }
                        }
                    }
                } catch (err) {
                    // Category folder might not have index, skip it
                    console.warn(`Category ${category} not yet migrated:`, err);
                }
            }
            
            if (loadedPlants.length > 0) {
                plantsDatabase = loadedPlants.sort((a, b) => a.id - b.id);
                console.log(`Loaded ${plantsDatabase.length} plants from modular files`);
                return plantsDatabase;
            }
        }
    } catch (err) {
        console.warn('Could not load from modular files:', err);
    }
    
    // Fallback to global plantsDatabase (from data.js)
    if (typeof window !== 'undefined' && typeof plantsDatabase !== 'undefined' && Array.isArray(plantsDatabase)) {
        console.log(`Using fallback: ${plantsDatabase.length} plants from data.js`);
        return plantsDatabase;
    }
    
    console.error('No plant data available!');
    return [];
}

// Auto-load on script execution
if (typeof window !== 'undefined') {
    loadPlantData().then(plants => {
        // Update global variable
        plantsDatabase = plants;
        
        // Dispatch event for scripts that depend on plants being loaded
        if (typeof window.dispatchEvent !== 'undefined') {
            window.dispatchEvent(new CustomEvent('plantsDataLoaded', { 
                detail: { plants: plantsDatabase } 
            }));
        }
    });
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadPlantData, plantsDatabase };
}
