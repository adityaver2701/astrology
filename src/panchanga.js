// ── Panchanga (five limbs of the Vedic day) ────────────────────────────────
// Tithi, Vara, Nakshatra, Yoga and Karana computed from the existing engine's
// sidereal Sun/Moon longitudes. Pure functions — no UI.

import { getJulianDate, calculatePlanets, normalize360, NAKSHATRAS } from './astrologyEngine';

export const TITHI_NAMES = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];

export const YOGA_NAMES = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana',
  'Atiganda', 'Sukarma', 'Dhriti', 'Shula', 'Ganda',
  'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra',
  'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva',
  'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma',
  'Indra', 'Vaidhriti',
];

// 7 movable karanas repeat 8× starting at half-tithi #2; the first and last
// three half-tithis are the 4 fixed karanas.
const MOVABLE_KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garija', 'Vanija', 'Vishti'];
const FIXED_KARANAS = { 0: 'Kimstughna', 57: 'Shakuni', 58: 'Chatushpada', 59: 'Naga' };

export const VARA_NAMES = [
  { name: 'Ravivara', english: 'Sunday', lord: 'Sun' },
  { name: 'Somavara', english: 'Monday', lord: 'Moon' },
  { name: 'Mangalavara', english: 'Tuesday', lord: 'Mars' },
  { name: 'Budhavara', english: 'Wednesday', lord: 'Mercury' },
  { name: 'Guruvara', english: 'Thursday', lord: 'Jupiter' },
  { name: 'Shukravara', english: 'Friday', lord: 'Venus' },
  { name: 'Shanivara', english: 'Saturday', lord: 'Saturn' },
];

// Inauspicious karanas / yogas commonly flagged in muhurta work.
const CAUTION_YOGAS = new Set(['Vishkambha', 'Atiganda', 'Shula', 'Ganda', 'Vyaghata', 'Vajra', 'Vyatipata', 'Parigha', 'Vaidhriti']);

/**
 * Compute the full panchanga for a UTC instant.
 * @param {Date} utcDate real UTC instant
 * @returns {{tithi:object, vara:object, nakshatra:object, yoga:object, karana:object, sun:object, moon:object}}
 */
export function computePanchanga(utcDate) {
  const jd = getJulianDate(utcDate);
  const { planets } = calculatePlanets(jd);
  const sun = planets.sun;
  const moon = planets.moon;

  // ── Tithi: elongation Moon − Sun, 12° each (ayanamsha cancels out) ──
  const elong = normalize360(moon.longitude - sun.longitude);
  const tithiIndex = Math.floor(elong / 12);              // 0..29
  const paksha = tithiIndex < 15 ? 'Shukla (waxing)' : 'Krishna (waning)';
  const numInPaksha = (tithiIndex % 15) + 1;              // 1..15
  let tithiName;
  if (tithiIndex === 14) tithiName = 'Purnima (Full Moon)';
  else if (tithiIndex === 29) tithiName = 'Amavasya (New Moon)';
  else tithiName = TITHI_NAMES[(tithiIndex % 15)];
  const tithiProgress = (elong % 12) / 12;

  // ── Vara: weekday (UTC-based; caller passes a local-corrected instant) ──
  const vara = VARA_NAMES[utcDate.getUTCDay()];

  // ── Nakshatra: Moon's sidereal star (engine already computed it) ──
  const nakshatra = {
    name: moon.nakshatraName,
    lord: moon.nakshatraLord,
    pada: moon.pada,
    index: NAKSHATRAS.findIndex(n => n.name === moon.nakshatraName),
  };

  // ── Yoga: sum Sun + Moon (sidereal), 27 divisions of 13°20' ──
  const yogaSum = normalize360(sun.longitude + moon.longitude);
  const yogaIndex = Math.floor(yogaSum / (360 / 27));
  const yogaName = YOGA_NAMES[yogaIndex];

  // ── Karana: half-tithi, 6° each ──
  const halfTithi = Math.floor(elong / 6);                // 0..59
  const karanaName = FIXED_KARANAS[halfTithi] || MOVABLE_KARANAS[(halfTithi - 1) % 7];

  return {
    tithi: {
      index: tithiIndex,
      number: numInPaksha,
      name: tithiName,
      paksha,
      progress: tithiProgress,
      elongation: elong,
    },
    vara,
    nakshatra,
    yoga: { index: yogaIndex, name: yogaName, caution: CAUTION_YOGAS.has(yogaName) },
    karana: { index: halfTithi, name: karanaName, caution: karanaName === 'Vishti' },
    sun: { signName: sun.signName, longitude: sun.longitude, nakshatraName: sun.nakshatraName },
    moon: { signName: moon.signName, longitude: moon.longitude, nakshatraName: moon.nakshatraName, pada: moon.pada },
  };
}
