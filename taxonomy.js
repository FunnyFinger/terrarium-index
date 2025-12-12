// Taxonomy Tree Visualization
// Creates a phylogenetic tree showing all plants organized by their taxonomic hierarchy

let taxonomyData = null;
// Only radial layout is supported
let treeSvg = null;
let treeG = null;
let root = null;
let tree = null;
let zoom = null;
let allPlants = [];
let isolatedNodes = null; // Store which nodes should be visible during isolation
let nodePositions = new Map(); // Store fixed positions for nodes by their unique identifier
let savedZoomTransform = null; // Store zoom transform to preserve pan/zoom state

// Local vernacular names cache (loaded from JSON file)
let localVernacularNames = null;
let vernacularNamesLoaded = false;

// Convert scientific name to slug (matching folder naming convention)
function scientificNameToSlug(scientificName) {
    if (!scientificName) return null;
    return scientificName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// Get plant image path - optimized for tree view (small thumbnails) or full size
function getPlantImagePath(plant, preferThumb = true) {
    if (!plant) return null;
    
    // First, try to find a small thumbnail specifically for tree view
    if (preferThumb && plant.scientificName) {
        const folderName = scientificNameToSlug(plant.scientificName);
        if (folderName) {
            // Try tree-specific thumbnail first (smaller, optimized for tree)
            // This should be a 40x40 or 60x60 thumbnail saved as thumb.jpg
            return `images/${folderName}/thumb.jpg`;
        }
    }
    
    // For full-sized images, prioritize imageUrl, then images array, then localStorage
    if (plant.imageUrl) {
        return plant.imageUrl;
    }
    if (plant.images && Array.isArray(plant.images) && plant.images.length > 0) {
        return plant.images[0];
    }
    
    // Check localStorage for saved images
    try {
        const savedImageUrl = localStorage.getItem(`plant_${plant.id}_imageUrl`);
        if (savedImageUrl) {
            return savedImageUrl;
        }
        const savedImagesStr = localStorage.getItem(`plant_${plant.id}_images`);
        if (savedImagesStr) {
            const savedImages = JSON.parse(savedImagesStr);
            if (Array.isArray(savedImages) && savedImages.length > 0) {
                return savedImages[0];
            }
        }
    } catch (e) {
        // Silent - localStorage parsing failed
    }
    
    // Last resort: try to construct path from scientific name
    if (!preferThumb && plant.scientificName) {
        const folderName = scientificNameToSlug(plant.scientificName);
        if (folderName) {
            // Use the actual naming convention: images/folderName/folderName-1.jpg
            return `images/${folderName}/${folderName}-1.jpg`;
        }
    }
    
    return null;
}

// Build hierarchical taxonomy structure
function buildTaxonomyTree(plants) {
    // Start with Life (LUCA) as root
    const tree = {
        name: 'Life',
        rank: 'domain',
        children: {},
        plants: []
    };
    
    // Create kingdom nodes under Life
    const kingdoms = {
        'Plantae': {
            name: 'Plantae',
            rank: 'kingdom',
            children: {},
            plants: []
        },
        'Fungi': {
            name: 'Fungi',
            rank: 'kingdom',
            children: {},
            plants: []
        }
    };
    
    tree.children['Plantae'] = kingdoms['Plantae'];
    tree.children['Fungi'] = kingdoms['Fungi'];
    
    // Organize plants by kingdom
    plants.forEach(plant => {
        if (!plant.taxonomy) return;
        
        const taxonomy = plant.taxonomy;
        // Normalize kingdom names: Viridiplantae is the same as Plantae
        let kingdom = taxonomy.kingdom || 'Plantae';
        if (kingdom === 'Viridiplantae') {
            kingdom = 'Plantae';
        }
        
        // Get or create the kingdom node
        if (!kingdoms[kingdom]) {
            kingdoms[kingdom] = {
                name: kingdom,
                rank: 'kingdom',
                children: {},
                plants: []
            };
            tree.children[kingdom] = kingdoms[kingdom];
        }
        
        const path = [
            taxonomy.phylum || 'Unknown',
            taxonomy.class || 'Unknown',
            taxonomy.order || 'Unknown',
            taxonomy.family || 'Unknown',
            taxonomy.genus || 'Unknown',
            taxonomy.species || plant.scientificName || 'Unknown'
        ];
        
        let current = kingdoms[kingdom];
        path.forEach((name, index) => {
            const rank = ['phylum', 'class', 'order', 'family', 'genus', 'species'][index];
            
            if (!current.children[name]) {
                current.children[name] = {
                    name: name,
                    rank: rank,
                    children: {},
                    plants: []
                };
            }
            
            current = current.children[name];
        });
        
        // Add plant to the species node
        // Store the full plant object so we can access imageUrl/images later
        const plantData = {
            id: plant.id,
            scientificName: plant.scientificName,
            name: plant.name,
            imagePath: getPlantImagePath(plant),
            plant: plant // Store full plant object for image access
        };
        current.plants.push(plantData);
        
        // Debug: log for Peperomia ferreyrae to verify data is stored correctly
        if (plant.scientificName === 'Peperomia ferreyrae') {
            console.log('Stored plant data for Peperomia ferreyrae:', {
                id: plantData.id,
                scientificName: plantData.scientificName,
                imagePath: plantData.imagePath,
                hasPlantObject: !!plantData.plant,
                plantImageUrl: plantData.plant?.imageUrl,
                plantImages: plantData.plant?.images
            });
        }
    });
    
    // Convert to D3 hierarchy format
    function convertToD3(node) {
        const children = Object.values(node.children)
            .map(convertToD3)
            .filter(child => child !== null);
        
        const d3Node = {
            name: node.name,
            rank: node.rank,
            plants: node.plants || [],
            children: children.length > 0 ? children : undefined
        };
        
        // Keep nodes if they have children, plants, or are important structural nodes (domain, kingdom)
        // This ensures Fungi kingdom shows up even if empty
        if (!d3Node.children && d3Node.plants.length === 0) {
            // Keep domain and kingdom nodes even if empty (for structural purposes)
            if (d3Node.rank === 'domain' || d3Node.rank === 'kingdom') {
                return d3Node;
            }
            return null; // Skip other empty nodes
        }
        
        return d3Node;
    }
    
    return convertToD3(tree);
}

// Initialize taxonomy visualization
async function initializeTaxonomy() {
    console.log('🌳 Initializing taxonomy tree...');
    
    // Load local vernacular names first (non-blocking)
    loadLocalVernacularNames().catch(err => {
        console.warn('Failed to preload vernacular names:', err);
    });
    
    // Wait for plants to load
    if (typeof plantsDatabase === 'undefined' || plantsDatabase.length === 0) {
        console.log('⏳ Waiting for plants to load...');
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (typeof plantsDatabase !== 'undefined' && plantsDatabase.length > 0) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }
    
    // Use the same plantsDatabase reference so updates to plant objects are reflected
    // Check window.plantsDatabase first (updated by script.js), then fallback to plantsDatabase
    allPlants = (typeof window !== 'undefined' && window.plantsDatabase) || plantsDatabase || [];
    console.log(`📊 Loaded ${allPlants.length} plants for taxonomy tree`);
    
    if (allPlants.length === 0) {
        document.getElementById('taxonomyTree').innerHTML = '<p>No plants found. Please ensure plant data is loaded.</p>';
        return;
    }
    
    // Build taxonomy tree
    taxonomyData = buildTaxonomyTree(allPlants);
    
    if (!taxonomyData) {
        document.getElementById('taxonomyTree').innerHTML = '<p>Error building taxonomy tree.</p>';
        return;
    }
    
    // Create D3 hierarchy
    root = d3.hierarchy(taxonomyData);
    
    // Keep tree expanded by default - don't collapse anything initially
    
    // Calculate tree layout
    updateTreeLayout();
}

// Update tree layout (radial only)
function updateTreeLayout() {
    if (!root) return;
    
    const container = document.getElementById('taxonomyTree');
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight - 200;
    
    // Save current zoom transform before clearing (if treeG exists)
    if (treeG && treeG.node()) {
        const currentTransform = d3.zoomTransform(treeSvg.node());
        if (currentTransform) {
            savedZoomTransform = currentTransform;
        }
    }
    
    // Clear previous tree
    d3.select('#taxonomyTree').selectAll('*').remove();
    
    // Create SVG
    treeSvg = d3.select('#taxonomyTree')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    // Create zoom behavior with higher max zoom for better thumbnail visibility
    zoom = d3.zoom()
        .scaleExtent([0.5, 20]) // Increased min zoom to 0.5 to reduce zooming out, max zoom to 20
        .on('zoom', (event) => {
            treeG.attr('transform', event.transform);
            // Save the current transform so it persists across updates
            savedZoomTransform = event.transform;
        });
    
    treeSvg.call(zoom);
    
    // Create main group
    treeG = treeSvg.append('g');
    
    // Radial layout
    // Significantly increase the radius to spread nodes out more
    const maxRadius = Math.min(width, height) / 1.5; // Use more of the available space
    
    tree = d3.tree()
        .size([2 * Math.PI, maxRadius])
        .separation((a, b) => {
            // For radial trees, separation controls angular spacing
            // Return a larger value to spread nodes further apart
            // The default is (a.parent === b.parent ? 1 : 2) / a.depth
            // We'll multiply this significantly more
            const baseSeparation = (a.parent === b.parent ? 1 : 2) / Math.max(a.depth, 1);
            // Multiply by an even larger factor to spread nodes more
            return baseSeparation * 15;
        });
    
    const treeData = tree(root);
    
    // Check if we have stored positions
    const hasStoredPositions = nodePositions.size > 0;
    
    // Transform radius to increase spacing between levels as depth increases
    // Find max depth first
    let maxDepth = 0;
    treeData.descendants().forEach(d => {
        if (d.depth > maxDepth) maxDepth = d.depth;
    });
    
    // Transform radius values to create increasing spacing with depth
    // Use a quadratic function: newRadius = baseRadius * (1 + depth^2 * spacingFactor)
    treeData.descendants().forEach(d => {
        const originalRadius = d.y;
        const depth = d.depth;
        // Normalize depth to 0-1 range
        const normalizedDepth = maxDepth > 0 ? depth / maxDepth : 0;
        // Apply quadratic scaling: deeper levels get exponentially more spacing
        // Factor of 0.5 means depth 1 gets 1.5x, depth 2 gets 2x, depth 3 gets 2.5x, etc.
        const spacingFactor = 1 + (normalizedDepth * normalizedDepth) * 1.2;
        d.y = originalRadius * spacingFactor;
    });
    
    if (hasStoredPositions) {
        // Restore positions from stored values for existing nodes
        restoreNodePositions(treeData);
        
        // Store positions for any new nodes that don't have stored positions yet
        treeData.descendants().forEach(d => {
            const nodeId = getNodeId(d);
            if (nodeId && !nodePositions.has(nodeId)) {
                // This is a newly expanded node - store its position
                nodePositions.set(nodeId, {
                    x: d.x,
                    y: d.y
                });
            }
        });
    } else {
        // First time - store all calculated positions
        storeNodePositions(treeData);
    }
    
    // Center the tree
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Draw links (radial layout) - organic branch-like curves
    const links = treeG.selectAll('.tree-link')
        .data(treeData.links())
        .enter()
        .append('path')
        .attr('class', 'tree-link')
        .attr('d', d => {
            // Manually create radial path with organic curves
            const source = d.source;
            const target = d.target;
            const sourceAngle = source.x;
            const sourceRadius = source.y;
            const targetAngle = target.x;
            const targetRadius = target.y;
            
            const x1 = centerX + sourceRadius * Math.cos(sourceAngle - Math.PI / 2);
            const y1 = centerY + sourceRadius * Math.sin(sourceAngle - Math.PI / 2);
            const x2 = centerX + targetRadius * Math.cos(targetAngle - Math.PI / 2);
            const y2 = centerY + targetRadius * Math.sin(targetAngle - Math.PI / 2);
            
            // Create organic branch-like curve using cubic bezier
            // Control points create a natural branch appearance
            const dx = x2 - x1;
            const dy = y2 - y1;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Control points positioned to create organic branch curve
            // First control point: slightly offset toward source's radial direction
            const sourceRadialX = Math.cos(sourceAngle - Math.PI / 2);
            const sourceRadialY = Math.sin(sourceAngle - Math.PI / 2);
            const cp1x = x1 + sourceRadialX * distance * 0.3;
            const cp1y = y1 + sourceRadialY * distance * 0.3;
            
            // Second control point: slightly offset toward target's radial direction
            const targetRadialX = Math.cos(targetAngle - Math.PI / 2);
            const targetRadialY = Math.sin(targetAngle - Math.PI / 2);
            const cp2x = x2 - targetRadialX * distance * 0.3;
            const cp2y = y2 - targetRadialY * distance * 0.3;
            
            // Add slight organic variation based on depth
            const variation = (target.depth % 3) * 0.1 - 0.1; // -0.1 to 0.1
            const cp1xVaried = cp1x + variation * distance * 0.2;
            const cp1yVaried = cp1y + variation * distance * 0.2;
            
            return `M ${x1} ${y1} C ${cp1xVaried} ${cp1yVaried}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
        })
        .attr('stroke-width', d => {
            // Vary thickness based on hierarchy - heavy at root, lighter at deeper levels
            const depth = d.target.depth;
            
            // Start with heavy lines (4px) at root, decrease to thin (0.8px) at deepest level
            if (maxDepth === 0) return 4;
            const normalizedDepth = depth / maxDepth;
            // Exponential decrease: heavy to light
            const thickness = 4 * Math.pow(0.6, normalizedDepth * 2);
            return Math.max(0.8, thickness);
        })
        .attr('opacity', d => {
            // Also make lines lighter (more transparent) as depth increases
            const depth = d.target.depth;
            
            if (maxDepth === 0) return 1;
            const normalizedDepth = depth / maxDepth;
            // Start at 1.0 (fully opaque) at root, decrease to 0.75 at deepest level (less transparent)
            return 1 - (normalizedDepth * 0.25);
        });
    
    // Draw nodes at exact tree positions (no position variation to maintain tree structure)
    const nodes = treeG.selectAll('.tree-node')
        .data(treeData.descendants())
        .enter()
        .append('g')
        .attr('class', 'tree-node')
        .attr('transform', d => {
            const x = centerX + d.y * Math.cos(d.x - Math.PI / 2);
            const y = centerY + d.y * Math.sin(d.x - Math.PI / 2);
            return `translate(${x},${y})`;
        });
    
    // Add circles for nodes with organic size variation
    nodes.append('circle')
        .attr('r', d => {
            const baseRadius = getNodeRadius(d);
            // Add subtle organic size variation (5-15% variation)
            const hash = d.data.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const variation = 1 + ((hash % 20 - 10) / 100); // -10% to +10%
            return baseRadius * variation;
        })
        .attr('class', d => `tree-node ${d.data.rank || ''}`)
        .style('opacity', d => {
            // Slight opacity variation for depth perception
            return 0.85 + (d.depth % 3) * 0.05;
        });
    
    // Add labels with radial alignment
    nodes.append('text')
        .attr('class', d => `tree-label ${d.data.rank || ''}`)
        .attr('dy', 4)
        .each(function(d) {
            const textElement = d3.select(this);
            
            // Set text content first (needed to measure text width)
            const text = (d.data.rank === 'species' && d.data.plants && d.data.plants.length > 0) 
                ? (d.data.plants.length > 1 ? `${d.data.name} (${d.data.plants.length})` : d.data.name)
                : d.data.name;
            textElement.text(text);
            
            // Special handling for "Life" node - horizontal and below
            if (d.data.name === 'Life' && d.data.rank === 'domain') {
                textElement.attr('text-anchor', 'middle');
                textElement.attr('dx', 0);
                textElement.attr('dy', 20); // Position below the node
                textElement.attr('transform', 'rotate(0)'); // No rotation, horizontal
                return;
            }
            
            // For all other nodes, use radial alignment
            const angle = d.x;
            // Normalize angle to 0-2π
            const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            
            // Calculate the actual x position on screen to determine left vs right
            // In radial layout: x = centerX + radius * cos(angle - π/2)
            // We need to check if the x coordinate is to the left or right of center
            const radius = d.y;
            const xPos = radius * Math.cos(normalizedAngle - Math.PI / 2);
            
            // Determine which half of the circle (left vs right)
            // Right side: x position is positive (to the right of center)
            // Left side: x position is negative (to the left of center)
            const isRightSide = xPos >= 0;
            const isLeftSide = xPos < 0;
            
            // Calculate text width for left side positioning
            let textWidth = 0;
            if (isLeftSide) {
                // Create a temporary text element to measure width
                // Use the same styling as the actual text element
                const tempText = treeSvg.append('text')
                    .attr('class', `tree-label ${d.data.rank || ''}`)
                    .attr('visibility', 'hidden')
                    .attr('font-family', 'Lato, sans-serif')
                    .attr('font-size', d.data.rank === 'domain' ? '16px' : 
                          d.data.rank === 'kingdom' ? '14px' :
                          d.data.rank === 'phylum' ? '13px' :
                          d.data.rank === 'class' ? '12px' :
                          d.data.rank === 'order' ? '11px' :
                          d.data.rank === 'family' ? '10px' :
                          d.data.rank === 'genus' ? '9px' : '8px')
                    .text(text);
                const bbox = tempText.node().getBBox();
                textWidth = bbox.width;
                tempText.remove();
            }
            
            // Rotate text to align radially (tangent to circle)
            // Convert angle to degrees, adjusting for SVG coordinate system (0° = top)
            const degrees = (normalizedAngle * 180 / Math.PI) - 90;
            
            // Set text anchor and positioning
            if (isRightSide) {
                // Right side: text anchor at start, simple offset
                textElement.attr('text-anchor', 'start');
                textElement.attr('dx', 8);
                textElement.attr('transform', `rotate(${degrees})`);
            } else if (isLeftSide) {
                // Left side: text anchor at end
                // Position anchor point: move it radially outward by (text width + offset)
                // This ensures the end of the word is at the same distance as right side start
                const offset = 8; // Same as right side
                const radialOffset = textWidth + offset;
                
                // Calculate radial direction vector (outward from center)
                // The radial direction at this angle is: (cos(angle - π/2), sin(angle - π/2))
                const radialX = Math.cos(normalizedAngle - Math.PI / 2);
                const radialY = Math.sin(normalizedAngle - Math.PI / 2);
                
                // Translate outward in radial direction, then rotate
                const rotation = degrees + 180;
                textElement.attr('text-anchor', 'end');
                // Translate outward radially by the calculated offset
                textElement.attr('transform', `translate(${radialOffset * radialX}, ${radialOffset * radialY}) rotate(${rotation})`);
            }
        });
    
    // Add plant thumbnails for species nodes
    nodes.filter(d => d.data.rank === 'species' && d.data.plants && d.data.plants.length > 0)
        .each(function(d) {
            const nodeGroup = d3.select(this);
            const nodeData = d; // Store node data for tooltip
            const plants = d.data.plants;
            
            // Show only 1 thumbnail per node to optimize performance
            // Only show thumbnail for the first plant to reduce image loading
            const thumbnailsToShow = plants.slice(0, 1); // Only first plant
            const nodeRadius = getNodeRadius(d);
            // Size thumbnail to fit inside node - use 90% of node diameter to leave small padding
            const thumbnailSize = nodeRadius * 1.8; // 1.8 * radius = 0.9 * diameter, fits inside
            
            // Position thumbnail inside the node circle (centered)
            thumbnailsToShow.forEach((plantData, idx) => {
                // Try to get image path - prefer thumb.jpg for tree view
                let imagePath = plantData.imagePath;
                if (!imagePath && plantData.plant) {
                    // Try to get from plant object, preferring thumb.jpg
                    imagePath = getPlantImagePath(plantData.plant, true);
                }
                
                if (imagePath) {
                    // Center thumbnail in node
                    const thumbnail = nodeGroup.append('g')
                        .attr('class', 'plant-thumbnail-container')
                        .attr('transform', 'translate(0, 0)');
                    
                    // Thumbnails are 60x60, so we'll use that as the base size
                    // Scale to fit within the node using transform
                    const thumbBaseSize = 60; // Thumbnails are 60x60
                    const scale = thumbnailSize / thumbBaseSize; // Scale factor to fit in node
                    
                    // Add clip path to crop image to circle - clip to node radius to fit inside
                    // The clip path needs to be in the unscaled coordinate system
                    const clipId = `clip-thumb-${plantData.id}`;
                    let defs = treeSvg.select('defs');
                    if (defs.empty()) {
                        defs = treeSvg.append('defs');
                    }
                    if (defs.select(`#${clipId}`).empty()) {
                        defs.append('clipPath')
                            .attr('id', clipId)
                            .append('circle')
                            .attr('r', nodeRadius) // Clip to node radius, not thumbnail size
                            .attr('cx', 0)
                            .attr('cy', 0);
                    }
                    
                    // Create a group for the image with scaling transform
                    // Scale from center (0,0) to maintain centering
                    const imageGroup = thumbnail.append('g')
                        .attr('transform', `scale(${scale})`);
                    
                    // Apply clip path to the thumbnail group (unscaled coordinate system)
                    // This clips the image to the circular node border
                    thumbnail.attr('clip-path', `url(#${clipId})`);
                    
                    // Image element - exactly matches the green box
                    // Thumbnails are 60x60, positioned to match green box exactly
                    const imageElement = imageGroup.append('image')
                        .attr('href', imagePath)
                        .attr('width', thumbBaseSize) // 60x60
                        .attr('height', thumbBaseSize)
                        .attr('class', 'plant-thumbnail')
                        .attr('x', -thumbBaseSize / 2) // -30, matches green box exactly
                        .attr('y', -thumbBaseSize / 2) // -30, matches green box exactly
                        .attr('preserveAspectRatio', 'none') // Fill the 60x60 box exactly
                        .attr('loading', 'lazy') // Lazy load images
                        .on('error', function() {
                            // Silently remove failed images (thumbnails might not exist yet)
                            d3.select(this).remove();
                        })
                        .on('mouseover', function(event) {
                            // Always get the fresh plant object from the current database to ensure latest imageUrl is used
                            const currentPlants = (typeof window !== 'undefined' && window.plantsDatabase) || allPlants || [];
                            
                            // Match by scientific name first (most reliable, avoids duplicate ID issues)
                            let freshPlant = currentPlants.find(p => 
                                p.scientificName === plantData.scientificName || 
                                p.scientificName.toLowerCase() === plantData.scientificName.toLowerCase()
                            );
                            
                            // If not found by scientific name, try by ID (but check for duplicates)
                            if (!freshPlant && plantData.id) {
                                const plantsById = currentPlants.filter(p => p.id === plantData.id);
                                // Only use ID match if there's exactly one plant with this ID
                                if (plantsById.length === 1) {
                                    freshPlant = plantsById[0];
                                } else if (plantsById.length > 1) {
                                    // Multiple plants with same ID - use scientific name match
                                    freshPlant = plantsById.find(p => 
                                        p.scientificName === plantData.scientificName || 
                                        p.scientificName.toLowerCase() === plantData.scientificName.toLowerCase()
                                    ) || null;
                                }
                            }
                            
                            // Use fresh plant if found, otherwise fall back to stored plant
                            const plantToUse = freshPlant || plantData.plant;
                            const scientificNameToUse = freshPlant ? freshPlant.scientificName : plantData.scientificName;
                            
                            // Get full image path (not thumbnail) for hover preview
                            const fullImagePath = getPlantImagePath(plantToUse, false);
                            
                            // Create a node data object with this specific plant for accurate tooltip
                            const specificNodeData = {
                                data: {
                                    ...nodeData.data,
                                    plants: [{
                                        ...plantData,
                                        plant: plantToUse, // Use fresh plant object
                                        scientificName: scientificNameToUse
                                    }]
                                }
                            };
                            showTooltip(event, scientificNameToUse, fullImagePath, specificNodeData);
                        })
                        .on('mouseout', function() {
                            hideTooltip();
                        })
                        .style('cursor', 'pointer')
                        .on('click', function() {
                            window.location.href = `index.html#plant-${plantData.id}`;
                        });
                }
            });
            
            if (plants.length > 3) {
                // Show count indicator inside node
                nodeGroup.append('text')
                    .attr('x', 0)
                    .attr('y', nodeRadius + 8)
                    .attr('class', 'tree-label')
                    .attr('text-anchor', 'middle')
                    .text(`+${plants.length - 3}`);
            }
        });
    
    // Center and scale the tree with increased zoom to see thumbnails better
    // Only calculate initial transform if we don't have a saved transform
    if (savedZoomTransform) {
        // Restore saved zoom transform
        treeG.attr('transform', savedZoomTransform);
        // Apply the transform to the zoom behavior
        treeSvg.call(zoom.transform, savedZoomTransform);
    } else {
        // Calculate initial transform for first load
        const bounds = treeG.node().getBBox();
        if (bounds.width > 0 && bounds.height > 0) {
            const fullWidth = bounds.width;
            const fullHeight = bounds.height;
            const widthScale = width / fullWidth;
            const heightScale = height / fullHeight;
            // Increase scale significantly to make nodes and thumbnails more visible
            const scale = Math.min(widthScale, heightScale) * 1.5; // Increased from 0.9 to 1.5 for better visibility
            const translateX = width / 2 - scale * (bounds.x + bounds.width / 2);
            const translateY = height / 2 - scale * (bounds.y + bounds.height / 2);
            
            const initialTransform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
            treeG.attr('transform', initialTransform);
            // Apply the transform to the zoom behavior
            treeSvg.call(zoom.transform, initialTransform);
            // Save it for future updates
            savedZoomTransform = initialTransform;
        } else {
            // Fallback if bounds are invalid
            const initialTransform = d3.zoomIdentity;
            treeG.attr('transform', initialTransform);
            treeSvg.call(zoom.transform, initialTransform);
            savedZoomTransform = initialTransform;
        }
    }
    
    // Add click handlers for node expansion/collapse (for nodes with children)
    // Use double-click for expand/collapse to avoid conflict with navigation
    nodes.filter(d => d.children || d._children)
        .on('dblclick', function(event, d) {
            event.stopPropagation();
            // Toggle expand/collapse
            if (d.children) {
                d._children = d.children;
                d.children = null;
            } else {
                d.children = d._children;
                d._children = null;
            }
            updateTreeLayout();
        })
        .style('cursor', 'pointer');
    
    // Add click handlers for all nodes to navigate to home page with taxonomy filter
    nodes.on('click', function(event, d) {
        event.stopPropagation();
        // Navigate to home page with taxonomy filter
        navigateToTaxonomyFilter(d);
    });
    
    // Add right-click handlers for context menu (skip "Life" domain node)
    nodes.filter(d => !(d.data.rank === 'domain' && d.data.name === 'Life'))
        .on('contextmenu', function(event, d) {
            showContextMenu(event, d);
        });
    
    // Add hover handlers for non-species nodes to show taxonomic info
    nodes.filter(d => d.data.rank !== 'species' && d.data.rank !== 'domain')
        .on('mouseover', function(event, d) {
            showTooltip(event, d.data.name, null, d);
        })
        .on('mouseout', function() {
            hideTooltip();
        });
    
    // Add hover and click handlers to labels as well (for non-species nodes)
    // Use .each() to ensure data binding works correctly
    nodes.filter(d => d.data.rank !== 'species' && d.data.rank !== 'domain')
        .each(function(d) {
            const nodeGroup = d3.select(this);
            const label = nodeGroup.select('text.tree-label');
            if (!label.empty()) {
                label
                    .on('mouseover', function(event) {
                        showTooltip(event, d.data.name, null, d);
                    })
                    .on('mouseout', function() {
                        hideTooltip();
                    })
                    .on('click', function(event) {
                        event.stopPropagation();
                        navigateToTaxonomyFilter(d);
                    })
                    .on('contextmenu', function(event) {
                        event.preventDefault();
                        event.stopPropagation();
                        showContextMenu(event, d);
                    })
                    .style('cursor', 'pointer')
                    .style('pointer-events', 'all');
            }
        });
    
    // Add hover and click handlers to species labels as well
    nodes.filter(d => d.data.rank === 'species')
        .each(function(d) {
            const nodeGroup = d3.select(this);
            const label = nodeGroup.select('text.tree-label');
            if (!label.empty()) {
                // For species with plants, show tooltip with first plant info on hover
                if (d.data.plants && d.data.plants.length > 0) {
                    // For species nodes, the name should match the scientific name
                    // Find the plant that matches the species name, or use the first one
                    const matchingPlant = d.data.plants.find(p => 
                        p.scientificName === d.data.name || 
                        p.scientificName.toLowerCase() === d.data.name.toLowerCase()
                    ) || d.data.plants[0];
                    
                    label
                        .on('mouseover', function(event) {
                            // Always get the fresh plant object from the current database to ensure latest imageUrl is used
                            // This fixes issues where the stored plant reference might be stale
                            const currentPlants = (typeof window !== 'undefined' && window.plantsDatabase) || allPlants || [];
                            
                            // CRITICAL: Match by species node name FIRST (d.data.name) to avoid issues with duplicate IDs
                            // The species node name is the authoritative source (e.g., "Peperomia ferreyrae")
                            let freshPlant = null;
                            
                            if (d.data.name) {
                                // First priority: exact match with species node name (most reliable, avoids duplicate ID issues)
                                freshPlant = currentPlants.find(p => 
                                    p.scientificName === d.data.name || 
                                    p.scientificName.toLowerCase() === d.data.name.toLowerCase()
                                );
                            }
                            
                            // Second priority: match by stored plant's scientific name (if species name didn't match)
                            if (!freshPlant && matchingPlant.scientificName) {
                                freshPlant = currentPlants.find(p => 
                                    p.scientificName === matchingPlant.scientificName || 
                                    p.scientificName.toLowerCase() === matchingPlant.scientificName.toLowerCase()
                                );
                            }
                            
                            // Last resort: try by ID (but be aware of duplicate ID issues)
                            // Only use this if we have a unique match
                            if (!freshPlant && matchingPlant.id) {
                                const plantsById = currentPlants.filter(p => p.id === matchingPlant.id);
                                // Only use ID match if there's exactly one plant with this ID
                                if (plantsById.length === 1) {
                                    freshPlant = plantsById[0];
                                } else if (plantsById.length > 1) {
                                    // Multiple plants with same ID - try to find by scientific name match
                                    freshPlant = plantsById.find(p => 
                                        d.data.name && (
                                            p.scientificName === d.data.name || 
                                            p.scientificName.toLowerCase() === d.data.name.toLowerCase()
                                        )
                                    ) || null;
                                }
                            }
                            
                            // Use fresh plant if found, otherwise fall back to stored plant
                            const plantToUse = freshPlant || matchingPlant.plant;
                            const scientificNameToUse = freshPlant ? freshPlant.scientificName : matchingPlant.scientificName;
                            
                            // Get full image path (not thumbnail) for hover preview
                            const fullImagePath = getPlantImagePath(plantToUse, false);
                            
                            // Debug: log the path to help diagnose issues
                            if (d.data.name === 'Peperomia ferreyrae' || scientificNameToUse === 'Peperomia ferreyrae') {
                                console.log('Tooltip for Peperomia ferreyrae:', {
                                    speciesNodeName: d.data.name,
                                    matchingPlantId: matchingPlant.id,
                                    matchingPlantScientificName: matchingPlant.scientificName,
                                    freshPlantId: freshPlant?.id,
                                    freshPlantScientificName: freshPlant?.scientificName,
                                    scientificNameToUse: scientificNameToUse,
                                    imagePath: fullImagePath,
                                    usingFreshPlant: !!freshPlant,
                                    plantsWithSameId: matchingPlant.id ? currentPlants.filter(p => p.id === matchingPlant.id).length : 0
                                });
                            }
                            showTooltip(event, scientificNameToUse, fullImagePath, d);
                        })
                        .on('mouseout', function() {
                            hideTooltip();
                        })
                        .on('click', function(event) {
                            event.stopPropagation();
                            navigateToTaxonomyFilter(d);
                        })
                        .on('contextmenu', function(event) {
                            event.preventDefault();
                            event.stopPropagation();
                            showContextMenu(event, d);
                        })
                        .style('cursor', 'pointer')
                        .style('pointer-events', 'all');
                } else {
                    // For species without plants, just navigate on click
                    label
                        .on('click', function(event) {
                            event.stopPropagation();
                            navigateToTaxonomyFilter(d);
                        })
                        .on('contextmenu', function(event) {
                            event.preventDefault();
                            event.stopPropagation();
                            showContextMenu(event, d);
                        })
                        .style('cursor', 'pointer')
                        .style('pointer-events', 'all');
                }
            }
        });
    
    // Make all nodes look clickable
    nodes.style('cursor', 'pointer');
}

// Get node radius based on rank - all ranks use same size as species
function getNodeRadius(d) {
    // All ranks use the same size as species (3)
    return 3;
}

// Get unique identifier for a node (based on path from root)
function getNodeId(node) {
    if (!node) return '';
    const path = [];
    let current = node;
    while (current) {
        path.unshift(current.data ? current.data.name : current.name || '');
        current = current.parent;
    }
    return path.join('|');
}

// Store node positions
function storeNodePositions(treeData) {
    treeData.descendants().forEach(d => {
        const nodeId = getNodeId(d);
        if (nodeId) {
            nodePositions.set(nodeId, {
                x: d.x, // angle
                y: d.y  // radius
            });
        }
    });
}

// Restore node positions from stored values
function restoreNodePositions(treeData) {
    treeData.descendants().forEach(d => {
        const nodeId = getNodeId(d);
        if (nodeId && nodePositions.has(nodeId)) {
            const pos = nodePositions.get(nodeId);
            d.x = pos.x;
            d.y = pos.y;
        }
    });
}

// Get common name for a taxonomic rank
function getTaxonomicCommonName(rank, name) {
    const commonNames = {
        'kingdom': {
            'Plantae': 'Plants',
            'Fungi': 'Fungi'
        },
        'phylum': {
            'Tracheophyta': 'Vascular Plants',
            'Bryophyta': 'Mosses',
            'Chlorophyta': 'Green Algae',
            'Rhodophyta': 'Red Algae'
        },
        'class': {
            'Magnoliopsida': 'Dicotyledons (Dicots)',
            'Liliopsida': 'Monocotyledons (Monocots)',
            'Polypodiopsida': 'Ferns',
            'Lycopodiopsida': 'Clubmosses',
            'Pinopsida': 'Conifers'
        },
        'order': {
            'Asparagales': 'Asparagus Order',
            'Poales': 'Grass Order',
            'Lamiales': 'Mint Order',
            'Malpighiales': 'Malpighia Order',
            'Gentianales': 'Gentian Order',
            'Alismatales': 'Water Plantain Order',
            'Polypodiales': 'Polypod Fern Order',
            'Ericales': 'Heath Order',
            'Caryophyllales': 'Carnation Order',
            'Dioscoreales': 'Yam Order',
            'Rosales': 'Rose Order',
            'Fabales': 'Legume Order',
            'Sapindales': 'Soapberry Order',
            'Myrtales': 'Myrtle Order',
            'Brassicales': 'Cabbage Order',
            'Solanales': 'Nightshade Order',
            'Cucurbitales': 'Gourd Order',
            'Fagales': 'Beech Order',
            'Malvales': 'Mallow Order',
            'Saxifragales': 'Saxifrage Order'
        },
        'family': {
            'Orchidaceae': 'Orchid Family',
            'Bromeliaceae': 'Bromeliad Family',
            'Araceae': 'Arum Family',
            'Poaceae': 'Grass Family',
            'Lamiaceae': 'Mint Family',
            'Acanthaceae': 'Acanthus Family',
            'Apocynaceae': 'Dogbane Family',
            'Asaraceae': 'Wild Ginger Family',
            'Dioscoreaceae': 'Yam Family',
            'Drosophyllaceae': 'Dewy Pine Family',
            'Alismataceae': 'Water Plantain Family',
            'Sarraceniaceae': 'Pitcher Plant Family',
            'Nephrolepidaceae': 'Sword Fern Family',
            'Pteridaceae': 'Maidenhair Fern Family',
            'Ericaceae': 'Heath Family',
            'Droseraceae': 'Sundew Family',
            'Nepenthaceae': 'Tropical Pitcher Plant Family',
            'Lentibulariaceae': 'Bladderwort Family',
            'Cephalotaceae': 'Albany Pitcher Plant Family',
            'Byblidaceae': 'Rainbow Plant Family',
            'Roridulaceae': 'Dewstick Family',
            'Dionaeaceae': 'Venus Flytrap Family',
            'Crassulaceae': 'Stonecrop Family',
            'Cactaceae': 'Cactus Family',
            'Euphorbiaceae': 'Spurge Family',
            'Moraceae': 'Fig Family',
            'Urticaceae': 'Nettle Family',
            'Begoniaceae': 'Begonia Family',
            'Gesneriaceae': 'Gesneriad Family',
            'Marantaceae': 'Arrowroot Family',
            'Commelinaceae': 'Spiderwort Family',
            'Selaginellaceae': 'Spikemoss Family',
            'Lycopodiaceae': 'Clubmoss Family',
            'Equisetaceae': 'Horsetail Family',
            'Osmundaceae': 'Royal Fern Family',
            'Cyatheaceae': 'Tree Fern Family',
            'Dennstaedtiaceae': 'Bracken Family',
            'Aspleniaceae': 'Spleenwort Family',
            'Polypodiaceae': 'Polypody Family',
            'Davalliaceae': 'Rabbit\'s Foot Fern Family',
            'Hymenophyllaceae': 'Filmy Fern Family',
            'Thelypteridaceae': 'Marsh Fern Family',
            'Dryopteridaceae': 'Wood Fern Family',
            'Blechnaceae': 'Deer Fern Family',
            'Adiantaceae': 'Maidenhair Fern Family',
            'Vittariaceae': 'Shoestring Fern Family',
            'Lomariopsidaceae': 'Basket Fern Family',
            'Tectariaceae': 'Halberd Fern Family'
        }
    };
    
    return commonNames[rank]?.[name] || null;
}

// Cache for taxonomic counts from API
const taxonomicCountCache = new Map();

// Get taxon key from GBIF by name and rank
async function getTaxonKey(name, rank) {
    const cacheKey = `key-${rank}-${name}`;
    if (taxonomicCountCache.has(cacheKey)) {
        return taxonomicCountCache.get(cacheKey);
    }
    
    try {
        // Map our rank to GBIF rank
        const rankMap = {
            'kingdom': 'KINGDOM',
            'phylum': 'PHYLUM',
            'class': 'CLASS',
            'order': 'ORDER',
            'family': 'FAMILY',
            'genus': 'GENUS',
            'species': 'SPECIES'
        };
        
        const gbifRank = rankMap[rank];
        if (!gbifRank) return null;
        
        // Use name matching API to find the taxon
        let response = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}&rank=${gbifRank}`);
        let data = await response.json();
        
        // If multiple equal matches, try with kingdom filter (Plantae) to narrow it down
        if (data.matchType === 'NONE' && data.note && data.note.includes('Multiple equal matches')) {
            // Try with kingdom filter for plant taxa
            response = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}&rank=${gbifRank}&kingdom=Plantae`);
            data = await response.json();
        }
        
        // If still no match, try using search endpoint instead
        if (data.matchType === 'NONE' || !data.usageKey) {
            // Use search endpoint as fallback
            const searchResponse = await fetch(`https://api.gbif.org/v1/species/search?q=${encodeURIComponent(name)}&rank=${gbifRank}&limit=1`);
            if (searchResponse.ok) {
                const searchData = await searchResponse.json();
                if (searchData.results && searchData.results.length > 0) {
                    const firstResult = searchData.results[0];
                    if (firstResult.key) {
                        let key = firstResult.key;
                        // Check if it's a synonym and get accepted key
                        if (firstResult.acceptedUsageKey) {
                            key = firstResult.acceptedUsageKey;
                        }
                        taxonomicCountCache.set(cacheKey, key);
                        return key;
                    }
                }
            }
        }
        
        if (data.matchType && data.matchType !== 'NONE' && data.usageKey) {
            let key = data.usageKey;
            // Check if the match result indicates it's a synonym - use acceptedUsageKey if available
            if (data.acceptedUsageKey) {
                key = data.acceptedUsageKey;
            }
            // Also check the status - if it's a synonym, try to get the accepted key
            if (data.status === 'SYNONYM' && data.acceptedUsageKey) {
                key = data.acceptedUsageKey;
            }
            taxonomicCountCache.set(cacheKey, key);
            return key;
        } else {
            console.warn(`No match found for ${rank} ${name}, matchType: ${data.matchType}, data:`, data);
        }
        return null;
    } catch (error) {
        console.warn(`Failed to get taxon key for ${rank} ${name}:`, error);
        return null;
    }
}

// Fetch species count for a genus from GBIF API
async function fetchGenusSpeciesCount(genusName) {
    const cacheKey = `genus-${genusName}`;
    if (taxonomicCountCache.has(cacheKey)) {
        return taxonomicCountCache.get(cacheKey);
    }
    
    try {
        // First get the genus key
        const genusKey = await getTaxonKey(genusName, 'genus');
        if (!genusKey) {
            console.warn(`No genus key found for ${genusName}`);
            return null;
        }
        
        // Get direct children (species) count using species/search endpoint
        // This is more reliable than the children endpoint for getting total counts
        let response = await fetch(`https://api.gbif.org/v1/species/search?highertaxon_key=${genusKey}&rank=SPECIES&status=ACCEPTED&limit=0`);
        
        let count = null;
        
        if (response.ok) {
            const data = await response.json();
            // GBIF search endpoint returns count field with total matches
            if (data.count !== undefined && data.count !== null) {
                count = data.count;
            }
        }
        
        // If search endpoint fails or returns 0, try the children endpoint as fallback
        if (count === null || count === undefined || count === 0) {
            try {
                // Use children endpoint - fetch with limit to get count field
                response = await fetch(`https://api.gbif.org/v1/species/${genusKey}/children?limit=20`);
                if (response.ok) {
                    const childrenData = await response.json();
                    
                    // GBIF children endpoint returns an object with count and results
                    // The count field is the total number of children
                    if (childrenData.count !== undefined && childrenData.count !== null) {
                        count = childrenData.count;
                    } else if (Array.isArray(childrenData)) {
                        // If it's just an array, count the length
                        // But we might need to fetch more if there are more than 20
                        if (childrenData.length === 20) {
                            // Might be more, try fetching with larger limit
                            const allResponse = await fetch(`https://api.gbif.org/v1/species/${genusKey}/children?limit=1000`);
                            if (allResponse.ok) {
                                const allData = await allResponse.json();
                                if (allData.count !== undefined && allData.count !== null) {
                                    count = allData.count;
                                } else if (Array.isArray(allData)) {
                                    count = allData.length;
                                }
                            } else {
                                // Fallback to the 20 we got
                                count = childrenData.length;
                            }
                        } else {
                            count = childrenData.length;
                        }
                    } else if (childrenData.results && Array.isArray(childrenData.results)) {
                        // Check if there's a count field first
                        if (childrenData.count !== undefined && childrenData.count !== null) {
                            count = childrenData.count;
                        } else {
                            // No count field, use results length
                            // But if we got 20, there might be more
                            if (childrenData.results.length === 20) {
                                const allResponse = await fetch(`https://api.gbif.org/v1/species/${genusKey}/children?limit=1000`);
                                if (allResponse.ok) {
                                    const allData = await allResponse.json();
                                    if (allData.count !== undefined && allData.count !== null) {
                                        count = allData.count;
                                    } else if (Array.isArray(allData)) {
                                        count = allData.length;
                                    } else if (allData.results && Array.isArray(allData.results)) {
                                        count = allData.results.length;
                                    }
                                } else {
                                    count = childrenData.results.length;
                                }
                            } else {
                                count = childrenData.results.length;
                            }
                        }
                    }
                }
            } catch (childrenError) {
                console.warn(`Children endpoint also failed for genus ${genusName}:`, childrenError);
            }
        }
        
        if (count === null || count === undefined) {
            console.warn(`No count found for genus ${genusName}, genusKey: ${genusKey}`);
        } else {
            console.log(`Found ${count} species for genus ${genusName}`);
        }
        
        taxonomicCountCache.set(cacheKey, count);
        return count;
    } catch (error) {
        console.warn(`Failed to fetch species count for genus ${genusName}:`, error);
        return null;
    }
}

// Fetch direct children count for a taxonomic rank from GBIF API
async function fetchTaxonomicChildrenCount(rank, name) {
    const cacheKey = `${rank}-${name}`;
    if (taxonomicCountCache.has(cacheKey)) {
        return taxonomicCountCache.get(cacheKey);
    }
    
    try {
        // First get the taxon key
        let taxonKey = await getTaxonKey(name, rank);
        if (!taxonKey) return null;
        
        // If we get 0 children, check if the taxon is a synonym and get the accepted key
        // First try to get children count, and if it's 0, check if there's an accepted key
        let initialCount = null;
        try {
            const childRankMap = {
                'kingdom': 'PHYLUM',
                'phylum': 'CLASS',
                'class': 'ORDER',
                'order': 'FAMILY',
                'family': 'GENUS',
                'genus': 'SPECIES'
            };
            const childRank = childRankMap[rank];
            if (childRank) {
                const testResponse = await fetch(`https://api.gbif.org/v1/species/search?highertaxon_key=${taxonKey}&rank=${childRank}&status=ACCEPTED&limit=0`);
                if (testResponse.ok) {
                    const testData = await testResponse.json();
                    if (testData.count !== undefined && testData.count !== null) {
                        initialCount = testData.count;
                    }
                }
            }
        } catch (e) {
            // Ignore errors in this check
        }
        
        // If initial count is 0, try to get the accepted key from the taxon info
        if (initialCount === 0) {
            try {
                const taxonInfoResponse = await fetch(`https://api.gbif.org/v1/species/${taxonKey}`);
                if (taxonInfoResponse.ok) {
                    const taxonInfo = await taxonInfoResponse.json();
                    if (taxonInfo.acceptedUsageKey && taxonInfo.acceptedUsageKey !== taxonKey) {
                        console.log(`Taxon ${name} (key ${taxonKey}) appears to be a synonym, using accepted key ${taxonInfo.acceptedUsageKey}`);
                        taxonKey = taxonInfo.acceptedUsageKey;
                    }
                }
            } catch (e) {
                // Ignore errors
            }
        }
        
        // Get direct children count using species/search endpoint
        // Map rank to GBIF rank for the search
        const rankMap = {
            'kingdom': 'KINGDOM',
            'phylum': 'PHYLUM',
            'class': 'CLASS',
            'order': 'ORDER',
            'family': 'FAMILY',
            'genus': 'GENUS'
        };
        
        // Determine what rank of children we're looking for
        const childRankMap = {
            'kingdom': 'PHYLUM',
            'phylum': 'CLASS',
            'class': 'ORDER',
            'order': 'FAMILY',
            'family': 'GENUS',
            'genus': 'SPECIES'
        };
        
        const childRank = childRankMap[rank];
        if (!childRank) return null;
        
        // Try species/search endpoint first
        let response = await fetch(`https://api.gbif.org/v1/species/search?highertaxon_key=${taxonKey}&rank=${childRank}&status=ACCEPTED&limit=0`);
        
        let count = null;
        
        if (response.ok) {
            const data = await response.json();
            // GBIF search endpoint returns count field with total matches
            if (data.count !== undefined && data.count !== null) {
                count = data.count;
            }
        }
        
        // If search endpoint fails or returns 0, try the children endpoint as fallback
        // (0 might mean the search didn't find results, but children endpoint might have them)
        if (count === null || count === undefined || count === 0) {
            try {
                // Use children endpoint - fetch with limit to get count field
                // GBIF children endpoint returns count in the response
                response = await fetch(`https://api.gbif.org/v1/species/${taxonKey}/children?limit=20`);
                if (response.ok) {
                    const childrenData = await response.json();
                    
                    // GBIF children endpoint returns an object with count and results
                    // The count field is the total number of children
                    if (childrenData.count !== undefined && childrenData.count !== null) {
                        count = childrenData.count;
                    } else if (Array.isArray(childrenData)) {
                        // If it's just an array, count the length
                        // But we might need to fetch more if there are more than 20
                        if (childrenData.length === 20) {
                            // Might be more, try fetching with larger limit
                            const allResponse = await fetch(`https://api.gbif.org/v1/species/${taxonKey}/children?limit=1000`);
                            if (allResponse.ok) {
                                const allData = await allResponse.json();
                                if (allData.count !== undefined && allData.count !== null) {
                                    count = allData.count;
                                } else if (Array.isArray(allData)) {
                                    count = allData.length;
                                }
                            } else {
                                // Fallback to the 20 we got
                                count = childrenData.length;
                            }
                        } else {
                            count = childrenData.length;
                        }
                    } else if (childrenData.results && Array.isArray(childrenData.results)) {
                        // Check if there's a count field first
                        if (childrenData.count !== undefined && childrenData.count !== null) {
                            count = childrenData.count;
                        } else {
                            // No count field, use results length
                            // But if we got 20, there might be more
                            if (childrenData.results.length === 20) {
                                const allResponse = await fetch(`https://api.gbif.org/v1/species/${taxonKey}/children?limit=1000`);
                                if (allResponse.ok) {
                                    const allData = await allResponse.json();
                                    if (allData.count !== undefined && allData.count !== null) {
                                        count = allData.count;
                                    } else if (Array.isArray(allData)) {
                                        count = allData.length;
                                    } else if (allData.results && Array.isArray(allData.results)) {
                                        count = allData.results.length;
                                    }
                                } else {
                                    count = childrenData.results.length;
                                }
                            } else {
                                count = childrenData.results.length;
                            }
                        }
                    }
                }
            } catch (childrenError) {
                console.warn(`Children endpoint also failed for ${rank} ${name}:`, childrenError);
            }
        }
        
        if (count === null || count === undefined) {
            console.warn(`No count found for ${rank} ${name}, taxonKey: ${taxonKey}`);
        } else if (count === 0) {
            console.warn(`Found 0 children for ${rank} ${name}, taxonKey: ${taxonKey} - this might indicate a synonym or incorrect taxon key`);
        } else {
            console.log(`Found ${count} children for ${rank} ${name}`);
        }
        
        taxonomicCountCache.set(cacheKey, count);
        return count;
    } catch (error) {
        console.warn(`Failed to fetch children count for ${rank} ${name}:`, error);
        return null;
    }
}

// Get description for a taxonomic node - only uses API-fetched data
// This function is async to support API calls
async function getTaxonomicDescription(rank, name, nodeData) {
    // Handle domain - no API call needed
    if (rank === 'domain') {
        return `Domain ${name}`;
    }
    
    // Handle species - no API call needed
    if (rank === 'species') {
        return `Species ${name}`;
    }
    
    // For all other ranks, fetch count from API
    let childrenCount = null;
    
    if (rank === 'genus') {
        childrenCount = await fetchGenusSpeciesCount(name);
    } else {
        childrenCount = await fetchTaxonomicChildrenCount(rank, name);
    }
    
    // Determine child label based on rank
    const childLabel = rank === 'family' ? 'genera' : 
                      rank === 'order' ? 'families' :
                      rank === 'class' ? 'orders' :
                      rank === 'phylum' ? 'classes' :
                      rank === 'kingdom' ? 'phyla' : 
                      rank === 'genus' ? 'species' : 'children';
    
    // Get rank label
    const rankLabels = {
        'kingdom': 'Kingdom',
        'phylum': 'Phylum',
        'class': 'Class',
        'order': 'Order',
        'family': 'Family',
        'genus': 'Genus',
        'species': 'Species'
    };
    
    const rankLabel = rankLabels[rank] || rank;
    
    // Return description with API-fetched count
    if (childrenCount !== null && childrenCount > 0) {
        return `${rankLabel} ${name}, containing ${childrenCount.toLocaleString()} ${childLabel} worldwide.`;
    }
    
    // If API failed, return just the rank and name
    return `${rankLabel} ${name}`;
}

// Count total descendants (plants) in a node
function countDescendants(nodeData) {
    let count = 0;
    if (nodeData.plants) {
        count += nodeData.plants.length;
    }
    if (nodeData.children) {
        nodeData.children.forEach(child => {
            count += countDescendants(child);
        });
    }
    return count;
}

// Get sibling nodes for comparison (helper function for future use)
function getSiblingNodes(nodeData) {
    if (!nodeData || !nodeData.parent) return [];
    return nodeData.parent.children || [];
}

// Navigate to home page with taxonomy filter
function navigateToTaxonomyFilter(nodeData) {
    if (!nodeData || !nodeData.data) return;
    
    const rank = nodeData.data.rank;
    const name = nodeData.data.name;
    
    // Skip "Life" domain node
    if (rank === 'domain' && name === 'Life') {
        return;
    }
    
    // Build URL with taxonomy filter
    const params = new URLSearchParams();
    params.set('taxonomyRank', rank);
    params.set('taxonomyName', name);
    
    // Navigate to home page with filter
    window.location.href = `index.html?${params.toString()}`;
}

// Helper function to format vernacular name with rank, avoiding duplicates
function formatVernacularNameWithRank(vernacularName, rank) {
    if (!vernacularName) return null;
    
    // Get rank label for display
    const rankLabels = {
        'kingdom': 'Kingdom',
        'phylum': 'Phylum',
        'class': 'Class',
        'order': 'Order',
        'family': 'Family',
        'genus': 'Genus',
        'species': 'Species'
    };
    const rankLabel = rankLabels[rank] || rank;
    
    // Check if the vernacular name already contains the rank word (case-insensitive)
    const nameLower = vernacularName.toLowerCase();
    const rankLower = rankLabel.toLowerCase();
    
    // Check if the name ends with the rank word (with or without space)
    const rankPattern = new RegExp(`\\b${rankLower}\\b`, 'i');
    if (rankPattern.test(nameLower)) {
        // Rank already included, return as-is
        return vernacularName;
    }
    
    // Rank not included, append it
    return `${vernacularName} ${rankLabel}`;
}

// Show tooltip with image preview (for species) or taxonomic info (for non-species)
function showTooltip(event, text, imagePath, nodeData = null) {
    let tooltip = document.querySelector('.plant-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'plant-tooltip';
        document.body.appendChild(tooltip);
    }
    
    // Clear previous content
    tooltip.innerHTML = '';
    
    // Determine if this is a species node or taxonomic node
    const isSpecies = nodeData && nodeData.data && nodeData.data.rank === 'species';
    const isTaxonomic = nodeData && nodeData.data && nodeData.data.rank !== 'species' && nodeData.data.rank !== 'domain';
    const rank = nodeData && nodeData.data ? nodeData.data.rank : null;
    const name = nodeData && nodeData.data ? nodeData.data.name : text;
    
    // Add scientific name
    const nameDiv = document.createElement('div');
    nameDiv.className = 'tooltip-name';
    nameDiv.textContent = text;
    tooltip.appendChild(nameDiv);
    
    // Fetch and display English vernacular name from Catalogue of Life API for all nodes (except domain)
    if (rank && rank !== 'domain') {
        const vernacularNameDiv = document.createElement('div');
        vernacularNameDiv.className = 'tooltip-common-name';
        vernacularNameDiv.textContent = 'Loading...';
        tooltip.appendChild(vernacularNameDiv);
        
        // Get rank label for display
        const rankLabels = {
            'kingdom': 'Kingdom',
            'phylum': 'Phylum',
            'class': 'Class',
            'order': 'Order',
            'family': 'Family',
            'genus': 'Genus',
            'species': 'Species'
        };
        const rankLabel = rankLabels[rank] || rank;
        
        // Fetch vernacular name asynchronously
        getColVernacularName(name, rank)
            .then(vernacularName => {
                if (vernacularName) {
                    // Format: "name Rank" (e.g., "plants Kingdom", "Bromeliad Family")
                    // But avoid duplicates if rank is already in the name
                    const formattedName = formatVernacularNameWithRank(vernacularName, rank);
                    vernacularNameDiv.textContent = formattedName;
                } else {
                    // If no vernacular name found, try the hardcoded common name as fallback
                    if (isTaxonomic) {
                        const commonName = getTaxonomicCommonName(rank, name);
                        if (commonName) {
                            // Format with rank, avoiding duplicates
                            const formattedName = formatVernacularNameWithRank(commonName, rank);
                            vernacularNameDiv.textContent = formattedName;
                        } else {
                            // No vernacular name available, use scientific name with rank
                            vernacularNameDiv.textContent = `${name} ${rankLabel}`;
                        }
                    } else {
                        // For species, use scientific name with rank if no vernacular name
                        vernacularNameDiv.textContent = `${name} ${rankLabel}`;
                    }
                }
            })
            .catch(error => {
                console.error('Failed to load vernacular name for', rank, name, ':', error);
                // Fallback to hardcoded common name if available
                if (isTaxonomic) {
                    const commonName = getTaxonomicCommonName(rank, name);
                    if (commonName) {
                        // Format with rank, avoiding duplicates
                        const formattedName = formatVernacularNameWithRank(commonName, rank);
                        vernacularNameDiv.textContent = formattedName;
                    } else {
                        // No vernacular name available, use scientific name with rank
                        vernacularNameDiv.textContent = `${name} ${rankLabel}`;
                    }
                } else {
                    // For species, use scientific name with rank if no vernacular name
                    vernacularNameDiv.textContent = `${name} ${rankLabel}`;
                }
            });
    }
    
    // For taxonomic nodes, add description (async - fetch from API if needed)
    if (isTaxonomic) {
        const descDiv = document.createElement('div');
        descDiv.className = 'tooltip-description';
        descDiv.textContent = 'Loading...';
        tooltip.appendChild(descDiv);
        
        // Fetch description asynchronously
        getTaxonomicDescription(rank, name, nodeData.data)
            .then(description => {
                if (description) {
                    descDiv.textContent = description;
                } else {
                    descDiv.textContent = `${rank} ${name}.`;
                }
            })
            .catch(error => {
                console.error('Failed to load description for', rank, name, ':', error);
                descDiv.textContent = `${rank} ${name}.`;
            });
    }
    
    // Add image if available (for species nodes)
    if (imagePath) {
        const img = document.createElement('img');
        // Add cache-busting timestamp to ensure latest image is loaded
        const separator = imagePath.includes('?') ? '&' : '?';
        const imageUrl = imagePath + separator + 'refresh=' + Date.now();
        img.src = imageUrl;
        img.className = 'tooltip-image';
        img.alt = text;
        
        // Debug: log image path for Peperomia ferreyrae
        if (text === 'Peperomia ferreyrae') {
            console.log('Tooltip image path for Peperomia ferreyrae:', imageUrl);
        }
        
        // Handle image loading errors - try alternative naming conventions
        let attemptCount = 0;
        img.onerror = function() {
            attemptCount++;
            console.warn(`Image failed to load (attempt ${attemptCount}):`, this.src);
            
            // If the path follows the pattern images/folderName/folderName-1.jpg, try alternatives
            const pathMatch = imagePath.match(/^images\/([^\/]+)\/([^\/]+)-(\d+)\.jpg/);
            if (pathMatch) {
                const folderName = pathMatch[1];
                const imageNum = pathMatch[3];
                
                // Try next image number if available (up to 3 attempts)
                if (attemptCount <= 3) {
                    const nextNum = parseInt(imageNum) + attemptCount;
                    const nextPath = `images/${folderName}/${folderName}-${nextNum}.jpg`;
                    const nextUrl = nextPath + separator + 'refresh=' + Date.now();
                    if (!this.src.includes(nextPath)) {
                        console.log(`Trying alternative image: ${nextUrl}`);
                        this.src = nextUrl;
                        return; // Try loading the next image
                    }
                }
            } else {
                // If path doesn't match expected pattern, try standard naming
                const pathMatch2 = imagePath.match(/^images\/([^\/]+)\//);
                if (pathMatch2 && attemptCount === 1) {
                    const folderName = pathMatch2[1];
                    const standardPath = `images/${folderName}/${folderName}-1.jpg`;
                    const standardUrl = standardPath + separator + 'refresh=' + Date.now();
                    if (!this.src.includes(standardPath)) {
                        console.log(`Trying standard image path: ${standardUrl}`);
                        this.src = standardUrl;
                        return; // Try loading with standard naming
                    }
                }
            }
            
            // If all alternatives fail, hide the image
            console.warn('All image loading attempts failed, hiding image');
            this.style.display = 'none';
        };
        
        img.onload = function() {
            if (text === 'Peperomia ferreyrae') {
                console.log('Image loaded successfully for Peperomia ferreyrae:', this.src);
            }
        };
        
        tooltip.appendChild(img);
    } else {
        // Debug: log when no image path is available
        if (text === 'Peperomia ferreyrae') {
            console.warn('No image path available for Peperomia ferreyrae tooltip');
        }
    }
    
    tooltip.style.display = 'block';
    
    // Position tooltip near cursor, but keep it within viewport
    // Adjust size based on content type
    const tooltipWidth = imagePath ? 600 : 450; // Wider for longer taxonomic descriptions
    const tooltipHeight = imagePath ? 650 : (isTaxonomic ? 300 : 100); // Taller for descriptions
    const padding = 20;
    
    let left = event.pageX + 15;
    let top = event.pageY - 10;
    
    // Adjust if tooltip would go off screen
    if (left + tooltipWidth > window.innerWidth) {
        left = event.pageX - tooltipWidth - 15;
    }
    if (top + tooltipHeight > window.innerHeight) {
        top = window.innerHeight - tooltipHeight - padding;
    }
    if (top < padding) {
        top = padding;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// Hide tooltip
function hideTooltip() {
    const tooltip = document.querySelector('.plant-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnCollapse').addEventListener('click', () => {
        if (root) {
            root.descendants().forEach(d => {
                if (d.children && d.depth > 1) {
                    d._children = d.children;
                    d.children = null;
                }
            });
            updateTreeLayout();
        }
    });
    
    document.getElementById('btnExpand').addEventListener('click', () => {
        if (root) {
            root.descendants().forEach(d => {
                if (d._children) {
                    d.children = d._children;
                    d._children = null;
                }
            });
            updateTreeLayout();
        }
    });
    
    // Initialize when plants are loaded
    initializeTaxonomy();
});

// Handle window resize
window.addEventListener('resize', () => {
    if (root) {
        updateTreeLayout();
    }
});

// Context menu functionality
let contextMenuNode = null;

// Cache for vernacular names (runtime cache for API calls)
const vernacularNameCache = new Map();

// Load local vernacular names from JSON file
async function loadLocalVernacularNames() {
    if (vernacularNamesLoaded) {
        return localVernacularNames;
    }
    
    try {
        const response = await fetch('data/taxonomy-vernacular-names.json');
        if (response.ok) {
            localVernacularNames = await response.json();
            vernacularNamesLoaded = true;
            console.log('✅ Loaded local vernacular names');
            return localVernacularNames;
        } else {
            console.warn('⚠️ Could not load local vernacular names, will use API');
            localVernacularNames = {};
            vernacularNamesLoaded = true;
            return localVernacularNames;
        }
    } catch (error) {
        console.warn('⚠️ Error loading local vernacular names:', error);
        localVernacularNames = {};
        vernacularNamesLoaded = true;
        return localVernacularNames;
    }
}

// Get English vernacular name (checks local data first, then API)
async function getColVernacularName(name, rank) {
    // Ensure local data is loaded
    if (!vernacularNamesLoaded) {
        await loadLocalVernacularNames();
    }
    
    // Check local data first
    if (localVernacularNames && localVernacularNames[rank] && localVernacularNames[rank][name]) {
        return localVernacularNames[rank][name];
    }
    
    // Check runtime cache
    const cacheKey = `vernacular-${rank}-${name}`;
    if (vernacularNameCache.has(cacheKey)) {
        return vernacularNameCache.get(cacheKey);
    }
    
    // Fallback to API call (only if not in local data)
    const apiName = await getColVernacularNameFromAPI(name, rank);
    if (apiName) {
        vernacularNameCache.set(cacheKey, apiName);
    }
    return apiName;
}

// Get English vernacular name from Catalogue of Life API (fallback only)
async function getColVernacularNameFromAPI(name, rank) {
    
    try {
        // Map rank to Catalogue of Life compatible format
        const rankMap = {
            'kingdom': 'kingdom',
            'phylum': 'phylum',
            'class': 'class',
            'order': 'order',
            'family': 'family',
            'genus': 'genus',
            'species': 'species'
        };
        
        const colRank = rankMap[rank];
        if (!colRank) return null;
        
        // First, try searching and check if vernacular names are in search results
        let searchUrl = `https://api.checklistbank.org/dataset/312578/nameusage/search?q=${encodeURIComponent(name)}&rank=${colRank}&limit=5`;
        let response = await fetch(searchUrl);
        
        if (response.ok) {
            const searchData = await response.json();
            if (searchData.result && Array.isArray(searchData.result) && searchData.result.length > 0) {
                // Find exact match by name
                const exactMatch = searchData.result.find(r => {
                    const usage = r.usage || r;
                    const usageName = usage.name?.scientificName || usage.name?.uninomial || usage.name?.name;
                    return usageName && usageName.toLowerCase() === name.toLowerCase();
                });
                
                const match = exactMatch || searchData.result[0];
                const usage = match.usage || match;
                
                // Check for vernacular names in search result
                let vernacularNames = [];
                if (usage.vernacularNames && Array.isArray(usage.vernacularNames)) {
                    vernacularNames = usage.vernacularNames;
                } else if (match.vernacularNames && Array.isArray(match.vernacularNames)) {
                    vernacularNames = match.vernacularNames;
                }
                
                // Filter for English names (language codes: 'eng', 'en', 'English')
                const englishNames = vernacularNames.filter(v => {
                    const lang = (v.language || v.lang || '').toLowerCase();
                    return lang === 'eng' || lang === 'en' || lang === 'english';
                });
                
                if (englishNames.length > 0) {
                    const vernacularName = englishNames[0].vernacularName || englishNames[0].name || englishNames[0];
                    if (vernacularName && typeof vernacularName === 'string') {
                        return vernacularName;
                    }
                }
                
                // If no English name, try any vernacular name
                if (vernacularNames.length > 0) {
                    const vernacularName = vernacularNames[0].vernacularName || vernacularNames[0].name || vernacularNames[0];
                    if (vernacularName && typeof vernacularName === 'string') {
                        return vernacularName;
                    }
                }
                
                // If we found a match but no vernacular names in search, get the taxon ID and fetch details
                const taxonId = usage.id || match.id;
                if (taxonId) {
                    // Fetch the taxon details which includes vernacular names
                    const detailUrl = `https://api.checklistbank.org/dataset/312578/nameusage/${taxonId}`;
                    const detailResponse = await fetch(detailUrl);
                    
                    if (detailResponse.ok) {
                        const detailData = await detailResponse.json();
                        
                        // Check for vernacular names in the detail response
                        vernacularNames = [];
                        if (detailData.vernacularNames && Array.isArray(detailData.vernacularNames)) {
                            vernacularNames = detailData.vernacularNames;
                        } else if (detailData.usage && detailData.usage.vernacularNames && Array.isArray(detailData.usage.vernacularNames)) {
                            vernacularNames = detailData.usage.vernacularNames;
                        } else if (detailData.name && detailData.name.vernacularNames && Array.isArray(detailData.name.vernacularNames)) {
                            vernacularNames = detailData.name.vernacularNames;
                        }
                        
                        // Filter for English names
                        const englishNames = vernacularNames.filter(v => {
                            const lang = (v.language || v.lang || '').toLowerCase();
                            return lang === 'eng' || lang === 'en' || lang === 'english';
                        });
                        
                        if (englishNames.length > 0) {
                            const vernacularName = englishNames[0].vernacularName || englishNames[0].name || englishNames[0];
                            if (vernacularName && typeof vernacularName === 'string') {
                                return vernacularName;
                            }
                        }
                        
                        // If no English name, try any vernacular name
                        if (vernacularNames.length > 0) {
                            const vernacularName = vernacularNames[0].vernacularName || vernacularNames[0].name || vernacularNames[0];
                            if (vernacularName && typeof vernacularName === 'string') {
                                return vernacularName;
                            }
                        }
                    }
                }
            }
        }
        
        return null;
    } catch (error) {
        console.warn(`Failed to get vernacular name for ${rank} ${name}:`, error);
        return null;
    }
}

// Get Catalogue of Life taxon ID from name and rank
async function getColTaxonId(name, rank) {
    const cacheKey = `col-id-${rank}-${name}`;
    if (taxonomicCountCache.has(cacheKey)) {
        return taxonomicCountCache.get(cacheKey);
    }
    
    try {
        // Map rank to Catalogue of Life compatible format
        const rankMap = {
            'kingdom': 'kingdom',
            'phylum': 'phylum',
            'class': 'class',
            'order': 'order',
            'family': 'family',
            'genus': 'genus',
            'species': 'species'
        };
        
        const colRank = rankMap[rank];
        if (!colRank) return null;
        
        // Try multiple search approaches
        // Approach 1: Search by name and rank
        let searchUrl = `https://api.checklistbank.org/dataset/312578/nameusage/search?q=${encodeURIComponent(name)}&rank=${colRank}&limit=5`;
        
        let response = await fetch(searchUrl);
        if (response.ok) {
            const data = await response.json();
            // Check if results exist
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
                        taxonomicCountCache.set(cacheKey, taxonId);
                        return taxonId;
                    }
                }
                
                // If no exact match, use first result
                const firstResult = data.result[0];
                const usage = firstResult.usage || firstResult;
                const taxonId = usage.id || firstResult.id;
                if (taxonId) {
                    taxonomicCountCache.set(cacheKey, taxonId);
                    return taxonId;
                }
            }
        }
        
        // Approach 2: Try without rank filter (broader search)
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
                        taxonomicCountCache.set(cacheKey, taxonId);
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

// Open Catalogue of Life page for a taxon
async function openCatalogueOfLife(nodeData) {
    if (!nodeData || !nodeData.data) return;
    
    const name = nodeData.data.name;
    const rank = nodeData.data.rank;
    
    // Skip "Life" domain node
    if (rank === 'domain' && name === 'Life') {
        return;
    }
    
    // Try to get the taxon ID from the API
    const taxonId = await getColTaxonId(name, rank);
    
    if (taxonId) {
        // Open direct taxon page
        window.open(`https://www.catalogueoflife.org/data/taxon/${taxonId}`, '_blank');
    } else {
        // Fallback: open search page with the name
        const searchUrl = `https://www.catalogueoflife.org/search?q=${encodeURIComponent(name)}`;
        window.open(searchUrl, '_blank');
    }
}

// Show context menu
function showContextMenu(event, nodeData) {
    event.preventDefault();
    event.stopPropagation();
    
    // Hide any existing context menu
    hideContextMenu();
    
    // Store the node data
    contextMenuNode = nodeData;
    
    // Get context menu element
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;
    
    // Skip "Life" domain node
    if (nodeData && nodeData.data && nodeData.data.rank === 'domain' && nodeData.data.name === 'Life') {
        return;
    }
    
    // Position the menu at cursor
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    
    // Adjust if menu would go off screen
    const menuRect = contextMenu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
        contextMenu.style.left = (event.pageX - menuRect.width) + 'px';
    }
    if (menuRect.bottom > window.innerHeight) {
        contextMenu.style.top = (event.pageY - menuRect.height) + 'px';
    }
}

// Hide context menu
function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
    contextMenuNode = null;
}

// Restore the original tree structure from taxonomyData
function restoreOriginalTree() {
    if (!taxonomyData) return;
    
    // Rebuild the root from the original taxonomyData
    // This restores the complete tree structure
    root = d3.hierarchy(taxonomyData);
    
    // Restore all collapsed nodes
    root.descendants().forEach(d => {
        if (d._children) {
            d.children = d._children;
            d._children = null;
        }
    });
}

// Isolate selected node - show only direct parents up to Life and all children down to species
function isolateNode(nodeData) {
    if (!nodeData || !root || !taxonomyData) return;
    
    // First, restore the original tree structure to ensure we can isolate any node
    restoreOriginalTree();
    
    // Now find the node in the restored tree that matches the selected node
    // We need to find it by its path from root
    function findNodeByPath(currentNode, targetPath, currentPath = []) {
        const nodePath = [...currentPath, currentNode.data ? currentNode.data.name : currentNode.name || ''];
        const pathString = nodePath.join('|');
        
        if (pathString === targetPath) {
            return currentNode;
        }
        
        if (currentNode.children) {
            for (const child of currentNode.children) {
                const found = findNodeByPath(child, targetPath, nodePath);
                if (found) return found;
            }
        }
        
        return null;
    }
    
    // Build the path string for the selected node
    const selectedPath = [];
    let current = nodeData;
    while (current) {
        const name = current.data ? current.data.name : current.name || '';
        selectedPath.unshift(name);
        current = current.parent;
    }
    const targetPathString = selectedPath.join('|');
    
    // Find the node in the restored tree
    const targetNode = findNodeByPath(root, targetPathString);
    if (!targetNode) {
        console.warn('Could not find target node in restored tree');
        updateTreeLayout();
        return;
    }
    
    // Build the path from root to selected node
    const pathToSelected = [];
    current = targetNode;
    while (current) {
        pathToSelected.unshift(current);
        current = current.parent;
    }
    
    // Store which nodes should be visible
    isolatedNodes = new Set();
    
    // Add the entire path from root to selected node
    pathToSelected.forEach(node => {
        isolatedNodes.add(node);
    });
    
    // Add all descendants of the selected node down to species level
    function addDescendants(node) {
        if (node.children) {
            node.children.forEach(child => {
                isolatedNodes.add(child);
                // Recurse for all descendants
                addDescendants(child);
            });
        }
    }
    addDescendants(targetNode);
    
    // Filter the tree structure - remove siblings of ancestors
    // First pass: filter children arrays for nodes we're keeping
    const allNodes = root.descendants();
    allNodes.forEach(d => {
        const isInPath = pathToSelected.includes(d);
        const isSelected = d === targetNode;
        const isDescendant = isDescendantOf(d, targetNode);
        const shouldKeep = isolatedNodes.has(d);
        
        if (shouldKeep && d.children) {
            // This node should be kept
            // For ancestors, filter children to only include the one in the path
            if (isInPath && !isSelected && !isDescendant) {
                const childInPath = d.children.find(child => pathToSelected.includes(child));
                if (childInPath) {
                    // Keep only the child that's in the path
                    d.children = [childInPath];
                } else {
                    // No child in path, remove all children
                    d._children = d.children;
                    d.children = null;
                }
            } else {
                // For selected node and descendants, filter children to only include isolated ones
                d.children = d.children.filter(child => isolatedNodes.has(child));
            }
        }
    });
    
    // Second pass: remove nodes that shouldn't be kept from their parent's children
    allNodes.forEach(d => {
        const shouldKeep = isolatedNodes.has(d);
        if (!shouldKeep && d.parent && d.parent.children) {
            const index = d.parent.children.indexOf(d);
            if (index > -1) {
                d.parent.children.splice(index, 1);
            }
        }
    });
    
    // Update the tree layout
    updateTreeLayout();
}

// Helper function to check if a node is a descendant of another node
function isDescendantOf(node, ancestor) {
    let current = node;
    while (current && current.parent) {
        if (current.parent === ancestor) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

// Add context menu event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Hide context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu && !contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    // Hide context menu on scroll
    document.addEventListener('scroll', hideContextMenu, true);
    
    // Handle context menu item click
    const openColMenuItem = document.getElementById('openColMenuItem');
    if (openColMenuItem) {
        openColMenuItem.addEventListener('click', async () => {
            if (contextMenuNode) {
                await openCatalogueOfLife(contextMenuNode);
                hideContextMenu();
            }
        });
    }
    
    // Handle isolate menu item click
    const isolateMenuItem = document.getElementById('isolateMenuItem');
    if (isolateMenuItem) {
        isolateMenuItem.addEventListener('click', () => {
            if (contextMenuNode) {
                isolateNode(contextMenuNode);
                hideContextMenu();
            }
        });
    }
});

