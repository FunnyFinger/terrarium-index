// Script to automatically add taxonomy and common names to all plants using Wikipedia API
// This will enrich plant data with scientific classification

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const PLANTS_DIR = path.join(__dirname, '..', 'data', 'plants');

/**
 * Extract species name from scientific name for Open Tree of Life search
 */
function extractSpeciesName(scientificName) {
    // Handle cases like "Ficus pumila", "Begonia spp.", "Aloe spp. (Miniature)"
    const parts = scientificName.trim().split(/\s+/);
    
    // If it's "Genus spp." format, return just the genus
    if (parts.length >= 2 && parts[1].toLowerCase() === 'spp.') {
        return parts[0]; // Return just genus
    }
    
    // If we have genus and species, return both
    if (parts.length >= 2) {
        // Remove parenthetical notes, varieties, etc.
        const genus = parts[0];
        const speciesPart = parts[1].replace(/\([^)]*\)/g, '').trim();
        if (speciesPart && !speciesPart.toLowerCase().includes('miniature') && !speciesPart.toLowerCase().includes('var')) {
            return `${genus} ${speciesPart}`;
        }
        return genus; // Fallback to just genus
    }
    
    // If only one word, assume it's genus
    return parts[0];
}

/**
 * Fetch taxonomy from Open Tree of Life
 */
async function fetchTaxonomyFromOpenTreeOfLife(speciesName) {
    try {
        // Open Tree of Life TNRS (Taxonomic Name Resolution Service) API
        const tnrsResponse = await axios.post('https://api.opentreeoflife.org/v3/tnrs/match_names', {
            names: [speciesName],
            do_approximate_matching: true,
            context_name: 'All life'
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        const matches = tnrsResponse.data?.results?.[0]?.matches || [];
        if (matches.length === 0) {
            return null;
        }
        
        // Get the best match (highest score)
        const bestMatch = matches[0];
        const ottId = bestMatch.taxonomy?.ott_id || bestMatch.ott_id;
        
        if (!ottId) {
            return null;
        }
        
        // Get taxonomy info for this OTT ID
        const taxonomyResponse = await axios.post('https://api.opentreeoflife.org/v3/taxonomy/taxon_info', {
            ott_id: ottId,
            include_lineage: true
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        const taxonInfo = taxonomyResponse.data;
        if (!taxonInfo) {
            return null;
        }
        
        // Build taxonomy from lineage
        const taxonomy = {};
        const lineage = taxonInfo.lineage || [];
        
        // Map Open Tree ranks to our taxonomy structure
        for (const ancestor of [...lineage, taxonInfo]) {
            const rank = ancestor.rank?.toLowerCase();
            const name = ancestor.name;
            
            if (!rank || !name) continue;
            
            // Map ranks
            if (rank === 'kingdom' || rank === 'regnum') {
                taxonomy.kingdom = name;
            } else if (rank === 'phylum' || rank === 'division' || rank === 'divisio') {
                taxonomy.phylum = name;
            } else if (rank === 'subphylum' || rank === 'subdivision') {
                taxonomy.subphylum = name;
            } else if (rank === 'class' || rank === 'classis') {
                taxonomy.class = name;
            } else if (rank === 'subclass' || rank === 'subclassis') {
                taxonomy.subclass = name;
            } else if (rank === 'order' || rank === 'ordo') {
                taxonomy.order = name;
            } else if (rank === 'suborder' || rank === 'subordo') {
                taxonomy.suborder = name;
            } else if (rank === 'family' || rank === 'familia') {
                taxonomy.family = name;
            } else if (rank === 'subfamily' || rank === 'subfamilia') {
                taxonomy.subfamily = name;
            } else if (rank === 'tribe' || rank === 'tribus') {
                taxonomy.tribe = name;
            } else if (rank === 'genus') {
                taxonomy.genus = name;
            } else if (rank === 'species') {
                taxonomy.species = name;
            }
        }
        
        // Set default kingdom
        if (!taxonomy.kingdom) {
            taxonomy.kingdom = 'Plantae';
        }
        
        // Build taxonomy link
        const taxonomyLink = `https://tree.opentreeoflife.org/taxonomy/browse?id=${ottId}`;
        
        return {
            taxonomy: Object.keys(taxonomy).length > 0 ? taxonomy : null,
            taxonomyLink: taxonomyLink,
            ottId: ottId
        };
        
    } catch (err) {
        console.log(`    ⚠️ Open Tree of Life error: ${err.message}`);
        return null;
    }
}

/**
 * Fetch taxonomy from Wikipedia using scientific name (fallback)
 */
async function fetchTaxonomyFromWikipedia(scientificName, plantName) {
    try {
        // Try searching Wikipedia for the plant
        const searchQuery = scientificName.includes('spp.') 
            ? scientificName.replace(' spp.', '') 
            : scientificName;
        
        // First, search for the article
        const searchResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
            params: {
                action: 'query',
                list: 'search',
                srsearch: searchQuery,
                srlimit: 3,
                format: 'json',
                origin: '*'
            },
            timeout: 10000
        });
        
        const searchResults = searchResponse.data.query?.search || [];
        if (searchResults.length === 0) {
            // Try with common name
            const searchResponse2 = await axios.get('https://en.wikipedia.org/w/api.php', {
                params: {
                    action: 'query',
                    list: 'search',
                    srsearch: plantName,
                    srlimit: 3,
                    format: 'json',
                    origin: '*'
                },
                timeout: 10000
            });
            const results2 = searchResponse2.data.query?.search || [];
            if (results2.length === 0) {
                return null;
            }
            searchResults.push(...results2);
        }
        
        // Get page content for the first result
        const pageTitle = searchResults[0].title;
        
        // Get page content - try to get full page, not just section 0
        const pageResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
            params: {
                action: 'query',
                titles: pageTitle,
                prop: 'revisions',
                rvprop: 'content',
                rvslots: 'main',
                format: 'json',
                origin: '*'
            },
            timeout: 20000
        });
        
        const pages = pageResponse.data.query?.pages || {};
        const pageData = Object.values(pages)[0];
        const pageContent = pageData?.revisions?.[0]?.slots?.main?.['*'] || 
                           pageData?.revisions?.[0]?.content || '';
        
        // Extract taxonomy from infobox - try multiple patterns
        const taxonomy = {};
        
        // Extract scientific classification from taxobox/infobox
        // Wikipedia uses different field names in different templates
        const extractValue = (keys, content) => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            for (const key of keyArray) {
                // Try different patterns
                const patterns = [
                    new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\|\\n<]+)`, 'i'),
                    new RegExp(`\\{\\{[^}]*\\|\\s*${key}\\s*=\\s*([^\\|\\n<]+)`, 'i'),
                    new RegExp(`${key}\\s*[=:]\\s*([^\\|\\n<]+)`, 'i')
                ];
                
                for (const pattern of patterns) {
                    const matches = content.match(new RegExp(pattern.source, 'g'));
                    if (matches && matches.length > 0) {
                        // Take the first match
                        const match = matches[0].match(pattern);
                        if (match) {
                            let value = match[1].trim()
                                .replace(/\[\[([^\|\]]+)(\|[^\]]+)?\]\]/g, '$1') // [[Name|Display]] -> Name
                                .replace(/<[^>]+>/g, '') // Remove HTML tags
                                .replace(/\{\{[^}]+\}\}/g, '') // Remove templates
                                .replace(/\([^)]*\)/g, '') // Remove parenthetical notes
                                .trim();
                            if (value && value.length > 0 && value !== 'null' && !value.match(/^[=\|]/) && value.length < 100) {
                                return value;
                            }
                        }
                    }
                }
            }
            return null;
        };
        
        // Extract from taxobox - Wikipedia taxoboxes can span multiple lines
        // Match the entire taxobox block (from {{Taxobox to closing }})
        let taxoboxMatch = null;
        let taxoboxDepth = 0;
        let taxoboxStart = -1;
        
        // Find taxobox start
        const taxoboxStartPattern = /\{\{(?:Taxobox|Species|Plant|Plantae|Taxon|Automatic[^}]*)/i;
        const match = pageContent.match(taxoboxStartPattern);
        if (match) {
            taxoboxStart = match.index;
            // Find the matching closing }}
            let depth = 0;
            for (let i = taxoboxStart; i < pageContent.length; i++) {
                if (pageContent.substr(i, 2) === '{{') {
                    depth++;
                    i++; // Skip second {
                } else if (pageContent.substr(i, 2) === '}}') {
                    depth--;
                    i++; // Skip second }
                    if (depth === 0) {
                        taxoboxMatch = pageContent.substring(taxoboxStart, i + 1);
                        break;
                    }
                }
            }
        }
        
        const infoboxContent = taxoboxMatch || pageContent;
        
        // Extract taxonomy hierarchically from largest to most specific
        // Kingdom level
        taxonomy.kingdom = extractValue(['regnum', 'kingdom'], infoboxContent) || 
                          extractValue(['regnum', 'kingdom'], pageContent) || 'Plantae';
        taxonomy.subkingdom = extractValue(['subregnum', 'subkingdom'], infoboxContent) || 
                              extractValue(['subregnum', 'subkingdom'], pageContent) || null;
        taxonomy.infrakingdom = extractValue(['infraregnum', 'infrakingdom'], infoboxContent) || null;
        
        // Phylum/Division level
        taxonomy.superphylum = extractValue(['superphylum'], infoboxContent) || null;
        taxonomy.superdivision = extractValue(['superdivisio', 'superdivision'], infoboxContent) || null;
        taxonomy.phylum = extractValue(['phylum', 'divisio'], infoboxContent) || 
                         extractValue(['phylum', 'divisio'], pageContent) || null;
        taxonomy.division = extractValue(['divisio', 'division'], infoboxContent) || null;
        taxonomy.subphylum = extractValue(['subphylum', 'subdivisio'], infoboxContent) || null;
        taxonomy.subdivision = extractValue(['subdivisio', 'subdivision'], infoboxContent) || null;
        taxonomy.infraphylum = extractValue(['infraphylum'], infoboxContent) || null;
        
        // Class level
        taxonomy.superclass = extractValue(['superclassis', 'superclass'], infoboxContent) || null;
        taxonomy.class = extractValue(['classis', 'class'], infoboxContent) || 
                        extractValue(['classis', 'class'], pageContent) || null;
        taxonomy.subclass = extractValue(['subclassis', 'subclass'], infoboxContent) || null;
        taxonomy.infraclass = extractValue(['infraclassis', 'infraclass'], infoboxContent) || null;
        
        // Order level
        taxonomy.superorder = extractValue(['superordo', 'superorder'], infoboxContent) || null;
        taxonomy.order = extractValue(['ordo', 'order'], infoboxContent) || 
                        extractValue(['ordo', 'order'], pageContent) || null;
        taxonomy.suborder = extractValue(['subordo', 'suborder'], infoboxContent) || null;
        taxonomy.infraorder = extractValue(['infraordo', 'infraorder'], infoboxContent) || null;
        
        // Family level
        taxonomy.superfamily = extractValue(['superfamilia', 'superfamily'], infoboxContent) || null;
        taxonomy.family = extractValue(['familia', 'family'], infoboxContent) || 
                         extractValue(['familia', 'family'], pageContent) || null;
        taxonomy.subfamily = extractValue(['subfamilia', 'subfamily'], infoboxContent) || null;
        taxonomy.tribe = extractValue(['tribus', 'tribe'], infoboxContent) || null;
        taxonomy.subtribe = extractValue(['subtribus', 'subtribe'], infoboxContent) || null;
        
        // Genus level
        taxonomy.genus = extractValue(['genus'], infoboxContent) || 
                        extractValue(['genus'], pageContent) || null;
        taxonomy.subgenus = extractValue(['subgenus'], infoboxContent) || null;
        taxonomy.section = extractValue(['sectio', 'section'], infoboxContent) || null;
        taxonomy.series = extractValue(['series'], infoboxContent) || null;
        
        // Species level
        taxonomy.species = extractValue(['species', 'species_authority', 'binomial'], infoboxContent) || 
                          extractValue(['species', 'species_authority', 'binomial'], pageContent) || null;
        taxonomy.subspecies = extractValue(['subspecies', 'subspecies_authority'], infoboxContent) || null;
        taxonomy.variety = extractValue(['varietas', 'variety'], infoboxContent) || null;
        taxonomy.form = extractValue(['forma', 'form'], infoboxContent) || null;
        taxonomy.cultivar = extractValue(['cultivar'], infoboxContent) || null;
        
        // Try to get more complete taxonomy from Wikidata if missing family/order
        if ((!taxonomy.family || !taxonomy.order) && taxonomy.genus) {
            try {
                // Search Wikidata for the genus
                const wdSearch = await axios.get('https://www.wikidata.org/w/api.php', {
                    params: {
                        action: 'wbsearchentities',
                        search: taxonomy.genus,
                        language: 'en',
                        type: 'taxon',
                        limit: 3,
                        format: 'json',
                        origin: '*'
                    },
                    timeout: 10000
                });
                
                const entities = wdSearch.data?.search || [];
                if (entities.length > 0) {
                    const entityId = entities[0].id;
                    
                    // Get entity data
                    const wdEntity = await axios.get('https://www.wikidata.org/w/api.php', {
                        params: {
                            action: 'wbgetentities',
                            ids: entityId,
                            props: 'claims',
                            format: 'json',
                            origin: '*'
                        },
                        timeout: 10000
                    });
                    
                    const claims = wdEntity.data?.entities?.[entityId]?.claims || {};
                    
                    // P171 = parent taxon (family for genus)
                    // P105 = taxon name
                    // Try to get family (parent of genus)
                    if (claims.P171 && !taxonomy.family) {
                        const parentIds = claims.P171.map(c => c.mainsnak?.datavalue?.value?.id);
                        for (const pid of parentIds.slice(0, 2)) {
                            if (pid) {
                                const parentEntity = await axios.get('https://www.wikidata.org/w/api.php', {
                                    params: {
                                        action: 'wbgetentities',
                                        ids: pid,
                                        props: 'labels',
                                        languages: 'en',
                                        format: 'json',
                                        origin: '*'
                                    },
                                    timeout: 5000
                                });
                                const label = parentEntity.data?.entities?.[pid]?.labels?.en?.value;
                                if (label && label.toLowerCase().endsWith('aceae') || label.toLowerCase().endsWith('eae')) {
                                    taxonomy.family = label;
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (wdErr) {
                // Wikidata lookup failed, continue with what we have
            }
        }
        
        // Extract genus from scientific name if not found
        if (!taxonomy.genus && scientificName) {
            const genusMatch = scientificName.match(/^([A-Z][a-z]+)/);
            if (genusMatch) {
                taxonomy.genus = genusMatch[1];
            }
        }
        
        // Extract common names from the article
        const commonNames = [];
        const commonNameSection = pageContent.match(/==\s*Common\s+names?\s*==(.*?)(==|$)/is);
        if (commonNameSection) {
            const namesText = commonNameSection[1];
            // Extract bulleted or listed names
            const nameMatches = namesText.match(/[*#]\s*\[\[([^\]]+)\]\]/g) || namesText.match(/[*#]\s*([^\n]+)/g);
            if (nameMatches) {
                nameMatches.slice(0, 5).forEach(match => {
                    const name = match.replace(/[*#\s\[\]]+/g, '').trim();
                    if (name && name.length > 2 && name.length < 50) {
                        commonNames.push(name);
                    }
                });
            }
        }
        
        // Also check for alternative names in infobox
        const altNames = extractValue('other_names|common_name', pageContent);
        if (altNames) {
            altNames.split(',').forEach(name => {
                const trimmed = name.trim();
                if (trimmed && !commonNames.includes(trimmed)) {
                    commonNames.push(trimmed);
                }
            });
        }
        
        // Clean up - remove empty fields
        Object.keys(taxonomy).forEach(key => {
            if (!taxonomy[key] || taxonomy[key] === 'null') {
                delete taxonomy[key];
            }
        });
        
        // Only return if we have at least family or genus
        if (taxonomy.family || taxonomy.genus) {
            return {
                taxonomy: Object.keys(taxonomy).length > 0 ? taxonomy : null,
                commonNames: commonNames.length > 0 ? [...new Set(commonNames)] : null,
                taxonomyLink: null // Wikipedia doesn't provide taxonomy link, will be set from Open Tree search
            };
        }
        
        return null;
    } catch (err) {
        console.log(`    ⚠️ Error fetching from Wikipedia: ${err.message}`);
        return null;
    }
}

/**
 * Process all plant files
 */
async function processAllPlants() {
    console.log('🌿 Adding Taxonomy and Common Names to All Plants\n');
    console.log('Using Wikipedia API (free, no key required)\n');
    
    const categories = (await fs.readdir(PLANTS_DIR, { withFileTypes: true }))
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    
    for (const category of categories) {
        const categoryPath = path.join(PLANTS_DIR, category);
        const indexPath = path.join(categoryPath, 'index.json');
        
        try {
            const indexContent = await fs.readFile(indexPath, 'utf8');
            const index = JSON.parse(indexContent);
            
            console.log(`\n📁 Category: ${category} (${index.plants?.length || 0} plants)`);
            
            for (const plantFile of index.plants || []) {
                const plantPath = path.join(categoryPath, plantFile);
                
                try {
                    const plantContent = await fs.readFile(plantPath, 'utf8');
                    const plant = JSON.parse(plantContent);
                    
                    totalProcessed++;
                    
                    // Always try to get full lineage from Open Tree of Life
                    // Check if we have complete taxonomy with many levels
                    const hasCompleteTaxonomy = plant.taxonomy && 
                                              plant.taxonomy.family && 
                                              plant.taxonomy.order && 
                                              plant.taxonomy.class &&
                                              plant.taxonomy.phylum &&
                                              Object.keys(plant.taxonomy).length >= 6 &&
                                              plant.taxonomyLink;
                    
                    // Skip if already has complete taxonomy with link
                    if (hasCompleteTaxonomy) {
                        console.log(`  ⏭️  ${plant.name} - Has complete taxonomy (${Object.keys(plant.taxonomy).length} levels)`);
                        continue;
                    }
                    
                    console.log(`  🔍 ${plant.name} (${plant.scientificName})...`);
                    
                    // Extract species name for Open Tree of Life
                    const speciesName = extractSpeciesName(plant.scientificName);
                    console.log(`    Searching Open Tree of Life for: "${speciesName}"`);
                    
                    // Try Open Tree of Life first (primary source for full lineage)
                    let result = await fetchTaxonomyFromOpenTreeOfLife(speciesName);
                    
                    // Fallback to Wikipedia if Open Tree fails
                    if (!result || !result.taxonomy) {
                        console.log(`    Falling back to Wikipedia...`);
                        const wikiResult = await fetchTaxonomyFromWikipedia(plant.scientificName, plant.name);
                        if (wikiResult) {
                            result = wikiResult;
                            // Add taxonomy link even from Wikipedia
                            if (!result.taxonomyLink) {
                                const searchName = speciesName.replace(/\s+/g, '_');
                                result.taxonomyLink = `https://tree.opentreeoflife.org/taxonomy/browse?name=${encodeURIComponent(speciesName)}`;
                            }
                        }
                    }
                    
                    if (result) {
                        let updated = false;
                        
                        if (result.taxonomy) {
                            // Merge with existing taxonomy, keeping existing values where present
                            if (!plant.taxonomy) {
                                plant.taxonomy = {};
                            }
                            // Update taxonomy, preserving existing values unless new value is more complete
                            Object.keys(result.taxonomy).forEach(key => {
                                if (!plant.taxonomy[key] || (result.taxonomy[key] && result.taxonomy[key].length > (plant.taxonomy[key] || '').length)) {
                                    plant.taxonomy[key] = result.taxonomy[key];
                                    updated = true;
                                }
                            });
                        }
                        
                        // Add taxonomy link
                        if (result.taxonomyLink) {
                            plant.taxonomyLink = result.taxonomyLink;
                            updated = true;
                        }
                        
                        // Try to get common names from Wikipedia
                        const wikiResult = await fetchTaxonomyFromWikipedia(plant.scientificName, plant.name);
                        if (wikiResult && wikiResult.commonNames && wikiResult.commonNames.length > 0) {
                            const existing = plant.commonNames || [];
                            plant.commonNames = [...new Set([...existing, ...wikiResult.commonNames])];
                            updated = true;
                        }
                        
                        if (updated) {
                            // Save updated plant
                            await fs.writeFile(plantPath, JSON.stringify(plant, null, 2) + '\n', 'utf8');
                            totalUpdated++;
                            
                            const taxonomyInfo = plant.taxonomy ? 
                                `Family: ${plant.taxonomy.family || 'N/A'}, Genus: ${plant.taxonomy.genus || 'N/A'}, ${Object.keys(plant.taxonomy).length} levels` : 
                                'No taxonomy';
                            const linkInfo = plant.taxonomyLink ? '✓ Link' : '';
                            
                            console.log(`    ✅ Updated: ${taxonomyInfo} ${linkInfo}`);
                        } else {
                            console.log(`    ℹ️  No updates needed`);
                        }
                    } else {
                        console.log(`    ⚠️  No data found`);
                        totalErrors++;
                    }
                    
                    // Rate limiting - be nice to Wikipedia
                    await new Promise(r => setTimeout(r, 1000));
                    
                } catch (err) {
                    console.error(`    ❌ Error processing ${plantFile}: ${err.message}`);
                    totalErrors++;
                }
            }
        } catch (err) {
            console.error(`  ❌ Error reading category ${category}: ${err.message}`);
        }
    }
    
    console.log(`\n✅ Complete!`);
    console.log(`   Processed: ${totalProcessed} plants`);
    console.log(`   Updated: ${totalUpdated} plants`);
    console.log(`   Errors/Not found: ${totalErrors} plants`);
    console.log(`\n💡 Plants without taxonomy can be manually updated.`);
}

// Run the script
if (require.main === module) {
    processAllPlants().catch(console.error);
}

module.exports = { 
    extractSpeciesName,
    fetchTaxonomyFromOpenTreeOfLife,
    fetchTaxonomyFromWikipedia, 
    processAllPlants 
};

