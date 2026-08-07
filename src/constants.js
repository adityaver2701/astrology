// ── Shared UI constants (extracted from App.jsx) ──────────────────────────

// Orbital periods (days). Negative = retrograde (Rahu/Ketu).
export const PLANET_PERIODS_DAYS = {
  sun: 365.25, moon: 27.32, mercury: 87.97, venus: 224.7,
  mars: 686.97, jupiter: 4332.59, saturn: 10759.22,
  rahu: -6793.5, ketu: -6793.5,
};

// Planet abbreviations matching Astro-Sage
export const PLANET_ABBRS = {
  sun: 'Su',
  moon: 'Mo',
  mercury: 'Me',
  venus: 'Ve',
  mars: 'Ma',
  jupiter: 'Ju',
  saturn: 'Sa',
  rahu: 'Ra',
  ketu: 'Ke'
};

// Profile avatar color palette
export const PROFILE_COLORS = [
  '#ca8a04', '#7c3aed', '#0891b2', '#16a34a',
  '#dc2626', '#ea580c', '#4f46e5', '#be185d',
  '#0d9488', '#92400e'
];

// Neutral starting birth details for a fresh account (no hardcoded person).
export const DEFAULT_BIRTH = {
  name: '',
  date: '2000-01-01',
  time: '12:00',
  placeName: 'New Delhi, Delhi, India',
  latitude: 28.6139,
  longitude: 77.2090,
  timezone: 5.5,
};

// Accounts that may see admin-only settings (Cloud Sync configuration).
// Configurable via VITE_ADMIN_EMAILS (comma-separated); defaults to the owner.
export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || 'penetacle@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Planet long name helper
export const PLANET_NAMES = {
  sun: 'Sun (Surya)',
  moon: 'Moon (Chandra)',
  mercury: 'Mercury (Budha)',
  venus: 'Venus (Shukra)',
  mars: 'Mars (Mangal)',
  jupiter: 'Jupiter (Guru)',
  saturn: 'Saturn (Shani)',
  rahu: 'Rahu (North Node)',
  ketu: 'Ketu (South Node)'
};

// Tab navigation config (icons + descriptions; keys 1-8 jump between tabs).
//
// `short` is the label used by the mobile bottom bar, where there is room for
// roughly 10 characters under an icon — the full `label` wraps to three lines
// and becomes unreadable at that size.
//
// `primary: true` marks the four tabs pinned to the bottom bar on phones. The
// rest live behind the "More" sheet. Exactly four must be primary: with the
// More button that fills a five-slot bar, which is the most Android can show
// without the targets dropping under the 48dp minimum.
export const TABS = [
  { id: 'birth-chart',         icon: '☉', short: 'Chart',    primary: true,  label: 'Birth Details & Trik Bhava',    desc: 'Natal planet positions, dignities, nakshatras and karmic 6-8-12 house analysis.' },
  { id: 'interactive-chart',   icon: '◈', short: 'Kundali',  primary: true,  label: 'Interactive Kundali',            desc: 'North-Indian chart with live transit overlay — drag planets or scrub the timeline.' },
  { id: 'historical-transits', icon: '↺', short: 'History',  primary: false, label: 'Historical Transits (50 Yr)',    desc: 'Scan five decades of a planet’s sign ingresses through your houses.' },
  { id: 'predictions',         icon: '✦', short: 'Events',   primary: true,  label: 'Life Events Matcher',            desc: 'Match logged life events to transit signatures and project future reoccurrences.' },
  { id: 'alignment-transits',  icon: '✧', short: 'Degrees',  primary: false, label: 'Degree & Nakshatra Transits',    desc: 'Exact-degree and nakshatra alignment windows over your natal points.' },
  { id: 'dasha-system',        icon: '☽', short: 'Dasha',    primary: true,  label: 'Vimshottari Dasha',              desc: 'Full Mahadasha → Antardasha → Pratyantar timeline from your Moon nakshatra.' },
  { id: 'panchanga',           icon: '🗓', short: 'Panchanga', primary: false, label: 'Panchanga',                     desc: 'Tithi, vara, nakshatra, yoga and karana for any date — the five limbs of the Vedic day.' },
  { id: 'compatibility',       icon: '♡', short: 'Match',    primary: false, label: 'Compatibility',                  desc: 'Ashtakoota (36-guna) matching between any two saved profiles.' },
];

/** The four tabs pinned to the mobile bottom bar. */
export const PRIMARY_TABS = TABS.filter(t => t.primary);
/** Everything else — shown in the "More" sheet. */
export const SECONDARY_TABS = TABS.filter(t => !t.primary);

// Helper: format degrees to standard zodiac degrees minutes (e.g. 14°25')
export const formatDegrees = (deg) => {
  const d = Math.floor(deg);
  const m = Math.floor((deg - d) * 60);
  return `${d}°${m.toString().padStart(2, '0')}'`;
};
