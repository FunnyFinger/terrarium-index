/**
 * Cultivar scientific naming convention: full species name followed by 'Cultivar Name'.
 * e.g. "Aglaonema commutatum 'Red Ruby'" not "Aglaonema 'Red Ruby'".
 *
 * @param {object} plant - Plant with taxonomy.species and scientificName
 * @returns {string|null} Correct scientific name for cultivar, or null if not a cultivar / no change needed
 */
function formatCultivarScientificName(plant) {
  if (!plant || typeof plant !== 'object') return null;
  const full = (plant.scientificName && String(plant.scientificName).trim()) || '';
  // Botanical variety (var.): use variety convention, not cultivar quotes — do not change
  if (/\s+var\.\s+/i.test(full)) return null;
  const species = (plant.taxonomy && plant.taxonomy.species && String(plant.taxonomy.species).trim()) || null;
  if (!species) return null;
  if (!full || full === species) return null;

  // Already in correct form: "Species 'Cultivar'"
  if (full.startsWith(species + " '")) return null;

  // Extract cultivar from single- or double-quoted part
  const single = full.match(/'([^']+)'/);
  const double = full.match(/"([^"]+)"/);
  const cultivarRaw = (single && single[1]) || (double && double[1]) || null;
  if (!cultivarRaw) return null;

  const cultivar = cultivarRaw.replace(/\b\w/g, (c) => c.toUpperCase());
  return species + " '" + cultivar + "'";
}

module.exports = { formatCultivarScientificName };
