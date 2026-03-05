/**
 * Hybrid scientific naming convention:
 * - Interspecific (same genus): "Genus Species1 x Species2" — second parent without repeated genus.
 * - Intergeneric (different genera): "Genus1 Species1 x Genus2 Species2" — both full names.
 *
 * @param {object} plant - Plant with scientificName and optional hybridParent1, hybridParent2
 * @returns {string|null} Correct scientific name for hybrid, or null if not a hybrid / no change needed
 */
function formatHybridScientificName(plant) {
  if (!plant || typeof plant !== 'object') return null;
  const full = (plant.scientificName && String(plant.scientificName).trim()) || '';
  const sep = full.match(/\s+(x|×)\s+/i);
  if (!sep) return null;

  let parent1 = (plant.hybridParent1 && String(plant.hybridParent1).trim()) || '';
  let parent2 = (plant.hybridParent2 && String(plant.hybridParent2).trim()) || '';
  if (!parent1 || !parent2) {
    const idx = sep.index;
    parent1 = full.slice(0, idx).trim();
    parent2 = full.slice(idx + sep[0].length).trim();
  }
  if (!parent1 || !parent2) return null;

  const words1 = parent1.split(/\s+/).filter(Boolean);
  const words2 = parent2.split(/\s+/).filter(Boolean);
  const genus1 = (words1[0] || '').trim();
  const genus2 = (words2[0] || '').trim();
  if (!genus1 || !genus2) return null;

  const sameGenus = genus1.toLowerCase() === genus2.toLowerCase();
  const x = ' × ';
  let formatted;
  if (sameGenus) {
    const species2Only = words2.slice(1).join(' ') || genus2;
    formatted = parent1 + x + species2Only;
  } else {
    formatted = parent1 + x + parent2;
  }

  if (formatted === full) return null;
  return formatted;
}

module.exports = { formatHybridScientificName };
