/**
 * AstroSage Vedic PDF Parser
 * Extracts structured predictive data from AstroSage Vedic Kundli PDF reports.
 * Supports: Planetary Positions, Ashtakvarga, Vimshottari Dasha (Mahadasha/Antardasha/Pratyantar),
 *            KP Cuspal Positions, Shadbala, Sadesati, Basic Birth Details, Chalit Table.
 */

// pdfjs-dist is loaded lazily (only when a PDF is uploaded) to avoid
// any module-initialization errors crashing the app at startup.
let _pdfjsLib = null;
async function getPdfjs() {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import('pdfjs-dist');
  _pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return _pdfjsLib;
}

// ──────────────────────────────────────────────────────────
//  CONSTANTS
// ──────────────────────────────────────────────────────────

const PLANET_SHORT = {
  sun: ['sun', 'su', 'sur'],
  moon: ['moon', 'mo', 'mon'],
  mars: ['mars', 'ma', 'mar', 'mangal'],
  mercury: ['mercury', 'me', 'mer', 'merc'],
  jupiter: ['jupiter', 'ju', 'jup', 'jupt', 'guru'],
  venus: ['venus', 've', 'ven', 'venu'],
  saturn: ['saturn', 'sa', 'sat', 'satn', 'shani'],
  rahu: ['rahu', 'ra', 'rah'],
  ketu: ['ketu', 'ke', 'ket'],
};

const SHORT_TO_FULL = {};
for (const [full, aliases] of Object.entries(PLANET_SHORT)) {
  for (const a of aliases) SHORT_TO_FULL[a.toLowerCase()] = full;
}

const SIGN_INDEX = {
  aries: 0, ar: 0, mesh: 0,
  taurus: 1, ta: 1, vrishabha: 1,
  gemini: 2, ge: 2, gem: 2, mithun: 2,
  cancer: 3, ca: 3, can: 3, kark: 3,
  leo: 4, le: 4, simha: 4,
  virgo: 5, vi: 5, vir: 5, kanya: 5,
  libra: 6, li: 6, lib: 6, tula: 6,
  scorpio: 7, sc: 7, sco: 7, scorpion: 7, vrishchik: 7,
  sagittarius: 8, sa: 8, sag: 8, dhanu: 8,
  capricorn: 9, cp: 9, cap: 9, makar: 9,
  aquarius: 10, aq: 10, aqu: 10, kumbha: 10,
  pisces: 11, pi: 11, pis: 11, meena: 11,
};

// ──────────────────────────────────────────────────────────
//  STEP 1: EXTRACT TEXT FROM PDF FILE
// ──────────────────────────────────────────────────────────

export async function extractTextFromPDF(file) {
  const pdfjsLib = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join('\n');
    pages.push(text);
  }
  return pages;
}

// ──────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────

function norm(s) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function parseAstroDate(str) {
  // Handles: "27/ 1/82", "18/ 1/83", "30/ 9/85", "6/ 8/94"
  if (!str) return null;
  str = str.trim();
  const m = str.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (!m) return null;
  const d = parseInt(m[1]), mo = parseInt(m[2]);
  let yr = parseInt(m[3]);
  if (yr < 100) {
    // 2-digit year: treat >26 as 1900s, <=26 as 2000s (dasha years rarely go past 2099)
    yr = yr > 26 ? 1900 + yr : 2000 + yr;
  }
  return new Date(yr, mo - 1, d);
}

function parseLongDate(str) {
  // Handles "January 24, 2020" or "March 21,\n1990"
  if (!str) return null;
  const months = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  const clean = str.replace(/\n/g, ' ').trim();
  const m = clean.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (!m) return null;
  const mo = months[m[1].toLowerCase()];
  if (mo === undefined) return null;
  return new Date(parseInt(m[3]), mo, parseInt(m[2]));
}

function toPlanetKey(abbr) {
  const k = norm(abbr).replace(/\s*\[r\]/i, '').replace(/\*/, '').trim();
  return SHORT_TO_FULL[k] || null;
}

function dmsToDecimal(dmsStr) {
  // "26-56-24" or "13-12-06" → decimal degrees within sign (0-30)
  if (!dmsStr) return null;
  const parts = dmsStr.trim().split(/[-:\s]+/);
  if (parts.length < 2) return null;
  const d = parseFloat(parts[0]) || 0;
  const m = parseFloat(parts[1]) || 0;
  const s = parseFloat(parts[2]) || 0;
  return d + m / 60 + s / 3600;
}

// ──────────────────────────────────────────────────────────
//  STEP 2: PARSERS
// ──────────────────────────────────────────────────────────

/**  Basic birth details */
function parseBasicDetails(allText) {
  const t = allText;
  const result = {};
  const field = (label) => {
    const m = t.match(new RegExp(label + '[:\\s]+([^\\n]+)', 'i'));
    return m ? m[1].trim() : null;
  };
  result.name = field('Name') || null;
  result.dob = field('Date of Birth') || field('Date') || null;
  result.tob = field('Time of Birth') || field('Time') || null;
  result.place = field('Place of Birth') || field('Place') || null;
  const lat = t.match(/Latitude[\s:]+(\d+)\s*:\s*(\d+)\s*:\s*([NS])/i);
  if (lat) result.latitude = (parseFloat(lat[1]) + parseFloat(lat[2]) / 60) * (lat[3] === 'S' ? -1 : 1);
  const lon = t.match(/Longitude[\s:]+(\d+)\s*:\s*(\d+)\s*:\s*([EW])/i);
  if (lon) result.longitude = (parseFloat(lon[1]) + parseFloat(lon[2]) / 60) * (lon[3] === 'W' ? -1 : 1);
  const tz = t.match(/Time Zone[\s:]+([0-9.]+)/i);
  if (tz) result.timezone = parseFloat(tz[1]);
  const ayan = t.match(/Ayanamsa[\s:]+([0-9-]+)/i);
  if (ayan) result.ayanamsa = dmsToDecimal(ayan[1]);
  const rasi = t.match(/Rasi[\s:]+([A-Za-z]+)/i);
  if (rasi) result.moonSign = rasi[1].trim();
  const lagna = t.match(/Lagna[\s:]+([A-Za-z]+)/i);
  if (lagna) result.lagna = lagna[1].trim();
  const nak = t.match(/Nakshatra[\s-]Pada[\s:]+([A-Za-z]+)[\s]+(\d)/i) ||
              t.match(/Nakshatra[\s:]+([A-Za-z]+)/i);
  if (nak) result.nakshatra = nak[1].trim();
  return result;
}

/**  Planetary positions table */
function parsePlanetaryPositions(allText) {
  const planets = {};
  // Find section
  const idx = allText.search(/Planetary Positions[\s\S]{0,200}ASC/i);
  if (idx === -1) return planets;
  const section = allText.slice(idx, idx + 3000);

  // Each row: name (possibly [R]), sign, degree (##-##-##), nakshatra, pada
  // We'll line-scan
  const lines = section.split('\n').map(l => l.trim()).filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].toLowerCase().replace(/\s*\[r\]/i, '').trim();
    const planetKey = SHORT_TO_FULL[line] || null;
    const isAsc = lines[i].toLowerCase().startsWith('asc');

    if (planetKey || isAsc) {
      const key = isAsc ? 'ascendant' : planetKey;
      const isRetrograde = /\[r\]/i.test(lines[i]);
      // Next lines: sign, degree, nakshatra, pada
      const sign = (lines[i + 1] || '').toLowerCase().replace(/[^a-z]/g, '');
      const degree = lines[i + 2] || '';
      const nak = lines[i + 3] || '';
      const pada = parseInt(lines[i + 4]) || null;

      const signIdx = SIGN_INDEX[sign] ?? null;
      const degDecimal = dmsToDecimal(degree);

      if (signIdx !== null || isAsc) {
        planets[key] = {
          sign: (lines[i + 1] || '').trim(),
          signIndex: signIdx,
          degree: degDecimal,
          fullDegree: signIdx !== null && degDecimal !== null ? signIdx * 30 + degDecimal : null,
          nakshatra: nak.trim(),
          pada,
          retrograde: isRetrograde,
        };
        i += 5;
        continue;
      }
    }
    i++;
  }
  return planets;
}

/**  Ashtakvarga bindu table → { byPlanet: {sun:[...12], ...}, total:[...12] } */
function parseAshtakvarga(allText) {
  const idx = allText.search(/Ashtakvarga Table/i);
  if (idx === -1) return null;
  const section = allText.slice(idx, idx + 4000);
  const nums = (section.match(/\b\d{1,2}\b/g) || []).map(Number);

  // Layout: after "Sign No 1 2 3...12" we have 7 planet rows x 12 + 1 total row x 12
  // First 12 numbers are sign headers (1-12), skip them
  // Then 7x12 = 84 planet bindus + 12 total = 96 numbers
  const PLANETS_ORDER = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

  // Find start: after the 12 sign headers
  // The sign headers are 1,2,3,...,12 in sequence
  let startIdx = -1;
  for (let i = 0; i < nums.length - 11; i++) {
    let ok = true;
    for (let j = 0; j < 12; j++) {
      if (nums[i + j] !== j + 1) { ok = false; break; }
    }
    if (ok) { startIdx = i + 12; break; }
  }

  if (startIdx === -1 || startIdx + 84 + 12 > nums.length) {
    // Fallback: just take last 96 numbers
    startIdx = Math.max(0, nums.length - 96);
  }

  const byPlanet = {};
  for (let p = 0; p < 7; p++) {
    byPlanet[PLANETS_ORDER[p]] = nums.slice(startIdx + p * 12, startIdx + p * 12 + 12);
  }
  const total = nums.slice(startIdx + 84, startIdx + 84 + 12);

  return { byPlanet, total };
}

/**  Vimshottari Dasha (Mahadasha + Antardasha dates) */
function parseVimshottariDasha(allText) {
  // Find the dasha section (not Pratyantar section)
  const prIdx = allText.search(/Vimshottari Dasha[\s-]+Pratyantar/i);
  const dsIdx = allText.search(/Vimshottari Dasha/i);
  if (dsIdx === -1) return [];

  const endIdx = prIdx > dsIdx ? prIdx : dsIdx + 8000;
  const section = allText.slice(dsIdx, endIdx).slice(0, 8000);

  const dashas = [];
  // Pattern: "MAR -7 Years\n  27/ 1/82 -  18/ 1/83\n" then "VEN  12/ 2/82" lines
  const mahaRe = /([A-Z]{2,3})\s*-+\s*(\d+)\s*Years?\s*\n\s*(\d{1,2}\/\s*\d{1,2}\/\d{2,4})\s*-+\s*(\d{1,2}\/\s*\d{1,2}\/\d{2,4})/g;
  const antarRe = /([A-Z]{2,3})\s+(\d{1,2}\/\s*\d{1,2}\/\d{2,4})/g;

  let mahaMatch;
  const mahaPositions = [];
  while ((mahaMatch = mahaRe.exec(section)) !== null) {
    const lord = toPlanetKey(mahaMatch[1]);
    if (!lord) continue;
    mahaPositions.push({
      lord,
      years: parseFloat(mahaMatch[2]),
      startDate: parseAstroDate(mahaMatch[3]),
      endDate: parseAstroDate(mahaMatch[4]),
      pos: mahaMatch.index,
      endPos: mahaRe.lastIndex,
    });
  }

  for (let mi = 0; mi < mahaPositions.length; mi++) {
    const maha = mahaPositions[mi];
    const nextPos = mi + 1 < mahaPositions.length ? mahaPositions[mi + 1].pos : section.length;
    const subsection = section.slice(maha.endPos, nextPos);

    const antardashas = [];
    let am;
    antarRe.lastIndex = 0;
    while ((am = antarRe.exec(subsection)) !== null) {
      const aLord = toPlanetKey(am[1]);
      if (!aLord) continue;
      const endDate = parseAstroDate(am[2]);
      antardashas.push({ lord: aLord, endDate });
    }

    dashas.push({ lord: maha.lord, years: maha.years, startDate: maha.startDate, endDate: maha.endDate, antardashas });
  }

  return dashas;
}

/**  Pratyantar Dasha (3rd level: Maha > Antar > Pratyantar) */
function parsePratyantar(allText) {
  const idx = allText.search(/Vimshottari Dasha[\s-]+Pratyantar/i);
  if (idx === -1) return [];
  const section = allText.slice(idx, idx + 30000);

  const result = [];
  // Pattern per block: "MAR --  MON\nFrom 27/ 1/82 - To 1/ 1/83\nMON  19/ 6/82\n..."
  const blockRe = /([A-Z]{2,3})\s*--+\s*([A-Z]{2,3})\s*\nFrom\s+(\S+)\s*-\s*To\s+(\S+)/g;

  let bm;
  const blocks = [];
  while ((bm = blockRe.exec(section)) !== null) {
    blocks.push({
      maha: toPlanetKey(bm[1]),
      antar: toPlanetKey(bm[2]),
      startDate: parseAstroDate(bm[3]),
      endDate: parseAstroDate(bm[4]),
      pos: bm.index,
      endPos: blockRe.lastIndex,
    });
  }

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (!block.maha || !block.antar) continue;
    const nextPos = bi + 1 < blocks.length ? blocks[bi + 1].pos : section.length;
    const sub = section.slice(block.endPos, nextPos);

    // Each pratyantar line: "MON  19/ 6/82"
    const pratRe = /([A-Z]{2,3})\s+(\d{1,2}\/\s*\d{1,2}\/\d{2,4})/g;
    const pratdash = [];
    let pm;
    while ((pm = pratRe.exec(sub)) !== null) {
      const lord = toPlanetKey(pm[1]);
      if (!lord) continue;
      pratdash.push({ lord, endDate: parseAstroDate(pm[2]) });
    }

    result.push({
      maha: block.maha,
      antar: block.antar,
      startDate: block.startDate,
      endDate: block.endDate,
      pratantars: pratdash,
    });
  }

  return result;
}

/**  Sadesati & Panoti periods */
function parseSadesati(allText) {
  const idx = allText.search(/Sadesati Report|Sade Sati/i);
  if (idx === -1) return [];
  const section = allText.slice(idx, idx + 15000);

  const periods = [];
  // Each row: S.N. | type | sign | startDate | endDate | phase
  // We look for patterns like "Small Panoti" or "Sade Sati" followed by sign name and dates
  const rowRe = /(\d+)\s+(Small Panoti|Sade Sati)\s+([A-Za-z]+)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)[^\n]+\d{4})\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)[^\n]+\d{4})\s*(Rising|Peak|Setting)?/gi;

  let m;
  while ((m = rowRe.exec(section)) !== null) {
    periods.push({
      sn: parseInt(m[1]),
      type: m[2].trim(),
      sign: m[3].trim(),
      startDate: parseLongDate(m[4]),
      endDate: parseLongDate(m[5]),
      phase: m[6] ? m[6].trim() : null,
    });
  }

  return periods;
}

/**  KP Cuspal Positions */
function parseKPCusps(allText) {
  const idx = allText.search(/KP System|Nakshatra Nadi/i);
  if (idx === -1) return [];
  const section = allText.slice(idx, idx + 3000);

  const cusps = [];
  // Pattern: cusp number, degree (###-##-##), sign abbr, nak abbr, sub abbr, ss abbr
  const re = /\b([1-9]|1[0-2])\b\s+(\d{3}-\d{2}-\d{2})\s+([A-Z]{2,3})\s+([A-Z]{2,3})\s+([A-Z]{2,3})\s+([A-Z]{2,3})/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    const cusp = parseInt(m[1]);
    if (cusp < 1 || cusp > 12) continue;
    cusps.push({
      cusp,
      degree: dmsToDecimal(m[2]),
      sign: m[3],
      nak: m[4],
      sub: m[5],
      ss: m[6],
    });
  }

  return cusps;
}

/**  Shadbala planet strength in Rupas */
function parseShadbala(allText) {
  const idx = allText.search(/Shadbala In Rupas|Total Shad Bala/i);
  if (idx === -1) return null;
  const section = allText.slice(idx, idx + 800);

  const PLANET_COLS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
  const result = {};

  // "Shadbala In Rupas\n6.16\n5.47\n4.72\n9.92\n7.21\n5.52\n5.05"
  const rupaM = section.match(/Shadbala In Rupas[\s\n]+([\d.]+)[\s\n]+([\d.]+)[\s\n]+([\d.]+)[\s\n]+([\d.]+)[\s\n]+([\d.]+)[\s\n]+([\d.]+)[\s\n]+([\d.]+)/i);
  if (rupaM) {
    for (let i = 0; i < 7; i++) {
      result[PLANET_COLS[i]] = parseFloat(rupaM[i + 1]);
    }
  }

  // Minimum required Rupas for reference
  result._minimum = { sun: 5, moon: 6, mars: 5, mercury: 7, jupiter: 6.5, venus: 5.5, saturn: 5 };

  return Object.keys(result).length > 1 ? result : null;
}

/**  Chalit (Bhava) house cusp table */
function parseChalit(allText) {
  const idx = allText.search(/Chalit Table/i);
  if (idx === -1) return [];
  const section = allText.slice(idx, idx + 2000);

  const rows = [];

  // Pattern: "1\nCapricorn\n13.47.21\n..." — bhav number, sign, begin degree, mid degree
  const re = /\b([1-9]|1[0-2])\b\s+(Capricorn|Aquarius|Pisces|Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpion|Sagittarius)\s+([\d.]+)\s+([\d.]+)/gi;
  let m;
  while ((m = re.exec(section)) !== null) {
    rows.push({
      bhav: parseInt(m[1]),
      sign: m[2],
      signIndex: SIGN_INDEX[m[2].toLowerCase()] ?? null,
      begin: parseFloat(m[3]),
      mid: parseFloat(m[4]),
    });
  }
  return rows;
}

/**  Varshaphal (Solar Return) chart details */
function parseVarshaphal(allText) {
  const idx = allText.search(/Varshaphal|Varshphal|Annual Predictions/i);
  if (idx === -1) return null;
  const section = allText.slice(idx, idx + 2000);

  const result = {};
  const yr = section.match(/Date of Birth[\s:]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (yr) result.solarReturnDate = yr[1];
  const lagna = section.match(/Lagna[\s:]+([A-Za-z]+)/i);
  if (lagna) result.lagna = lagna[1].trim();
  const nak = section.match(/Nakshatra[\s:]+([A-Za-z]+)/i);
  if (nak) result.nakshatra = nak[1].trim();

  return result;
}

// ──────────────────────────────────────────────────────────
//  STEP 3: MAIN PARSER — COMBINE ALL SECTIONS
// ──────────────────────────────────────────────────────────

export async function parseKundliPDF(file) {
  const pages = await extractTextFromPDF(file);
  const allText = pages.join('\n\n---PAGE---\n\n');

  const result = {
    source: 'AstroSage',
    uploadedAt: new Date().toISOString(),
    pageCount: pages.length,
    birthDetails: null,
    planets: null,
    ashtakvarga: null,
    vimshottari: [],
    pratyantar: [],
    sadesati: [],
    kpCusps: [],
    shadbala: null,
    chalit: [],
    varshaphal: null,
    confidence: {},
    rawTextLength: allText.length,
  };

  try { result.birthDetails = parseBasicDetails(allText); } catch (e) { console.warn('birthDetails parse error', e); }
  try { result.planets = parsePlanetaryPositions(allText); } catch (e) { console.warn('planets parse error', e); }
  try { result.ashtakvarga = parseAshtakvarga(allText); } catch (e) { console.warn('ashtakvarga parse error', e); }
  try { result.vimshottari = parseVimshottariDasha(allText); } catch (e) { console.warn('vimshottari parse error', e); }
  try { result.pratyantar = parsePratyantar(allText); } catch (e) { console.warn('pratyantar parse error', e); }
  try { result.sadesati = parseSadesati(allText); } catch (e) { console.warn('sadesati parse error', e); }
  try { result.kpCusps = parseKPCusps(allText); } catch (e) { console.warn('kpCusps parse error', e); }
  try { result.shadbala = parseShadbala(allText); } catch (e) { console.warn('shadbala parse error', e); }
  try { result.chalit = parseChalit(allText); } catch (e) { console.warn('chalit parse error', e); }
  try { result.varshaphal = parseVarshaphal(allText); } catch (e) { console.warn('varshaphal parse error', e); }

  // Compute confidence scores
  const planetCount = Object.keys(result.planets || {}).length;
  result.confidence = {
    planets: planetCount >= 9 ? 1.0 : planetCount / 10,
    ashtakvarga: result.ashtakvarga?.total?.length === 12 ? 1.0 : 0,
    vimshottari: result.vimshottari.length >= 5 ? 1.0 : result.vimshottari.length / 9,
    pratyantar: result.pratyantar.length >= 10 ? 1.0 : result.pratyantar.length / 40,
    sadesati: result.sadesati.length >= 3 ? 1.0 : 0,
    kpCusps: result.kpCusps.length === 12 ? 1.0 : result.kpCusps.length / 12,
    shadbala: result.shadbala ? 1.0 : 0,
    chalit: result.chalit.length === 12 ? 1.0 : result.chalit.length / 12,
  };

  const vals = Object.values(result.confidence);
  result.confidence.overall = vals.reduce((a, b) => a + b, 0) / vals.length;

  return result;
}

// ──────────────────────────────────────────────────────────
//  STEP 4: QUERY UTILITIES (used by App at runtime)
// ──────────────────────────────────────────────────────────

/** Get Ashtakvarga bindu score (0-8) for a planet transiting a given sign index */
export function getAshtakvargaBindu(pdfData, planetKey, signIndex) {
  if (!pdfData?.ashtakvarga?.byPlanet?.[planetKey]) return null;
  const idx = ((signIndex % 12) + 12) % 12;
  return pdfData.ashtakvarga.byPlanet[planetKey][idx] ?? null;
}

/** Get total Sarvashtakavarga score (0-56) for a sign */
export function getSarvashtakvargaScore(pdfData, signIndex) {
  if (!pdfData?.ashtakvarga?.total) return null;
  const idx = ((signIndex % 12) + 12) % 12;
  return pdfData.ashtakvarga.total[idx] ?? null;
}

/** Bindu label: 0-1 crisis, 2-3 challenging, 4 neutral, 5-6 supportive, 7-8 excellent */
export function binduLabel(score) {
  if (score === null || score === undefined) return null;
  if (score <= 1) return { label: 'Crisis', color: '#dc2626', stars: 1 };
  if (score <= 2) return { label: 'Difficult', color: '#ea580c', stars: 2 };
  if (score === 3) return { label: 'Challenging', color: '#d97706', stars: 3 };
  if (score === 4) return { label: 'Neutral', color: '#ca8a04', stars: 4 };
  if (score <= 5) return { label: 'Supportive', color: '#16a34a', stars: 5 };
  if (score <= 6) return { label: 'Strong', color: '#0891b2', stars: 6 };
  return { label: 'Excellent', color: '#7c3aed', stars: score };
}

/** Get active Pratyantar for a given Date */
export function getActivePratyantar(pdfData, date) {
  if (!pdfData?.pratyantar?.length) return null;
  const t = date.getTime();
  for (const block of pdfData.pratyantar) {
    if (!block.startDate || !block.endDate) continue;
    if (t >= block.startDate.getTime() && t <= block.endDate.getTime()) {
      // Find active pratyantar within block
      let prevEnd = block.startDate;
      for (const pr of block.pratantars) {
        if (!pr.endDate) continue;
        if (t <= pr.endDate.getTime()) {
          return {
            maha: block.maha,
            antar: block.antar,
            pratantar: pr.lord,
            startDate: prevEnd,
            endDate: pr.endDate,
            blockStartDate: block.startDate,
            blockEndDate: block.endDate,
          };
        }
        prevEnd = pr.endDate;
      }
    }
  }
  return null;
}

/** Get active Sadesati phase for a given Date */
export function getActiveSadesati(pdfData, date) {
  if (!pdfData?.sadesati?.length) return null;
  const t = date.getTime();
  for (const period of pdfData.sadesati) {
    if (!period.startDate || !period.endDate) continue;
    if (t >= period.startDate.getTime() && t <= period.endDate.getTime()) {
      return period;
    }
  }
  return null;
}

/** Shadbala strength label */
export function shadbalLabel(pdfData, planetKey) {
  if (!pdfData?.shadbala?.[planetKey]) return null;
  const val = pdfData.shadbala[planetKey];
  const min = pdfData.shadbala._minimum?.[planetKey] || 5;
  const ratio = val / min;
  if (ratio >= 1.4) return { label: 'Very Strong', val, color: '#7c3aed' };
  if (ratio >= 1.1) return { label: 'Strong', val, color: '#16a34a' };
  if (ratio >= 0.9) return { label: 'Average', val, color: '#ca8a04' };
  return { label: 'Weak', val, color: '#dc2626' };
}

/** Summary of what was successfully extracted */
export function getPDFDataSummary(pdfData) {
  if (!pdfData) return [];
  return [
    { key: 'planets', label: 'Planetary Positions', available: Object.keys(pdfData.planets || {}).length >= 9, count: Object.keys(pdfData.planets || {}).length + ' planets' },
    { key: 'ashtakvarga', label: 'Ashtakvarga Bindus', available: !!pdfData.ashtakvarga?.total, count: pdfData.ashtakvarga ? '7 planets x 12 signs' : '' },
    { key: 'vimshottari', label: 'Vimshottari Dasha', available: pdfData.vimshottari?.length >= 5, count: pdfData.vimshottari?.length + ' Mahadashas' },
    { key: 'pratyantar', label: 'Pratyantar (3rd Level)', available: pdfData.pratyantar?.length >= 10, count: pdfData.pratyantar?.length + ' blocks' },
    { key: 'sadesati', label: 'Sadesati Timeline', available: pdfData.sadesati?.length >= 2, count: pdfData.sadesati?.length + ' periods' },
    { key: 'kpCusps', label: 'KP Cuspal Positions', available: pdfData.kpCusps?.length === 12, count: pdfData.kpCusps?.length + ' cusps' },
    { key: 'shadbala', label: 'Shadbala Strength', available: !!pdfData.shadbala, count: pdfData.shadbala ? '7 planets scored' : '' },
    { key: 'chalit', label: 'Chalit Bhav Cusps', available: pdfData.chalit?.length >= 10, count: pdfData.chalit?.length + ' bhavas' },
  ];
}
