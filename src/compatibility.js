// ── Ashtakoota (36-guna) compatibility matching ────────────────────────────
// Classical guna-milan between two Moon positions (rasi + nakshatra), per the
// standard Parashari tables. Vashya uses a sign-level approximation (classical
// texts split Sagittarius/Capricorn at mid-sign; we assign whole signs).

import { getJulianDate, calculatePlanets, NAKSHATRAS } from './astrologyEngine';

// ── Reference tables (index = nakshatra 0-26 / rasi 0-11) ──────────────────

const YONI_ANIMALS = [
  'Horse', 'Elephant', 'Sheep', 'Serpent', 'Serpent', 'Dog', 'Cat', 'Sheep', 'Cat',
  'Rat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Buffalo', 'Tiger', 'Deer', 'Deer',
  'Dog', 'Monkey', 'Mongoose', 'Monkey', 'Lion', 'Horse', 'Lion', 'Cow', 'Elephant',
];

// Symmetric yoni affinity matrix (4 best … 0 sworn enemies).
const YONI_ORDER = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Deer', 'Monkey', 'Mongoose', 'Lion'];
const YONI_MATRIX = [
  // Horse Eleph Sheep Serp Dog  Cat  Rat  Cow  Buff Tigr Deer Monk Mong Lion
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 1, 3, 2, 1], // Horse
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0], // Elephant
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1], // Sheep
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2], // Serpent
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1], // Dog
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 2, 3, 2, 1], // Cat
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2], // Rat
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1], // Cow
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1], // Buffalo
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1], // Tiger
  [1, 2, 2, 2, 0, 2, 2, 3, 2, 1, 4, 2, 2, 1], // Deer
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2], // Monkey
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2], // Mongoose
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4], // Lion
];

const GANA = { // 0 = Deva, 1 = Manushya, 2 = Rakshasa
  Deva: ['Ashwini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Hasta', 'Swati', 'Anuradha', 'Shravana', 'Revati'],
  Manushya: ['Bharani', 'Rohini', 'Ardra', 'Purva Phalguni', 'Uttara Phalguni', 'Purva Ashadha', 'Uttara Ashadha', 'Purva Bhadrapada', 'Uttara Bhadrapada'],
  Rakshasa: ['Krittika', 'Ashlesha', 'Magha', 'Chitra', 'Vishakha', 'Jyeshtha', 'Mula', 'Dhanishta', 'Shatabhisha'],
};

const NADI = {
  Adi: ['Ashwini', 'Ardra', 'Punarvasu', 'Uttara Phalguni', 'Hasta', 'Jyeshtha', 'Mula', 'Shatabhisha', 'Purva Bhadrapada'],
  Madhya: ['Bharani', 'Mrigashira', 'Pushya', 'Purva Phalguni', 'Chitra', 'Anuradha', 'Purva Ashadha', 'Dhanishta', 'Uttara Bhadrapada'],
  Antya: ['Krittika', 'Rohini', 'Ashlesha', 'Magha', 'Swati', 'Vishakha', 'Uttara Ashadha', 'Shravana', 'Revati'],
};

const RASI_LORDS = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];

// Natural planetary friendships.
const FRIENDS = {
  sun: ['moon', 'mars', 'jupiter'], moon: ['sun', 'mercury'],
  mars: ['sun', 'moon', 'jupiter'], mercury: ['sun', 'venus'],
  jupiter: ['sun', 'moon', 'mars'], venus: ['mercury', 'saturn'],
  saturn: ['mercury', 'venus'],
};
const ENEMIES = {
  sun: ['venus', 'saturn'], moon: [],
  mars: ['mercury'], mercury: ['moon'],
  jupiter: ['mercury', 'venus'], venus: ['sun', 'moon'],
  saturn: ['sun', 'moon', 'mars'],
};

// Varna by rasi element: water=Brahmin(4), fire=Kshatriya(3), earth=Vaishya(2), air=Shudra(1).
const VARNA_RANK = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4];
const VARNA_NAMES = { 4: 'Brahmin', 3: 'Kshatriya', 2: 'Vaishya', 1: 'Shudra' };

// Vashya groups (sign-level approximation).
const VASHYA_GROUP = ['quadruped', 'quadruped', 'human', 'water', 'wild', 'human', 'human', 'keeta', 'quadruped', 'quadruped', 'human', 'water'];

// ── Koota calculators (a = person A, b = person B) ─────────────────────────

function findGroup(table, nakName) {
  for (const [group, list] of Object.entries(table)) {
    if (list.includes(nakName)) return group;
  }
  return null;
}

function relation(p1, p2) {
  if (p1 === p2) return 'friend';
  if ((FRIENDS[p1] || []).includes(p2)) return 'friend';
  if ((ENEMIES[p1] || []).includes(p2)) return 'enemy';
  return 'neutral';
}

function taraGood(fromNak, toNak) {
  const count = ((toNak - fromNak + 27) % 27) + 1;
  const rem = count % 9;
  return !(rem === 3 || rem === 5 || rem === 7);
}

export function computeKootas(a, b) {
  const nakA = NAKSHATRAS[a.nakIndex].name;
  const nakB = NAKSHATRAS[b.nakIndex].name;

  // 1. Varna (1)
  const va = VARNA_RANK[a.rasiIndex], vb = VARNA_RANK[b.rasiIndex];
  const varna = {
    name: 'Varna', max: 1,
    score: va >= vb ? 1 : 0,
    detail: `${VARNA_NAMES[va]} × ${VARNA_NAMES[vb]}`,
    meaning: 'Ego & work compatibility',
  };

  // 2. Vashya (2) — sign-level approximation
  const ga = VASHYA_GROUP[a.rasiIndex], gb = VASHYA_GROUP[b.rasiIndex];
  let vashyaScore = 1;
  if (ga === gb) vashyaScore = 2;
  else if ((ga === 'wild' && gb === 'quadruped') || (gb === 'wild' && ga === 'quadruped')) vashyaScore = 0;
  const vashya = {
    name: 'Vashya', max: 2,
    score: vashyaScore,
    detail: `${ga} × ${gb}`,
    meaning: 'Mutual influence & attraction',
  };

  // 3. Tara (3)
  const goodAB = taraGood(a.nakIndex, b.nakIndex);
  const goodBA = taraGood(b.nakIndex, a.nakIndex);
  const tara = {
    name: 'Tara', max: 3,
    score: goodAB && goodBA ? 3 : goodAB || goodBA ? 1.5 : 0,
    detail: `${nakA} ↔ ${nakB}`,
    meaning: 'Destiny & well-being',
  };

  // 4. Yoni (4)
  const yA = YONI_ANIMALS[a.nakIndex], yB = YONI_ANIMALS[b.nakIndex];
  const yoni = {
    name: 'Yoni', max: 4,
    score: YONI_MATRIX[YONI_ORDER.indexOf(yA)][YONI_ORDER.indexOf(yB)],
    detail: `${yA} × ${yB}`,
    meaning: 'Intimacy & instinct',
  };

  // 5. Graha Maitri (5)
  const lordA = RASI_LORDS[a.rasiIndex], lordB = RASI_LORDS[b.rasiIndex];
  const rAB = relation(lordA, lordB), rBA = relation(lordB, lordA);
  let maitriScore;
  if (rAB === 'friend' && rBA === 'friend') maitriScore = 5;
  else if ((rAB === 'friend' && rBA === 'neutral') || (rBA === 'friend' && rAB === 'neutral')) maitriScore = 4;
  else if (rAB === 'neutral' && rBA === 'neutral') maitriScore = 3;
  else if ((rAB === 'friend' && rBA === 'enemy') || (rBA === 'friend' && rAB === 'enemy')) maitriScore = 1;
  else if ((rAB === 'neutral' && rBA === 'enemy') || (rBA === 'neutral' && rAB === 'enemy')) maitriScore = 0.5;
  else maitriScore = 0;
  const maitri = {
    name: 'Graha Maitri', max: 5,
    score: maitriScore,
    detail: `${lordA} × ${lordB}`,
    meaning: 'Mental & spiritual rapport',
  };

  // 6. Gana (6)
  const ganaA = findGroup(GANA, nakA), ganaB = findGroup(GANA, nakB);
  let ganaScore;
  if (ganaA === ganaB) ganaScore = 6;
  else if ((ganaA === 'Deva' && ganaB === 'Manushya') || (ganaB === 'Deva' && ganaA === 'Manushya')) ganaScore = 5;
  else if ((ganaA === 'Deva' && ganaB === 'Rakshasa') || (ganaB === 'Deva' && ganaA === 'Rakshasa')) ganaScore = 1;
  else ganaScore = 0;
  const gana = {
    name: 'Gana', max: 6,
    score: ganaScore,
    detail: `${ganaA} × ${ganaB}`,
    meaning: 'Temperament match',
  };

  // 7. Bhakoot (7)
  const dAB = ((b.rasiIndex - a.rasiIndex + 12) % 12) + 1;
  const badBhakoot = [2, 12, 5, 9, 6, 8].includes(dAB) && dAB !== 1;
  const bhakoot = {
    name: 'Bhakoot', max: 7,
    score: badBhakoot ? 0 : 7,
    detail: `Moon signs ${dAB}/${((a.rasiIndex - b.rasiIndex + 12) % 12) + 1} apart`,
    meaning: 'Emotional & family harmony',
  };

  // 8. Nadi (8)
  const nadiA = findGroup(NADI, nakA), nadiB = findGroup(NADI, nakB);
  const nadi = {
    name: 'Nadi', max: 8,
    score: nadiA === nadiB ? 0 : 8,
    detail: `${nadiA} × ${nadiB}`,
    meaning: 'Health & progeny',
  };

  const kootas = [varna, vashya, tara, yoni, maitri, gana, bhakoot, nadi];
  const total = kootas.reduce((s, k) => s + k.score, 0);

  let verdict, verdictClass;
  if (total >= 33) { verdict = 'Excellent match'; verdictClass = 'excellent'; }
  else if (total >= 25) { verdict = 'Very good match'; verdictClass = 'good'; }
  else if (total >= 18) { verdict = 'Acceptable match'; verdictClass = 'average'; }
  else { verdict = 'Below traditional threshold (18)'; verdictClass = 'poor'; }

  const flags = [];
  if (nadi.score === 0) flags.push('Nadi dosha — both partners share the same nadi; classically the most serious flag.');
  if (bhakoot.score === 0) flags.push('Bhakoot dosha — Moon signs in a 2/12, 5/9 or 6/8 relationship.');
  if (gana.score === 0) flags.push('Gana mismatch — Manushya × Rakshasa temperament combination.');

  return { kootas, total, max: 36, verdict, verdictClass, flags };
}

/**
 * Moon profile (rasi + nakshatra indexes) from birth details.
 * @param {{date:string,time:string,timezone:number,latitude:number,longitude:number}} bd
 */
export function computeMoonProfile(bd) {
  const birthLocal = new Date(`${bd.date}T${bd.time}Z`);
  const birthUtc = new Date(birthLocal.getTime() - (bd.timezone || 0) * 3600000);
  const jd = getJulianDate(birthUtc);
  const { planets } = calculatePlanets(jd);
  const moon = planets.moon;
  const nakIndex = NAKSHATRAS.findIndex(n => n.name === moon.nakshatraName);
  return {
    rasiIndex: moon.signIndex,
    rasiName: moon.signName,
    nakIndex,
    nakName: moon.nakshatraName,
    pada: moon.pada,
  };
}
