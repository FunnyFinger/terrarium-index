/**
 * Temperature is stored in Celsius on plants (`temperatureRange` / `waterTemperatureRange`).
 * UI scale spans TEMPERATURE_SCALE.minC … maxC (−20°C … 55°C).
 * Legacy data used 0–100% where 0% = 0°C and 100% = 50°C.
 */
'use strict';

const TEMPERATURE_SCALE = { minC: -20, maxC: 55 };
const LEGACY_TEMPERATURE_MAX_C = 50;

function celsiusToTempPercent(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return null;
  const span = TEMPERATURE_SCALE.maxC - TEMPERATURE_SCALE.minC;
  return ((n - TEMPERATURE_SCALE.minC) / span) * 100;
}

function tempPercentToCelsius(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  const span = TEMPERATURE_SCALE.maxC - TEMPERATURE_SCALE.minC;
  return TEMPERATURE_SCALE.minC + (n / 100) * span;
}

function clampCelsius(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return n;
  return Math.max(TEMPERATURE_SCALE.minC, Math.min(TEMPERATURE_SCALE.maxC, n));
}

/** Raw °C from edit form / migrated data (vs legacy 0–100% storage). */
function temperatureRangeLooksLikeCelsius(range) {
  if (!range || typeof range.min !== 'number' || typeof range.max !== 'number') return false;
  // Strict: common plant °C bands below 30–40 (avoids colliding with legacy percent ~36–48)
  return range.max <= 40 && range.min < 30 && range.min >= TEMPERATURE_SCALE.minC;
}

function legacyPercentToCelsius(p) {
  return (Number(p) / 100) * LEGACY_TEMPERATURE_MAX_C;
}

/**
 * Coerce stored temperatureRange to Celsius.
 * - Raw °C values: returned as-is
 * - Legacy 0–100% (0°C–50°C mapping): converted to °C
 */
function normalizeTemperatureRangeToCelsius(range) {
  if (!range || typeof range.min !== 'number' || typeof range.max !== 'number') return range;
  if (temperatureRangeLooksLikeCelsius(range)) {
    const ideal = typeof range.ideal === 'number' ? range.ideal : (range.min + range.max) / 2;
    return { min: range.min, max: range.max, ideal: ideal };
  }
  const min = legacyPercentToCelsius(range.min);
  const max = legacyPercentToCelsius(range.max);
  const ideal = typeof range.ideal === 'number'
    ? legacyPercentToCelsius(range.ideal)
    : (min + max) / 2;
  return { min: min, max: max, ideal: ideal };
}

function roundTemp(n, digits) {
  const d = digits == null ? 1 : digits;
  const f = Math.pow(10, d);
  return Math.round(Number(n) * f) / f;
}

module.exports = {
  TEMPERATURE_SCALE,
  LEGACY_TEMPERATURE_MAX_C,
  celsiusToTempPercent,
  tempPercentToCelsius,
  clampCelsius,
  temperatureRangeLooksLikeCelsius,
  legacyPercentToCelsius,
  normalizeTemperatureRangeToCelsius,
  roundTemp
};
