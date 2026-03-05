/**
 * Botanical variety naming convention: "Genus species var. epithet" (full species, epithet lowercase).
 * e.g. "Ananas comosus var. microstachys" not "Ananas var. microstachys" or "Ananas comosus var. Microstachys".
 *
 * @param {object} plant - Plant with scientificName and optional taxonomy.species
 * @returns {string|null} Correct scientific name for variety, or null if not a variety / no change needed
 */
function formatVarietyScientificName(plant) {
  if (!plant || typeof plant !== 'object') return null;
  const full = (plant.scientificName && String(plant.scientificName).trim()) || '';
  const match = full.match(/\s+var\.\s+(.+)$/i);
  if (!match) return null;

  const epithet = match[1].trim().toLowerCase();
  const speciesPart = full.slice(0, match.index).trim();
  const taxonomySpecies = (plant.taxonomy && plant.taxonomy.species && String(plant.taxonomy.species).trim()) || '';
  const baseFromTaxonomy = taxonomySpecies ? taxonomySpecies.replace(/\s+var\.\s+.*$/i, '').trim() : '';

  const species = (baseFromTaxonomy && baseFromTaxonomy.length >= speciesPart.length) ? baseFromTaxonomy : speciesPart;
  const formatted = species + ' var. ' + epithet;

  if (formatted === full) return null;
  return formatted;
}

module.exports = { formatVarietyScientificName };
