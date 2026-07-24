/**
 * Ensure parent species plant exists when adding a cultivar or botanical variety.
 * Parent scientific name = taxonomy.species (e.g. Peperomia albovittata for 'Piccolo Banda').
 */

function isCultivarOrVarietyPlant(plant) {
  const full = (plant.scientificName && String(plant.scientificName).trim()) || '';
  if (plant.isCultivar === true || plant.isVariety === true) return true;
  if (/'[^']+'/.test(full) || /"[^"]+"/.test(full)) return true;
  if (/\s+var\.\s+/i.test(full)) return true;
  return false;
}

function getParentSpeciesName(plant) {
  const species = (plant.taxonomy && plant.taxonomy.species && String(plant.taxonomy.species).trim()) || '';
  if (!species) return null;
  const full = (plant.scientificName && String(plant.scientificName).trim()) || '';
  if (full === species) return null;
  return species;
}

/**
 * Build a parent species payload from a cultivar/variety child (before normalizePlant).
 * Optional override: child.parentSpecies (full object) or child.parentSpeciesName / parentDescription / parentCommonNames.
 */
function buildParentSpeciesPlant(child) {
  const speciesName = getParentSpeciesName(child);
  if (!speciesName) return null;

  if (child.parentSpecies && typeof child.parentSpecies === 'object') {
    return Object.assign({}, child.parentSpecies, {
      scientificName: child.parentSpecies.scientificName || speciesName,
      taxonomy: child.parentSpecies.taxonomy || Object.assign({}, child.taxonomy || {}, { species: speciesName }),
      isCultivar: false,
      isVariety: false
    });
  }

  const genus = (child.taxonomy && child.taxonomy.genus) || speciesName.split(/\s+/)[0] || 'Unknown';
  const epithet = speciesName.split(/\s+/).slice(1).join(' ') || '';
  const displayName = child.parentSpeciesName ||
    (epithet ? (epithet.charAt(0).toUpperCase() + epithet.slice(1) + ' Peperomia'.replace('Peperomia Peperomia', 'Peperomia')) : speciesName);

  // Prefer "Peacock Peperomia"-style only when caller sets parentSpeciesName; else use scientific epithet + genus
  const name = child.parentSpeciesName || (epithet
    ? epithet.charAt(0).toUpperCase() + epithet.slice(1)
    : speciesName);

  return {
    name: name,
    scientificName: speciesName,
    commonNames: Array.isArray(child.parentCommonNames) ? child.parentCommonNames : [speciesName],
    isCultivar: false,
    isVariety: false,
    category: child.category,
    substrate: child.substrate,
    size: child.size,
    growthRate: child.growthRate,
    description: child.parentDescription ||
      ('Parent species of cultivated forms such as ' + (child.scientificName || child.name) + '. ' +
        'Care is similar to its cultivars: bright indirect light, well-draining mix, and careful watering. ' +
        ((child.description && String(child.description).slice(0, 280)) || '')),
    careTips: Array.isArray(child.careTips) ? child.careTips.slice() : [],
    taxonomy: Object.assign({}, child.taxonomy || {}, { genus: genus, species: speciesName }),
    growthPattern: child.growthPattern,
    hazard: child.hazard,
    rarity: child.rarity || 'common',
    growthHabit: child.growthHabit,
    plantType: child.plantType,
    floweringPeriod: child.floweringPeriod,
    propagation: child.propagation,
    colors: child.colors,
    humidityRange: child.humidityRange,
    lightRange: child.lightRange,
    airCirculationRange: child.airCirculationRange,
    waterNeedsRange: child.waterNeedsRange,
    substrateType: child.substrateType,
    specialNeeds: child.specialNeeds,
    temperatureRange: child.temperatureRange,
    difficultyRange: child.difficultyRange,
    soilPhRange: child.soilPhRange,
    growthRateRange: child.growthRateRange,
    carnivorous: child.carnivorous === true,
    geographicOrigin: child.geographicOrigin || null
  };
}

module.exports = {
  isCultivarOrVarietyPlant,
  getParentSpeciesName,
  buildParentSpeciesPlant
};
