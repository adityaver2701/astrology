import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import {
  calculatePlanets,
  calculateAscendantLongitude,
  getJulianDate,
  getHouseFromLagna,
  scanPlanetTransits,
  matchLifeEventTransits,
  predictFutureReoccurrences,
  analyzeTrikBhavaNatal,
  SIGNS,
  NAKSHATRAS,
  scanDegreeAlignments,
  analyzePeakDateAlignments,
  calculateVimshottariDasha,
  getCurrentDasha,
  DASHA_YEARS,
  getPlanetDignity,
  enhanceTransitWithPDFData,
  getAccuracyProfile,
  binduLabel,
  getActivePratyantar,
  getActiveSadesati,
  shadbalLabel,
  getPDFDataSummary,
} from './astrologyEngine';
import {
  getSyncConfig, setSyncConfig, clearSyncConfig, isSupabaseConfigured,
  cloudLoad, cloudSave, testConnection,
  signOut, getSession, onAuthChange,
  uploadReport, getReportUrl, deleteReport,
} from './cloudSync';
import AuthScreen from './AuthScreen';
import AIReading from './AIReading';
import GuideTour from './GuideTour';
import AdminDashboard from './AdminDashboard';
import { VARGAS, buildVargaChart } from './vargas';
// pdfParser is only loaded dynamically on PDF upload — never part of the static bundle

// Orbital periods (days). Negative = retrograde (Rahu/Ketu).
const PLANET_PERIODS_DAYS = {
  sun: 365.25, moon: 27.32, mercury: 87.97, venus: 224.7,
  mars: 686.97, jupiter: 4332.59, saturn: 10759.22,
  rahu: -6793.5, ketu: -6793.5,
};

// Planet abbreviations matching Astro-Sage
const PLANET_ABBRS = {
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
const PROFILE_COLORS = [
  '#ca8a04', '#7c3aed', '#0891b2', '#16a34a',
  '#dc2626', '#ea580c', '#4f46e5', '#be185d',
  '#0d9488', '#92400e'
];

// Neutral starting birth details for a fresh account (no hardcoded person).
const DEFAULT_BIRTH = {
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
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || 'penetacle@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Planet long name helper
const PLANET_NAMES = {
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

// Tab navigation config (icons + descriptions; keys 1-6 jump between tabs)
const TABS = [
  { id: 'birth-chart',         icon: '☉', label: 'Birth Details & Trik Bhava',    desc: 'Natal planet positions, dignities, nakshatras and karmic 6-8-12 house analysis.' },
  { id: 'interactive-chart',   icon: '◈', label: 'Interactive Kundali',            desc: 'North-Indian chart with live transit overlay — drag planets or scrub the timeline.' },
  { id: 'historical-transits', icon: '↺', label: 'Historical Transits (50 Yr)',    desc: 'Scan five decades of a planet’s sign ingresses through your houses.' },
  { id: 'predictions',         icon: '✦', label: 'Life Events Matcher',            desc: 'Match logged life events to transit signatures and project future reoccurrences.' },
  { id: 'alignment-transits',  icon: '✧', label: 'Degree & Nakshatra Transits',    desc: 'Exact-degree and nakshatra alignment windows over your natal points.' },
  { id: 'dasha-system',        icon: '☽', label: 'Vimshottari Dasha',              desc: 'Full Mahadasha → Antardasha → Pratyantar timeline from your Moon nakshatra.' },
];

// Lord placements interpretations database
const DUSTHANA_INTERPRETATIONS = {
  lord6: {
    1: 'The 6th Lord is in the 1st House. Challenges, adversaries, or health struggles are deeply intertwined with your personality and self-growth. In accordance with Brihat Parashara Hora Shastra, this is a warrior placement. You are meant to overcome obstacles through direct personal struggle. Pandit Krishna Ashant teaches that this placement creates a persistent feeling of having to fight for your identity, forcing you to develop unmatched courage, resilience, and service-oriented consciousness.',
    2: 'The 6th Lord is in the 2nd House. Financial resources, family relations, and speech might be sources of conflict or debt. However, you will learn to manage finances with absolute precision. Krishna Ashant notes a karmic pattern of having to constantly clean up or organize family resources, which ultimately grants you financial prudence and strategic mastery over material resources.',
    3: 'The 6th Lord is in the 3rd House. Your courage, communication, and relationships with siblings are activated by struggles. It indicates a sharp, defensive mind. You excel in debates or technical skills. Krishna Ashant details that this placement requires you to channel your mental anxiety into writing, speaking, or manual skills, transforming nervous energy into artistic or analytical execution.',
    4: 'The 6th Lord is in the 4th House. Inner happiness, mother, and home environment are affected by conflicts or responsibilities. You may feel a domestic burden. However, this teaches emotional discipline. Under Pandit Krishna Ashant\'s teachings, the 4th house represents the inner sanctuary. Having the 6th lord here indicates that your home is a place of service, teaching you to find peace within rather than relying on external comforts.',
    5: 'The 6th Lord is in the 5th House. Children, romance, and intelligence are colored by obstacles. Speculative investments should be made with extreme caution. But your critical thinking and analytical intelligence are highly developed. Krishna Ashant points out that this placement demands you to guide others through their problems, turning your intellectual struggles into counseling wisdom.',
    6: 'The 6th Lord is in the 6th House. This forms Harsha Vipareeta Raja Yoga! It gives you a robust constitution, immunity to diseases, and the capacity to effortlessly conquer your competitors. Your struggles become the source of your greatest strength. In accordance with Pandit Krishna Ashant, you possess a natural psychological armor that converts friction into direct power, succeeding where others fall.',
    7: 'The 6th Lord is in the 7th House. Partnerships and marriage involve disputes, duties, or health adjustments. You might marry someone in the medical, legal, or service professions. Krishna Ashant points out a projection of the shadow self onto the partner. The relationship is a karmic classroom, teaching you to resolve conflicts through selfless compromise and absolute honesty.',
    8: 'The 6th Lord is in the 8th House. This forms a Vipareeta Raja Yoga (Harsha Yoga variant). Sudden transformations, hidden knowledge, and longevity are highlighted. It gives capacity to resolve complex crises. Krishna Ashant describes this as a path of psychological alchemy: you must face hidden fears, debts, or secrets, finding power through total surrender and regeneration.',
    9: 'The 6th Lord is in the 9th House. Religious beliefs, higher education, and relations with father or mentors have obstacles. You may question dogmas. Krishna Ashant notes that you are meant to find your own truth through trial and error, transforming your philosophical doubts into personal, experiential wisdom.',
    10: 'The 6th Lord is in the 10th House. Career path involves service, healing, resolving conflicts, or working in competitive environments. You will rise to power by solving others\' problems. Krishna Ashant suggests that your public life is dedicated to fighting obstacles, making you a natural counselor, manager, or legal/medical expert.',
    11: 'The 6th Lord is in the 11th House. Gains and friendships might come through competitive endeavors, litigation, or health services. You may face friction with elder siblings or groups. Krishna Ashant notes that you must learn to cooperate and use your critical mind to build networks that benefit the marginalized, rather than focusing solely on personal gains.',
    12: 'The 6th Lord is in the 12th House. This forms Vipareeta Raja Yoga! It converts expenses and isolation into spiritual breakthroughs. You overcome hidden enemies by ignoring them. Krishna Ashant explains that your karmic struggles are dissolved in the subconscious, making you a master of psychological release and silent endurance.'
  },
  lord8: {
    1: 'The 8th Lord is in the 1st House. Your life is marked by profound transformations, sudden changes, and deep interest in hidden or occult matters. You have a magnetic, mysterious personality. Krishna Ashant teaches that you must undergo periodic "ego deaths" and rebuild yourself from the ashes. Your identity is a canvas of constant rebirth.',
    2: 'The 8th Lord is in the 2nd House. Financial fluctuations, sudden gains, or occult wealth are indicated. Speech is powerful and revealing. Krishna Ashant notes that you must learn to value spiritual assets over material attachments, as sudden transformations will teach you that true security lies within.',
    3: 'The 8th Lord is in the 3rd House. Your communication, writing, and hands-on skills are deeply analytical and investigative. You may uncover secrets or research deeply. Krishna Ashant points out that your mind is drawn to taboos, demanding that you use your intellect to bring hidden truths to light.',
    4: 'The 8th Lord is in the 4th House. Sudden changes in domestic life or real estate are indicated. Mother\'s life has sudden phases. You have deep intuition and interest in esoteric history. Krishna Ashant explains that your emotional foundation is anchored in the unseen, requiring you to heal inherited family trauma.',
    5: 'The 8th Lord is in the 5th House. Deep intuition, interest in mantras, tantra, or creative occult projects. Romance has intense, transformative phases. Krishna Ashant details that your creative power is linked to the subconscious, letting you manifest deep, symbolic art or wisdom.',
    6: 'The 8th Lord is in the 6th House. This forms Sarala Vipareeta Raja Yoga! It gives you the power to withstand crises, defeat chronic diseases, and turn sudden attacks by enemies to your advantage. Krishna Ashant notes that you are a spiritual alchemist, transforming crises into personal resilience.',
    7: 'The 8th Lord is in the 7th House. Marital life or partnerships undergo intense transitions, transformations, or involve hidden factors. Your partner may be deeply mystical or wealthy. Krishna Ashant suggests that relationships force you to confront your shadow, teaching you intimacy through complete vulnerability.',
    8: 'The 8th Lord is in the 8th House. This forms a powerful Sarala Vipareeta Raja Yoga! It yields immense longevity, psychic intuition, and mastery over occult sciences. You are comfortable with death and changes. Krishna Ashant states that you are a natural keeper of secrets, carrying an unshakeable presence that calms others in times of crisis.',
    9: 'The 8th Lord is in the 9th House. Sudden changes in belief systems, foreign travels, or philosophical views. Relationship with father/mentors has transformative phases. Krishna Ashant notes that your spiritual journey is a path of dramatic revelations, teaching you to seek truth beyond dogma.',
    10: 'The 8th Lord is in the 10th House. Your career is characterized by research, investigation, handling secrets, or sudden shifts. You might excel in crisis management. Krishna Ashant indicates that your professional role is to manage transformation, guiding organizations or individuals through rebirth.',
    11: 'The 8th Lord is in the 11th House. Sudden gains, inheritance, or wealth from occult or hidden sources. Friction in friendships but deep, select networks. Krishna Ashant notes that you must use your resources to support occult sciences or collective transformation, aligning your gains with higher spiritual plans.',
    12: 'The 8th Lord is in the 12th House. This forms Vipareeta Raja Yoga! Deep psychic abilities, dream travel, interest in moksha (spiritual liberation), and foreign connections. Krishna Ashant explains that your subconscious is a wellspring of ancient wisdom, letting you dissolve karmic debts through meditation.'
  },
  lord12: {
    1: 'The 12th Lord is in the 1st House. You are naturally introspective, private, and drawn to foreign lands or isolation. You have a dreamlike, ethereal quality. Krishna Ashant notes that your physical energy is linked to the sub-conscious; you require regular solitude to recharge your life force.',
    2: 'The 12th Lord is in the 2nd House. Expenditures on family, voice, or food are indicated. You may earn from foreign resources or charity. Krishna Ashant warns of speech that may lead to losses, advising you to practice silence and speak only absolute truth.',
    3: 'The 12th Lord is in the 3rd House. Your communication is intuitive, poetic, or spiritual. Siblings may move to foreign lands. Krishna Ashant explains that your writing or hands-on work has a meditative quality, serving as a medium for subconscious expression.',
    4: 'The 12th Lord is in the 4th House. Relocation to a foreign country or living in a secluded place. Mother is spiritually inclined. Krishna Ashant notes that you may feel a sense of displacement, which is a call to realize that your true home is within the divine presence.',
    5: 'The 12th Lord is in the 5th House. Deep spiritual wisdom, meditation, and creative isolation. Speculative risks should be avoided. Krishna Ashant suggests that your children may be highly spiritual or live abroad, and your intelligence is guided by intuitive downloads.',
    6: 'The 12th Lord is in the 6th House. This forms Vimala Vipareeta Raja Yoga! It guards you against major financial debts, translates expenditures into charitable deeds, and neutralizes daily stressors. Krishna Ashant points out that you possess the unique ability to work tirelessly behind the scenes without seeking ego validation.',
    7: 'The 12th Lord is in the 7th House. Marital life involves spiritual connections or periods of physical distance. Partner may be of foreign origin or highly detached. Krishna Ashant suggests that you learn the lesson of unconditional love, letting go of personal expectations in relationships.',
    8: 'The 12th Lord is in the 8th House. This forms a Vipareeta Raja Yoga (Vimala Yoga variant). Deep mystical experiences, interest in astral travel, dream analysis, and secrets. Krishna Ashant details that you have the power to dissolve psychological trauma through spiritual surrender and retreat.',
    9: 'The 12th Lord is in the 9th House. Traveling to distant lands for spiritual pilgrimages, studying esoteric philosophies, and detachment from dogmatic beliefs. Krishna Ashant explains that your gurus are found in dreams or silent contemplation, guiding you to a path of absolute freedom.',
    10: 'The 12th Lord is in the 10th House. Working in hospitals, prisons, ashrams, charities, or multinational corporations. You work best in seclusion or behind the scenes. Krishna Ashant suggests that your career is a form of spiritual service, where you spend energy to liberate others.',
    11: 'The 12th Lord is in the 11th House. Spending money on philanthropic networks, foreign travels, or spiritual groups. Gains are unpredictable but spiritual networks are strong. Krishna Ashant warns against superficial associations, recommending you seek friendships that elevate your consciousness.',
    12: 'The 12th Lord is in the 12th House. This forms Vimala Vipareeta Raja Yoga! Highly spiritual placement indicating profound meditation, peaceful sleep, astral journeys, and preparation for Moksha. Krishna Ashant describes this as a soul that is packing its bags, having realized the impermanence of the physical world.'
  }
};

// Built-in CSV Parser (RFC 4180 compliant)
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let insideQuote = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

// Smart Category Classifier based on event context keywords
function classifyCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('marry') || text.includes('marriage') || text.includes('wife') || text.includes('husband') || text.includes('love') || text.includes('relationship') || text.includes('conson') || text.includes('honeymoon') || text.includes('son') || text.includes('daughter') || text.includes('child') || text.includes('family') || text.includes('parents') || text.includes('brother')) {
    return 'Relationship';
  }
  if (text.includes('spiritual') || text.includes('yoga') || text.includes('guru') || text.includes('meditation') || text.includes('occult') || text.includes('temple') || text.includes('religious') || text.includes('gayatri') || text.includes('sahaja')) {
    return 'Spiritual';
  }
  if (text.includes('travel') || text.includes('relocation') || text.includes('moved') || text.includes('shifted') || text.includes('hometown') || text.includes('pg') || text.includes('rented house') || text.includes('bangalore') || text.includes('pune') || text.includes('hyderabad') || text.includes('uk') || text.includes('paris') || text.includes('switzerland') || text.includes('italy') || text.includes('kashmir')) {
    return 'Travel';
  }
  if (text.includes('health') || text.includes('surgery') || text.includes('kidney') || text.includes('illness') || text.includes('chickenpox') || text.includes('hospital') || text.includes('diseases') || text.includes('accident') || text.includes('sick')) {
    return 'Health';
  }
  if (text.includes('finance') || text.includes('financial') || text.includes('debt') || text.includes('money') || text.includes('savings') || text.includes('donation') || text.includes('loss') || text.includes('jobless') || text.includes('without money') || text.includes('hike') || text.includes('salary')) {
    return 'Finance';
  }
  if (text.includes('job') || text.includes('work') || text.includes('office') || text.includes('boss') || text.includes('company') || text.includes('promotion') || text.includes('mca') || text.includes('degree') || text.includes('graduation') || text.includes('school') || text.includes('college') || text.includes('study') || text.includes('architect') || text.includes('engineer') || text.includes('specialist') || text.includes('consultant')) {
    return 'Career';
  }
  
  return 'Career'; // default
}

// Smart Date Range Parser
function parseEventDates(yearStr) {
  const months = {
    january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
    dec: 11, december: 11
  };

  const cleanStr = yearStr.trim().toLowerCase().replace(/\s+/g, ' ');

  // Split by dash/en-dash/em-dash or raw "to" or "–"
  const parts = cleanStr.split(/[\u2013\u2014-]|to/).map(p => p.trim());

  function parseSingleDateStr(str) {
    if (!str) return null;
    // Check for month and year, e.g. "march 2000"
    const wordMatch = str.match(/([a-z]+)\s+(\d{4})/);
    if (wordMatch) {
      const mName = wordMatch[1];
      const yNum = parseInt(wordMatch[2]);
      if (months[mName] !== undefined) {
        return { year: yNum, month: months[mName] };
      }
    }
    // Check for year only, e.g. "2000"
    const yearMatch = str.match(/\b(\d{4})\b/);
    if (yearMatch) {
      return { year: parseInt(yearMatch[1]), month: null };
    }
    return null;
  }

  if (parts.length === 2) {
    const startInfo = parseSingleDateStr(parts[0]);
    const endInfo = parseSingleDateStr(parts[1]);
    
    let startDate;
    let endDate;

    if (startInfo) {
      if (startInfo.month !== null) {
        const m = (startInfo.month + 1).toString().padStart(2, '0');
        startDate = `${startInfo.year}-${m}-01`;
      } else {
        startDate = `${startInfo.year}-01-01`;
      }
    } else {
      startDate = '2000-01-01';
    }
    
    if (endInfo) {
      if (endInfo.month !== null) {
        const m = (endInfo.month + 1).toString().padStart(2, '0');
        const lastDay = new Date(endInfo.year, endInfo.month + 1, 0).getDate();
        endDate = `${endInfo.year}-${m}-${lastDay.toString().padStart(2, '0')}`;
      } else {
        endDate = `${endInfo.year}-12-31`;
      }
    } else if (startInfo) {
      endDate = `${startInfo.year}-12-31`;
    } else {
      endDate = '2000-12-31';
    }
    return { startDate, endDate };
  } else {
    const info = parseSingleDateStr(cleanStr);
    if (info) {
      if (info.month !== null) {
        const m = (info.month + 1).toString().padStart(2, '0');
        const lastDay = new Date(info.year, info.month + 1, 0).getDate();
        return {
          startDate: `${info.year}-${m}-01`,
          endDate: `${info.year}-${m}-${lastDay.toString().padStart(2, '0')}`
        };
      } else {
        return {
          startDate: `${info.year}-01-01`,
          endDate: `${info.year}-12-31`
        };
      }
    }
  }
  return { startDate: '2000-01-01', endDate: '2000-12-31' };
}

function App() {
  const [activeTab, setActiveTab] = useState('birth-chart');

  // Theme (light = Celestial Gold, dark = Midnight Sky)
  const [theme, setTheme] = useState(() => localStorage.getItem('astro_theme') || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('astro_theme', theme);
  }, [theme]);

  // Keyboard shortcuts: 1-6 switch tabs (ignored while typing)
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < TABS.length) setActiveTab(TABS[idx].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Back-to-top button visibility
  const [showTopBtn, setShowTopBtn] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Birth Details State
  const [birthDetails, setBirthDetails] = useState(() => {
    const saved = localStorage.getItem('astro_birth_details');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return { ...DEFAULT_BIRTH };
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [geocodingLoading, setGeocodingLoading] = useState(false);
  const [geocodingError, setGeocodingError] = useState('');

  // Natal Chart Output State
  const [natalChart, setNatalChart] = useState(null);
  const [trikBhavaAnalysis, setTrikBhavaAnalysis] = useState(null);

  // Transit Date Selector State (real-time scrubbing)
  const [transitDateInput, setTransitDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [transitTimeInput, setTransitTimeInput] = useState('12:00');
  const [showNakshatras, setShowNakshatras] = useState(true);

  // Transit drag-to-scrub state
  const [transitDragInfo, setTransitDragInfo] = useState(null); // { planetId, startAngle, startDateMs }
  const transitSvgRef = useRef(null);

  // Historical Transits Timeline State
  const [selectedTransitPlanet, setSelectedTransitPlanet] = useState('saturn');
  const [historicalTransits, setHistoricalTransits] = useState([]);
  const [scanningTransits, setScanningTransits] = useState(false);

  // Life Events Log
  const [lifeEvents, setLifeEvents] = useState(() => {
    const saved = localStorage.getItem('astro_life_events');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      { id: 1, name: 'Career Milestone / Graduation', startDate: '2017-06-01', endDate: '2017-07-31', category: 'Career' },
      { id: 2, name: 'Major Geographic Relocation', startDate: '2021-09-10', endDate: '2021-10-25', category: 'Travel' }
    ];
  });
  const [newEvent, setNewEvent] = useState({ name: '', startDate: '', endDate: '', category: 'Career' });

  // CSV Importer States
  const [csvPreviewEvents, setCsvPreviewEvents] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [csvError, setCsvError] = useState('');
  
  // Predictions output
  const [predictionResults, setPredictionResults] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [predicting, setPredicting] = useState(false);

  // Alignment Scanner States
  const [degreeAlignments, setDegreeAlignments] = useState([]);
  const [scanningAlignments, setScanningAlignments] = useState(false);
  const [hasScannedAlignments, setHasScannedAlignments] = useState(false);

  // Vimshottari Dasha State
  const [dashaData, setDashaData] = useState(null);
  const [expandedDasha, setExpandedDasha] = useState(null);

  // Birth & Location Profile collapse state
  const [birthFormCollapsed, setBirthFormCollapsed] = useState(true);

  // Predictions tab collapse states (default collapsed so report is front-and-centre)
  const [eventsListOpen, setEventsListOpen] = useState(false);
  const [addEventFormOpen, setAddEventFormOpen] = useState(false);

  // Auto-scan: all-events merged timeline.
  // autoMatchesKey records which (birthDetails, lifeEvents) snapshot the current
  // autoMatches were computed for — "computed"/"loading" are derived from it,
  // so no reset effect is needed when the inputs change.
  const [autoMatches, setAutoMatches] = useState([]);
  const [autoMatchesKey, setAutoMatchesKey] = useState(null);
  const [expandedAutoMatch, setExpandedAutoMatch] = useState(null);

  // Saved Profiles & Predictions states
  const [savedProfiles, setSavedProfiles] = useState(() => {
    const saved = localStorage.getItem('astro_saved_profiles');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeProfileId, setActiveProfileId] = useState(() => {
    const v = localStorage.getItem('astro_active_profile_id');
    return v ? parseInt(v) : null;
  });
  const [showProfileManager, setShowProfileManager] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', color: PROFILE_COLORS[0], notes: '' });
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [savedPredictions, setSavedPredictions] = useState(() => {
    const saved = localStorage.getItem('astro_saved_predictions');
    return saved ? JSON.parse(saved) : [];
  });
  const [predictionSaveNameInput, setPredictionSaveNameInput] = useState('');

  // PDF parsing state
  const [parsingPDFForProfile, setParsingPDFForProfile] = useState(null); // profileId being parsed
  const [pdfParseError, setPdfParseError] = useState('');

  // Persist memory states
  useEffect(() => {
    localStorage.setItem('astro_saved_profiles', JSON.stringify(savedProfiles));
  }, [savedProfiles]);

  useEffect(() => {
    localStorage.setItem('astro_saved_predictions', JSON.stringify(savedPredictions));
  }, [savedPredictions]);

  // ── Cloud Sync (Supabase) ──────────────────────────────────────────────
  // 'off' = not configured · 'loading' = pulling on startup · 'synced' = up to date
  // 'saving' = push in flight/debounced · 'error' = last operation failed
  const [syncStatus, setSyncStatus] = useState(() => (getSyncConfig() ? 'loading' : 'off'));
  const [syncError, setSyncError] = useState('');
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [syncForm, setSyncForm] = useState(() => {
    const cfg = getSyncConfig();
    return { url: cfg?.url || '', anonKey: cfg?.anonKey || '' };
  });
  const [syncConnecting, setSyncConnecting] = useState(false);
  const cloudReadyRef = useRef(false);      // gates pushes until the startup pull completes
  const lastPushedJsonRef = useRef(null);   // avoids re-pushing identical data
  const syncTimerRef = useRef(null);

  // ── Auth (Supabase) ────────────────────────────────────────────────────
  // session: undefined = still checking · null = signed out · object = signed in
  const authConfigured = isSupabaseConfigured();
  const [session, setSession] = useState(() => (authConfigured ? undefined : null));
  const [showUserMenu, setShowUserMenu] = useState(false);
  const user = session?.user || null;
  const isAdmin = !!user && ADMIN_EMAILS.includes((user.email || '').toLowerCase());

  // Initialise session from persisted storage and subscribe to changes.
  useEffect(() => {
    if (!authConfigured) return;
    let unsub = () => {};
    (async () => {
      try {
        const s = await getSession();
        setSession(s);
      } catch {
        setSession(null);
      }
      unsub = onAuthChange((_event, s2) => setSession(s2));
    })();
    return () => unsub();
  }, [authConfigured]);

  // Reset all in-memory + cached data (used on sign-out and fresh accounts so
  // one user's data never lingers for the next on a shared browser).
  const resetLocalData = useCallback(() => {
    setSavedProfiles([]);
    setSavedPredictions([]);
    setLifeEvents([]);
    setActiveProfileId(null);
    setBirthDetails({ ...DEFAULT_BIRTH });
    setPredictionResults(null);
    setSelectedEventId(null);
    setDegreeAlignments([]);
    setHasScannedAlignments(false);
    setHistoricalTransits([]);
    ['astro_active_profile_id', 'astro_saved_profiles', 'astro_saved_predictions',
     'astro_birth_details', 'astro_life_events'].forEach(k => localStorage.removeItem(k));
  }, []);

  const handleSignOut = useCallback(async () => {
    setShowUserMenu(false);
    cloudReadyRef.current = false;
    lastPushedJsonRef.current = null;
    try { await signOut(); } catch (e) { console.error('sign out', e); }
    resetLocalData();
    setSyncStatus('off');
  }, [resetLocalData]);

  // ── First-run guided tour ──────────────────────────────────────────────
  const [showGuide, setShowGuide] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [zoomId, setZoomId] = useState(null); // id of chart shown enlarged
  const guideKey = user ? `astro_guide_seen_${user.id}` : null;

  // Auto-open the guide the first time each user signs in.
  useEffect(() => {
    if (!user || !guideKey) return;
    if (!localStorage.getItem(guideKey)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowGuide(true);
    }
  }, [user, guideKey]);

  const markGuideSeen = useCallback(() => {
    if (guideKey) localStorage.setItem(guideKey, '1');
  }, [guideKey]);

  const closeGuide = useCallback(() => { markGuideSeen(); setShowGuide(false); }, [markGuideSeen]);
  const finishGuide = useCallback(() => {
    markGuideSeen();
    setShowGuide(false);
    setBirthFormCollapsed(false); // open the Birth & Location Profile so they can start
  }, [markGuideSeen]);

  // Fixed-key-order serialization for change detection (jsonb reorders keys)
  const canonicalBundleJson = (d) => JSON.stringify({
    version: 1,
    savedProfiles: d.savedProfiles,
    savedPredictions: d.savedPredictions,
    activeProfileId: d.activeProfileId,
    birthDetails: d.birthDetails,
    lifeEvents: d.lifeEvents
  });

  const applyCloudBundle = useCallback((d) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d.savedProfiles)) setSavedProfiles(d.savedProfiles);
    if (Array.isArray(d.savedPredictions)) setSavedPredictions(d.savedPredictions);
    if (Array.isArray(d.lifeEvents)) setLifeEvents(d.lifeEvents);
    if (d.birthDetails && d.birthDetails.date) setBirthDetails(d.birthDetails);
    if (d.activeProfileId !== undefined && d.activeProfileId !== null) {
      setActiveProfileId(d.activeProfileId);
      localStorage.setItem('astro_active_profile_id', String(d.activeProfileId));
    }
  }, []);

  // Per-user startup pull: when a user signs in, load THEIR row (cloud wins).
  // A fresh account starts empty. Runs again whenever the signed-in user changes.
  useEffect(() => {
    if (!authConfigured) return;
    if (session === undefined) return;        // auth still resolving
    if (!user) {                              // signed out
      cloudReadyRef.current = false;
      lastPushedJsonRef.current = null;
      return;
    }
    let cancelled = false;
    cloudReadyRef.current = false;
    (async () => {
      setSyncStatus('loading');
      try {
        const row = await cloudLoad();
        if (cancelled) return;
        if (row && row.data) {
          applyCloudBundle(row.data);
          lastPushedJsonRef.current = canonicalBundleJson(row.data);
        } else {
          // Fresh account: start clean and seed an empty bundle for this user.
          resetLocalData();
          const bundle = {
            version: 1, savedProfiles: [], savedPredictions: [], activeProfileId: null,
            birthDetails: { ...DEFAULT_BIRTH }, lifeEvents: [], savedAt: new Date().toISOString()
          };
          await cloudSave(bundle);
          lastPushedJsonRef.current = canonicalBundleJson(bundle);
        }
        setSyncStatus('synced');
        setSyncError('');
      } catch (err) {
        if (cancelled) return;
        console.error('Cloud sync load error', err);
        setSyncStatus('error');
        setSyncError(err.message || 'Could not reach cloud');
      } finally {
        if (!cancelled) cloudReadyRef.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, session === undefined]);

  // Auto-save: debounced push of the full bundle whenever synced data changes.
  useEffect(() => {
    if (!user || !cloudReadyRef.current) return;
    const bundle = {
      version: 1,
      savedProfiles,
      savedPredictions,
      activeProfileId,
      birthDetails,
      lifeEvents,
      savedAt: new Date().toISOString()
    };
    const json = canonicalBundleJson(bundle);
    if (json === lastPushedJsonRef.current) return;
    setSyncStatus('saving');
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        await cloudSave(bundle);
        lastPushedJsonRef.current = json;
        setSyncStatus('synced');
        setSyncError('');
      } catch (err) {
        console.error('Cloud sync save error', err);
        setSyncStatus('error');
        setSyncError(err.message || 'Could not save to cloud');
      }
    }, 1500);
    return () => clearTimeout(syncTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedProfiles, savedPredictions, activeProfileId, birthDetails, lifeEvents, user?.id]);

  // Advanced: override the Supabase URL/key (most users never need this — the
  // app ships pre-configured). Saving reloads so the auth client re-inits.
  const handleSyncConnect = async () => {
    const cfg = { url: syncForm.url.trim().replace(/\/+$/, ''), anonKey: syncForm.anonKey.trim() };
    if (!cfg.url || !cfg.anonKey) { setSyncError('Both Project URL and anon key are required.'); return; }
    setSyncConnecting(true);
    setSyncError('');
    try {
      setSyncConfig(cfg);          // rebuilds the Supabase client
      await testConnection();      // verify URL + key + table
      setShowSyncSettings(false);
      window.location.reload();     // re-init auth/session against new config
    } catch (err) {
      console.error('Cloud sync connect error', err);
      setSyncStatus('error');
      setSyncError(err.message || 'Connection failed');
    } finally {
      setSyncConnecting(false);
    }
  };

  const handleSyncDisconnect = () => {
    clearSyncConfig();
    cloudReadyRef.current = false;
    lastPushedJsonRef.current = null;
    setSyncStatus('off');
    setSyncError('');
    setShowSyncSettings(false);
    window.location.reload();
  };

  const handleLoadProfile = (prof) => {
    setBirthDetails(prof.birthDetails);
    if (prof.lifeEvents && Array.isArray(prof.lifeEvents)) {
      setLifeEvents(prof.lifeEvents);
    }
    setActiveProfileId(prof.id);
    localStorage.setItem('astro_active_profile_id', String(prof.id));
    // Reset any derived outputs so they recalculate for new profile
    setPredictionResults(null);
    setSelectedEventId(null);
    setDegreeAlignments([]);
    setHasScannedAlignments(false);
    setHistoricalTransits([]);
  };

  const handleDeleteProfile = (id) => {
    setSavedProfiles(savedProfiles.filter(p => p.id !== id));
    if (activeProfileId === id) {
      setActiveProfileId(null);
      localStorage.removeItem('astro_active_profile_id');
    }
  };

  const handleDuplicateProfile = (prof) => {
    const duped = {
      ...prof,
      id: Date.now(),
      profileName: prof.profileName + ' (Copy)',
      createdAt: new Date().toISOString()
    };
    setSavedProfiles(prev => [...prev, duped]);
  };

  const handleUpdateActiveProfileData = () => {
    if (!activeProfileId) return;
    setSavedProfiles(prev => prev.map(p => p.id === activeProfileId
      ? { ...p, birthDetails: { ...birthDetails }, lifeEvents: [...lifeEvents] }
      : p
    ));
  };

  const handleExportProfiles = () => {
    if (savedProfiles.length === 0) return;
    const data = {
      exportedAt: new Date().toISOString(),
      version: 1,
      profiles: savedProfiles
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astro-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProfiles = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const imported = Array.isArray(data) ? data : (data.profiles || []);
        if (!imported.length) { alert('No profiles found in file.'); return; }
        // Re-ID to avoid collisions, preserve everything else
        const now = Date.now();
        const remapped = imported.map((p, i) => ({ ...p, id: now + i }));
        setSavedProfiles(prev => {
          // Merge: skip profiles with same name+date combo to avoid dupes
          const existing = new Set(prev.map(p => `${p.profileName}|${p.birthDetails?.date}`));
          const fresh = remapped.filter(p => !existing.has(`${p.profileName}|${p.birthDetails?.date}`));
          return [...prev, ...fresh];
        });
        alert(`Imported ${remapped.length} profile(s) successfully.`);
      } catch {
        alert('Failed to read file. Make sure it\'s a valid Astro Profiles JSON export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleProfilePDFUpload = async (profileId, file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfParseError('Please upload a valid PDF file (AstroSage Vedic Kundli report).');
      return;
    }
    setPdfParseError('');
    setParsingPDFForProfile(profileId);
    try {
      const { parseKundliPDF } = await import('./pdfParser');
      const pdfData = await parseKundliPDF(file);

      // Upload the raw PDF to the user's private Storage folder so the original
      // report is saved (not just the parsed data). Non-fatal if it fails.
      let pdfStoragePath = null, pdfSize = file.size;
      if (user) {
        try {
          const up = await uploadReport(profileId, file);
          pdfStoragePath = up.path;
          pdfSize = up.size;
        } catch (upErr) {
          console.error('PDF storage upload failed', upErr);
          setPdfParseError(`Parsed the report, but saving the original file failed: ${upErr.message}`);
        }
      }

      setSavedProfiles(prev => prev.map(p =>
        p.id === profileId ? { ...p, pdfData, pdfFileName: file.name, pdfStoragePath, pdfSize } : p
      ));
      // If this is the active profile, trigger chart recalc with PDF birth data if available
      if (profileId === activeProfileId && pdfData.birthDetails) {
        const bd = pdfData.birthDetails;
        if (bd.latitude && bd.longitude && bd.dob) {
          // Parse DOB from "27 : 1 : 1982" or "27/1/1982" format
          const dobClean = bd.dob.replace(/\s*:\s*/g, '-').replace(/\//g, '-');
          const parts = dobClean.split('-');
          if (parts.length === 3) {
            const d = parts[0].padStart(2,'0'), mo = parts[1].padStart(2,'0'), yr = parts[2];
            const isoDate = `${yr}-${mo}-${d}`;
            if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
              // Only update if user hasn't manually changed birth details
              // We do NOT auto-overwrite to avoid disrupting existing profile
            }
          }
        }
      }
    } catch (err) {
      console.error('PDF parse error', err);
      setPdfParseError(`Could not parse PDF: ${err.message || 'Unknown error'}. Ensure this is an AstroSage Vedic Kundli report.`);
    } finally {
      setParsingPDFForProfile(null);
    }
  };

  const [downloadingReport, setDownloadingReport] = useState(null); // profileId
  const handleDownloadReport = async (prof) => {
    if (!prof.pdfStoragePath) { alert('The original PDF for this profile is not stored in the cloud.'); return; }
    setDownloadingReport(prof.id);
    try {
      const url = await getReportUrl(prof.pdfStoragePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(`Could not open the report: ${err.message}`);
    } finally {
      setDownloadingReport(null);
    }
  };

  // Derive active profile's PDF data (used throughout app)
  const activePDFData = useMemo(() => {
    const ap = savedProfiles.find(p => p.id === activeProfileId);
    return ap?.pdfData || null;
  }, [savedProfiles, activeProfileId]);

  // Compact natural-language chart summary fed to the AI reading endpoint.
  const chartSummary = useMemo(() => {
    if (!natalChart || !natalChart.planets) return '';
    const lagnaName = SIGNS[natalChart.lagnaSign]?.name || '?';
    const lines = Object.keys(natalChart.planets).map(k => {
      const p = natalChart.planets[k];
      const house = ((p.signIndex - natalChart.lagnaSign + 12) % 12) + 1;
      return `${PLANET_NAMES[p.id] || p.id}: ${p.signName} (house ${house}), ${p.nakshatraName} nakshatra pada ${p.pada}${p.retrograde ? ', retrograde' : ''}`;
    });
    let dashaStr = '';
    if (dashaData) {
      const cur = getCurrentDasha(dashaData, new Date()) || {};
      if (cur.currentMahadasha) {
        dashaStr = `\nCurrent Vimshottari Dasha: ${cur.currentMahadasha.lord} Mahadasha` +
          (cur.currentAntardasha ? ` / ${cur.currentAntardasha.lord} Antardasha` : '') + '.';
      }
    }
    const who = birthDetails.name ? birthDetails.name : 'The native';
    return `${who}, born ${birthDetails.date} ${birthDetails.time} at ${birthDetails.placeName}.\n` +
      `Ascendant (Lagna): ${lagnaName}.\nPlanetary placements:\n- ${lines.join('\n- ')}${dashaStr}`;
  }, [natalChart, dashaData, birthDetails]);

  // Divisional (varga) charts derived from the natal sidereal positions.
  const vargaCharts = useMemo(() => {
    if (!natalChart || !natalChart.planets) return [];
    const asc = natalChart.lagnaSign * 30 + natalChart.lagnaDegree;
    return VARGAS.filter(v => v.num !== 1).map(v => {
      const c = buildVargaChart(natalChart.planets, asc, v.num);
      return { id: v.id, label: v.label, planets: c.planets, lagnaSign: c.lagnaSign };
    });
  }, [natalChart]);

  const handleSaveCurrentPrediction = () => {
    if (!predictionResults) return;
    const saveName = predictionSaveNameInput.trim() || `${birthDetails.name} - ${predictionResults.event.name}`;
    const newSave = {
      id: Date.now(),
      title: saveName,
      profileName: birthDetails.name,
      eventName: predictionResults.event.name,
      eventStart: predictionResults.event.startDate,
      eventEnd: predictionResults.event.endDate,
      eventId: selectedEventId,
      birthDetails: { ...birthDetails },
      predictionResults: predictionResults
    };
    setSavedPredictions([...savedPredictions, newSave]);
    setPredictionSaveNameInput('');
  };

  const handleLoadSavedPrediction = (savedItem) => {
    setBirthDetails(savedItem.birthDetails);
    const results = JSON.parse(JSON.stringify(savedItem.predictionResults));
    
    if (results.originalSignature && results.originalSignature.midPointDate) {
      results.originalSignature.midPointDate = new Date(results.originalSignature.midPointDate);
    }
    
    if (results.futureMatches && Array.isArray(results.futureMatches)) {
      results.futureMatches = results.futureMatches.map(match => ({
        ...match,
        date: new Date(match.date),
        startDate: new Date(match.startDate),
        endDate: new Date(match.endDate),
        peakDate: new Date(match.peakDate)
      }));
    }
    
    setPredictionResults(results);
    setSelectedEventId(savedItem.eventId);
    setActiveTab('predictions');
  };

  const handleDeleteSavedPrediction = (id) => {
    setSavedPredictions(savedPredictions.filter(p => p.id !== id));
  };

  const handleGenerateNatal = useCallback(() => {
    try {
      const birthDateTime = new Date(`${birthDetails.date}T${birthDetails.time}Z`);
      // Shift birth time to UTC for astronomical calculations
      const birthUtc = new Date(birthDateTime.getTime() - birthDetails.timezone * 60 * 60 * 1000);
      const jd = getJulianDate(birthUtc);
      
      const planetsResults = calculatePlanets(jd);
      const lagnaLon = calculateAscendantLongitude(jd, birthDetails.longitude, birthDetails.latitude);
      const lagnaSign = Math.floor(lagnaLon / 30);
      const lagnaDeg = lagnaLon % 30;

      const chartObj = {
        lagnaSign,
        lagnaDegree: lagnaDeg,
        planets: planetsResults.planets,
        ayanamsha: planetsResults.ayanamsha,
        julianDate: jd
      };

      setNatalChart(chartObj);

      // Perform Trik Bhava Analysis
      const trik = analyzeTrikBhavaNatal(planetsResults.planets, lagnaSign);
      setTrikBhavaAnalysis(trik);

      // Calculate Vimshottari Dasha from Moon's sidereal longitude
      const moonLong = planetsResults.planets.moon.longitude;
      const dashas = calculateVimshottariDasha(jd, moonLong);
      setDashaData(dashas);

      // Reset predictions
      setPredictionResults(null);
      setSelectedEventId(null);
    } catch (err) {
      console.error(err);
      alert('Error calculating chart. Please double check dates and values.');
    }
  }, [birthDetails]);

  // Save details to localStorage when they change
  useEffect(() => {
    localStorage.setItem('astro_birth_details', JSON.stringify(birthDetails));
  }, [birthDetails]);

  useEffect(() => {
    localStorage.setItem('astro_life_events', JSON.stringify(lifeEvents));
  }, [lifeEvents]);

  // Calculate Natal Chart on load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleGenerateNatal();
  }, [handleGenerateNatal]);

  // (Removed) CSV auto-load: life events are now per-user only; the previous
  // auto-import seeded every session with the project owner's timeline.

  // Derive Transit Chart whenever Transit Date/Time changes
  const transitChart = useMemo(() => {
    if (!natalChart) return null;
    const transitDateTime = new Date(`${transitDateInput}T${transitTimeInput}Z`);
    const jd = getJulianDate(transitDateTime);
    // We evaluate transits at the same latitude/longitude to align relative house structures
    return calculatePlanets(jd);
  }, [transitDateInput, transitTimeInput, natalChart]);

  // Ordered list of every chart, used by the enlarge/zoom modal (with prev/next).
  const allCharts = useMemo(() => {
    if (!natalChart || !natalChart.planets) return [];
    const list = [{
      id: 'natal', title: 'Lagna / Birth Chart (D1)',
      subtitle: `Lagna: ${SIGNS[natalChart.lagnaSign].name}`,
      planets: natalChart.planets, lagnaSign: natalChart.lagnaSign,
    }];
    if (transitChart) list.push({
      id: 'transit', title: 'Transit Chart',
      subtitle: `${transitDateInput} ${transitTimeInput} UTC`,
      planets: transitChart.planets, lagnaSign: natalChart.lagnaSign,
    });
    vargaCharts.forEach(v => list.push({
      id: v.id, title: v.label, subtitle: `Lagna: ${SIGNS[v.lagnaSign].name}`,
      planets: v.planets, lagnaSign: v.lagnaSign,
    }));
    return list;
  }, [natalChart, transitChart, vargaCharts, transitDateInput, transitTimeInput]);

  // CSV file reading and parsing handler
  const handleCSVData = (text) => {
    try {
      setCsvError('');
      const rows = parseCSV(text);
      if (rows.length < 2) {
        setCsvError('The CSV file appears to be empty or invalid.');
        return;
      }
      
      // Determine column indexes based on header row
      const headers = rows[0].map(h => h.trim().toLowerCase());
      const yearIdx = headers.indexOf('year');
      const titleIdx = headers.indexOf('event title') !== -1 ? headers.indexOf('event title') : headers.indexOf('title');
      const descIdx = headers.indexOf('description') !== -1 ? headers.indexOf('description') : headers.indexOf('desc');
      
      if (yearIdx === -1 || titleIdx === -1) {
        setCsvError('Required columns "Year" and "Event Title" (or "Title") were not found in the CSV.');
        return;
      }

      const parsedEvents = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || !row[yearIdx]) continue;
        
        const yearStr = row[yearIdx].trim();
        const titleStr = row[titleIdx] ? row[titleIdx].trim() : 'Unnamed Event';
        const descStr = descIdx !== -1 && row[descIdx] ? row[descIdx].trim() : '';
        
        const { startDate, endDate } = parseEventDates(yearStr);
        const category = classifyCategory(titleStr, descStr);
        
        parsedEvents.push({
          id: i, // temp id for wizard tracking
          name: titleStr,
          fullDescription: descStr,
          startDate,
          endDate,
          category,
          selected: true // checked by default
        });
      }

      if (parsedEvents.length === 0) {
        setCsvError('No valid life events were parsed from the CSV file.');
      } else {
        setCsvPreviewEvents(parsedEvents);
      }
    } catch (err) {
      console.error(err);
      setCsvError('Error parsing CSV. Please check formatting.');
    }
  };

  // Fetch local workspace CSV file directly
  const handleLoadWorkspaceCSV = async () => {
    try {
      setCsvError('');
      const res = await fetch('/life_events_timeline.csv');
      if (!res.ok) {
        throw new Error('Failed to fetch default workspace timeline CSV.');
      }
      const text = await res.text();
      handleCSVData(text);
    } catch (err) {
      console.error(err);
      setCsvError('Could not load the workspace CSV. Try uploading it manually.');
    }
  };

  // Drag and Drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        handleCSVData(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        handleCSVData(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  // Handler to bulk import the checked events
  const handleBulkImport = () => {
    const selectedToImport = csvPreviewEvents.filter(ev => ev.selected);
    if (selectedToImport.length === 0) {
      alert('Please select at least one event to import.');
      return;
    }

    const currentMaxId = lifeEvents.length > 0 ? Math.max(...lifeEvents.map(e => e.id)) : 0;
    
    const newEventsList = selectedToImport.map((ev, index) => {
      // Append truncated description to title if present to preserve the context in the event name
      let finalName = ev.name;
      if (ev.fullDescription) {
        finalName += ` (${ev.fullDescription.substring(0, 45)}${ev.fullDescription.length > 45 ? '...' : ''})`;
      }
      return {
        id: currentMaxId + index + 1,
        name: finalName,
        startDate: ev.startDate,
        endDate: ev.endDate,
        category: ev.category
      };
    });

    setLifeEvents([...lifeEvents, ...newEventsList]);
    setCsvPreviewEvents([]); // clear import wizard
  };

  const handleUpdatePreviewEvent = (id, field, value) => {
    setCsvPreviewEvents(prev => prev.map(ev => ev.id === id ? { ...ev, [field]: value } : ev));
  };

  const handleToggleSelectAllPreview = (checked) => {
    setCsvPreviewEvents(prev => prev.map(ev => ({ ...ev, selected: checked })));
  };

  const handleScanDegreeAlignments = () => {
    if (!natalChart) {
      alert('Please calculate your birth chart first.');
      return;
    }
    setScanningAlignments(true);
    setHasScannedAlignments(true);
    setTimeout(() => {
      try {
        const alignments = scanDegreeAlignments(
          birthDetails,
          natalChart.planets,
          natalChart.lagnaSign,
          2026,
          2056
        );
        setDegreeAlignments(alignments);
      } catch (err) {
        console.error(err);
        alert('Error scanning alignments.');
      } finally {
        setScanningAlignments(false);
      }
    }, 100);
  };



  const handleSearchLocation = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setGeocodingLoading(true);
    setGeocodingError('');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        // Estimate timezone offset from longitude (15 deg = 1 hour)
        const timezoneOffset = Math.round((lon / 15) * 2) / 2; // rounds to nearest 0.5 hour
        
        setBirthDetails(prev => ({
          ...prev,
          placeName: item.display_name,
          latitude: lat,
          longitude: lon,
          timezone: timezoneOffset
        }));
        setSearchQuery('');
      } else {
        setGeocodingError('No results found. Please check spelling or enter coordinates manually.');
      }
    } catch (err) {
      console.error(err);
      setGeocodingError('Network error searching location. You can still input details manually.');
    } finally {
      setGeocodingLoading(false);
    }
  };

  const handleScanHistoricalTransits = () => {
    setScanningTransits(true);
    // Scanning last 50 years: 1976 to 2026
    setTimeout(() => {
      const data = scanPlanetTransits(selectedTransitPlanet, 1976, 2026);
      // Reverse order to show most recent first
      setHistoricalTransits(data.reverse());
      setScanningTransits(false);
    }, 100);
  };

  const handleAddEvent = (e) => {
    e.preventDefault();
    if (!newEvent.name || !newEvent.startDate || !newEvent.endDate) {
      alert('Please fill out all fields for the life event.');
      return;
    }
    const id = lifeEvents.length > 0 ? Math.max(...lifeEvents.map(ev => ev.id)) + 1 : 1;
    setLifeEvents([...lifeEvents, { ...newEvent, id }]);
    setNewEvent({ name: '', startDate: '', endDate: '', category: 'Career' });
  };

  const handleDeleteEvent = (id) => {
    setLifeEvents(lifeEvents.filter(ev => ev.id !== id));
    if (selectedEventId === id) {
      setPredictionResults(null);
      setSelectedEventId(null);
    }
  };

  const handlePredictFuture = (eventItem) => {
    if (!natalChart) {
      alert('Please calculate your birth chart first.');
      return;
    }
    setPredicting(true);
    setSelectedEventId(eventItem.id);

    setTimeout(() => {
      // 1. Calculate transit configuration for event range midpoint
      const matchedSignature = matchLifeEventTransits(birthDetails, eventItem.startDate, eventItem.endDate);
      
      // 2. Scan future dates for similar transit configurations (2026 to 2056)
      const futureMatches = predictFutureReoccurrences(
        birthDetails, 
        matchedSignature.eventSignature,
        matchedSignature.natalLagnaSign,
        matchedSignature.natalPlanets,
        2026,
        2056
      );

      // Generate text interpretations based on Trik Bhava activation & Krishna Ashant insights
      const enrichedMatches = futureMatches.slice(0, 10).map(match => {
        const trikActivation = [];
        const activationHouses = new Set();
        
        ['saturn', 'jupiter', 'rahu', 'ketu'].forEach(pKey => {
          const house = match.transits[pKey].house;
          if ([6, 8, 12].includes(house)) {
            activationHouses.add(house);
          }
        });

        // Trik commentary mapping
        if (activationHouses.has(6)) {
          trikActivation.push({
            house: 6,
            title: 'Shatru & Roga Bhava (6th House) Activation',
            text: 'This future transit places major karmic triggers in your 6th house of struggle, health, and service. Under Pandit Krishna Ashant\'s psychological framework, the 6th house is where our daily shadow work is processed. A high-similarity recurrence here suggests a phase where you must refine physical habits, resolve unresolved interpersonal disputes, or manage financial obligations. Aligning this with your birth chart lords suggests that self-discipline and selfless service are your alchemical tools to dissolve obstacles.'
          });
        }
        if (activationHouses.has(8)) {
          trikActivation.push({
            house: 8,
            title: 'Randhra Bhava (8th House) Activation',
            text: 'Your 8th house of deep mysteries, sudden transformations, and joint finances is highly activated. Historically, this corresponds to moments of crisis or sudden redirection. According to Krishna Ashant\'s "Trik Bhavo Ki Gatha", this is the crucible of rebirth. Resistance to change during this alignment will build internal friction. The natal promise of your 8th Lord dictates that letting go of control, investigating esoteric fields, or healing psychological inheritance will yield exceptional personal empowerment.'
          });
        }
        if (activationHouses.has(12)) {
          trikActivation.push({
            house: 12,
            title: 'Vyaya & Moksha Bhava (12th House) Activation',
            text: 'The 12th house of expenses, isolation, and spiritual release is highlighted. This represents a closing cycle of experience. Krishna Ashant details this as a time of sub-conscious clearing where the soul pays its karmic debts. It is an excellent window for retreat, meditation, foreign travel, or working behind the scenes. Financially, expenses will rise, but these function as investments in psychological liberation and release from material bindings.'
          });
        }

        if (trikActivation.length === 0) {
          trikActivation.push({
            house: 0,
            title: 'Kendra/Kona (Central/Trinal) House Activation',
            text: 'This transit activates your central kendras or trines, suggesting that the repeating pattern centers on external adjustments—career moves, relationship contracts, or self-expression—rather than dusthana crises. It represents an opportunity to leverage natal planet connections for material growth.'
          });
        }

        return {
          ...match,
          trikCommentaries: trikActivation
        };
      });

      setPredictionResults({
        event: eventItem,
        originalSignature: matchedSignature,
        futureMatches: enrichedMatches
      });
      setPredicting(false);
    }, 200);
  };

  // Snapshot key of the inputs the auto-scan depends on
  const autoScanKey = useMemo(
    () => JSON.stringify([birthDetails, lifeEvents.map(ev => [ev.id, ev.startDate, ev.endDate])]),
    [birthDetails, lifeEvents]
  );
  const autoMatchesComputed = autoMatchesKey === autoScanKey;
  const autoMatchesLoading =
    activeTab === 'predictions' && !!natalChart && lifeEvents.length > 0 && !autoMatchesComputed;

  // ── AUTO-SCAN: compute upcoming matches for ALL life events ─────────
  useEffect(() => {
    if (activeTab !== 'predictions') return;
    if (!natalChart || lifeEvents.length === 0) return;
    if (autoMatchesKey === autoScanKey) return; // already computed for this data

    const timer = setTimeout(() => {
      try {
        const today = new Date();
        const todayMs = today.getTime();
        const scanStart = today.getFullYear();
        const scanEnd   = scanStart + 2;   // 2 years ahead — fast enough for 40+ events
        const pastStart = scanStart - 30;  // look back 30 years for historical analogs

        // Build Trik Bhava commentary for a window's transits (shared by past + future)
        const buildTrik = (match) => {
          const activationHouses = new Set();
          ['saturn','jupiter','rahu','ketu'].forEach(p => {
            const h = match.transits?.[p]?.house;
            if ([6,8,12].includes(h)) activationHouses.add(h);
          });
          const t = [];
          if (activationHouses.has(6)) t.push({ house:6, title:'6th House (Shatru/Roga) Activation', text:'Service, health, and daily struggle are highlighted. Self-discipline and selfless action are your alchemical tools.' });
          if (activationHouses.has(8)) t.push({ house:8, title:'8th House (Randhra) Activation', text:'Sudden transformation and hidden knowledge are highlighted. Surrender and regeneration yield exceptional empowerment.' });
          if (activationHouses.has(12)) t.push({ house:12, title:'12th House (Vyaya/Moksha) Activation', text:'A closing cycle of release and spiritual retreat. Expenses rise but function as investment in psychological liberation.' });
          if (t.length === 0) t.push({ house:0, title:'Kendra/Kona Activation', text:'Central house activation: career, relationship, or self-expression adjustment rather than dusthana crisis.' });
          return t;
        };

        // Deduplicate raw windows by 45-day bucket (keep highest score)
        const dedup = (raw) => {
          const buckets = {};
          raw.forEach(m => {
            const key = Math.floor(m.peakDate.getTime() / (45 * 86400000));
            if (!buckets[key] || m.score > buckets[key].score) buckets[key] = m;
          });
          return Object.values(buckets);
        };

        const futureRaw = [];
        const pastRaw = [];

        for (const event of lifeEvents) {
          try {
            const sig = matchLifeEventTransits(birthDetails, event.startDate, event.endDate);

            // Upcoming reoccurrences (current year -> +2)
            predictFutureReoccurrences(
              birthDetails, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets,
              scanStart, scanEnd
            ).slice(0, 4).forEach(match => {
              futureRaw.push({ ...match, score: match.peakScore, trikCommentaries: buildTrik(match), referenceEvent: event, originalSignature: sig });
            });

            // Past similar transits (previous 30 years, already-completed windows)
            predictFutureReoccurrences(
              birthDetails, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets,
              pastStart, scanStart
            ).filter(w => w.endDate.getTime() < todayMs).slice(0, 3).forEach(match => {
              pastRaw.push({ ...match, score: match.peakScore, trikCommentaries: buildTrik(match), referenceEvent: event, originalSignature: sig });
            });
          } catch { /* skip bad event */ }
        }

        // Upcoming: strictly future windows (excludes any currently-active window)
        const upcoming = dedup(futureRaw)
          .filter(m => m.startDate.getTime() > todayMs)
          .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
          .slice(0, 24)
          .map(m => ({ ...m, _group: 'upcoming' }));

        // Past: most-recent completed analogs first
        const past = dedup(pastRaw)
          .filter(m => m.endDate.getTime() < todayMs)
          .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
          .slice(0, 8)
          .map(m => ({ ...m, _group: 'past' }));

        // Render order: past (recent -> older) then upcoming (soonest -> later)
        setAutoMatches([...past, ...upcoming]);
        setExpandedAutoMatch(null);
      } catch (err) {
        console.error('Auto-scan error:', err);
      } finally {
        setAutoMatchesKey(autoScanKey);
      }
    }, 50);

    // Cleanup cancels a pending scan if the inputs/tab change mid-flight
    return () => clearTimeout(timer);
  }, [activeTab, natalChart, lifeEvents, birthDetails, autoScanKey, autoMatchesKey]);

  // Helper: format degrees to standard zodiac degrees minutes (e.g. 14°25')
  const formatDegrees = (deg) => {
    const d = Math.floor(deg);
    const m = Math.floor((deg - d) * 60);
    return `${d}°${m.toString().padStart(2, '0')}'`;
  };


  // Mouse/touch drag → time scrub on transit chart
  useEffect(() => {
    if (!transitDragInfo) return;
    const getSvgAngle = (clientX, clientY) => {
      const el = transitSvgRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const x = (clientX - r.left) / r.width * 400 - 200;
      const y = (clientY - r.top) / r.height * 400 - 200;
      return Math.atan2(x, -y); // 0 = top, clockwise positive
    };
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      let delta = getSvgAngle(clientX, clientY) - transitDragInfo.startAngle;
      // Normalise to [-π, π]
      while (delta > Math.PI)  delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const period = PLANET_PERIODS_DAYS[transitDragInfo.planetId] || 365.25;
      // Counterclockwise drag (delta < 0) = forward in time for prograde planets
      const newMs = transitDragInfo.startDateMs - (delta / (2 * Math.PI)) * period * 86400000;
      const d = new Date(newMs);
      setTransitDateInput(d.toISOString().split('T')[0]);
      setTransitTimeInput(d.toISOString().substring(11, 16));
    };
    const onUp = () => setTransitDragInfo(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };
  }, [transitDragInfo]);

  // Get SVG Layout of North Indian Chart.
  // `draggable` enables time-scrub dragging on the transit chart (uses transitSvgRef).
  const renderNorthIndianChart = (planetsList, lagnaSign, draggable = false) => {
    if (lagnaSign === undefined) return null;

    // Per-planet colors — matched to reference screenshot
    const PLANET_COLORS = {
      sun:     '#CC0000',  // bright crimson
      moon:    '#9575CD',  // medium purple
      mercury: '#283593',  // dark navy blue
      venus:   '#2E7D32',  // dark green
      mars:    '#2E7D32',  // dark green
      jupiter: '#AD1457',  // deep magenta/pink
      saturn:  '#B71C1C',  // dark red
      rahu:    '#BF360C',  // burnt orange-red
      ketu:    '#B8860B',  // dark goldenrod/brown
    };

    // Build lists of planets in each of the 12 houses
    const housesPlanets = {};
    for (let h = 1; h <= 12; h++) {
      housesPlanets[h] = [];
    }

    if (planetsList) {
      Object.keys(planetsList).forEach(key => {
        const p = planetsList[key];
        const house = getHouseFromLagna(p.signIndex, lagnaSign);
        housesPlanets[house].push(p);
      });
    }

    // Chart geometry (400×400 viewBox, y increases downward):
    //   Outer border: (5,5)→(395,395)
    //   Inner diamond vertices: (200,5)(395,200)(200,395)(5,200)
    //   Diag1 y=x: intersects inner diamond at (102,102) and (298,298)
    //   Diag2 y=-x+400: intersects at (298,102) and (102,298)  Center: (200,200)
    //
    // House regions (counter-clockwise from top):
    //   Inner 4 diamonds — 1=top(y<x&y<-x+400), 4=left(y>x&y<-x+400),
    //                       7=bottom(y>x&y>-x+400), 10=right(y<x&y>-x+400)
    //   Outer 8 triangles — corner areas outside the inner diamond
    //
    // Sign numbers: at OUTER CORNER for outer-8 triangles; near CENTER TIP for inner-4.
    // Planet centroids: house centroid (well inside each region, away from sign nr).
    const housePlacements = {
      //            sign nr                       planet centroid
      1:  { signX: 200, signY: 68,  cx: 200, cy: 120 },  // top ◇ — sign mid-diamond
      2:  { signX: 100, signY: 20,  cx: 95,  cy: 65  },  // UL upper △ — near top edge
      3:  { signX: 20,  signY: 100, cx: 65,  cy: 95  },  // UL lower △ — near left edge
      4:  { signX: 68,  signY: 200, cx: 120, cy: 200 },  // left ◇ — sign mid-diamond
      5:  { signX: 20,  signY: 300, cx: 65,  cy: 305 },  // LL upper △ — near left edge
      6:  { signX: 100, signY: 380, cx: 95,  cy: 335 },  // LL lower △ — near bottom edge
      7:  { signX: 200, signY: 332, cx: 200, cy: 280 },  // bottom ◇ — sign mid-diamond
      8:  { signX: 300, signY: 380, cx: 305, cy: 335 },  // LR lower △ — near bottom edge
      9:  { signX: 380, signY: 300, cx: 335, cy: 305 },  // LR upper △ — near right edge
      10: { signX: 332, signY: 200, cx: 280, cy: 200 },  // right ◇ — sign mid-diamond
      11: { signX: 380, signY: 100, cx: 335, cy: 95  },  // UR lower △ — near right edge
      12: { signX: 300, signY: 20,  cx: 305, cy: 65  },  // UR upper △ — near top edge
    };

    const LINE_COLOR = '#E07B00';
    const LINE_WIDTH = 2;
    const LINE_OPACITY = 1;

    return (
      <svg
        ref={draggable ? transitSvgRef : undefined}
        viewBox="0 0 400 400"
        className="kundali-svg"
        overflow="hidden"
        aria-label="North Indian Vedic Astrology Chart"
        style={draggable ? { cursor: transitDragInfo ? 'grabbing' : 'default' } : undefined}
      >
        {/* Outer border */}
        <rect x="5" y="5" width="390" height="390" fill="white"
          stroke={LINE_COLOR} strokeWidth="2.5" />

        {/* Diagonals */}
        <line x1="5"   y1="5"   x2="395" y2="395" stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} opacity={LINE_OPACITY} />
        <line x1="395" y1="5"   x2="5"   y2="395" stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} opacity={LINE_OPACITY} />

        {/* Inner Diamond */}
        <line x1="200" y1="5"   x2="395" y2="200" stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} opacity={LINE_OPACITY} />
        <line x1="395" y1="200" x2="200" y2="395" stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} opacity={LINE_OPACITY} />
        <line x1="200" y1="395" x2="5"   y2="200" stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} opacity={LINE_OPACITY} />
        <line x1="5"   y1="200" x2="200" y2="5"   stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} opacity={LINE_OPACITY} />

        {/* Houses */}
        {Object.keys(housePlacements).map(hStr => {
          const houseNum = parseInt(hStr);
          const { signX, signY, cx, cy } = housePlacements[houseNum];
          const signIndex = (lagnaSign + houseNum - 1) % 12;
          const signNum = signIndex + 1;
          const planets = housesPlanets[houseNum];

          const LINE_H = 20;
          const totalH = (planets.length - 1) * LINE_H;
          const startY = cy - totalH / 2;

          return (
            <g key={houseNum}>
              {/* Sign number — small, at outer edge of house, clear of all lines */}
              <text
                x={signX} y={signY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#1B5E20"
                fontSize="12"
                fontWeight="800"
                fontFamily="sans-serif"
              >
                {signNum}
              </text>

              {/* Planets stacked vertically — bold, with degree superscript */}
              {planets.map((p, i) => {
                const abbr  = PLANET_ABBRS[p.id] || p.id.slice(0, 2);
                const deg   = String(Math.floor(p.degree)).padStart(2, '0');
                const color = PLANET_COLORS[p.id] || '#92400e';
                const yPos  = startY + i * LINE_H;

                const isDragging = draggable && transitDragInfo?.planetId === p.id;
                return (
                  <g key={p.id}>
                    {isDragging && (
                      <circle cx={cx} cy={yPos} r="16"
                        fill="none" stroke={color} strokeWidth="1.5"
                        opacity="0.55" strokeDasharray="3 2" />
                    )}
                    <text
                      x={cx}
                      y={yPos}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={color}
                      fontSize="17"
                      fontWeight="800"
                      fontFamily="monospace, sans-serif"
                      style={draggable ? { cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' } : undefined}
                      onMouseDown={draggable ? (e) => {
                        e.preventDefault();
                        const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        if (!r) return;
                        const x = (e.clientX - r.left) / r.width * 400 - 200;
                        const y = (e.clientY - r.top) / r.height * 400 - 200;
                        const angle = Math.atan2(x, -y);
                        setTransitDragInfo({
                          planetId: p.id,
                          startAngle: angle,
                          startDateMs: new Date(`${transitDateInput}T${transitTimeInput}Z`).getTime(),
                        });
                      } : undefined}
                      onTouchStart={draggable ? (e) => {
                        const t = e.touches[0];
                        const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        if (!r) return;
                        const x = (t.clientX - r.left) / r.width * 400 - 200;
                        const y = (t.clientY - r.top) / r.height * 400 - 200;
                        setTransitDragInfo({
                          planetId: p.id,
                          startAngle: Math.atan2(x, -y),
                          startDateMs: new Date(`${transitDateInput}T${transitTimeInput}Z`).getTime(),
                        });
                      } : undefined}
                    >
                      {abbr}{p.retrograde ? '*' : ''}
                      <tspan dy="-7" fontSize="11" fontWeight="700">{deg}</tspan>
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    );
  };

  // ── Cloud Sync Settings Modal ─────────────────────────────────────────
  const renderSyncSettingsModal = () => {
    if (!showSyncSettings) return null;
    const configured = !!getSyncConfig();
    return (
      <div className="pm-overlay" onClick={() => setShowSyncSettings(false)}>
        <div className="pm-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
          <div className="pm-header">
            <h2 className="pm-title">☁ Cloud Sync</h2>
            <button className="pm-close" onClick={() => setShowSyncSettings(false)}>✕</button>
          </div>
          <div className="pm-form-section">
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px' }}>
              The app is pre-configured — just <strong>Create Account / Sign In</strong>. Your profiles,
              predictions, reports and charts are private to your account and sync across devices.
              These fields are only for <strong>advanced</strong> use (pointing the app at a different
              Supabase project). Saving reloads the app. One-time database setup is in
              <strong> SUPABASE_AUTH_SETUP.md</strong>.
            </p>
            <div className="pm-section-label">Supabase Project URL</div>
            <input
              className="text-input"
              placeholder="https://xxxxx.supabase.co"
              value={syncForm.url}
              onChange={e => setSyncForm(f => ({ ...f, url: e.target.value }))}
              style={{ width: '100%', marginBottom: '8px' }}
            />
            <div className="pm-section-label">Anon (public) API Key</div>
            <input
              className="text-input"
              type="password"
              placeholder="eyJhbGciOi..."
              value={syncForm.anonKey}
              onChange={e => setSyncForm(f => ({ ...f, anonKey: e.target.value }))}
              style={{ width: '100%', marginBottom: '8px' }}
            />
            {syncError && (
              <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 8px' }}>⚠ {syncError}</p>
            )}
            {configured && syncStatus === 'synced' && !syncError && (
              <p style={{ fontSize: '12px', color: '#16a34a', margin: '4px 0 8px' }}>✓ Connected — data is syncing automatically.</p>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: '12px' }}
                disabled={syncConnecting}
                onClick={handleSyncConnect}
              >{syncConnecting ? 'Connecting…' : configured ? 'Reconnect / Update' : 'Connect & Sync'}</button>
              {configured && (
                <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={handleSyncDisconnect}>
                  Disconnect
                </button>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
              Connecting loads any existing cloud data (cloud wins). If the cloud is empty,
              your current local data is uploaded as the starting point.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ── Profile Manager Modal ─────────────────────────────────────────────
  const renderProfileManagerModal = () => {
    if (!showProfileManager) return null;
    return (
      <div className="pm-overlay" onClick={() => { setShowProfileManager(false); setEditingProfileId(null); }}>
        <div className="pm-panel" onClick={e => e.stopPropagation()}>
          <div className="pm-header">
            <h2 className="pm-title">⊙ Profile Manager</h2>
            <button className="pm-close" onClick={() => { setShowProfileManager(false); setEditingProfileId(null); }}>✕</button>
          </div>

          {/* Create / Edit Form */}
          <div className="pm-form-section">
            <div className="pm-section-label">{editingProfileId ? 'Edit Profile' : 'Save Current as New Profile'}</div>
            <div className="pm-form-row">
              <input
                className="text-input"
                placeholder="Profile name (e.g. Mom, Me, Client)"
                value={profileForm.name}
                onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                style={{ flex: 1 }}
              />
            </div>
            <div className="pm-color-row">
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '6px' }}>Color:</span>
              {PROFILE_COLORS.map(c => (
                <button
                  key={c}
                  className={`pm-color-dot${profileForm.color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setProfileForm(f => ({ ...f, color: c }))}
                  title={c}
                />
              ))}
            </div>
            <textarea
              className="text-input"
              placeholder="Notes (optional — relationship, purpose, etc.)"
              value={profileForm.notes}
              onChange={e => setProfileForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ resize: 'none', fontSize: '12px', marginTop: '6px', width: '100%' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              {editingProfileId ? (
                <>
                  <button className="btn btn-primary" style={{ fontSize: '12px' }} onClick={() => {
                    setSavedProfiles(prev => prev.map(p => p.id === editingProfileId
                      ? { ...p, profileName: profileForm.name || p.profileName, color: profileForm.color, notes: profileForm.notes }
                      : p
                    ));
                    setEditingProfileId(null);
                    setProfileForm({ name: '', color: PROFILE_COLORS[0], notes: '' });
                  }}>Update Profile</button>
                  <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={() => {
                    setEditingProfileId(null);
                    setProfileForm({ name: '', color: PROFILE_COLORS[0], notes: '' });
                  }}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-primary" style={{ fontSize: '12px' }} onClick={() => {
                  const nameToSave = profileForm.name.trim() || birthDetails.name || 'Unnamed';
                  const newProfile = {
                    id: Date.now(),
                    profileName: nameToSave,
                    color: profileForm.color,
                    birthDetails: { ...birthDetails },
                    lifeEvents: [...lifeEvents],
                    createdAt: new Date().toISOString(),
                    notes: profileForm.notes
                  };
                  const updated = [...savedProfiles, newProfile];
                  setSavedProfiles(updated);
                  setActiveProfileId(newProfile.id);
                  localStorage.setItem('astro_active_profile_id', String(newProfile.id));
                  setProfileForm({ name: '', color: PROFILE_COLORS[updated.length % PROFILE_COLORS.length], notes: '' });
                }}>💾 Save as New Profile</button>
              )}
            </div>
          </div>

          {/* Profiles List */}
          <div className="pm-list-section">
            <div className="pm-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>All Saved Profiles ({savedProfiles.length})</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="pm-btn"
                  style={{ fontSize: '11px', padding: '3px 8px', opacity: savedProfiles.length === 0 ? 0.4 : 1 }}
                  onClick={handleExportProfiles}
                  disabled={savedProfiles.length === 0}
                  title="Export all profiles to a JSON backup file"
                >⬇ Export</button>
                <label
                  className="pm-btn"
                  style={{ fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}
                  title="Import profiles from a previously exported JSON file"
                >
                  ⬆ Import
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportProfiles} />
                </label>
              </div>
            </div>
            {savedProfiles.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No profiles saved yet. Fill in birth details above and save.
              </p>
            )}
            <div className="pm-list">
              {savedProfiles.map(prof => {
                const isActive = activeProfileId === prof.id;
                const isEditing = editingProfileId === prof.id;
                return (
                  <div key={prof.id} className="pm-entry">
                    {/* ── Top row: avatar · info · action buttons ── */}
                    <div className={`pm-item${isActive ? ' active' : ''}${isEditing ? ' editing' : ''}`}>
                      <div className="pm-item-avatar" style={{ background: prof.color || '#ca8a04' }}>
                        {(prof.profileName || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="pm-item-info">
                        <div className="pm-item-name">
                          {prof.profileName}
                          {isActive && <span className="pm-active-badge">● Active</span>}
                          {prof.pdfData && <span className="pm-pdf-badge-small">📄 PDF</span>}
                        </div>
                        <div className="pm-item-meta">
                          Born {prof.birthDetails?.date} · {prof.birthDetails?.placeName?.split(',')[0]}
                          {prof.lifeEvents?.length ? ` · ${prof.lifeEvents.length} events` : ''}
                          {prof.pdfData && ` · +${getAccuracyProfile(prof.pdfData).earned}% acc`}
                        </div>
                        {prof.notes && <div className="pm-item-notes">{prof.notes}</div>}
                      </div>
                      <div className="pm-item-btns">
                        {!isActive && (
                          <button className="pm-btn load" onClick={() => { handleLoadProfile(prof); setShowProfileManager(false); }}>Load</button>
                        )}
                        <button className="pm-btn edit" onClick={() => {
                          setEditingProfileId(prof.id);
                          setProfileForm({ name: prof.profileName, color: prof.color || PROFILE_COLORS[0], notes: prof.notes || '' });
                        }}>Edit</button>
                        {isActive && (
                          <button className="pm-btn sync" title="Sync current birth details & life events into this profile" onClick={handleUpdateActiveProfileData}>Sync ↑</button>
                        )}
                        <button className="pm-btn dup" title="Duplicate this profile" onClick={() => handleDuplicateProfile(prof)}>Dup</button>
                        <button className="pm-btn del" onClick={() => handleDeleteProfile(prof.id)}>✕</button>
                      </div>
                    </div>

                    {/* ── PDF Upload / Data Section ── */}
                    <div className="pm-pdf-section">
                      {prof.pdfData ? (
                        <div className="pm-pdf-loaded">
                          <span className="pm-pdf-icon">📄</span>
                          <div className="pm-pdf-loaded-info">
                            <div className="pm-pdf-loaded-name">{prof.pdfFileName || 'AstroSage PDF'} · {prof.pdfData.pageCount}pp · {Math.round((prof.pdfData.confidence?.overall || 0) * 100)}% confidence</div>
                            <div className="pm-pdf-loaded-meta">
                              {getPDFDataSummary(prof.pdfData).map(d => (
                                <span key={d.key} className={`pm-pdf-tag${d.available ? ' available' : ' missing'}`}>
                                  {d.available ? '✓' : '–'} {d.label}
                                </span>
                              ))}
                            </div>
                            <div className="pm-pdf-accuracy-bar">
                              <span className="pm-pdf-acc-label">Accuracy unlocked:</span>
                              <div className="pm-pdf-acc-track">
                                <div className="pm-pdf-acc-fill" style={{ width: `${getAccuracyProfile(prof.pdfData).total}%` }} />
                              </div>
                              <span className="pm-pdf-acc-num">+{getAccuracyProfile(prof.pdfData).earned}%</span>
                            </div>
                          </div>
                          {prof.pdfStoragePath && (
                            <button className="pm-pdf-download" title="Download the original PDF report"
                              disabled={downloadingReport === prof.id}
                              onClick={() => handleDownloadReport(prof)}>
                              {downloadingReport === prof.id ? '…' : '⬇ PDF'}
                            </button>
                          )}
                          <button className="pm-btn del" style={{ flexShrink: 0, alignSelf: 'flex-start' }} title="Remove PDF data & stored file"
                            onClick={async () => {
                              const path = prof.pdfStoragePath;
                              setSavedProfiles(prev => prev.map(p => p.id === prof.id ? { ...p, pdfData: null, pdfFileName: null, pdfStoragePath: null } : p));
                              if (path) { try { await deleteReport(path); } catch (e) { console.error('delete report', e); } }
                            }}>✕</button>
                        </div>
                      ) : (
                        <label className={`pm-pdf-upload${parsingPDFForProfile === prof.id ? ' parsing' : ''}`}
                          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                          onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                          onDrop={e => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('drag-over');
                            const f = e.dataTransfer.files[0];
                            if (f) handleProfilePDFUpload(prof.id, f);
                          }}
                        >
                          <input type="file" accept=".pdf" style={{ display: 'none' }}
                            onChange={e => {
                              const f = e.target.files[0];
                              if (f) handleProfilePDFUpload(prof.id, f);
                              e.target.value = '';
                            }}
                          />
                          {parsingPDFForProfile === prof.id ? (
                            <span className="pm-pdf-parsing">
                              <span className="pm-pdf-spin">⟳</span> Parsing PDF — extracting Ashtakvarga, Dasha, KP data…
                            </span>
                          ) : (
                            <>
                              <span className="pm-pdf-upload-icon">📤</span>
                              <span className="pm-pdf-upload-text">
                                Drop AstroSage Kundli PDF here or <u>click to upload</u>
                                <br />
                                <small>Unlocks Ashtakvarga scoring · Pratyantar timing · KP Lords · Shadbala · Sadesati</small>
                              </span>
                            </>
                          )}
                        </label>
                      )}
                      {pdfParseError && parsingPDFForProfile === null && (
                        <div className="pm-pdf-error">{pdfParseError}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Auth gate ───────────────────────────────────────────────────────────
  // While the session is resolving, show a minimal splash. If configured and
  // not signed in, show the register/login screen instead of the app.
  if (authConfigured && session === undefined) {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <span className="auth-glyph">☉</span>
          <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Loading…</p>
        </div>
      </div>
    );
  }
  if (authConfigured && !user) {
    return <AuthScreen />;
  }

  // Small magnifier button overlaid on each chart; opens the enlarge modal.
  const zoomBtn = (id) => (
    <button type="button" className="chart-zoom-btn" title="Enlarge chart" aria-label="Enlarge chart"
      onClick={() => setZoomId(id)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    </button>
  );

  return (
    <div className="app-container">
      {/* Profile Manager Modal */}
      {renderProfileManagerModal()}

      {/* Cloud Sync Settings Modal */}
      {renderSyncSettingsModal()}

      {/* First-run guided tour */}
      {showGuide && (
        <GuideTour tabs={TABS} isAdmin={isAdmin} onClose={closeGuide} onFinish={finishGuide} />
      )}

      {/* Admin dashboard (admin accounts only) */}
      {showAdmin && isAdmin && (
        <AdminDashboard onClose={() => setShowAdmin(false)} />
      )}

      {/* Enlarged chart viewer with prev/next across all charts */}
      {(() => {
        if (!zoomId) return null;
        const idx = allCharts.findIndex(c => c.id === zoomId);
        if (idx < 0) return null;
        const cur = allCharts[idx];
        return (
          <div className="chart-zoom-overlay" onClick={() => setZoomId(null)}>
            <div className="chart-zoom-modal" onClick={e => e.stopPropagation()}>
              <div className="chart-zoom-head">
                <h3 className="chart-zoom-title">{cur.title}</h3>
                <button className="pm-close" onClick={() => setZoomId(null)} aria-label="Close">✕</button>
              </div>
              <div className="chart-zoom-body">
                <button className="chart-zoom-nav" disabled={idx <= 0}
                  onClick={() => setZoomId(allCharts[idx - 1].id)} aria-label="Previous chart">‹</button>
                <div className="chart-zoom-svg">
                  {renderNorthIndianChart(cur.planets, cur.lagnaSign)}
                </div>
                <button className="chart-zoom-nav" disabled={idx >= allCharts.length - 1}
                  onClick={() => setZoomId(allCharts[idx + 1].id)} aria-label="Next chart">›</button>
              </div>
              <p className="chart-zoom-sub">{cur.subtitle} · {idx + 1} / {allCharts.length}</p>
            </div>
          </div>
        );
      })()}

      {/* Header Banner */}
      <header className="app-header">
        <div className="header-inner">
          <div>
            <h1 className="header-title">Astro-Transit Chart</h1>
            <p className="header-subtitle">Vedic Jyotish & Karmic Trik Bhava Analytics Engine</p>
          </div>
          <div className="header-actions">
            <button
              className="header-help-btn"
              onClick={() => setShowGuide(true)}
              title="Open the guided tour"
              aria-label="Help and guided tour"
            >?</button>
            {isAdmin && (
              <button
                className="theme-toggle"
                onClick={() => setShowAdmin(true)}
                title="Admin dashboard — users & profiles"
              >🛡 Admin</button>
            )}
            <button
              className="theme-toggle"
              onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? 'Switch to Celestial Gold (light) theme' : 'Switch to Midnight Sky (dark) theme'}
            >
              <span className="tt-icon">{theme === 'dark' ? '☀' : '☾'}</span>
              {theme === 'dark' ? 'Day' : 'Night'}
            </button>
{isAdmin && (
            <button
              className="theme-toggle"
              onClick={() => setShowSyncSettings(true)}
              title={
                syncStatus === 'off' ? 'Cloud sync is off — click to set up automatic profile backup'
                : syncStatus === 'error' ? `Sync error: ${syncError} — click to fix`
                : syncStatus === 'saving' ? 'Saving changes to cloud…'
                : syncStatus === 'loading' ? 'Loading profiles from cloud…'
                : 'All data synced to cloud'
              }
            >
              <span className={`sync-dot sync-${syncStatus}`} />
              ☁ {syncStatus === 'off' ? 'Sync' : syncStatus === 'error' ? 'Error' : syncStatus === 'synced' ? 'Synced' : '…'}
            </button>
            )}
            <button className="header-profile-btn" onClick={() => { setProfileForm({ name: '', color: PROFILE_COLORS[savedProfiles.length % PROFILE_COLORS.length], notes: '' }); setEditingProfileId(null); setShowProfileManager(true); }}>
              ⊙ Profiles {savedProfiles.length > 0 && <span className="header-profile-count">{savedProfiles.length}</span>}
            </button>
            {user && (
              <div className="user-menu">
                <button className="user-chip" onClick={() => setShowUserMenu(v => !v)} title={user.email}>
                  <span className="user-avatar">{(user.email || '?').charAt(0).toUpperCase()}</span>
                  <span className="user-email-short">{user.email}</span>
                  <span aria-hidden>▾</span>
                </button>
                {showUserMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} onClick={() => setShowUserMenu(false)} />
                    <div className="user-pop">
                      <div className="user-pop-email">Signed in as<br /><strong>{user.email}</strong></div>
                      <button className="user-pop-signout" onClick={handleSignOut}>Sign Out</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Profile Switcher Bar */}
      <div className="profile-bar">
        <div className="profile-bar-inner">
          {savedProfiles.length === 0 ? (
            <span className="profile-bar-hint">No profiles yet — save one to switch between charts instantly</span>
          ) : (
            <div className="profile-bar-scroll">
              {savedProfiles.map(prof => {
                const isActive = activeProfileId === prof.id;
                return (
                  <button
                    key={prof.id}
                    className={`profile-card-btn${isActive ? ' active' : ''}`}
                    onClick={() => handleLoadProfile(prof)}
                    title={`Load ${prof.profileName}`}
                  >
                    <span className="pcb-avatar" style={{ background: prof.color || '#ca8a04' }}>
                      {(prof.profileName || 'U').charAt(0).toUpperCase()}
                    </span>
                    <span className="pcb-info">
                      <span className="pcb-name">{prof.profileName}</span>
                      <span className="pcb-meta">{prof.birthDetails?.date?.split('-')[0] || '—'}{prof.lifeEvents?.length ? ` · ${prof.lifeEvents.length}ev` : ''}</span>
                    </span>
                    {isActive && <span className="pcb-active-pip" />}
                  </button>
                );
              })}
            </div>
          )}
          <div className="profile-bar-actions">
            <button
              className="pba-btn"
              onClick={() => {
                setProfileForm({ name: birthDetails.name || '', color: PROFILE_COLORS[savedProfiles.length % PROFILE_COLORS.length], notes: '' });
                setEditingProfileId(null);
                setShowProfileManager(true);
              }}
            >+ Save Current</button>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Controls, Right Display */}
      <main className="dashboard-layout" style={{ gridTemplateColumns: birthFormCollapsed ? '48px 1fr' : '380px 1fr', transition: 'grid-template-columns 0.3s ease' }}>
        
        {/* Left Side: Setup & Input Panel */}
        <section className={`setup-panel glass-card${birthFormCollapsed ? ' panel-collapsed' : ''}`}>
          {birthFormCollapsed ? (
            <div className="panel-collapsed-bar" onClick={() => setBirthFormCollapsed(false)} title="Expand panel">
              <span className="panel-collapsed-arrow">▶</span>
              <span className="panel-collapsed-label">Birth &amp; Location Profile</span>
            </div>
          ) : (
            <h2 className="section-title" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none' }}
              onClick={() => setBirthFormCollapsed(true)}>
              Birth &amp; Location Profile
              <span style={{ fontSize:'16px', fontWeight:'400', color:'var(--gold-dark)', marginLeft:'8px' }}>◀</span>
            </h2>
          )}
          
          {!birthFormCollapsed && (<>
          {/* Online Place Geocoder Form */}
          <form onSubmit={handleSearchLocation} className="search-form">
            <div className="input-group">
              <label htmlFor="searchQuery" className="input-label">Search Birth Place Online</label>
              <div className="search-bar-row">
                <input
                  type="text"
                  id="searchQuery"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Mumbai, Maharashtra"
                  className="text-input search-input"
                />
                <button type="submit" className="btn btn-primary" disabled={geocodingLoading}>
                  {geocodingLoading ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>
          </form>

          {geocodingError && <p className="error-message">{geocodingError}</p>}

          <div className="separator"></div>

          {/* Core Birth Input Fields */}
          <div className="birth-inputs-grid">
            <div className="input-group">
              <label htmlFor="birthName" className="input-label">Name</label>
              <input
                type="text"
                id="birthName"
                value={birthDetails.name}
                onChange={(e) => setBirthDetails({ ...birthDetails, name: e.target.value })}
                className="text-input"
              />
            </div>

            <div className="input-group">
              <label htmlFor="birthDate" className="input-label">Birth Date (Local)</label>
              <input
                type="date"
                id="birthDate"
                value={birthDetails.date}
                onChange={(e) => setBirthDetails({ ...birthDetails, date: e.target.value })}
                className="text-input"
              />
            </div>

            <div className="input-group">
              <label htmlFor="birthTime" className="input-label">Birth Time (Local)</label>
              <input
                type="time"
                id="birthTime"
                value={birthDetails.time}
                onChange={(e) => setBirthDetails({ ...birthDetails, time: e.target.value })}
                className="text-input"
              />
            </div>

            <div className="input-group">
              <label htmlFor="birthTz" className="input-label">Timezone (GMT Offset)</label>
              <input
                type="number"
                step="0.5"
                id="birthTz"
                value={birthDetails.timezone}
                onChange={(e) => setBirthDetails({ ...birthDetails, timezone: parseFloat(e.target.value) })}
                className="text-input"
              />
            </div>

            <div className="input-group">
              <label htmlFor="birthLat" className="input-label">Latitude (°N)</label>
              <input
                type="number"
                step="0.0001"
                id="birthLat"
                value={birthDetails.latitude}
                onChange={(e) => setBirthDetails({ ...birthDetails, latitude: parseFloat(e.target.value) })}
                className="text-input"
              />
            </div>

            <div className="input-group">
              <label htmlFor="birthLon" className="input-label">Longitude (°E)</label>
              <input
                type="number"
                step="0.0001"
                id="birthLon"
                value={birthDetails.longitude}
                onChange={(e) => setBirthDetails({ ...birthDetails, longitude: parseFloat(e.target.value) })}
                className="text-input"
              />
            </div>
          </div>

          <div className="place-display">
            <strong>Current Coordinate Preset:</strong> {birthDetails.placeName} 
            <br />
            <small>({birthDetails.latitude.toFixed(4)}° N, {birthDetails.longitude.toFixed(4)}° E, GMT {birthDetails.timezone >= 0 ? '+' : ''}{birthDetails.timezone})</small>
          </div>

          <div className="separator"></div>
          
          {/* Active Profile Indicator */}
          <div style={{ marginTop: '15px' }}>
            {(() => {
              const ap = savedProfiles.find(p => p.id === activeProfileId);
              if (ap) {
                return (
                  <div className="active-profile-strip">
                    <div className="aps-avatar" style={{ background: ap.color || '#ca8a04' }}>
                      {ap.profileName.charAt(0).toUpperCase()}
                    </div>
                    <div className="aps-info">
                      <div className="aps-name">{ap.profileName}</div>
                      <div className="aps-sub">{ap.lifeEvents?.length || 0} life events · Active Profile</div>
                    </div>
                    <button className="btn btn-secondary aps-sync-btn" onClick={handleUpdateActiveProfileData} title="Sync current birth details & life events into saved profile">
                      Sync ↑
                    </button>
                  </div>
                );
              }
              return (
                <div className="aps-empty">
                  No active profile — use the Profile Bar above to switch
                </div>
              );
            })()}
          </div>

          <button onClick={handleGenerateNatal} className="btn btn-secondary full-width margin-top">
            Recalculate Birth Chart
          </button>

          {/* Persistence status strip */}
          <div className="persistence-strip">
            <div className="persist-item">
              <span className="persist-dot persist-green" />
              <span>Birth details auto-saved</span>
            </div>
            <div className="persist-item">
              <span className="persist-dot persist-green" />
              <span>{lifeEvents.length} life events saved</span>
            </div>
            <div className="persist-item">
              <span className="persist-dot persist-green" />
              <span>{savedProfiles.length} profile{savedProfiles.length !== 1 ? 's' : ''} in memory</span>
            </div>
            <button
              type="button"
              className="persist-clear-btn"
              title="Clear all saved data"
              onClick={() => {
                if (window.confirm('Clear all saved data (birth details, life events, profiles, predictions)?')) {
                  ['astro_birth_details','astro_life_events','astro_saved_profiles','astro_saved_predictions','astro_csv_autoloaded'].forEach(k => localStorage.removeItem(k));
                  window.location.reload();
                }
              }}
            >
              Clear all data
            </button>
          </div>
          </>)}
        </section>

        {/* Right Side: Tabbed Display & Output Panel */}
        <section className="display-panel glass-card">
          
          {/* Tab Navigation Menu */}
          <nav className="tab-menu">
            {TABS.map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                title={`${tab.label} (press ${i + 1})`}
              >
                <span className="tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Active tab description + shortcut hint */}
          <div className="tab-hint">
            <span>{TABS.find(t => t.id === activeTab)?.desc}</span>
            <span className="tab-hint-keys">Tip: press <kbd>1</kbd>–<kbd>6</kbd> to switch tabs</span>
          </div>

          {/* Separator */}
          <div className="separator"></div>

          {/* Empty state when no chart has been generated yet */}
          {!natalChart && activeTab !== 'historical-transits' && (
            <div className="empty-state">
              <span className="empty-state-icon">☉</span>
              <h3>No Birth Chart Yet</h3>
              <p>
                Enter your birth date, time and place in the panel on the left
                (use the online place search to fill coordinates automatically),
                then generate your chart to unlock every tab.
              </p>
              <button className="btn btn-primary" onClick={handleGenerateNatal}>
                ✦ Generate Birth Chart
              </button>
            </div>
          )}

          {/* TAB CONTENT 1: Birth Details & Trik Bhava Analysis */}
          {activeTab === 'birth-chart' && natalChart && (
            <div className="tab-content-fade">
              <div className="birth-summary-row">
                <h3 className="tab-section-title">Birth Analysis of {birthDetails.name}</h3>
                <span className="info-badge">Lahiri Ayanamsha: {formatDegrees(natalChart.ayanamsha)}</span>
              </div>

              {/* At-a-glance summary strip */}
              {(() => {
                const moon = natalChart.planets.moon;
                const sun = natalChart.planets.sun;
                const { currentMahadasha, currentAntardasha } = dashaData
                  ? getCurrentDasha(dashaData, new Date())
                  : { currentMahadasha: null, currentAntardasha: null };
                return (
                  <div className="glance-strip">
                    <div className="glance-chip">
                      <span className="glance-icon">↑</span>
                      <div className="glance-body">
                        <div className="glance-label">Lagna (Asc)</div>
                        <div className="glance-value">{SIGNS[natalChart.lagnaSign].name}</div>
                        <div className="glance-sub">{SIGNS[natalChart.lagnaSign].sanskrit} · {formatDegrees(natalChart.lagnaDegree)}</div>
                      </div>
                    </div>
                    {moon && (
                      <div className="glance-chip">
                        <span className="glance-icon">☽</span>
                        <div className="glance-body">
                          <div className="glance-label">Moon Sign</div>
                          <div className="glance-value">{moon.signName}</div>
                          <div className="glance-sub">{moon.nakshatraName} · Pada {moon.pada}</div>
                        </div>
                      </div>
                    )}
                    {sun && (
                      <div className="glance-chip">
                        <span className="glance-icon">☉</span>
                        <div className="glance-body">
                          <div className="glance-label">Sun Sign</div>
                          <div className="glance-value">{sun.signName}</div>
                          <div className="glance-sub">{sun.nakshatraName}</div>
                        </div>
                      </div>
                    )}
                    {currentMahadasha && (
                      <div
                        className="glance-chip clickable"
                        onClick={() => setActiveTab('dasha-system')}
                        title="Open the full Vimshottari Dasha timeline"
                      >
                        <span className="glance-icon">⏳</span>
                        <div className="glance-body">
                          <div className="glance-label">Running Dasha</div>
                          <div className="glance-value">
                            {currentMahadasha.lord}{currentAntardasha ? ` / ${currentAntardasha.lord}` : ''}
                          </div>
                          <div className="glance-sub">
                            Until {currentMahadasha.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })} →
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Table of Planet Positions matching Astro-Sage Grid style */}
              <div className="table-responsive">
                <table className="planetary-table">
                  <thead>
                    <tr>
                      <th>Planet</th>
                      <th>Zodiac Sign</th>
                      <th>Sanskrit Sign</th>
                      <th>Longitude</th>
                      <th>Dignity</th>
                      <th>Retrograde</th>
                      <th>Nakshatra</th>
                      <th>Pada</th>
                      <th>Nakshatra Lord</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Ascendant details as first row */}
                    <tr>
                      <td><strong>Ascendant (Lagna)</strong></td>
                      <td>{SIGNS[natalChart.lagnaSign].name}</td>
                      <td>{SIGNS[natalChart.lagnaSign].sanskrit}</td>
                      <td>{formatDegrees(natalChart.lagnaDegree)}</td>
                      <td>--</td>
                      <td>--</td>
                      <td>{NAKSHATRAS[Math.floor((natalChart.lagnaSign * 30 + natalChart.lagnaDegree) / 13.333333)].name}</td>
                      <td>{Math.floor(((natalChart.lagnaSign * 30 + natalChart.lagnaDegree) % 13.333333) / 3.333333) + 1}</td>
                      <td>{NAKSHATRAS[Math.floor((natalChart.lagnaSign * 30 + natalChart.lagnaDegree) / 13.333333)].lord}</td>
                    </tr>
                    {/* Planet positions rows */}
                    {Object.keys(natalChart.planets).map(key => {
                      const p = natalChart.planets[key];
                      const dignity = getPlanetDignity(p.id, p.signIndex);
                      const dignityLabel = dignity === 'exalted' ? '⬆ Exalted' : dignity === 'debilitated' ? '⬇ Debilitated' : dignity === 'own' ? '✦ Own Sign' : '—';
                      const dignityClass = dignity === 'exalted' ? 'dignity-exalted' : dignity === 'debilitated' ? 'dignity-debilitated' : dignity === 'own' ? 'dignity-own' : '';
                      return (
                        <tr key={p.id}>
                          <td>{PLANET_NAMES[p.id]}</td>
                          <td>{p.signName}</td>
                          <td>{p.signSanskrit}</td>
                          <td>{formatDegrees(p.degree)}</td>
                          <td><span className={dignityClass}>{dignityLabel}</span></td>
                          <td>{p.retrograde ? <span className="retrograde-indicator">Yes (R)</span> : 'No'}</td>
                          <td>{p.nakshatraName}</td>
                          <td>{p.pada}</td>
                          <td>{p.nakshatraLord}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ✨ AI Reading (Cloudflare Workers AI) */}
              <AIReading summary={chartSummary} disabled={!chartSummary} />

              {/* Trik Bhava Commentary and Yogas Section */}
              {trikBhavaAnalysis && (
                <div className="trik-analysis-block">
                  <h3 className="tab-section-title spacing-top">Trik Bhava & Karmic Shadow Analysis</h3>
                  <p className="karmic-disclaimer">
                    Based on <em>Brihat Parashara Hora Shastra</em> and the karmic-psychological teachings of 
                    Pandit Krishna Ashant's <em>Trik Bhavo Ki Gatha</em>. Focusing on the challenges, transformations, 
                    and expenditures of the 6th, 8th, and 12th houses.
                  </p>

                  {/* Active Yogas */}
                  {trikBhavaAnalysis.yogas.length > 0 && (
                    <div className="yogas-list">
                      <h4 className="card-subtitle font-gold">Formed Vipareeta Raja Yogas</h4>
                      {trikBhavaAnalysis.yogas.map((yoga, i) => (
                        <div key={i} className="yoga-card alert-card">
                          <strong>{yoga.name}</strong>: {yoga.description}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* House Commentary Grid */}
                  <div className="trik-commentary-grid">
                    <div className="trik-card glass-subcard">
                      <div className="trik-card-header">
                        <span className="card-badge bg-6">6th House</span>
                        <h4>Shatru, Roga, Rina (Struggles & Healing)</h4>
                      </div>
                      <p className="trik-detail-text">
                        <strong>6th Lord ({trikBhavaAnalysis.placements[6].lord.toUpperCase()})</strong> resides in the{' '}
                        <strong>{trikBhavaAnalysis.placements[6].placedHouse} House</strong> ({trikBhavaAnalysis.placements[6].placedSignName}).
                      </p>
                      <p className="trik-body-text">
                        {DUSTHANA_INTERPRETATIONS.lord6[trikBhavaAnalysis.placements[6].placedHouse]}
                      </p>
                    </div>

                    <div className="trik-card glass-subcard">
                      <div className="trik-card-header">
                        <span className="card-badge bg-8">8th House</span>
                        <h4>Ayu, Randhra (Secret transformations & Occult)</h4>
                      </div>
                      <p className="trik-detail-text">
                        <strong>8th Lord ({trikBhavaAnalysis.placements[8].lord.toUpperCase()})</strong> resides in the{' '}
                        <strong>{trikBhavaAnalysis.placements[8].placedHouse} House</strong> ({trikBhavaAnalysis.placements[8].placedSignName}).
                      </p>
                      <p className="trik-body-text">
                        {DUSTHANA_INTERPRETATIONS.lord8[trikBhavaAnalysis.placements[8].placedHouse]}
                      </p>
                    </div>

                    <div className="trik-card glass-subcard">
                      <div className="trik-card-header">
                        <span className="card-badge bg-12">12th House</span>
                        <h4>Vyaya, Moksha (Losses, Sleep, Dissolution)</h4>
                      </div>
                      <p className="trik-detail-text">
                        <strong>12th Lord ({trikBhavaAnalysis.placements[12].lord.toUpperCase()})</strong> resides in the{' '}
                        <strong>{trikBhavaAnalysis.placements[12].placedHouse} House</strong> ({trikBhavaAnalysis.placements[12].placedSignName}).
                      </p>
                      <p className="trik-body-text">
                        {DUSTHANA_INTERPRETATIONS.lord12[trikBhavaAnalysis.placements[12].placedHouse]}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Current Dasha Summary Banner */}
              {dashaData && (() => {
                const { currentMahadasha, currentAntardasha } = getCurrentDasha(dashaData, new Date());
                if (!currentMahadasha) return null;
                const mEnd = currentMahadasha.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
                const adEnd = currentAntardasha ? currentAntardasha.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : '';
                return (
                  <div className="dasha-banner glass-subcard spacing-top" style={{ borderLeft: '3px solid var(--accent-gold)', padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>Current Mahadasha</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-gold)', textTransform: 'capitalize' }}>{currentMahadasha.lord} Dasha</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ends {mEnd} · {DASHA_YEARS[currentMahadasha.lord]} yr period</div>
                    </div>
                    {currentAntardasha && (
                      <div style={{ borderLeft: '1px solid rgba(139,92,246,0.3)', paddingLeft: '18px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>Current Antardasha</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-violet)', textTransform: 'capitalize' }}>{currentAntardasha.lord} Antardasha</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ends {adEnd}</div>
                      </div>
                    )}
                    <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
                      → See full timeline in <strong style={{ color: 'var(--accent-violet)', cursor: 'pointer' }} onClick={() => setActiveTab('dasha-system')}>Vimshottari Dasha</strong> tab
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB CONTENT 2: Interactive North Indian Chart (Kundali) */}
          {activeTab === 'interactive-chart' && natalChart && (
            <div className="tab-content-fade">
              <h3 className="tab-section-title">Vedic Chart Layout (Kundali)</h3>
              
              <div className="chart-comparison-view">
                
                {/* Natal Chart Column */}
                <div className="chart-column">
                  <h4 className="chart-column-title">Lagna / Birth Chart</h4>
                  <div className="chart-svg-container">
                    {zoomBtn('natal')}
                    {renderNorthIndianChart(natalChart.planets, natalChart.lagnaSign)}
                  </div>
                  <p className="chart-description">
                    Lagna: <strong>{SIGNS[natalChart.lagnaSign].name}</strong> ({formatDegrees(natalChart.lagnaDegree)})
                  </p>
                </div>

                {/* Transit Chart Column */}
                <div className="chart-column">
                  <h4 className="chart-column-title font-purple">Transit Chart</h4>
                  <div className="chart-svg-container">
                    {transitChart && zoomBtn('transit')}
                    {transitChart && renderNorthIndianChart(transitChart.planets, natalChart.lagnaSign, true)}
                  </div>
                  <p className="chart-description" style={{ minHeight: '2.8em' }}>
                    {transitDragInfo
                      ? <span style={{ color:'var(--accent-gold)', fontWeight:700 }}>
                          ⟳ Dragging <em>{transitDragInfo.planetId}</em> — {transitDateInput} {transitTimeInput} UTC
                        </span>
                      : <>Transit Date: <strong>{transitDateInput}</strong> {transitTimeInput} UTC
                          <br/><span style={{ fontSize:'11px', opacity:0.6 }}>Drag any planet to scrub time</span></>
                    }
                  </p>
                </div>
              </div>

              {/* Divisional charts (Vargas) */}
              {vargaCharts.length > 0 && (
                <div className="varga-section glass-subcard">
                  <h4 className="card-subtitle">Divisional Charts (Vargas)</h4>
                  <p className="section-description">
                    Harmonic sub-charts derived from your sidereal positions — each magnifies a
                    specific area of life. Lagna and planets are re-mapped per the Parashari method.
                  </p>
                  <div className="varga-grid">
                    {vargaCharts.map(v => (
                      <div key={v.id} className="varga-cell">
                        <div className="varga-cell-title">{v.label}</div>
                        <div className="chart-svg-container varga-svg">
                          {zoomBtn(v.id)}
                          {renderNorthIndianChart(v.planets, v.lagnaSign)}
                        </div>
                        <div className="varga-cell-sub">Lagna: <strong>{SIGNS[v.lagnaSign].name}</strong></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Slider for real-time transit scrubbing */}
              <div className="transit-slider-controls glass-subcard">
                <h4 className="card-subtitle">Real-Time Transit Scrubber</h4>
                
                <div className="slider-row">
                  <div className="input-group flex-1">
                    <label htmlFor="transitDate" className="input-label">Transit Date</label>
                    <input
                      type="date"
                      id="transitDate"
                      value={transitDateInput}
                      onChange={(e) => setTransitDateInput(e.target.value)}
                      className="text-input"
                    />
                  </div>
                  <div className="input-group flex-1">
                    <label htmlFor="transitTime" className="input-label">Transit Time (UTC)</label>
                    <input
                      type="time"
                      id="transitTime"
                      value={transitTimeInput}
                      onChange={(e) => setTransitTimeInput(e.target.value)}
                      className="text-input"
                    />
                  </div>
                  <div className="input-group flex-1 checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={showNakshatras}
                        onChange={(e) => setShowNakshatras(e.target.checked)}
                      />
                      Show Nakshatras
                    </label>
                  </div>
                </div>

                {/* Timeline scrubber: direct date control, monthly precision, 1950–2060 */}
                <div className="scrubber-range-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                    <label htmlFor="yearScrubber" className="input-label" style={{ marginBottom: 0 }}>
                      Timeline Scrubber
                    </label>
                    <span style={{ fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                      {new Date(`${transitDateInput}T12:00:00Z`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
                    </span>
                  </div>
                  <input
                    type="range"
                    id="yearScrubber"
                    min="1950"
                    max="2060"
                    step="0.0833"
                    value={(() => {
                      const d = new Date(`${transitDateInput}T12:00:00Z`);
                      return d.getFullYear() + d.getMonth() / 12;
                    })()}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      const year = Math.floor(val);
                      const month = Math.round((val - year) * 12);
                      const d = new Date(Date.UTC(year, month, 1));
                      setTransitDateInput(d.toISOString().split('T')[0]);
                    }}
                    className="range-scrubber"
                  />
                  <div className="scrubber-legend">
                    <span>1950</span>
                    <span>2005</span>
                    <span>2060</span>
                  </div>
                </div>
              </div>

              {/* Transit Nakshatra Info if enabled */}
              {showNakshatras && transitChart && (
                <div className="nakshatra-explorer glass-subcard spacing-top">
                  <h4 className="card-subtitle">Transit Nakshatra Coordinates</h4>
                  <div className="nakshatra-grid">
                    {Object.keys(transitChart.planets).map(key => {
                      const p = transitChart.planets[key];
                      const nLord = p.nakshatraLord;
                      const nPada = p.pada;
                      const nName = p.nakshatraName;
                      
                      return (
                        <div key={p.id} className="nak-badge">
                          <strong>{p.name}</strong>: {nName} (Pada {nPada})
                          <br />
                          <small className="font-gold">Ruler: {nLord}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT 3: Historical Transit Explorer */}
          {activeTab === 'historical-transits' && (
            <div className="tab-content-fade">
              <h3 className="tab-section-title">Sign Transits Lookup (1976 - 2026)</h3>
              <p className="tab-instructions">
                Scan when the slow-moving planetary bodies (Saturn, Jupiter, Rahu, Ketu) changed zodiac signs during the last 50 years.
              </p>

              <div className="transit-selector-row glass-subcard">
                <div className="input-group">
                  <label htmlFor="transitPlanet" className="input-label">Select Planet</label>
                  <select
                    id="transitPlanet"
                    value={selectedTransitPlanet}
                    onChange={(e) => setSelectedTransitPlanet(e.target.value)}
                    className="text-input"
                  >
                    <option value="saturn">Saturn (Shani) - Slow transit ~2.5 yrs per sign</option>
                    <option value="jupiter">Jupiter (Guru) - Mid transit ~1 yr per sign</option>
                    <option value="rahu">Rahu (North Node) - Nodes transit ~1.5 yrs per sign</option>
                    <option value="ketu">Ketu (South Node) - Nodes transit ~1.5 yrs per sign</option>
                  </select>
                </div>
                <button
                  onClick={handleScanHistoricalTransits}
                  className="btn btn-primary"
                  disabled={scanningTransits}
                >
                  {scanningTransits ? 'Scanning...' : 'Scan 50 Years'}
                </button>
              </div>

              {/* Transit results */}
              {historicalTransits.length > 0 && (
                <div className="historical-results-list">
                  <h4 className="card-subtitle">Found {historicalTransits.length} Transit Sign Changes</h4>
                  <div className="table-responsive">
                    <table className="transit-results-table">
                      <thead>
                        <tr>
                          <th>Date of Transit</th>
                          <th>Left Sign</th>
                          <th>Entered Sign</th>
                          <th>Sign Element</th>
                          <th>Sign Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalTransits.map((tr, index) => {
                          const toSign = SIGNS.find(s => s.name === tr.toSignName);
                          return (
                            <tr key={index}>
                              <td><strong>{new Date(tr.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></td>
                              <td className="text-muted">{tr.fromSignName} ({SIGNS[tr.fromSign].sanskrit})</td>
                              <td className="text-highlight">{tr.toSignName} ({SIGNS[tr.toSign].sanskrit})</td>
                              <td>{toSign ? toSign.element : ''}</td>
                              <td>{toSign ? toSign.nature : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT 4: Life Events Matcher & Predictions */}
          {activeTab === 'predictions' && natalChart && (
            <div className="tab-content-fade">
              <h3 className="tab-section-title">Life Events Transit Analytics Matcher</h3>
              <p className="tab-instructions">
                Log major events in your life (marriage, relocations, career changes, illnesses) to map the planetary transit signature during that time.
                The engine will identify similar future transits of Saturn, Jupiter, Rahu, and Ketu between 2026 and 2056, calculating a similarity score, and analyzing your birth chart potential.
              </p>

              {/* ── ACCURACY ENGINE PANEL ── */}
              {(() => {
                const acc = getAccuracyProfile(activePDFData);
                const today = new Date();
                const pratantar = activePDFData ? getActivePratyantar(activePDFData, today) : null;
                const sadesati = activePDFData ? getActiveSadesati(activePDFData, today) : null;
                return (
                  <div className="accuracy-panel glass-subcard spacing-bottom">
                    <div className="acc-header">
                      <div className="acc-title">⚡ Prediction Accuracy Engine</div>
                      <div className="acc-score-row">
                        <div className="acc-bar-track">
                          <div className="acc-bar-fill acc-base" style={{ width: `${acc.base}%` }} title={`Base: ${acc.base}%`} />
                          <div className="acc-bar-fill acc-earned" style={{ width: `${acc.earned}%`, marginLeft: `${acc.base}%` }} title={`PDF boost: +${acc.earned}%`} />
                        </div>
                        <span className="acc-score-num">{acc.total}<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/{acc.max}%</span></span>
                      </div>
                    </div>

                    {/* Data sources grid */}
                    <div className="acc-sources">
                      <div className={`acc-source active`}>
                        <span className="acc-src-dot green" />Transit Positions
                      </div>
                      <div className={`acc-source active`}>
                        <span className="acc-src-dot green" />Mahadasha / Antardasha
                      </div>
                      <div className={`acc-source active`}>
                        <span className="acc-src-dot green" />Trik Bhava Analysis
                      </div>
                      {acc.breakdown.map(b => (
                        <div key={b.key} className={`acc-source${b.active ? ' active' : ' locked'}`}>
                          <span className={`acc-src-dot${b.active ? ' green' : ' grey'}`} />
                          {b.label}
                          {b.active && <span className="acc-src-plus">+{b.points}%</span>}
                        </div>
                      ))}
                    </div>

                    {/* Active Pratyantar & Sadesati */}
                    {(pratantar || sadesati) && (
                      <div className="acc-live-row">
                        {pratantar && (
                          <div className="acc-live-chip">
                            <span className="acc-live-label">Pratyantar Now</span>
                            <strong style={{ textTransform: 'capitalize' }}>
                              {pratantar.maha} › {pratantar.antar} › {pratantar.pratantar}
                            </strong>
                            <span className="acc-live-dates">
                              ends {pratantar.endDate instanceof Date ? pratantar.endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                            </span>
                          </div>
                        )}
                        {sadesati && (
                          <div className={`acc-live-chip sadesati-${sadesati.phase?.toLowerCase() || 'active'}`}>
                            <span className="acc-live-label">Sadesati</span>
                            <strong>{sadesati.type} — {sadesati.phase || ''} Phase</strong>
                            <span className="acc-live-dates">{sadesati.sign} · ends {sadesati.endDate instanceof Date ? sadesati.endDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Unlock suggestions when no PDF */}
                    {!activePDFData && (
                      <div className="acc-unlock-row">
                        <span className="acc-unlock-icon">🔓</span>
                        <div className="acc-unlock-text">
                          <strong>Upload an AstroSage PDF to this profile</strong> to unlock Ashtakvarga bindu scoring,
                          Pratyantar-level timing (±2 week precision), KP sub-lord event triggers, Shadbala-weighted dashas and Sadesati overlays.
                          <br /><em style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Open ⊙ Profiles → select this profile → drop PDF in the upload zone</em>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── UPCOMING TRANSIT WINDOWS (auto-computed) ── */}
              <div className="upcoming-windows-panel glass-subcard spacing-bottom">
                <div className="uw-header">
                  <div className="uw-title">
                    🔮 Upcoming Transit Windows
                    <span className="uw-subtitle">auto-scanned from {lifeEvents.length} life events · past analogs & upcoming</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {autoMatchesComputed && !autoMatchesLoading && (
                      <button className="uw-refresh-btn" onClick={() => { setAutoMatchesKey(null); setAutoMatches([]); setExpandedAutoMatch(null); }}>
                        ↻ Refresh
                      </button>
                    )}
                    {autoMatchesLoading && <span className="uw-scanning-text">⟳ Scanning all events…</span>}
                  </div>
                </div>

                {autoMatchesLoading && (
                  <div className="uw-loading">
                    <div className="uw-loading-bar" />
                    <span>Computing transit signatures for {lifeEvents.length} life events across {new Date().getFullYear()}–{new Date().getFullYear()+3}…</span>
                  </div>
                )}

                {autoMatchesComputed && !autoMatchesLoading && autoMatches.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px 0' }}>
                    No matching transit windows (past or upcoming) found. Try adding more life events.
                  </p>
                )}

                {autoMatchesComputed && !autoMatchesLoading && autoMatches.length > 0 && (
                  <div className="uw-list">
                    {autoMatches.map((match, idx) => {
                      const enhanced = enhanceTransitWithPDFData(match, activePDFData);
                      const isExpanded = expandedAutoMatch === idx;
                      const today = new Date();
                      const peakDate = match.peakDate instanceof Date ? match.peakDate : new Date(match.peakDate);
                      const startDate = match.startDate instanceof Date ? match.startDate : new Date(match.startDate);
                      const endDate = match.endDate instanceof Date ? match.endDate : new Date(match.endDate);
                      const daysToStart = Math.ceil((startDate.getTime() - today.getTime()) / 86400000);
                      const isNow = today >= startDate && today <= endDate;
                      const isThisMonth = !isNow && daysToStart >= 0 && daysToStart <= 35;
                      const isNextMonth = !isNow && !isThisMonth && daysToStart > 35 && daysToStart <= 70;
                      const isPast = match._group === 'past' || endDate.getTime() < today.getTime();
                      const monthsAgo = Math.round((today.getTime() - endDate.getTime()) / (30.4 * 86400000));
                      const pastAgoLabel = monthsAgo >= 12 ? `${Math.round(monthsAgo/12)}y ago` : `${Math.max(1, monthsAgo)}mo ago`;
                      const grp = match._group;
                      const showGroupHeader = idx === 0 || autoMatches[idx - 1]._group !== grp;

                      const { currentMahadasha, currentAntardasha } = dashaData
                        ? getCurrentDasha(dashaData, peakDate) : {};

                      const peakPratantar = activePDFData ? getActivePratyantar(activePDFData, peakDate) : null;
                      const peakSadesati = activePDFData ? getActiveSadesati(activePDFData, peakDate) : null;
                      const peakAlignments = (() => {
                        try { return analyzePeakDateAlignments(peakDate, natalChart.planets, natalChart.lagnaSign); }
                        catch { return []; }
                      })();

                      return (
                        <Fragment key={idx}>
                        {showGroupHeader && (
                          <div className={`uw-group-header ${grp === 'past' ? 'uw-group-past' : 'uw-group-upcoming'}`}>
                            {grp === 'past' ? '↩ Past similar transits (already occurred)' : '🔮 Upcoming windows'}
                          </div>
                        )}
                        <div className={`uw-item${isExpanded ? ' expanded' : ''}${isNow ? ' uw-now' : ''}${isPast ? ' uw-past' : ''}`}>
                          {/* ── Window Header ── */}
                          <div className="uw-item-header" onClick={() => setExpandedAutoMatch(isExpanded ? null : idx)}>
                            <div className="uw-item-left">
                              {/* Time badge */}
                              {isPast && <span className="uw-badge uw-badge-past">↩ {pastAgoLabel}</span>}
                              {isNow && <span className="uw-badge uw-badge-now">● NOW</span>}
                              {isThisMonth && <span className="uw-badge uw-badge-soon">This Month</span>}
                              {isNextMonth && <span className="uw-badge uw-badge-next">Next Month</span>}
                              {!isNow && !isThisMonth && !isNextMonth && daysToStart > 0 && (
                                <span className="uw-badge uw-badge-future">In {Math.ceil(daysToStart/30)}mo</span>
                              )}

                              {/* Date range */}
                              <span className="uw-date-range">
                                <strong>{startDate.toLocaleDateString(undefined, { month:'short', year:'numeric' })}</strong>
                                {' – '}
                                <strong>{endDate.toLocaleDateString(undefined, { month:'short', year:'numeric' })}</strong>
                              </span>

                              {/* Match scores */}
                              <span className="uw-score">{match.score}%</span>
                              {enhanced.adjustedScore !== match.score && activePDFData?.ashtakvarga && (
                                <span className="uw-score adjusted">{enhanced.adjustedScore}%▲</span>
                              )}
                              {peakSadesati && (
                                <span className={`sadesati-chip phase-${peakSadesati.phase?.toLowerCase() || 'active'}`}>
                                  ☄ {peakSadesati.phase}
                                </span>
                              )}
                            </div>

                            <div className="uw-item-right">
                              {/* Reference event */}
                              <span className={`event-category-badge cat-${(match.referenceEvent.category || 'career').toLowerCase()}`}>
                                {match.referenceEvent.category}
                              </span>
                              <span className="uw-ref-name">
                                {match.referenceEvent.name.slice(0, 45)}{match.referenceEvent.name.length > 45 ? '…' : ''}
                                <span className="uw-ref-year">
                                  ({new Date(match.referenceEvent.startDate).getFullYear()})
                                </span>
                              </span>
                              <span className="uw-chevron">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </div>

                          {/* ── Quick summary strip ── */}
                          <div className="uw-summary-strip">
                            {/* Transit houses */}
                            <div className="uw-transits-row">
                              {Object.entries(match.transits || {}).map(([p, t]) => (
                                <span key={p} className="uw-transit-chip">
                                  <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{p.slice(0,3)}</span>
                                  <span>H{t.house}</span>
                                </span>
                              ))}
                            </div>
                            {/* Dasha */}
                            {currentMahadasha && (
                              <div className="uw-dasha-row">
                                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Dasha: </span>
                                <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{currentMahadasha.lord}</span>
                                {currentAntardasha && <span style={{ color: 'var(--text-muted)' }}> › {currentAntardasha.lord}</span>}
                                {peakPratantar && <span style={{ color: 'var(--cyan)', fontSize: '10px' }}> › {peakPratantar.pratantar}</span>}
                              </div>
                            )}
                            {/* Bindu scores if PDF */}
                            {activePDFData?.ashtakvarga && enhanced.binduScores && (
                              <div className="uw-bindu-row">
                                {Object.entries(enhanced.binduScores).map(([planet, scores]) => {
                                  const bl = binduLabel(scores.bindu);
                                  if (!bl) return null;
                                  return (
                                    <span key={planet} className="bindu-chip" style={{ borderColor: bl.color, color: bl.color, fontSize: '10px', padding: '1px 6px' }}>
                                      {planet.slice(0,3)} {scores.bindu}/8
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* ── Expanded full report ── */}
                          {isExpanded && (
                            <div className="uw-expanded-body">
                              {/* Section 1: Transit Data */}
                              <div className="prediction-body-grid" style={{ borderTop: '1px solid var(--border-gold)', paddingTop: '14px' }}>
                                <div className="prediction-section border-right">
                                  <h5 className="prediction-sec-title">Transit Positions at Peak ({peakDate.toLocaleDateString(undefined, { month:'long', day:'numeric', year:'numeric' })})</h5>
                                  <ul className="details-list">
                                    {Object.entries(match.transits || {}).map(([key, tInfo]) => {
                                      const origInfo = match.originalSignature?.eventSignature?.[key];
                                      return (
                                        <li key={key} className={origInfo && tInfo.house === origInfo.house ? 'exact-match' : ''}>
                                          <strong>{key.toUpperCase()}</strong>: House {tInfo.house} ({SIGNS[tInfo.signIndex]?.name})
                                          {origInfo && <><br /><small className="text-muted">(Past: House {origInfo.house} in {SIGNS[origInfo.signIndex]?.name})</small></>}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>

                                <div className="prediction-section">
                                  <h5 className="prediction-sec-title font-purple">Trik Bhava & Natal Potential</h5>
                                  <div className="commentary-scroll">
                                    {match.trikCommentaries.map((com, ci) => (
                                      <div key={ci} className="trik-commentary-item">
                                        <h6 className="commentary-item-title font-gold">{com.title}</h6>
                                        <p className="commentary-item-text">{com.text}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Section 3: Degree alignments */}
                                {peakAlignments.length > 0 && (
                                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-gold)', paddingTop: '12px' }}>
                                    <h5 className="prediction-sec-title font-gold">
                                      Degree & Nakshatra Triggers ({peakAlignments.length} planet{peakAlignments.length !== 1 ? 's' : ''} matched)
                                    </h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {peakAlignments.map((al, ai) => {
                                        const isHigh = al.severity === 'high';
                                        return (
                                          <div key={ai} style={{ padding: '7px 10px', borderRadius: '6px', background: isHigh ? 'rgba(234,179,8,0.05)' : 'rgba(139,92,246,0.03)', border: isHigh ? '1px solid rgba(234,179,8,0.25)' : '1px solid rgba(139,92,246,0.1)', fontSize: '12px' }}>
                                            <strong className="font-purple">{al.transitPlanet}</strong> transits your <strong className="font-gold">{al.transitHouse}H</strong> ({al.transitSign}) at {al.transitDegree.toFixed(1)}° matching natal <strong className="font-gold">{al.natalPlanet}</strong> at {al.natalDegree.toFixed(1)}° — <span style={{ color: isHigh ? 'var(--gold-bright)' : 'var(--violet)', fontWeight: 600 }}>{al.matchType}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Saved Matcher Memory List */}
              {savedPredictions.length > 0 && (
                <div className="saved-predictions-history glass-subcard spacing-bottom">
                  <h4 className="card-subtitle font-gold">Saved Predictions Memory</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {savedPredictions.map(pred => (
                      <div
                        key={pred.id}
                        className="prediction-history-item"
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(139, 92, 246, 0.2)',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px'
                        }}
                      >
                        <div>
                          <strong className="text-highlight" style={{ fontSize: '13px' }}>{pred.title}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Birth Profile: <strong>{pred.profileName}</strong> | Event: <strong>{pred.eventName}</strong> ({pred.eventStart} to {pred.eventEnd})
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleLoadSavedPrediction(pred)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedPrediction(pred.id)}
                            className="btn"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              background: 'transparent',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: 'var(--accent-red, #ef4444)'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CSV Uploader Panel */}
              <div className="csv-uploader-section glass-subcard spacing-bottom">
                <h4 className="card-subtitle">Bulk Import Life Events (CSV)</h4>
                <p className="section-description">
                  Attach/upload a CSV file containing your historical timeline or load the preloaded workspace CSV.
                  Required columns: <code>Year</code>, <code>Event Title</code>. Optional: <code>Description</code>.
                </p>
                
                <div 
                  className={`csv-dropzone ${dragActive ? 'drag-active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="dropzone-content">
                    <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                    <p>Drag and drop your life events CSV file here, or</p>
                    <label className="btn btn-primary file-browse-btn">
                      Browse Files
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleFileChange} 
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>

                {isAdmin && (
                  <div className="csv-actions-row">
                    <button onClick={handleLoadWorkspaceCSV} className="btn btn-secondary">
                      Load Workspace CSV Timeline
                    </button>
                  </div>
                )}

                {csvError && <p className="error-message csv-error">{csvError}</p>}
              </div>

              {/* CSV Import Preview Wizard */}
              {csvPreviewEvents.length > 0 && (
                <div className="import-wizard-card glass-subcard tab-content-fade spacing-bottom">
                  <div className="wizard-header">
                    <h4 className="card-subtitle font-gold">CSV Import Preview Wizard</h4>
                    <span className="info-badge">{csvPreviewEvents.filter(e => e.selected).length} of {csvPreviewEvents.length} Selected</span>
                  </div>
                  <p className="wizard-instructions">
                    We parsed the events and estimated their dates & categories. Review, customize, and edit the events below before importing.
                  </p>
                  
                  <div className="table-responsive wizard-table-container">
                    <table className="wizard-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={csvPreviewEvents.length > 0 && csvPreviewEvents.every(e => e.selected)}
                              onChange={(e) => handleToggleSelectAllPreview(e.target.checked)}
                            />
                          </th>
                          <th>Event Name / Title</th>
                          <th>Category</th>
                          <th>Start Date</th>
                          <th>End Date</th>
                          <th style={{ width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewEvents.map(ev => (
                          <tr key={ev.id} className={ev.selected ? 'row-selected' : 'row-deselected'}>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="checkbox" 
                                checked={ev.selected}
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'selected', e.target.checked)}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={ev.name} 
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'name', e.target.value)}
                                className="text-input preview-row-input"
                              />
                            </td>
                            <td>
                              <select 
                                value={ev.category}
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'category', e.target.value)}
                                className="text-input preview-row-input category-select"
                              >
                                <option value="Career">Career & Success</option>
                                <option value="Finance">Finance & Losses</option>
                                <option value="Relationship">Marriage & Relationships</option>
                                <option value="Health">Health & Struggles</option>
                                <option value="Travel">Travel & Relocation</option>
                                <option value="Spiritual">Spiritual & Self-realization</option>
                              </select>
                            </td>
                            <td>
                              <input 
                                type="date" 
                                value={ev.startDate}
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'startDate', e.target.value)}
                                className="text-input preview-row-input date-select"
                              />
                            </td>
                            <td>
                              <input 
                                type="date" 
                                value={ev.endDate}
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'endDate', e.target.value)}
                                className="text-input preview-row-input date-select"
                              />
                            </td>
                            <td>
                              <button 
                                onClick={() => setCsvPreviewEvents(prev => prev.filter(p => p.id !== ev.id))}
                                className="delete-btn"
                                title="Remove item from import"
                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="action-bar-row">
                    <button 
                      onClick={() => setCsvPreviewEvents([])} 
                      className="btn"
                      style={{ background: 'transparent', border: '1px solid var(--border-cosmic)', color: 'var(--text-primary)' }}
                    >
                      Cancel / Clear
                    </button>
                    <button onClick={handleBulkImport} className="btn btn-primary">
                      Bulk Import Selected Events ({csvPreviewEvents.filter(e => e.selected).length})
                    </button>
                  </div>
                </div>
              )}

              {/* Event Logging Form — collapsible */}
              <div className="event-creation-container glass-subcard collapsible-section">
                <div className="collapsible-header" onClick={() => setAddEventFormOpen(o => !o)}>
                  <h4 className="card-subtitle" style={{ margin: 0 }}>Log New Life Event</h4>
                  <span className="collapsible-chevron">{addEventFormOpen ? '▲' : '▼'}</span>
                </div>
                {!addEventFormOpen && <div className="collapsible-hint">Click to expand and add a new event</div>}
              </div>
              {addEventFormOpen && (
              <div className="event-creation-container glass-subcard" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none', marginTop: '-8px' }}>
                <div style={{ height: 0 }} />
                <form onSubmit={handleAddEvent} className="event-form">
                  <div className="input-group">
                    <label htmlFor="eventName" className="input-label">Event Name / Description</label>
                    <input
                      type="text"
                      id="eventName"
                      value={newEvent.name}
                      onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                      placeholder="e.g. Bought First Home, Started Master's degree"
                      className="text-input"
                    />
                  </div>
                  
                  <div className="date-row">
                    <div className="input-group flex-1">
                      <label htmlFor="eventStart" className="input-label">Start Date</label>
                      <input
                        type="date"
                        id="eventStart"
                        value={newEvent.startDate}
                        onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                        className="text-input"
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label htmlFor="eventEnd" className="input-label">End Date</label>
                      <input
                        type="date"
                        id="eventEnd"
                        value={newEvent.endDate}
                        onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                        className="text-input"
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label htmlFor="eventCat" className="input-label">Category</label>
                      <select
                        id="eventCat"
                        value={newEvent.category}
                        onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                        className="text-input"
                      >
                        <option value="Career">Career & Success</option>
                        <option value="Finance">Finance & Losses</option>
                        <option value="Relationship">Marriage & Relationships</option>
                        <option value="Health">Health & Struggles</option>
                        <option value="Travel">Travel & Relocation</option>
                        <option value="Spiritual">Spiritual & Self-realization</option>
                      </select>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary spacing-top">
                    Add Event to Log
                  </button>
                </form>
              </div>
              )}

              {/* List of logged events — collapsible, default collapsed */}
              <div className="logged-events-list collapsible-section glass-subcard">
                <div className="collapsible-header" onClick={() => setEventsListOpen(o => !o)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h4 className="card-subtitle" style={{ margin: 0 }}>
                      Registered Life Events
                      <span className="events-count-badge">{lifeEvents.length}</span>
                    </h4>
                    {selectedEventId && (
                      <span className="events-active-hint">
                        ● {lifeEvents.find(e => e.id === selectedEventId)?.name?.slice(0, 30)}…
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {!eventsListOpen && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        click to browse &amp; run matcher
                      </span>
                    )}
                    <span className="collapsible-chevron">{eventsListOpen ? '▲ Collapse' : '▼ Expand'}</span>
                  </div>
                </div>

                {eventsListOpen && (
                  <div className="events-grid" style={{ marginTop: '12px' }}>
                    {lifeEvents.map(ev => (
                      <div key={ev.id} className={`event-log-card ${selectedEventId === ev.id ? 'selected' : ''}`}>
                        <div className="event-card-header">
                          <span className={`event-category-badge cat-${ev.category.toLowerCase()}`}>
                            {ev.category}
                          </span>
                          <button onClick={() => handleDeleteEvent(ev.id)} className="delete-btn" title="Delete event">
                            &times;
                          </button>
                        </div>
                        <h5 className="event-log-title">{ev.name}</h5>
                        <p className="event-log-date">Range: {ev.startDate} to {ev.endDate}</p>
                        <button
                          className="btn btn-primary event-predict-btn"
                          style={{ marginTop: '8px', fontSize: '12px', padding: '5px 12px' }}
                          onClick={() => handlePredictFuture(ev)}
                          disabled={predicting}
                          title="Match this event's transit signature against 2026-2056"
                        >
                          🔮 Predict Recurrences
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Predictions Display Report */}
              {predicting && <p className="prediction-loading">Calculating future planetary conjunctions, checking Lahiri Ayanamsha precessions, and scoring patterns...</p>}

              {predictionResults && !predicting && (
                <div className="prediction-report-card tab-content-fade spacing-top">
                  <div className="report-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                    <h3 className="report-main-title" style={{ margin: 0 }}>Astrological Match & Prediction Report</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Save Name (e.g. My Graduation Match)"
                        value={predictionSaveNameInput}
                        onChange={(e) => setPredictionSaveNameInput(e.target.value)}
                        className="text-input"
                        style={{ padding: '6px 10px', fontSize: '12px', width: '220px' }}
                      />
                      <button
                        onClick={handleSaveCurrentPrediction}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        Save Match to Memory
                      </button>
                    </div>
                  </div>
                  <div className="separator"></div>

                  <div className="original-event-details glass-subcard">
                    <h4 className="font-gold font-bold">Historical Event Reference: {predictionResults.event.name}</h4>
                    <p className="original-text">
                      During this event ({predictionResults.event.startDate} to {predictionResults.event.endDate}), the planetary transits relative to your birth chart created a specific signature in your house layout:
                    </p>
                    <ul className="original-signatures-list">
                      {Object.keys(predictionResults.originalSignature.eventSignature).map(key => {
                        const info = predictionResults.originalSignature.eventSignature[key];
                        return (
                          <li key={key}>
                            <strong>{key.toUpperCase()}</strong>: Transiting your{' '}
                            <span className="text-highlight">{info.house} House</span> ({SIGNS[info.signIndex].name} - {SIGNS[info.signIndex].sanskrit})
                            {info.conjunctions.length > 0 && (
                              <span>, conjunct natal: <strong>{info.conjunctions.map(c => c.planet.toUpperCase()).join(', ')}</strong></span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <h4 className="spacing-top font-bold text-highlight">Future Transit Re-occurrences (2026 - 2056)</h4>
                  <p className="prediction-intro">
                    We scanned the next 30 years of daily transits. Below are the peak windows where Saturn, Jupiter, Rahu, and Ketu occupy highly similar house alignments and planetary conjunctions relative to your natal chart.
                  </p>

                  <div className="prediction-results-container">
                    {predictionResults.futureMatches.length === 0 ? (
                      <p className="no-matches-found">No similar transit signatures exceeding a 60% match score were found in the 2026-2056 timeframe. This indicates that this event represents a highly unique, non-repeating karmic alignment in your current lifetime.</p>
                    ) : (
                      predictionResults.futureMatches.map((match, i) => {
                        // Enhance with PDF Ashtakvarga data if available
                        const enhanced = enhanceTransitWithPDFData(match, activePDFData);
                        const peakSadesati = activePDFData ? getActiveSadesati(activePDFData, match.peakDate) : null;
                        const peakPratantar = activePDFData ? getActivePratyantar(activePDFData, match.peakDate) : null;
                        return (
                        <div key={i} className="prediction-item-card glass-subcard">
                          <div className="prediction-item-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span className="match-score-pill">
                                {match.score}% Transit Match
                              </span>
                              {enhanced.adjustedScore !== match.score && (
                                <span className="match-score-pill adjusted" title="Score adjusted by Ashtakvarga bindu weighting">
                                  {enhanced.adjustedScore}% Bindu-Adjusted
                                </span>
                              )}
                              {peakSadesati && (
                                <span className={`sadesati-chip phase-${peakSadesati.phase?.toLowerCase() || 'active'}`}>
                                  ☄ Sadesati {peakSadesati.phase}
                                </span>
                              )}
                            </div>
                            <span className="prediction-date-range">
                              Window: <strong>{match.startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</strong> to <strong>{match.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</strong>
                            </span>
                          </div>

                          {/* Ashtakvarga Bindu Row */}
                          {activePDFData?.ashtakvarga && enhanced.binduScores && (
                            <div className="bindu-row">
                              <span className="bindu-row-label">Ashtakvarga Bindus at peak:</span>
                              {Object.entries(enhanced.binduScores).map(([planet, scores]) => {
                                const bl = binduLabel(scores.bindu);
                                if (!bl) return null;
                                return (
                                  <div key={planet} className="bindu-chip" style={{ borderColor: bl.color, color: bl.color }}>
                                    <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{planet.slice(0,3)}</span>
                                    <span className="bindu-num">{scores.bindu}/8</span>
                                    <span className="bindu-label-text" style={{ color: bl.color }}>{bl.label}</span>
                                  </div>
                                );
                              })}
                              <span className="bindu-avg">Avg: {enhanced.avgBindu}</span>
                            </div>
                          )}

                          {/* Pratyantar timing strip */}
                          {peakPratantar && (
                            <div className="pratantar-strip">
                              <span className="pratantar-label">Pratyantar at peak:</span>
                              <strong style={{ textTransform: 'capitalize' }}>
                                {peakPratantar.maha} Maha › {peakPratantar.antar} Antar › {peakPratantar.pratantar} Pratyantar
                              </strong>
                              <span className="pratantar-dates">
                                {peakPratantar.startDate instanceof Date ? peakPratantar.startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                                {' → '}
                                {peakPratantar.endDate instanceof Date ? peakPratantar.endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                              </span>
                            </div>
                          )}

                          {/* Shadbala dasha-lord strength when PDF loaded */}
                          {activePDFData?.shadbala && (() => {
                            const { currentMahadasha } = dashaData ? getCurrentDasha(dashaData, match.peakDate) : {};
                            if (!currentMahadasha) return null;
                            const sl = shadbalLabel(activePDFData, currentMahadasha.lord);
                            if (!sl) return null;
                            return (
                              <div className="shadbala-strip" style={{ borderColor: sl.color }}>
                                <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{currentMahadasha.lord} Mahadasha lord strength:</span>
                                <span style={{ color: sl.color, fontWeight: 700 }}>{sl.label} ({sl.val.toFixed(2)} Rupas)</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{sl.val >= (activePDFData.shadbala._minimum?.[currentMahadasha.lord] || 5) ? 'Above minimum — dasha delivers results' : 'Below minimum — delayed/weakened results'}</span>
                              </div>
                            );
                          })()}

                          {(() => {
                            const peakAlignments = analyzePeakDateAlignments(match.peakDate, natalChart.planets, natalChart.lagnaSign);
                            return (
                          <div className="prediction-body-grid">

                            {/* SECTION 1: Analytical Transit Data */}
                            <div className="prediction-section border-right">
                              <h5 className="prediction-sec-title">Section 1: Analytical Transit Data</h5>
                              <p className="details-intro">Planetary positions at match peak ({match.peakDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}):</p>
                              <ul className="details-list">
                                {Object.keys(match.transits).map(key => {
                                  const tInfo = match.transits[key];
                                  const origInfo = predictionResults.originalSignature.eventSignature[key];
                                  return (
                                    <li key={key} className={tInfo.house === origInfo.house ? 'exact-match' : ''}>
                                      <strong>{key.toUpperCase()}</strong>: House {tInfo.house} ({SIGNS[tInfo.signIndex].name})
                                      <br />
                                      <small className="text-muted">
                                        (Original: House {origInfo.house} in {SIGNS[origInfo.signIndex].name})
                                      </small>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>

                            {/* SECTION 2: Birth-Chart & Karmic Possibility Analysis */}
                            <div className="prediction-section">
                              <h5 className="prediction-sec-title font-purple">Section 2: Natal Potentials & Trik Bhava Activation</h5>
                              <div className="commentary-scroll">
                                {match.trikCommentaries.map((com, index) => (
                                  <div key={index} className="trik-commentary-item">
                                    <h6 className="commentary-item-title font-gold">{com.title}</h6>
                                    <p className="commentary-item-text">{com.text}</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* SECTION 3: 9-Planet Conjunctions & Degree Activations */}
                            <div className="prediction-full-width spacing-top" style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(139, 92, 246, 0.15)', paddingTop: '14px' }}>
                              <h5 className="prediction-sec-title font-gold" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Section 3: Simultaneous Birth Chart Coordinate Triggers (All 9 Planets)</span>
                                {peakAlignments.length >= 2 ? (
                                  <span className="info-badge font-gold" style={{ background: 'rgba(234, 179, 8, 0.15)', borderColor: 'var(--accent-gold)', textShadow: '0 0 4px var(--accent-gold)' }}>
                                    ★ Critical Alignment Day ({peakAlignments.length} Planets Match)
                                  </span>
                                ) : peakAlignments.length === 1 ? (
                                  <span className="info-badge" style={{ fontSize: '10px' }}>Active Trigger (1 Planet Match)</span>
                                ) : null}
                              </h5>
                              <p className="details-intro" style={{ marginBottom: '10px' }}>
                                Transits of all 9 planets on <strong>{match.peakDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong> — exact degree (±1°) or Nakshatra matches against your birth chart:
                              </p>

                              {peakAlignments.length === 0 ? (
                                <p className="no-matches-found" style={{ padding: '6px 0', fontSize: '12px' }}>No exact degree or Nakshatra conjunctions on this peak date.</p>
                              ) : (
                                <div className="alignment-badges-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {peakAlignments.map((al, idx) => {
                                      const isHigh = al.severity === 'high';
                                      return (
                                        <div 
                                          key={idx} 
                                          className="alignment-badge-row" 
                                          style={{ 
                                            background: isHigh ? 'rgba(234, 179, 8, 0.05)' : 'rgba(139, 92, 246, 0.03)',
                                            border: isHigh ? '1px solid rgba(234, 179, 8, 0.25)' : '1px solid rgba(139, 92, 246, 0.1)',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '8px'
                                          }}
                                        >
                                          <div>
                                            Transiting <strong className="font-purple">{al.transitPlanet}</strong> transits your <strong className="font-gold">{al.transitHouse} House</strong> ({al.transitSign}) at {al.transitDegree.toFixed(1)}° ({al.transitNakshatra} Nakshatra).
                                            <br />
                                            <span style={{ color: 'var(--text-muted)' }}>
                                              Matches Natal <strong className="font-gold">{al.natalPlanet}</strong> in your <strong className="font-gold">{al.natalHouse} House</strong> ({al.natalSign}) at {al.natalDegree.toFixed(1)}° ({al.natalNakshatra} Nakshatra).
                                            </span>
                                          </div>
                                          <div style={{ textAlign: 'right' }}>
                                            <span className={`event-category-badge ${isHigh ? 'cat-finance' : 'cat-travel'}`} style={{ padding: '2px 8px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                              {al.matchType}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>

                          </div>
                          ); })()}
                        </div>
                      );}
                    )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT 5: Same-Degree & Same-Nakshatra Alignments Scanner */}
          {activeTab === 'alignment-transits' && natalChart && (
            <div className="tab-content-fade">
              <h3 className="tab-section-title">Degree & Nakshatra Transits Scanner</h3>
              <p className="tab-instructions">
                In Vedic Jyotish, deep karmic shifts are triggered when a transiting planet passes through the exact degree (within 1.0°) of a natal planet. 
                If the transit is also in the <strong>same Nakshatra</strong> (direct conjunction), it is categorized as a <strong>Life-Changing Event</strong>. 
                If they match in degree but transits in a <strong>different house/sign</strong>, it triggers key harmonic aspects and adjustments.
              </p>

              <div className="scan-controls-block glass-subcard spacing-bottom text-center" style={{ textAlign: 'center', padding: '30px 20px' }}>
                <h4 className="card-subtitle font-gold">Scan Future Transit Alignments (2026 - 2056)</h4>
                <p className="section-description spacing-bottom" style={{ maxWidth: '600px', margin: '10px auto 20px' }}>
                  The engine will scan the next 30 years of Saturn, Jupiter, Rahu, and Ketu transits, cross-referencing your birth chart coordinates to identify these key dates.
                </p>
                <button 
                  onClick={handleScanDegreeAlignments} 
                  className="btn btn-secondary"
                  disabled={scanningAlignments}
                >
                  {scanningAlignments ? 'Scanning Future Transits...' : 'Scan 30 Years for Alignments'}
                </button>
              </div>

              {scanningAlignments && (
                <div className="prediction-loading">
                  Searching daily ephemeris, checking Lahiri Ayanamsha boundaries, and computing degree overlaps...
                </div>
              )}

              {hasScannedAlignments && !scanningAlignments && (
                <div className="scanned-alignments-results tab-content-fade">
                  <h4 className="card-subtitle">Found {degreeAlignments.length} Significant Transit Alignments</h4>
                  <p className="section-description spacing-bottom">
                    Review the chronological timeline of planetary triggers below. Pay special attention to "Life-Changing Conjunctions" which mark major shifts.
                  </p>
                  <div className="alignments-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {degreeAlignments.length === 0 ? (
                      <p className="no-matches-found">No alignments matching the exact degree (within 1°) of your birth chart planets were found in this timeframe.</p>
                    ) : (
                      degreeAlignments.map((al, index) => {
                        const isHigh = al.severity === 'high';
                        return (
                          <div
                            key={index}
                            className={`alignment-card glass-subcard ${isHigh ? 'life-changing' : 'aspect-only'}`}
                            style={{
                              borderLeft: isHigh ? '3px solid var(--accent-gold)' : '3px solid var(--accent-violet)',
                              boxShadow: isHigh ? 'var(--shadow-neon-gold)' : 'none',
                              padding: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <div className="alignment-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(139, 92, 246, 0.1)', paddingBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                              <span className="prediction-date-range">
                                Peak Date: <strong>{al.date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                              </span>
                              <span className={`event-category-badge ${isHigh ? 'cat-finance' : 'cat-career'}`} style={{ fontSize: '10px', padding: '3px 8px', fontWeight: 'bold' }}>
                                {al.matchType}
                              </span>
                            </div>
                            <div className="alignment-card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginTop: '4px' }}>
                              <div className="alignment-quick-info" style={{ borderRight: '1px solid rgba(139, 92, 246, 0.1)', paddingRight: '16px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px' }}>
                                <div><strong>Transit:</strong> <span className="font-purple">{al.transitPlanet}</span> at {al.transitDegree.toFixed(1)}°</div>
                                <div><strong>House:</strong> {al.transitHouse} ({al.transitSign})</div>
                                <div><strong>Nakshatra:</strong> {al.transitNakshatra}</div>
                                <div style={{ height: '1px', background: 'rgba(139, 92, 246, 0.08)', margin: '4px 0' }}></div>
                                <div><strong>Natal Match:</strong> <span className="font-gold">{al.natalPlanet}</span> at {al.natalDegree.toFixed(1)}°</div>
                                <div><strong>House:</strong> {al.natalHouse} ({al.natalSign})</div>
                                <div><strong>Nakshatra:</strong> {al.natalNakshatra}</div>
                              </div>
                              <div className="alignment-explanation-text" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', lineHeight: '1.5', textAlign: 'justify' }}>
                                <p style={{ margin: 0 }}>{al.description}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT 6: Vimshottari Dasha System */}
          {activeTab === 'dasha-system' && natalChart && dashaData && (() => {
            const today = new Date();
            const { currentMahadasha, currentAntardasha, nextMahadasha } = getCurrentDasha(dashaData, today);

            const dashaColors = {
              ketu: '#ef4444', venus: '#ec4899', sun: '#f97316', moon: '#6366f1',
              mars: '#dc2626', rahu: '#8b5cf6', jupiter: '#22c55e', saturn: '#64748b', mercury: '#06b6d4'
            };

            const fmtDate = (d) => d instanceof Date
              ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
              : '';

            const totalMs = (d) => d.endDate.getTime() - d.startDate.getTime();
            const pct = (d) => Math.max(0, Math.min(100, (Math.min(today.getTime(), d.endDate.getTime()) - d.startDate.getTime()) / totalMs(d) * 100));

            return (
              <div className="tab-content-fade">
                <h3 className="tab-section-title">Vimshottari Dasha — 120 Year Planetary Period System</h3>
                <p className="tab-instructions">
                  Derived from the Moon&apos;s Nakshatra at birth. The Mahadasha (major period) governs the primary karmic theme of each life phase, subdivided into 9 Antardashas following the same planetary sequence.
                  {activePDFData?.pratyantar?.length > 0 && ' Pratyantar (3rd-level) periods from your uploaded PDF are shown inside each Antardasha.'}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Birth Moon: <strong style={{ color: 'var(--accent-gold)' }}>{natalChart.planets.moon.nakshatraName}</strong> Nakshatra (Lord: {natalChart.planets.moon.nakshatraLord}) — Pada {natalChart.planets.moon.pada} · {formatDegrees(natalChart.planets.moon.longitude)} in {natalChart.planets.moon.signName}
                </p>

                {/* Pratyantar summary banner when PDF loaded */}
                {activePDFData?.pratyantar?.length > 0 && (() => {
                  const pr = getActivePratyantar(activePDFData, today);
                  if (!pr) return null;
                  return (
                    <div className="pratantar-banner glass-subcard spacing-bottom">
                      <div className="pratantar-banner-icon">⏱</div>
                      <div className="pratantar-banner-body">
                        <div className="pratantar-banner-title">Active Pratyantar (3rd-Level Period)</div>
                        <div className="pratantar-banner-lords">
                          <span style={{ textTransform: 'capitalize' }}>{pr.maha}</span>
                          <span className="pratantar-arrow">›</span>
                          <span style={{ textTransform: 'capitalize' }}>{pr.antar}</span>
                          <span className="pratantar-arrow">›</span>
                          <span style={{ textTransform: 'capitalize', color: 'var(--gold-bright)', fontWeight: 700 }}>{pr.pratantar}</span>
                        </div>
                        <div className="pratantar-banner-dates">
                          {pr.startDate instanceof Date ? pr.startDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                          {' → '}
                          {pr.endDate instanceof Date ? pr.endDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                        </div>
                      </div>
                      {activePDFData.shadbala?.[pr.pratantar] && (() => {
                        const sl = shadbalLabel(activePDFData, pr.pratantar);
                        return sl ? (
                          <div className="pratantar-banner-strength" style={{ color: sl.color }}>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '2px' }}>Pratyantar Lord Strength</div>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>{sl.label}</div>
                            <div style={{ fontSize: '11px' }}>{sl.val.toFixed(2)} Rupas</div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  );
                })()}

                {currentMahadasha && (
                  <div className="glass-subcard spacing-bottom" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '20px', border: '1px solid rgba(234,179,8,0.3)' }}>
                    <div>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>Active Mahadasha</div>
                      <div style={{ fontSize: '22px', fontWeight: 'bold', color: dashaColors[currentMahadasha.lord] || 'var(--accent-gold)', textTransform: 'capitalize' }}>{currentMahadasha.lord} Dasha</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{fmtDate(currentMahadasha.startDate)} → {fmtDate(currentMahadasha.endDate)}</div>
                      <div style={{ marginTop: '10px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct(currentMahadasha).toFixed(1)}%`, background: dashaColors[currentMahadasha.lord] || 'var(--accent-gold)', borderRadius: '3px' }} />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{pct(currentMahadasha).toFixed(1)}% elapsed</div>
                    </div>
                    {currentAntardasha && (
                      <div>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>Active Antardasha</div>
                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: dashaColors[currentAntardasha.lord] || 'var(--accent-violet)', textTransform: 'capitalize' }}>{currentAntardasha.lord} Antardasha</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{fmtDate(currentAntardasha.startDate)} → {fmtDate(currentAntardasha.endDate)}</div>
                        <div style={{ marginTop: '10px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct(currentAntardasha).toFixed(1)}%`, background: dashaColors[currentAntardasha.lord] || 'var(--accent-violet)', borderRadius: '3px' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{pct(currentAntardasha).toFixed(1)}% elapsed</div>
                      </div>
                    )}
                    {nextMahadasha && (
                      <div style={{ opacity: 0.7 }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>Next Mahadasha</div>
                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: dashaColors[nextMahadasha.lord] || 'var(--text-primary)', textTransform: 'capitalize' }}>{nextMahadasha.lord} Dasha</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Begins {fmtDate(nextMahadasha.startDate)}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{DASHA_YEARS[nextMahadasha.lord]}-year period</div>
                      </div>
                    )}
                  </div>
                )}

                <h4 className="card-subtitle spacing-top" style={{ marginBottom: '10px' }}>Full Dasha Timeline</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dashaData.map((dasha, dashIdx) => {
                    const isActive = currentMahadasha && dasha.lord === currentMahadasha.lord && dasha.startDate.getTime() === currentMahadasha.startDate.getTime();
                    const isPast = dasha.endDate < today;
                    const isExpanded = expandedDasha === dashIdx;
                    return (
                      <div
                        key={dashIdx}
                        className="glass-subcard"
                        style={{
                          border: isActive ? '1px solid var(--accent-gold)' : '1px solid rgba(139,92,246,0.15)',
                          boxShadow: isActive ? '0 0 12px rgba(234,179,8,0.12)' : 'none',
                          opacity: isPast ? 0.55 : 1,
                          overflow: 'hidden'
                        }}
                      >
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer' }}
                          onClick={() => setExpandedDasha(isExpanded ? null : dashIdx)}
                        >
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dashaColors[dasha.lord] || '#888', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'capitalize', color: isActive ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                              {dasha.lord.charAt(0).toUpperCase() + dasha.lord.slice(1)} Mahadasha
                            </span>
                            {dasha.isPartial && (
                              <span style={{ fontSize: '10px', background: 'rgba(139,92,246,0.2)', padding: '1px 6px', borderRadius: '8px', marginLeft: '8px', color: 'var(--text-muted)' }}>Balance</span>
                            )}
                            {isActive && (
                              <span style={{ fontSize: '10px', background: 'rgba(234,179,8,0.2)', padding: '1px 6px', borderRadius: '8px', marginLeft: '8px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>ACTIVE NOW</span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                            <div>{fmtDate(dasha.startDate)} → {fmtDate(dasha.endDate)}</div>
                            <div>{dasha.years.toFixed(1)} yrs</div>
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>

                        {/* Progress bar for active mahadasha */}
                        {isActive && (
                          <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}>
                            <div style={{ height: '100%', width: `${pct(dasha).toFixed(1)}%`, background: 'var(--accent-gold)' }} />
                          </div>
                        )}

                        {/* Expanded: Antardasha grid */}
                        {isExpanded && (
                          <div style={{ borderTop: '1px solid rgba(139,92,246,0.12)', padding: '12px 16px 8px' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '8px' }}>Antardashas</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px' }}>
                              {dasha.antardashas.map((antar, aIdx) => {
                                const isCurrentAntar = isActive && currentAntardasha && antar.lord === currentAntardasha.lord && Math.abs(antar.startDate.getTime() - currentAntardasha.startDate.getTime()) < 864e5;
                                const antarPast = antar.endDate < today;
                                return (
                                  <div key={aIdx} style={{
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    background: isCurrentAntar ? 'rgba(234,179,8,0.06)' : 'rgba(255,255,255,0.02)',
                                    border: isCurrentAntar ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(139,92,246,0.1)',
                                    opacity: antarPast ? 0.5 : 1,
                                    fontSize: '12px'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: dashaColors[antar.lord] || '#888' }} />
                                      <strong style={{ textTransform: 'capitalize', color: isCurrentAntar ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                                        {antar.lord.charAt(0).toUpperCase() + antar.lord.slice(1)}
                                      </strong>
                                      {isCurrentAntar && (
                                        <span style={{ fontSize: '9px', background: 'rgba(234,179,8,0.25)', padding: '0 4px', borderRadius: '6px', color: 'var(--accent-gold)' }}>NOW</span>
                                      )}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                      {fmtDate(antar.startDate)} {'->'} {fmtDate(antar.endDate)}
                                    </div>
                                    {/* Pratyantar (3rd level) inline list from PDF data */}
                                    {isCurrentAntar && activePDFData?.pratyantar?.length > 0 && (() => {
                                      const prMatch = activePDFData.pratyantar.find(pr =>
                                        pr.maha === dasha.lord && pr.antar === antar.lord &&
                                        pr.startDate && pr.endDate && today >= pr.startDate && today <= pr.endDate
                                      );
                                      if (!prMatch?.pratantars?.length) return null;
                                      let segCursor = prMatch.startDate;
                                      return (
                                        <div className="pratantar-inline-list">
                                          {prMatch.pratantars.map((pp, pIdx) => {
                                            const segStart = segCursor;
                                            segCursor = pp.endDate;
                                            const isNow = pp.endDate && today <= pp.endDate && today >= segStart;
                                            const isPastSeg = pp.endDate && today > pp.endDate;
                                            return (
                                              <div key={pIdx} className={`pratantar-inline-row${isNow ? ' active' : ''}${isPastSeg ? ' past' : ''}`}>
                                                <div className="pratantar-dot" style={{ background: dashaColors[pp.lord] || '#888' }} />
                                                <span className="pratantar-lord" style={{ textTransform: 'capitalize' }}>{pp.lord}</span>
                                                <span className="pratantar-end">{'->'}  {fmtDate(pp.endDate)}</span>
                                                {isNow && <span className="pratantar-now-badge">NOW</span>}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </section>
      </main>

      {/* Back to top button */}
      {showTopBtn && (
        <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="Back to top">↑</button>
      )}
    </div>
  );
}

export default App;
// auth + per-user data isolation + private PDF storage (Supabase)
