/**
 * Canonical rarity values for plants_catalog / filters:
 *   common | uncommon | rare | very-rare
 */
const RARITY_VALUES = ['common', 'uncommon', 'rare', 'very-rare'];

const RARITY_ALIASES = {
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  'very-rare': 'very-rare',
  veryrare: 'very-rare',
  'very rare': 'very-rare',
  'very_rare': 'very-rare'
};

/** Normalize any rarity string to canonical slug, or null if unrecognized. */
function normalizeRarity(value) {
  if (value == null || value === '') return null;
  const key = String(value).trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (RARITY_ALIASES[key]) return RARITY_ALIASES[key];
  // Collapse multiple hyphens
  const collapsed = key.replace(/-+/g, '-');
  return RARITY_ALIASES[collapsed] || null;
}

/** Display label for UI (Title Case). */
function rarityDisplayLabel(value) {
  const n = normalizeRarity(value);
  if (!n) return value == null ? '' : String(value);
  if (n === 'very-rare') return 'Very Rare';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Sort rank 1–4 (common → very-rare); unknown = 0. */
function raritySortRank(value) {
  const n = normalizeRarity(value);
  if (!n) return 0;
  return RARITY_VALUES.indexOf(n) + 1;
}

module.exports = {
  RARITY_VALUES,
  normalizeRarity,
  rarityDisplayLabel,
  raritySortRank
};
