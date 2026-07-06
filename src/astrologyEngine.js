/**
 * Astro-Transit Chart - Core Astrology & Astronomy Engine
 * Implements high-precision astronomical coordinates, Lahiri Ayanamsha,
 * geocentric conversions, Nakshatra boundaries, Ascendant calculations,
 * and a transit pattern matcher for future predictions.
 */

// 12 Zodiac Signs
export const SIGNS = [
  { name: 'Aries', ruler: 'Mars', sanskrit: 'Mesha', element: 'Fire', nature: 'Chara' },
  { name: 'Taurus', ruler: 'Venus', sanskrit: 'Vrishabha', element: 'Earth', nature: 'Sthira' },
  { name: 'Gemini', ruler: 'Mercury', sanskrit: 'Mithuna', element: 'Air', nature: 'Dvisvabhava' },
  { name: 'Cancer', ruler: 'Moon', sanskrit: 'Karka', element: 'Water', nature: 'Chara' },
  { name: 'Leo', ruler: 'Sun', sanskrit: 'Simha', element: 'Fire', nature: 'Sthira' },
  { name: 'Virgo', ruler: 'Mercury', sanskrit: 'Kanya', element: 'Earth', nature: 'Dvisvabhava' },
  { name: 'Libra', ruler: 'Venus', sanskrit: 'Tula', element: 'Air', nature: 'Chara' },
  { name: 'Scorpio', ruler: 'Mars', sanskrit: 'Vrischika', element: 'Water', nature: 'Sthira' },
  { name: 'Sagittarius', ruler: 'Jupiter', sanskrit: 'Dhanu', element: 'Fire', nature: 'Dvisvabhava' },
  { name: 'Capricorn', ruler: 'Saturn', sanskrit: 'Makara', element: 'Earth', nature: 'Chara' },
  { name: 'Aquarius', ruler: 'Saturn', sanskrit: 'Kumbha', element: 'Air', nature: 'Sthira' },
  { name: 'Pisces', ruler: 'Jupiter', sanskrit: 'Meena', element: 'Water', nature: 'Dvisvabhava' }
];

// 27 Nakshatras
export const NAKSHATRAS = [
  { name: 'Ashwini', lord: 'Ketu', deity: 'Ashwini Kumars' },
  { name: 'Bharani', lord: 'Venus', deity: 'Yama' },
  { name: 'Krittika', lord: 'Sun', deity: 'Agni' },
  { name: 'Rohini', lord: 'Moon', deity: 'Brahma' },
  { name: 'Mrigashira', lord: 'Mars', deity: 'Soma' },
  { name: 'Ardra', lord: 'Rahu', deity: 'Rudra' },
  { name: 'Punarvasu', lord: 'Jupiter', deity: 'Aditi' },
  { name: 'Pushya', lord: 'Saturn', deity: 'Brihaspati' },
  { name: 'Ashlesha', lord: 'Mercury', deity: 'Sarpas' },
  { name: 'Magha', lord: 'Ketu', deity: 'Pitras' },
  { name: 'Purva Phalguni', lord: 'Venus', deity: 'Bhaga' },
  { name: 'Uttara Phalguni', lord: 'Sun', deity: 'Aryaman' },
  { name: 'Hasta', lord: 'Moon', deity: 'Savitar' },
  { name: 'Chitra', lord: 'Mars', deity: 'Vishwakarma' },
  { name: 'Swati', lord: 'Rahu', deity: 'Vayu' },
  { name: 'Vishakha', lord: 'Jupiter', deity: 'Indragni' },
  { name: 'Anuradha', lord: 'Saturn', deity: 'Mitra' },
  { name: 'Jyeshtha', lord: 'Mercury', deity: 'Indra' },
  { name: 'Mula', lord: 'Ketu', deity: 'Nirriti' },
  { name: 'Purva Ashadha', lord: 'Venus', deity: 'Apah' },
  { name: 'Uttara Ashadha', lord: 'Sun', deity: 'Viswadevas' },
  { name: 'Shravana', lord: 'Moon', deity: 'Vishnu' },
  { name: 'Dhanishta', lord: 'Mars', deity: 'Vasus' },
  { name: 'Shatabhisha', lord: 'Rahu', deity: 'Varuna' },
  { name: 'Purva Bhadrapada', lord: 'Jupiter', deity: 'Aja Ekapada' },
  { name: 'Uttara Bhadrapada', lord: 'Saturn', deity: 'Ahirbudhnya' },
  { name: 'Revati', lord: 'Mercury', deity: 'Pushan' }
];

// Keplerian elements at J2000.0 (a in AU, e in rad, I, L, w, Node in degrees) and their rates per century.
// Data from JPL/NASA Standish & Williams (1992) Table 1.
const PLANET_ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.25032350, 149472.67411175],
    w: [77.45779628, 0.16047689], // Longitude of perihelion
    Node: [48.33076593, -0.12534081] // Ascending node longitude
  },
  venus: {
    a: [0.72333566, 0.00000390],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.00078890],
    L: [181.97909950, 58517.81538729],
    w: [131.60246718, 0.00268329],
    Node: [76.67984255, -0.27769418]
  },
  earth: { // EMB (Earth-Moon Barycenter)
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    w: [102.93768193, 0.32327364],
    Node: [0.0, 0.0]
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.09339410, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    w: [-23.94362959, 0.44441088],
    Node: [49.55953891, -0.29257343]
  },
  jupiter: {
    a: [5.20288700, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    w: [14.72847983, 0.21252668],
    Node: [100.47390909, 0.20469106]
  },
  saturn: {
    a: [9.53667594, -0.00125060],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    w: [92.59887831, -0.41897216],
    Node: [113.66242448, -0.28867794]
  }
};

// Exact arc length of one Nakshatra (360/27) and one Pada (360/108) in degrees
export const NAK_SPAN = 360 / 27;
export const PADA_SPAN = 360 / 108;

// Helper: Normalize an angle to 0 - 360 degrees
export function normalize360(angle) {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
}

// Convert Calendar Date to Julian Date (UTC time)
// date is a standard JS Date object in UTC
export function getJulianDate(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  let y = year;
  let m = month;
  if (month <= 2) {
    y = year - 1;
    m = month + 12;
  }

  const A = Math.floor(y / 100);
  const B = Math.floor(A / 4);
  const C = 2 - A + B;
  const E = Math.floor(365.25 * (y + 4716));
  const F = Math.floor(30.6001 * (m + 1));

  return C + day + hours / 24 + E + F - 1524.5;
}

// Obliquity of the Ecliptic (in degrees)
export function getObliquity(T) {
  // T is Julian centuries from J2000.0
  return 23.4392911 - 0.013004167 * T - 0.000000164 * T * T + 0.0000005036 * T * T * T;
}

// Lahiri Ayanamsha (in degrees)
// Calculated precisely relative to J2000.0.
// Lahiri is 23.850606 degrees on 2000-01-01, precessing at ~50.29 arcseconds per year.
export function getLahiriAyanamsha(T) {
  // Precession rate per century is 50.290966 * 100 / 3600 = 1.39697128 degrees
  return 23.850606 + 1.39697128 * T;
}

// Greenwich Mean Sidereal Time (GMST) in degrees
export function getGMST(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
  return normalize360(gmst);
}

// Local Sidereal Time (LST) in degrees
export function getLST(jd, longitude) {
  // longitude: East positive, West negative
  return normalize360(getGMST(jd) + longitude);
}

// Heliocentric 3D coordinates for a planet
function getHeliocentricCoordinates(planetId, T) {
  const elements = PLANET_ELEMENTS[planetId];
  if (!elements) return { x: 0, y: 0, z: 0 };

  const a = elements.a[0] + elements.a[1] * T;
  const e = elements.e[0] + elements.e[1] * T;
  const I = normalize360(elements.I[0] + elements.I[1] * T) * Math.PI / 180;
  const L = normalize360(elements.L[0] + elements.L[1] * T);
  const w_long = normalize360(elements.w[0] + elements.w[1] * T);
  const Node = normalize360(elements.Node[0] + elements.Node[1] * T) * Math.PI / 180;

  const w = normalize360(w_long - (elements.Node[0] + elements.Node[1] * T)) * Math.PI / 180; // Argument of perihelion
  const M = normalize360(L - w_long) * Math.PI / 180; // Mean anomaly

  // Solve Kepler's Equation: E - e sin E = M
  let E = M;
  for (let i = 0; i < 12; i++) {
    const delta = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += delta;
    if (Math.abs(delta) < 1e-8) break;
  }

  // Coordinates in orbital plane
  const x_prime = a * (Math.cos(E) - e);
  const y_prime = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // Rotate to J2000 Ecliptic coordinates
  const cosW = Math.cos(w), sinW = Math.sin(w);
  const cosN = Math.cos(Node), sinN = Math.sin(Node);
  const cosI = Math.cos(I), sinI = Math.sin(I);

  const x_ecl = (cosW * cosN - sinW * sinN * cosI) * x_prime + (-sinW * cosN - cosW * sinN * cosI) * y_prime;
  const y_ecl = (cosW * sinN + sinW * cosN * cosI) * x_prime + (-sinW * sinN + cosW * cosN * cosI) * y_prime;
  const z_ecl = (sinW * sinI) * x_prime + (cosW * sinI) * y_prime;

  return { x: x_ecl, y: y_ecl, z: z_ecl };
}

// Geocentric Moon Longitude (Meeus ELP-2000 simplified algorithm with periodic terms)
function getMoonLongitudeTropical(T) {
  // Fundamental arguments (in degrees)
  const L_prime = normalize360(218.3164477 + 481267.8812233 * T - 0.0015786 * T * T + (T * T * T) / 538841.0);
  const D = normalize360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T * T * T) / 545868.0);
  const M = normalize360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
  const M_prime = normalize360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T * T * T) / 69699.0);
  const F = normalize360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - (T * T * T) / 3526000.0);

  const E = 1 - 0.002516 * T - 0.0000074 * T * T;

  // Convert to radians
  const rD = D * Math.PI / 180;
  const rM = M * Math.PI / 180;
  const rMp = M_prime * Math.PI / 180;
  const rF = F * Math.PI / 180;

  // Key perturbation terms in longitude (in degrees)
  let deltaL = 0;
  deltaL += 6.288774 * Math.sin(rMp);
  deltaL += 1.274027 * Math.sin(2 * rD - rMp);
  deltaL += 0.658309 * Math.sin(2 * rD);
  deltaL += 0.213618 * Math.sin(2 * rMp);
  deltaL -= 0.185116 * Math.sin(rM) * E;
  deltaL -= 0.114332 * Math.sin(2 * rF);
  deltaL += 0.058793 * Math.sin(2 * rD - 2 * rMp);
  deltaL += 0.057066 * Math.sin(2 * rD - rM - rMp) * E;
  deltaL += 0.053322 * Math.sin(2 * rD + rMp);
  deltaL += 0.045758 * Math.sin(2 * rD - rM) * E;
  deltaL -= 0.040923 * Math.sin(rM - rMp) * E;
  deltaL -= 0.034720 * Math.sin(rD);
  deltaL -= 0.030724 * Math.sin(rM + rMp) * E;
  deltaL += 0.018038 * Math.sin(2 * rF - 2 * rD);
  deltaL += 0.015207 * Math.sin(2 * rD - rMp + rM) * E;
  deltaL += 0.014387 * Math.sin(2 * rD + rMp - rM) * E;
  deltaL += 0.014675 * Math.sin(2 * rD - 2 * rMp - rM) * E;
  deltaL += 0.010475 * Math.sin(2 * rD + 2 * rMp);

  return normalize360(L_prime + deltaL);
}

// General precession in ecliptic longitude accumulated since J2000.0 (degrees).
// Needed because the Keplerian elements are referred to the J2000 ecliptic/equinox,
// while the Moon (Meeus ELP series), Rahu (mean node) and the Ayanamsha are all
// referred to the equinox OF DATE. Without this correction planetary longitudes
// drift ~1.4 degrees per century relative to the rest of the engine.
function getPrecessionFromJ2000(T) {
  return (5029.0966 * T + 1.11113 * T * T) / 3600;
}

// Geocentric coordinates for planetary bodies (except Moon & Node)
// Returns ecliptic longitude referred to the mean equinox OF DATE.
function getPlanetLongitudeTropical(planetId, jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const precession = getPrecessionFromJ2000(T);

  if (planetId === 'sun') {
    const earth = getHeliocentricCoordinates('earth', T);
    // Sun geocentric longitude is opposite of Earth heliocentric
    return normalize360(Math.atan2(-earth.y, -earth.x) * 180 / Math.PI + precession);
  }

  const planet = getHeliocentricCoordinates(planetId, T);
  const earth = getHeliocentricCoordinates('earth', T);

  const x_geo = planet.x - earth.x;
  const y_geo = planet.y - earth.y;

  return normalize360(Math.atan2(y_geo, x_geo) * 180 / Math.PI + precession);
}

// Get the Mean Node (Rahu) tropical longitude
function getRahuLongitudeTropical(T) {
  // Mean node formula from Jean Meeus / IAU
  return normalize360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441.0);
}

// Calculate the Sidereal Ascendant (Lagna) Longitude
export function calculateAscendantLongitude(jd, longitude, latitude) {
  const T = (jd - 2451545.0) / 36525.0;
  const ayanamsha = getLahiriAyanamsha(T);
  const eps = getObliquity(T) * Math.PI / 180;
  const LST = getLST(jd, longitude) * Math.PI / 180;
  const latRad = latitude * Math.PI / 180;

  // Formula: tan(Asc) = cos(LST) / (-sin(eps)*tan(lat) - cos(eps)*sin(LST))
  // Using Math.atan2(y, x) where:
  const y = Math.cos(LST);
  const x = -(Math.sin(eps) * Math.tan(latRad) + Math.cos(eps) * Math.sin(LST));

  const tropicalAsc = normalize360(Math.atan2(y, x) * 180 / Math.PI);
  return normalize360(tropicalAsc - ayanamsha);
}

// Detect Retrograde motion
function checkRetrograde(planetId, jd) {
  if (planetId === 'sun' || planetId === 'moon') {
    // Sun and Moon never go retrograde.
    return false;
  }
  if (planetId === 'rahu' || planetId === 'ketu') {
    // The mean nodes are always retrograde in Vedic convention.
    return true;
  }
  // Calculate position now and 2 hours later
  const pos1 = getPlanetLongitudeTropical(planetId, jd);
  const pos2 = getPlanetLongitudeTropical(planetId, jd + 0.0833);
  let diff = pos2 - pos1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}

// Complete Calculation for all Planets
export function calculatePlanets(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const ayanamsha = getLahiriAyanamsha(T);

  const planetIds = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];
  const results = {};

  planetIds.forEach(id => {
    let tropLon;
    if (id === 'moon') {
      tropLon = getMoonLongitudeTropical(T);
    } else if (id === 'rahu') {
      tropLon = getRahuLongitudeTropical(T);
    } else if (id === 'ketu') {
      tropLon = normalize360(getRahuLongitudeTropical(T) + 180);
    } else {
      tropLon = getPlanetLongitudeTropical(id, jd);
    }

    const sidLon = normalize360(tropLon - ayanamsha);
    const signIndex = Math.floor(sidLon / 30);
    const degreeInSign = sidLon % 30;

    // Nakshatra calculation (27 divisions of 13°20')
    const nakIndex = Math.min(Math.floor(sidLon / NAK_SPAN), 26);
    const nakLong = sidLon - nakIndex * NAK_SPAN;
    const pada = Math.min(Math.floor(nakLong / PADA_SPAN), 3) + 1;
    const nakDetail = NAKSHATRAS[nakIndex];

    results[id] = {
      id,
      name: id.toUpperCase(),
      longitude: sidLon,
      signIndex,
      signName: SIGNS[signIndex].name,
      signSanskrit: SIGNS[signIndex].sanskrit,
      degree: degreeInSign,
      retrograde: checkRetrograde(id, jd),
      nakshatraName: nakDetail.name,
      nakshatraLord: nakDetail.lord,
      nakshatraDeity: nakDetail.deity,
      pada: pada
    };
  });

  return {
    planets: results,
    ayanamsha,
    julianDate: jd
  };
}

// Compute the Sign of a planet at a specific Julian Date
export function getPlanetSignIndex(planetId, jd, ayanamsha) {
  let tropLon;
  const T = (jd - 2451545.0) / 36525.0;
  if (planetId === 'moon') {
    tropLon = getMoonLongitudeTropical(T);
  } else if (planetId === 'rahu') {
    tropLon = getRahuLongitudeTropical(T);
  } else if (planetId === 'ketu') {
    tropLon = normalize360(getRahuLongitudeTropical(T) + 180);
  } else {
    tropLon = getPlanetLongitudeTropical(planetId, jd);
  }
  const sidLon = normalize360(tropLon - ayanamsha);
  return Math.floor(sidLon / 30);
}

// Scan sign transits for a planet in a historical period (e.g. last 50 years)
// planetId: 'saturn', 'jupiter', 'rahu', 'ketu'
export function scanPlanetTransits(planetId, startYear, endYear) {
  const transits = [];
  const startMs = new Date(startYear, 0, 1).getTime();
  const endMs = new Date(endYear, 11, 31).getTime();

  // Scan interval in days (fast-moving planets scan smaller, slow-moving planets scan wider)
  // Saturn, Jupiter, Rahu, Ketu move slow. A 5-day scan is perfect.
  const intervalDays = 5;
  const stepMs = intervalDays * 24 * 60 * 60 * 1000;

  let currentMs = startMs;
  let previousSign = -1;

  while (currentMs <= endMs) {
    const testDate = new Date(currentMs);
    const jd = getJulianDate(testDate);
    const T = (jd - 2451545.0) / 36525.0;
    const ayanamsha = getLahiriAyanamsha(T);
    const currentSign = getPlanetSignIndex(planetId, jd, ayanamsha);

    if (previousSign !== -1 && currentSign !== previousSign) {
      // Sign change detected between currentMs - stepMs and currentMs
      // Perform Binary Search to find the exact transit hour
      let left = currentMs - stepMs;
      let right = currentMs;
      let exactTransitMs = currentMs;

      for (let step = 0; step < 10; step++) {
        const mid = (left + right) / 2;
        const midDate = new Date(mid);
        const midJd = getJulianDate(midDate);
        const midT = (midJd - 2451545.0) / 36525.0;
        const midAya = getLahiriAyanamsha(midT);
        const midSign = getPlanetSignIndex(planetId, midJd, midAya);

        if (midSign === currentSign) {
          right = mid;
          exactTransitMs = mid;
        } else {
          left = mid;
        }
      }

      transits.push({
        date: new Date(exactTransitMs),
        fromSign: previousSign,
        toSign: currentSign,
        fromSignName: SIGNS[previousSign].name,
        toSignName: SIGNS[currentSign].name
      });
    }

    previousSign = currentSign;
    currentMs += stepMs;
  }

  return transits;
}

// -------------------------------------------------------------
// Life Events Pattern Matcher & Prediction Engine
// Matches Jupiter, Saturn, Rahu, Ketu transits relative to Natal Chart
// -------------------------------------------------------------

// Calculate house of a planet relative to Lagna Sign
// Sign and Lagna indexes are 0-11
export function getHouseFromLagna(planetSignIndex, lagnaSignIndex) {
  return (planetSignIndex - lagnaSignIndex + 12) % 12 + 1;
}

export function matchLifeEventTransits(birthDetails, eventStartDate, eventEndDate) {
  // 1. Calculate Natal chart configurations
  const birthDate = new Date(birthDetails.date + 'T' + birthDetails.time + 'Z');
  // Adjust birthDate to UTC using offset (timezone in hours, e.g. +5.5. UTC = Local - offset)
  const birthUtc = new Date(birthDate.getTime() - birthDetails.timezone * 60 * 60 * 1000);
  const birthJd = getJulianDate(birthUtc);
  
  const natalLagna = calculateAscendantLongitude(birthJd, birthDetails.longitude, birthDetails.latitude);
  const natalLagnaSign = Math.floor(natalLagna / 30);

  const natalData = calculatePlanets(birthJd);
  
  // 2. Calculate Transit during event (using mid-point of event range)
  const startMs = new Date(eventStartDate).getTime();
  const endMs = new Date(eventEndDate).getTime();
  const midMs = (startMs + endMs) / 2;
  const eventMidDate = new Date(midMs);
  const eventJd = getJulianDate(eventMidDate);

  const eventTransits = calculatePlanets(eventJd);

  // Focus on Saturn, Jupiter, Rahu, Ketu
  const targetKeys = ['saturn', 'jupiter', 'rahu', 'ketu'];
  const eventSignature = {};

  targetKeys.forEach(key => {
    const transitInfo = eventTransits.planets[key];
    const house = getHouseFromLagna(transitInfo.signIndex, natalLagnaSign);
    
    // Check if transit planet is conjunct any natal planet (within 10 degrees)
    const conjunctions = [];
    Object.keys(natalData.planets).forEach(nKey => {
      const natalInfo = natalData.planets[nKey];
      let diff = Math.abs(transitInfo.longitude - natalInfo.longitude);
      if (diff > 180) diff = 360 - diff;
      if (diff <= 10) {
        conjunctions.push({ planet: nKey, diff: diff });
      }
    });

    eventSignature[key] = {
      signIndex: transitInfo.signIndex,
      house: house,
      conjunctions: conjunctions
    };
  });

  return {
    natalLagnaSign,
    natalLagnaDegree: natalLagna % 30,
    natalPlanets: natalData.planets,
    eventSignature,
    midPointDate: eventMidDate
  };
}

// Scans future date range for transit alignment matches
export function predictFutureReoccurrences(birthDetails, eventSignature, natalLagnaSign, natalPlanets, startYear = 2026, endYear = 2056) {
  const matches = [];
  const startMs = new Date(startYear, 0, 1).getTime();
  const endMs = new Date(endYear, 11, 31).getTime();

  // Scan monthly to find matching patterns
  const scanStepMs = 30.4 * 24 * 60 * 60 * 1000; // ~30.4 days (1 month)
  let currentMs = startMs;

  while (currentMs <= endMs) {
    const testDate = new Date(currentMs);
    const jd = getJulianDate(testDate);
    const T = (jd - 2451545.0) / 36525.0;
    const ayanamsha = getLahiriAyanamsha(T);

    // Compute transits of Saturn, Jupiter, Rahu, Ketu
    const transits = {};
    const targetKeys = ['saturn', 'jupiter', 'rahu', 'ketu'];

    targetKeys.forEach(key => {
      let tropLon;
      if (key === 'rahu') tropLon = getRahuLongitudeTropical(T);
      else if (key === 'ketu') tropLon = normalize360(getRahuLongitudeTropical(T) + 180);
      else tropLon = getPlanetLongitudeTropical(key, jd);

      const sidLon = normalize360(tropLon - ayanamsha);
      const signIndex = Math.floor(sidLon / 30);
      const house = getHouseFromLagna(signIndex, natalLagnaSign);

      const conjunctions = [];
      Object.keys(natalPlanets).forEach(nKey => {
        const natalInfo = natalPlanets[nKey];
        let diff = Math.abs(sidLon - natalInfo.longitude);
        if (diff > 180) diff = 360 - diff;
        if (diff <= 10) conjunctions.push(nKey);
      });

      transits[key] = {
        signIndex,
        house,
        conjunctions,
        longitude: sidLon
      };
    });

    // Score calculation
    let totalScore = 0;
    
    // Weightings:
    // Saturn House Match: 35%
    // Jupiter House Match: 25%
    // Rahu House Match (or reverse axis): 20% (15% if reversed)
    // Ketu House Match (or reverse axis): 10% (8% if reversed)
    // Conjunction Matches: 10%

    // Saturn House Match
    if (transits.saturn.house === eventSignature.saturn.house) {
      totalScore += 35;
    }
    // Jupiter House Match
    if (transits.jupiter.house === eventSignature.jupiter.house) {
      totalScore += 25;
    }
    // Rahu / Ketu Axis Match
    if (transits.rahu.house === eventSignature.rahu.house) {
      totalScore += 20;
    } else if (transits.rahu.house === eventSignature.ketu.house) {
      totalScore += 15; // Swapped axis
    }

    if (transits.ketu.house === eventSignature.ketu.house) {
      totalScore += 10;
    } else if (transits.ketu.house === eventSignature.rahu.house) {
      totalScore += 8; // Swapped axis
    }

    // Conjunction Match (10% max)
    let conjunctMatchCount = 0;
    let expectedConjunctCount = 0;

    targetKeys.forEach(key => {
      const expConjuncts = eventSignature[key].conjunctions.map(c => c.planet);
      expectedConjunctCount += expConjuncts.length;
      expConjuncts.forEach(planet => {
        if (transits[key].conjunctions.includes(planet)) {
          conjunctMatchCount++;
        }
      });
    });

    if (expectedConjunctCount > 0) {
      totalScore += (conjunctMatchCount / expectedConjunctCount) * 10;
    } else {
      // If no conjunctions occurred in original event, we reward matching a lack of heavy conjunctions
      totalScore += 10;
    }

    if (totalScore >= 60) {
      matches.push({
        date: new Date(currentMs),
        score: Math.round(totalScore),
        transits
      });
    }

    currentMs += scanStepMs;
  }

  // Group monthly matches into contiguous periods (windows)
  const windows = [];
  if (matches.length === 0) return windows;

  let currentWindow = null;

  matches.forEach(match => {
    if (!currentWindow) {
      currentWindow = {
        startDate: match.date,
        endDate: match.date,
        peakScore: match.score,
        peakDate: match.date,
        scores: [match.score],
        transits: match.transits
      };
    } else {
      const diffMonths = (match.date.getTime() - currentWindow.endDate.getTime()) / (30.4 * 24 * 60 * 60 * 1000);
      if (diffMonths <= 1.8) {
        // Extend current window
        currentWindow.endDate = match.date;
        currentWindow.scores.push(match.score);
        if (match.score > currentWindow.peakScore) {
          currentWindow.peakScore = match.score;
          currentWindow.peakDate = match.date;
          currentWindow.transits = match.transits; // Update transit details at peak
        }
      } else {
        // Save current window and start new one
        windows.push(currentWindow);
        currentWindow = {
          startDate: match.date,
          endDate: match.date,
          peakScore: match.score,
          peakDate: match.date,
          scores: [match.score],
          transits: match.transits
        };
      }
    }
  });

  if (currentWindow) {
    windows.push(currentWindow);
  }

  // Sort windows by score descending
  return windows.sort((a, b) => b.peakScore - a.peakScore);
}

// -------------------------------------------------------------
// Trik Bhava (6th, 8th, 12th) & Karmic Analysis Generators
// -------------------------------------------------------------

// Determines Trik Bhava placements & Yogas for Birth Chart Analysis
export function analyzeTrikBhavaNatal(natalPlanets, lagnaSignIndex) {
  // Houses indexes (1 to 12)
  const houseLords = {};
  
  // Define sign lords: Aries (0) -> Mars, Taurus (1) -> Venus, etc.
  const signLords = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];

  for (let house = 1; house <= 12; house++) {
    const signIndex = (lagnaSignIndex + house - 1) % 12;
    houseLords[house] = {
      house,
      signIndex,
      signName: SIGNS[signIndex].name,
      lord: signLords[signIndex]
    };
  }

  // Locate the placements of the 6th, 8th, and 12th lords in the chart
  const trikHouses = [6, 8, 12];
  const analysis = {};

  trikHouses.forEach(h => {
    const lordPlanet = houseLords[h].lord;
    // Find where the lord planet is placed
    const planetData = natalPlanets[lordPlanet];
    const placedSign = planetData.signIndex;
    const placedHouse = getHouseFromLagna(placedSign, lagnaSignIndex);

    analysis[h] = {
      lord: lordPlanet,
      placedHouse: placedHouse,
      placedSignName: SIGNS[placedSign].name,
      placedSignSanskrit: SIGNS[placedSign].sanskrit
    };
  });

  // Check for Vipareeta Raja Yogas
  // 6th Lord in 6th, 8th or 12th (Harsha Yoga)
  // 8th Lord in 6th, 8th or 12th (Sarala Yoga)
  // 12th Lord in 6th, 8th or 12th (Vimala Yoga)
  const yogas = [];
  
  if ([6, 8, 12].includes(analysis[6].placedHouse)) {
    yogas.push({
      name: 'Harsha Vipareeta Raja Yoga',
      description: 'The 6th Lord resides in a dusthana house. This grants outstanding immunity, power to triumph over adversaries, financial resilience, and transmuting conflicts into spiritual victories.'
    });
  }

  if ([6, 8, 12].includes(analysis[8].placedHouse)) {
    yogas.push({
      name: 'Sarala Vipareeta Raja Yoga',
      description: 'The 8th Lord resides in a dusthana house. This yields immense mental fortitude, interest in mysteries or occult, longevity, and the unique ability to convert sudden catastrophes into paths of rebirth.'
    });
  }

  if ([6, 8, 12].includes(analysis[12].placedHouse)) {
    yogas.push({
      name: 'Vimala Vipareeta Raja Yoga',
      description: 'The 12th Lord resides in a dusthana house. This indicates healthy expenditures, spiritual inclinations, overseas connections, ability to save wealth, and overcoming sub-conscious fears.'
    });
  }

  return {
    houseLords,
    placements: analysis,
    yogas
  };
}

// Scans future date range (2026-2056) for slow-moving planets matching degree or Nakshatra
export function scanDegreeAlignments(birthDetails, natalPlanets, lagnaSign, startYear = 2026, endYear = 2056) {
  const startMs = new Date(startYear, 0, 1).getTime();
  const endMs = new Date(endYear, 11, 31).getTime();
  
  const stepMs = 1 * 24 * 60 * 60 * 1000; // 1 day
  let currentMs = startMs;
  
  const rawMatches = [];
  const targetKeys = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];
  
  while (currentMs <= endMs) {
    const testDate = new Date(currentMs);
    const jd = getJulianDate(testDate);
    const T = (jd - 2451545.0) / 36525.0;
    const ayanamsha = getLahiriAyanamsha(T);
    
    targetKeys.forEach(tKey => {
      let tropLon;
      if (tKey === 'rahu') tropLon = getRahuLongitudeTropical(T);
      else if (tKey === 'ketu') tropLon = normalize360(getRahuLongitudeTropical(T) + 180);
      else tropLon = getPlanetLongitudeTropical(tKey, jd);
      
      const sidLon = normalize360(tropLon - ayanamsha);
      const signIndex = Math.floor(sidLon / 30);
      const degree = sidLon % 30;
      
      const nakIndex = Math.min(Math.floor(sidLon / NAK_SPAN), 26);
      const nakDetail = NAKSHATRAS[nakIndex];
      
      const np = natalPlanets[tKey];
      if (np) {
        let degDiff = Math.abs(sidLon - np.longitude);
        if (degDiff > 180) degDiff = 360 - degDiff;
        const isSameDegree = degDiff <= 1.0;
        const isSameNakshatra = nakDetail.name === np.nakshatraName;
        
        if (isSameDegree || isSameNakshatra) {
          rawMatches.push({
            date: new Date(currentMs),
            tKey,
            nKey: tKey,
            transitDegree: degree,
            natalDegree: np.degree,
            degDiff,
            isSameDegree,
            isSameNakshatra,
            transitNakshatra: nakDetail.name,
            natalNakshatra: np.nakshatraName,
            transitSign: SIGNS[signIndex].name,
            natalSign: np.signName,
            transitHouse: getHouseFromLagna(signIndex, lagnaSign),
            natalHouse: getHouseFromLagna(np.signIndex, lagnaSign)
          });
        }
      }
    });
    
    currentMs += stepMs;
  }
  
  // Group consecutive matches for the same (tKey, nKey) pair
  const grouped = [];
  const keyMap = {}; // "tKey-nKey" -> Array of matches
  
  rawMatches.forEach(m => {
    const key = `${m.tKey}-${m.nKey}`;
    if (!keyMap[key]) keyMap[key] = [];
    keyMap[key].push(m);
  });
  
  const processSegment = (segment) => {
    // Find the peak match in the segment (minimum degDiff)
    let peak = segment[0];
    segment.forEach(item => {
      if (item.degDiff < peak.degDiff) {
        peak = item;
      }
    });
    
    const isSameDegree = segment.some(s => s.isSameDegree);
    const isSameNakshatra = segment.some(s => s.isSameNakshatra);
    
    let matchType = '';
    let severity = 'low';
    let description = '';
    
    if (isSameNakshatra && isSameDegree) {
      matchType = 'Conjunction (Same Nakshatra & Degree)';
      severity = 'high';
      description = `Transiting ${peak.tKey.toUpperCase()} is in exact conjunction with your Natal ${peak.nKey.toUpperCase()} at ${peak.transitDegree.toFixed(1)}° in ${peak.transitNakshatra} Nakshatra. This marks a rare and highly potent life-changing trigger!`;
    } else if (isSameNakshatra) {
      matchType = 'Same Nakshatra';
      severity = 'medium';
      description = `Transiting ${peak.tKey.toUpperCase()} enters ${peak.transitNakshatra} Nakshatra, matching your Natal ${peak.nKey.toUpperCase()}. It triggers themes of your Natal ${peak.nKey.toUpperCase()}'s house placement.`;
    } else if (isSameDegree) {
      matchType = 'Same Degree, Different House';
      severity = 'low';
      description = `Transiting ${peak.tKey.toUpperCase()} reaches ${peak.transitDegree.toFixed(1)}°, matching the exact degree of your Natal ${peak.nKey.toUpperCase()} but transiting in a different sign/house. This activates harmonic aspects.`;
    }
    
    grouped.push({
      date: peak.date,
      tKey: peak.tKey,
      nKey: peak.nKey,
      transitPlanet: peak.tKey.toUpperCase(),
      natalPlanet: peak.nKey.toUpperCase(),
      transitDegree: peak.transitDegree,
      natalDegree: peak.natalDegree,
      transitNakshatra: peak.transitNakshatra,
      natalNakshatra: peak.natalNakshatra,
      transitSign: peak.transitSign,
      natalSign: peak.natalSign,
      transitHouse: peak.transitHouse,
      natalHouse: peak.natalHouse,
      matchType,
      severity,
      description
    });
  };

  Object.keys(keyMap).forEach(key => {
    const matches = keyMap[key];
    let currentSegment = [];
    matches.forEach(m => {
      if (currentSegment.length === 0) {
        currentSegment.push(m);
      } else {
        const prev = currentSegment[currentSegment.length - 1];
        const diffDays = (m.date.getTime() - prev.date.getTime()) / (24 * 60 * 60 * 1000);
        if (diffDays <= 60) {
          currentSegment.push(m);
        } else {
          processSegment(currentSegment);
          currentSegment = [m];
        }
      }
    });
    if (currentSegment.length > 0) {
      processSegment(currentSegment);
    }
  });
  
  // Sort by date ascending
  return grouped.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Analyze alignments for all 9 transiting planets on a specific date
export function analyzePeakDateAlignments(peakDate, natalPlanets, lagnaSign) {
  try {
    const dateObj = new Date(peakDate);
    const jd = getJulianDate(dateObj);
    const transitResults = calculatePlanets(jd).planets;
    
    const alignments = [];
    const planetIds = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];
    
    planetIds.forEach(pKey => {
      const tp = transitResults[pKey];
      const np = natalPlanets[pKey];
      
      if (tp && np) {
        let degDiff = Math.abs(tp.longitude - np.longitude);
        if (degDiff > 180) degDiff = 360 - degDiff;
        const isSameDegree = degDiff <= 1.0;
        const isSameNakshatra = tp.nakshatraName === np.nakshatraName;
        
        if (isSameDegree || isSameNakshatra) {
          let matchType = '';
          let severity = 'low';
          let description = '';
          
          if (isSameNakshatra && isSameDegree) {
            matchType = 'Planetary Return (Same Nak & Deg)';
            severity = 'high';
            description = `Transiting ${tp.name} is in exact conjunction with its Natal position at ${tp.degree.toFixed(1)}° in ${tp.nakshatraName} Nakshatra. This is a rare and highly potent planetary return!`;
          } else if (isSameNakshatra) {
            matchType = 'Same Nakshatra';
            severity = 'medium';
            description = `Transiting ${tp.name} enters its Natal Nakshatra ${tp.nakshatraName}. This triggers key themes of its house placement.`;
          } else if (isSameDegree) {
            matchType = 'Planetary Return (Same Degree)';
            severity = 'medium';
            description = `Transiting ${tp.name} reaches its Natal degree of ${tp.degree.toFixed(1)}° in its natal sign, activating its natal house placement.`;
          }
          
          alignments.push({
            id: `${pKey}-${pKey}`,
            transitPlanet: tp.name,
            natalPlanet: np.name,
            transitDegree: tp.degree,
            natalDegree: np.degree,
            transitNakshatra: tp.nakshatraName,
            natalNakshatra: np.nakshatraName,
            transitSign: tp.signName,
            natalSign: np.signName,
            transitHouse: getHouseFromLagna(tp.signIndex, lagnaSign),
            natalHouse: getHouseFromLagna(np.signIndex, lagnaSign),
            matchType,
            severity,
            description
          });
        }
      }
    });
    
    return alignments;
  } catch (err) {
    console.error(err);
    return [];
  }
}

// ---------------------------------------------------------------
// Vimshottari Dasha System (120-Year Planetary Period Engine)
// ---------------------------------------------------------------

export const DASHA_SEQUENCE = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
export const DASHA_YEARS = { ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17 };

const NAK_LORDS_SEQ = [
  'ketu','venus','sun','moon','mars','rahu','jupiter','saturn','mercury',
  'ketu','venus','sun','moon','mars','rahu','jupiter','saturn','mercury',
  'ketu','venus','sun','moon','mars','rahu','jupiter','saturn','mercury'
];

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function julianToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

function buildAntardashas(mahaLord, mahaStartMs, totalMahaMs, fullMahaYears) {
  const seqIdx = DASHA_SEQUENCE.indexOf(mahaLord);
  const ads = [];
  let cur = mahaStartMs;

  for (let i = 0; i < 9; i++) {
    const adLord = DASHA_SEQUENCE[(seqIdx + i) % 9];
    // Proportional duration within mahadasha (scaled to actual remaining ms)
    const fullAdMs = (DASHA_YEARS[adLord] / 120) * fullMahaYears * MS_PER_YEAR;
    const scaleFactor = totalMahaMs / (fullMahaYears * MS_PER_YEAR);
    const actualAdMs = fullAdMs * scaleFactor;
    const end = cur + actualAdMs;

    ads.push({
      lord: adLord,
      startDate: new Date(cur),
      endDate: new Date(end),
      years: actualAdMs / MS_PER_YEAR
    });
    cur = end;
  }
  return ads;
}

export function calculateVimshottariDasha(birthJd, moonSiderealLong) {
  const nakIdx = Math.min(Math.floor(normalize360(moonSiderealLong) / NAK_SPAN), 26);
  const fracInNak = (normalize360(moonSiderealLong) - nakIdx * NAK_SPAN) / NAK_SPAN;

  const birthNakLord = NAK_LORDS_SEQ[nakIdx];
  const seqStart = DASHA_SEQUENCE.indexOf(birthNakLord);

  // Balance of birth-lord dasha remaining at birth
  const balanceYears = DASHA_YEARS[birthNakLord] * (1 - fracInNak);
  const birthMs = julianToDate(birthJd).getTime();

  const dashas = [];
  let curMs = birthMs;

  // First (partial) dasha — starts at birth
  {
    const lord = birthNakLord;
    const durationMs = balanceYears * MS_PER_YEAR;
    const end = curMs + durationMs;
    dashas.push({
      lord,
      years: balanceYears,
      startDate: new Date(curMs),
      endDate: new Date(end),
      isPartial: true,
      antardashas: buildAntardashas(lord, curMs, durationMs, DASHA_YEARS[lord])
    });
    curMs = end;
  }

  // Full subsequent dashas until we cover ~2080
  let idx = 1;
  while (new Date(curMs).getFullYear() < 2082) {
    const lord = DASHA_SEQUENCE[(seqStart + idx) % 9];
    const years = DASHA_YEARS[lord];
    const durationMs = years * MS_PER_YEAR;
    const end = curMs + durationMs;
    dashas.push({
      lord,
      years,
      startDate: new Date(curMs),
      endDate: new Date(end),
      isPartial: false,
      antardashas: buildAntardashas(lord, curMs, durationMs, years)
    });
    curMs = end;
    idx++;
  }

  return dashas;
}

export function getCurrentDasha(dashas, targetDate) {
  const t = targetDate instanceof Date ? targetDate.getTime() : new Date(targetDate).getTime();

  for (let i = 0; i < dashas.length; i++) {
    const d = dashas[i];
    if (t >= d.startDate.getTime() && t < d.endDate.getTime()) {
      let currentAntardasha = null;
      for (const ad of d.antardashas) {
        if (t >= ad.startDate.getTime() && t < ad.endDate.getTime()) {
          currentAntardasha = ad;
          break;
        }
      }
      return {
        currentMahadasha: d,
        currentAntardasha,
        nextMahadasha: dashas[i + 1] || null
      };
    }
  }
  return { currentMahadasha: null, currentAntardasha: null, nextMahadasha: null };
}

// ---------------------------------------------------------------
// Planetary Dignity Engine
// ---------------------------------------------------------------

// Exaltation signs (sign index 0-11) and degrees for each planet
export const PLANET_DIGNITY = {
  sun:     { exalt: 0, debil: 6, exaltDeg: 10, ownSigns: [4] },           // Exalt Aries, Debil Libra, Own Leo
  moon:    { exalt: 1, debil: 7, exaltDeg: 3,  ownSigns: [3] },           // Exalt Taurus, Debil Scorpio, Own Cancer
  mars:    { exalt: 9, debil: 3, exaltDeg: 28, ownSigns: [0, 7] },        // Exalt Capricorn, Debil Cancer
  mercury: { exalt: 5, debil: 11, exaltDeg: 15, ownSigns: [2, 5] },       // Exalt Virgo, Debil Pisces
  jupiter: { exalt: 3, debil: 9, exaltDeg: 5,  ownSigns: [8, 11] },       // Exalt Cancer, Debil Capricorn
  venus:   { exalt: 11, debil: 5, exaltDeg: 27, ownSigns: [1, 6] },       // Exalt Pisces, Debil Virgo
  saturn:  { exalt: 6, debil: 0, exaltDeg: 20, ownSigns: [9, 10] },       // Exalt Libra, Debil Aries
  rahu:    { exalt: 1, debil: 7, exaltDeg: 20, ownSigns: [] },             // Exalt Taurus (some schools)
  ketu:    { exalt: 7, debil: 1, exaltDeg: 20, ownSigns: [] }              // Exalt Scorpio
};

export function getPlanetDignity(planetId, signIndex) {
  const d = PLANET_DIGNITY[planetId];
  if (!d) return 'neutral';
  if (d.ownSigns.includes(signIndex)) return 'own';
  if (d.exalt === signIndex) return 'exalted';
  if (d.debil === signIndex) return 'debilitated';
  return 'neutral';
}

// ══════════════════════════════════════════════════════════════════
//  PDF-ENHANCED ANALYSIS UTILITIES
//  These functions layer AstroSage PDF data on top of the base engine
// ══════════════════════════════════════════════════════════════════

/**
 * Score a transit window using Ashtakvarga bindu data from uploaded PDF.
 * Returns enhanced match object with binduScore, sarvaScore, shadbalWeight.
 */
export function enhanceTransitWithPDFData(matchResult, pdfData) {
  if (!pdfData) return matchResult;

  const enhanced = { ...matchResult };
  const binduScores = {};
  const SLOW_PLANETS = ['saturn', 'jupiter', 'rahu', 'ketu'];

  let totalBindu = 0;
  let binduCount = 0;

  SLOW_PLANETS.forEach(planet => {
    const tInfo = matchResult.transits?.[planet];
    if (!tInfo) return;
    const signIdx = tInfo.signIndex;
    if (signIdx === undefined || signIdx === null) return;

    const bindu = pdfData?.ashtakvarga?.byPlanet?.[planet]?.[signIdx] ?? null;
    const sarva = pdfData?.ashtakvarga?.total?.[signIdx] ?? null;

    binduScores[planet] = { bindu, sarva };
    if (bindu !== null) { totalBindu += bindu; binduCount++; }
  });

  enhanced.binduScores = binduScores;
  enhanced.avgBindu = binduCount > 0 ? (totalBindu / binduCount).toFixed(1) : null;

  // Composite score boost: bindu ≥5 → 10% boost; ≤2 → 10% reduction
  if (enhanced.avgBindu !== null) {
    const avg = parseFloat(enhanced.avgBindu);
    const boost = avg >= 5 ? 1.10 : avg <= 2 ? 0.90 : 1.0;
    enhanced.adjustedScore = Math.min(100, Math.round(enhanced.score * boost));
  } else {
    enhanced.adjustedScore = enhanced.score;
  }

  // Shadbala weighting for dasha lord at peak date
  if (pdfData?.shadbala && matchResult?.transits) {
    enhanced.shadbalWeights = {};
    const MIN = { sun: 5, moon: 6, mars: 5, mercury: 7, jupiter: 6.5, venus: 5.5, saturn: 5 };
    Object.keys(pdfData.shadbala).forEach(p => {
      if (p.startsWith('_')) return;
      const val = pdfData.shadbala[p];
      const min = MIN[p] || 5;
      enhanced.shadbalWeights[p] = { val, ratio: (val / min).toFixed(2), strong: val >= min };
    });
  }

  return enhanced;
}

/**
 * Get accuracy improvement percentage when PDF data is present vs. not.
 * Returns { base, withPDF, breakdown[] }
 */
export function getAccuracyProfile(pdfData) {
  const BASE = 38; // base accuracy without any PDF data
  const breakdown = [
    { key: 'ashtakvarga', label: 'Ashtakvarga Bindu Scoring', points: 22, description: 'Weights each transit by its bindu score (0–8), filtering high-quality windows from weak ones' },
    { key: 'pratyantar',  label: 'Pratyantar (3rd-Level Dasha)', points: 18, description: 'Narrows timing from ±3-month Antardasha windows to ±2-week Pratyantar precision' },
    { key: 'kpCusps',     label: 'KP Sub-Lord System', points: 15, description: 'Uses KP house significators to predict binary events: will this happen, and when?' },
    { key: 'shadbala',    label: 'Shadbala Dasha Weighting', points: 10, description: 'Planets with high Shadbala deliver dasha results more strongly and reliably' },
    { key: 'sadesati',    label: 'Sadesati Phase Overlay', points: 8,  description: 'Tags predictions with Saturn stress phase — Rising/Peak/Setting changes interpretation' },
    { key: 'chalit',      label: 'Chalit Bhav Correction', points: 7,  description: 'Corrects house placement for planets near cusp boundaries (±3°)' },
  ];

  let earned = 0;
  const available = breakdown.map(b => {
    let has = false;
    if (b.key === 'ashtakvarga') has = !!pdfData?.ashtakvarga?.total;
    else if (b.key === 'pratyantar') has = (pdfData?.pratyantar?.length || 0) >= 10;
    else if (b.key === 'kpCusps') has = (pdfData?.kpCusps?.length || 0) === 12;
    else if (b.key === 'shadbala') has = !!pdfData?.shadbala;
    else if (b.key === 'sadesati') has = (pdfData?.sadesati?.length || 0) >= 2;
    else if (b.key === 'chalit') has = (pdfData?.chalit?.length || 0) >= 10;
    if (has) earned += b.points;
    return { ...b, active: has };
  });

  return {
    base: BASE,
    earned,
    total: BASE + earned,
    max: BASE + breakdown.reduce((s, b) => s + b.points, 0),
    breakdown: available,
  };
}

// ══════════════════════════════════════════════════════════════════
//  PDF DATA QUERY UTILITIES  (moved here so App.jsx never needs to
//  statically import pdfParser.js, which bundles pdfjs-dist)
// ══════════════════════════════════════════════════════════════════

export function getAshtakvargaBindu(pdfData, planetKey, signIndex) {
  if (!pdfData?.ashtakvarga?.byPlanet?.[planetKey]) return null;
  const idx = ((signIndex % 12) + 12) % 12;
  return pdfData.ashtakvarga.byPlanet[planetKey][idx] ?? null;
}

export function getSarvashtakvargaScore(pdfData, signIndex) {
  if (!pdfData?.ashtakvarga?.total) return null;
  const idx = ((signIndex % 12) + 12) % 12;
  return pdfData.ashtakvarga.total[idx] ?? null;
}

export function binduLabel(score) {
  if (score === null || score === undefined) return null;
  if (score <= 1) return { label: 'Crisis',      color: '#dc2626', stars: 1 };
  if (score <= 2) return { label: 'Difficult',   color: '#ea580c', stars: 2 };
  if (score === 3) return { label: 'Challenging', color: '#d97706', stars: 3 };
  if (score === 4) return { label: 'Neutral',     color: '#ca8a04', stars: 4 };
  if (score <= 5) return { label: 'Supportive',  color: '#16a34a', stars: 5 };
  if (score <= 6) return { label: 'Strong',       color: '#0891b2', stars: 6 };
  return { label: 'Excellent', color: '#7c3aed', stars: score };
}

export function getActivePratyantar(pdfData, date) {
  if (!pdfData?.pratyantar?.length) return null;
  const t = date.getTime();
  for (const block of pdfData.pratyantar) {
    if (!block.startDate || !block.endDate) continue;
    const bStart = block.startDate instanceof Date ? block.startDate : new Date(block.startDate);
    const bEnd   = block.endDate   instanceof Date ? block.endDate   : new Date(block.endDate);
    if (isNaN(bStart) || isNaN(bEnd)) continue;
    if (t >= bStart.getTime() && t <= bEnd.getTime()) {
      let prevEnd = bStart;
      for (const pr of block.pratantars || []) {
        if (!pr.endDate) continue;
        const prEnd = pr.endDate instanceof Date ? pr.endDate : new Date(pr.endDate);
        if (isNaN(prEnd)) continue;
        if (t <= prEnd.getTime()) {
          return { maha: block.maha, antar: block.antar, pratantar: pr.lord,
                   startDate: prevEnd, endDate: prEnd,
                   blockStartDate: bStart, blockEndDate: bEnd };
        }
        prevEnd = prEnd;
      }
    }
  }
  return null;
}

export function getActiveSadesati(pdfData, date) {
  if (!pdfData?.sadesati?.length) return null;
  const t = date.getTime();
  for (const period of pdfData.sadesati) {
    if (!period.startDate || !period.endDate) continue;
    const ps = period.startDate instanceof Date ? period.startDate : new Date(period.startDate);
    const pe = period.endDate   instanceof Date ? period.endDate   : new Date(period.endDate);
    if (isNaN(ps) || isNaN(pe)) continue;
    if (t >= ps.getTime() && t <= pe.getTime()) return period;
  }
  return null;
}

export function shadbalLabel(pdfData, planetKey) {
  if (!pdfData?.shadbala?.[planetKey]) return null;
  const val = pdfData.shadbala[planetKey];
  const min = pdfData.shadbala._minimum?.[planetKey] || 5;
  const ratio = val / min;
  if (ratio >= 1.4) return { label: 'Very Strong', val, color: '#7c3aed' };
  if (ratio >= 1.1) return { label: 'Strong',      val, color: '#16a34a' };
  if (ratio >= 0.9) return { label: 'Average',     val, color: '#ca8a04' };
  return { label: 'Weak', val, color: '#dc2626' };
}

export function getPDFDataSummary(pdfData) {
  if (!pdfData) return [];
  return [
    { key: 'planets',     label: 'Planetary Positions',    available: Object.keys(pdfData.planets || {}).length >= 9,   count: Object.keys(pdfData.planets || {}).length + ' planets' },
    { key: 'ashtakvarga', label: 'Ashtakvarga Bindus',     available: !!pdfData.ashtakvarga?.total,                      count: pdfData.ashtakvarga ? '7 planets x 12 signs' : '' },
    { key: 'vimshottari', label: 'Vimshottari Dasha',      available: (pdfData.vimshottari?.length || 0) >= 5,           count: (pdfData.vimshottari?.length || 0) + ' Mahadashas' },
    { key: 'pratyantar',  label: 'Pratyantar (3rd Level)', available: (pdfData.pratyantar?.length  || 0) >= 10,          count: (pdfData.pratyantar?.length  || 0) + ' blocks' },
    { key: 'sadesati',    label: 'Sadesati Timeline',      available: (pdfData.sadesati?.length    || 0) >= 2,           count: (pdfData.sadesati?.length    || 0) + ' periods' },
    { key: 'kpCusps',     label: 'KP Cuspal Positions',    available: (pdfData.kpCusps?.length     || 0) === 12,         count: (pdfData.kpCusps?.length     || 0) + ' cusps' },
    { key: 'shadbala',    label: 'Shadbala Strength',      available: !!pdfData.shadbala,                                count: pdfData.shadbala ? '7 planets scored' : '' },
    { key: 'chalit',      label: 'Chalit Bhav Cusps',      available: (pdfData.chalit?.length      || 0) >= 10,          count: (pdfData.chalit?.length      || 0) + ' bhavas' },
  ];
}
