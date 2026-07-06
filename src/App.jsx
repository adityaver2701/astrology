import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  calculatePlanets,
  calculateAscendantLongitude,
  getJulianDate,
  scanPlanetTransits,
  matchLifeEventTransits,
  predictFutureReoccurrences,
  analyzeTrikBhavaNatal,
  SIGNS,
  scanDegreeAlignments,
  calculateVimshottariDasha,
  getCurrentDasha,
} from './astrologyEngine';
import {
  getSyncConfig, setSyncConfig, clearSyncConfig, isSupabaseConfigured,
  cloudLoad, cloudSave, testConnection, SyncConflictError,
  signOut, getSession, onAuthChange,
  uploadReport, getReportUrl,
} from './cloudSync';
import AuthScreen from './AuthScreen';
import GuideTour from './GuideTour';
import AdminDashboard from './AdminDashboard';
import KundaliChart from './components/KundaliChart';
import SyncSettingsModal from './components/SyncSettingsModal';
import ProfileManagerModal from './components/ProfileManagerModal';
import { VARGAS, buildVargaChart } from './vargas';
import {
  PROFILE_COLORS, DEFAULT_BIRTH, ADMIN_EMAILS, PLANET_NAMES, TABS,
} from './constants';
import { parseCSV, classifyCategory, parseEventDates } from './utils/csv';
import { offsetForLocalTime, isValidTimeZone } from './utils/timezone';
import { buildShareUrl, parseSharedChart, clearSharedChartParam } from './utils/share';
// pdfParser is only loaded dynamically on PDF upload — never part of the static bundle

// ── Tab panels are lazy-loaded: each becomes its own chunk, and switching
//    tabs no longer re-renders 4,000 lines of unrelated JSX. ──
const BirthChartTab = lazy(() => import('./tabs/BirthChartTab'));
const InteractiveChartTab = lazy(() => import('./tabs/InteractiveChartTab'));
const HistoricalTransitsTab = lazy(() => import('./tabs/HistoricalTransitsTab'));
const PredictionsTab = lazy(() => import('./tabs/PredictionsTab'));
const AlignmentsTab = lazy(() => import('./tabs/AlignmentsTab'));
const DashaTab = lazy(() => import('./tabs/DashaTab'));
const PanchangaTab = lazy(() => import('./tabs/PanchangaTab'));
const CompatibilityTab = lazy(() => import('./tabs/CompatibilityTab'));

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

  // Weekly transit-alert emails (worker cron) — per-user opt-in, synced in the bundle.
  const [alertsEnabled, setAlertsEnabled] = useState(false);

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
  const lastSyncedAtRef = useRef(null);  // updated_at of the row we last pulled/pushed (conflict detection)

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
    setAlertsEnabled(false);
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
    lifeEvents: d.lifeEvents,
    alertsEnabled: !!d.alertsEnabled
  });

  const applyCloudBundle = useCallback((d) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d.savedProfiles)) setSavedProfiles(d.savedProfiles);
    if (Array.isArray(d.savedPredictions)) setSavedPredictions(d.savedPredictions);
    if (Array.isArray(d.lifeEvents)) setLifeEvents(d.lifeEvents);
    setAlertsEnabled(!!d.alertsEnabled);
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
          lastSyncedAtRef.current = row.updatedAt || null;
        } else {
          // Fresh account: start clean and seed an empty bundle for this user.
          resetLocalData();
          const bundle = {
            version: 1, savedProfiles: [], savedPredictions: [], activeProfileId: null,
            birthDetails: { ...DEFAULT_BIRTH }, lifeEvents: [], alertsEnabled: false,
            savedAt: new Date().toISOString()
          };
          const saved = await cloudSave(bundle);
          lastPushedJsonRef.current = canonicalBundleJson(bundle);
          lastSyncedAtRef.current = saved?.updatedAt || null;
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
      alertsEnabled,
      savedAt: new Date().toISOString()
    };
    const json = canonicalBundleJson(bundle);
    if (json === lastPushedJsonRef.current) return;
    setSyncStatus('saving');
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        // Conflict-aware push: refuses to clobber a row another device updated
        // after our last pull (previously this was blind last-write-wins).
        const saved = await cloudSave(bundle, { expectedUpdatedAt: lastSyncedAtRef.current });
        lastPushedJsonRef.current = json;
        lastSyncedAtRef.current = saved?.updatedAt || null;
        setSyncStatus('synced');
        setSyncError('');
      } catch (err) {
        if (err instanceof SyncConflictError) {
          const useCloud = window.confirm(
            'This account was updated from another device since this page last synced.\n\n' +
            'OK — load the newer cloud data (recommended; this device\u2019s unsynced edits are discarded)\n' +
            'Cancel — overwrite the cloud with THIS device\u2019s data'
          );
          if (useCloud && err.serverData) {
            applyCloudBundle(err.serverData);
            lastPushedJsonRef.current = canonicalBundleJson(err.serverData);
            lastSyncedAtRef.current = err.serverUpdatedAt || null;
            setSyncStatus('synced');
            setSyncError('');
          } else {
            try {
              const forced = await cloudSave(bundle); // no expectedUpdatedAt = force
              lastPushedJsonRef.current = json;
              lastSyncedAtRef.current = forced?.updatedAt || null;
              setSyncStatus('synced');
              setSyncError('');
            } catch (err2) {
              setSyncStatus('error');
              setSyncError(err2.message || 'Could not save to cloud');
            }
          }
          return;
        }
        console.error('Cloud sync save error', err);
        setSyncStatus('error');
        setSyncError(err.message || 'Could not save to cloud');
      }
    }, 1500);
    return () => clearTimeout(syncTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedProfiles, savedPredictions, activeProfileId, birthDetails, lifeEvents, alertsEnabled, user?.id]);

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

  // One-click: prepare the chart and create-or-update + sync a profile for it.
  const [prepareFlash, setPrepareFlash] = useState('');
  const handlePrepareAndSave = useCallback(() => {
    handleGenerateNatal(); // ensure the chart reflects the latest inputs
    const name = (birthDetails.name || '').trim();
    if (!name) { setPrepareFlash('name-required'); return; }
    const key = `${name}|${birthDetails.date}`;
    const existing = savedProfiles.find(p => `${p.profileName}|${p.birthDetails?.date}` === key);
    if (existing) {
      setSavedProfiles(prev => prev.map(p => p.id === existing.id
        ? { ...p, birthDetails: { ...birthDetails }, lifeEvents: [...lifeEvents] }
        : p));
      setActiveProfileId(existing.id);
      localStorage.setItem('astro_active_profile_id', String(existing.id));
      setPrepareFlash('updated');
    } else {
      const newProfile = {
        id: Date.now(),
        profileName: name,
        color: PROFILE_COLORS[savedProfiles.length % PROFILE_COLORS.length],
        birthDetails: { ...birthDetails },
        lifeEvents: [...lifeEvents],
        createdAt: new Date().toISOString(),
        notes: '',
      };
      setSavedProfiles(prev => [...prev, newProfile]);
      setActiveProfileId(newProfile.id);
      localStorage.setItem('astro_active_profile_id', String(newProfile.id));
      setPrepareFlash('saved');
    }
    // The savedProfiles change triggers the debounced cloud auto-save effect.
    setTimeout(() => setPrepareFlash(''), 4000);
  }, [handleGenerateNatal, birthDetails, lifeEvents, savedProfiles]);

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
      // Primary: Open-Meteo geocoder — returns the IANA timezone, so we can
      // compute the true historical UTC offset (incl. DST) at the birth moment.
      let place = null;
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=1&format=json`);
        const d = await r.json();
        if (d?.results?.length) {
          const it = d.results[0];
          place = {
            name: [it.name, it.admin1, it.country].filter(Boolean).join(', '),
            lat: it.latitude, lon: it.longitude, tzId: it.timezone || null,
          };
        }
      } catch { /* fall through to Nominatim */ }

      if (!place) {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) {
          place = { name: data[0].display_name, lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), tzId: null };
        }
      }

      if (place) {
        setBirthDetails(prev => {
          // True offset at the birth date when we know the IANA zone;
          // otherwise fall back to the old longitude estimate.
          const offset = place.tzId && isValidTimeZone(place.tzId)
            ? offsetForLocalTime(place.tzId, prev.date, prev.time)
            : null;
          return {
            ...prev,
            placeName: place.name,
            latitude: place.lat,
            longitude: place.lon,
            timezone: offset !== null ? offset : Math.round((place.lon / 15) * 2) / 2,
            tzId: place.tzId || undefined,
          };
        });
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

  // When the birth date/time changes and we know the place's IANA timezone,
  // keep the numeric offset in sync (handles DST at the birth moment).
  useEffect(() => {
    if (!birthDetails.tzId || !isValidTimeZone(birthDetails.tzId)) return;
    const offset = offsetForLocalTime(birthDetails.tzId, birthDetails.date, birthDetails.time);
    if (offset !== null && offset !== birthDetails.timezone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBirthDetails(prev => ({ ...prev, timezone: offset }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birthDetails.tzId, birthDetails.date, birthDetails.time]);

  // ── Shareable chart links ────────────────────────────────────────────────
  // On first load, a ?chart= param overrides birth details (read-only view of
  // someone else's chart — nothing is saved unless the viewer does so).
  const [sharedChartActive, setSharedChartActive] = useState(false);
  useEffect(() => {
    const shared = parseSharedChart();
    if (shared) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBirthDetails(shared);
      setSharedChartActive(true);
      clearSharedChartParam();
    }
  }, []);

  const [shareFlash, setShareFlash] = useState(false);
  const handleShareChart = useCallback(async () => {
    const url = buildShareUrl(birthDetails);
    try {
      await navigator.clipboard.writeText(url);
      setShareFlash(true);
      setTimeout(() => setShareFlash(false), 2500);
    } catch {
      window.prompt('Copy this share link:', url);
    }
  }, [birthDetails]);

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

  return (
    <div className="app-container">
      {/* Profile Manager Modal */}
      <ProfileManagerModal
        showProfileManager={showProfileManager} setShowProfileManager={setShowProfileManager}
        editingProfileId={editingProfileId} setEditingProfileId={setEditingProfileId}
        profileForm={profileForm} setProfileForm={setProfileForm}
        savedProfiles={savedProfiles} setSavedProfiles={setSavedProfiles}
        activeProfileId={activeProfileId} setActiveProfileId={setActiveProfileId}
        birthDetails={birthDetails} lifeEvents={lifeEvents}
        handleExportProfiles={handleExportProfiles} handleImportProfiles={handleImportProfiles}
        handleLoadProfile={handleLoadProfile} handleUpdateActiveProfileData={handleUpdateActiveProfileData}
        handleDuplicateProfile={handleDuplicateProfile} handleDeleteProfile={handleDeleteProfile}
        handleProfilePDFUpload={handleProfilePDFUpload} parsingPDFForProfile={parsingPDFForProfile}
        pdfParseError={pdfParseError} downloadingReport={downloadingReport} handleDownloadReport={handleDownloadReport}
      />

      {/* Cloud Sync Settings Modal */}
      <SyncSettingsModal
        showSyncSettings={showSyncSettings} setShowSyncSettings={setShowSyncSettings}
        syncForm={syncForm} setSyncForm={setSyncForm}
        syncError={syncError} syncStatus={syncStatus} syncConnecting={syncConnecting}
        handleSyncConnect={handleSyncConnect} handleSyncDisconnect={handleSyncDisconnect}
      />
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
                  <KundaliChart planets={cur.planets} lagnaSign={cur.lagnaSign} />
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
            <button
              className="theme-toggle"
              onClick={handleShareChart}
              title="Copy a read-only link to the current birth chart"
            >⤴ {shareFlash ? 'Link copied!' : 'Share'}</button>
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
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid rgba(139,92,246,0.15)' }}
                        title="Get a weekly email when a significant transit window is approaching (requires server email setup)">
                        <input type="checkbox" checked={alertsEnabled} onChange={e => setAlertsEnabled(e.target.checked)} />
                        Email transit alerts <span style={{ opacity: 0.6 }}>(beta)</span>
                      </label>
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

      {/* Shared-chart banner */}
      {sharedChartActive && (
        <div style={{ maxWidth: '1400px', margin: '10px auto 0', padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.08)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
          <span>👁</span>
          <span style={{ flex: 1 }}>
            Viewing a <strong>shared chart</strong>{birthDetails.name ? <> — <strong>{birthDetails.name}</strong></> : null}.
            Nothing is saved to your profiles unless you press “Prepare Chart &amp; Save Profile”.
          </span>
          <button className="pm-close" onClick={() => setSharedChartActive(false)} aria-label="Dismiss">✕</button>
        </div>
      )}

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

          <button onClick={handlePrepareAndSave} className="btn btn-primary full-width margin-top prepare-save-btn">
            ✦ Prepare Chart &amp; Save Profile
          </button>
          {prepareFlash === 'name-required' && (
            <p className="prepare-flash err">⚠ Enter a Name above so this can be saved as a profile.</p>
          )}
          {prepareFlash === 'saved' && (
            <p className="prepare-flash ok">✓ Chart ready — profile created &amp; synced to your account.</p>
          )}
          {prepareFlash === 'updated' && (
            <p className="prepare-flash ok">✓ Chart ready — existing profile updated &amp; synced.</p>
          )}

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
          {!natalChart && !['historical-transits', 'panchanga', 'compatibility'].includes(activeTab) && (
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


          {/* Lazy-loaded tab content */}
          <Suspense fallback={<div className="tab-loading" style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>✦ Loading…</div>}>
            {activeTab === 'birth-chart' && natalChart && (
              <BirthChartTab
                birthDetails={birthDetails} natalChart={natalChart} dashaData={dashaData}
                trikBhavaAnalysis={trikBhavaAnalysis} chartSummary={chartSummary} setActiveTab={setActiveTab}
              />
            )}

            {activeTab === 'interactive-chart' && natalChart && (
              <InteractiveChartTab
                natalChart={natalChart} transitChart={transitChart} vargaCharts={vargaCharts}
                transitDateInput={transitDateInput} setTransitDateInput={setTransitDateInput}
                transitTimeInput={transitTimeInput} setTransitTimeInput={setTransitTimeInput}
                showNakshatras={showNakshatras} setShowNakshatras={setShowNakshatras}
                onZoom={setZoomId}
              />
            )}

            {activeTab === 'historical-transits' && (
              <HistoricalTransitsTab
                selectedTransitPlanet={selectedTransitPlanet} setSelectedTransitPlanet={setSelectedTransitPlanet}
                historicalTransits={historicalTransits} scanningTransits={scanningTransits}
                handleScanHistoricalTransits={handleScanHistoricalTransits}
              />
            )}

            {activeTab === 'predictions' && natalChart && (
              <PredictionsTab
                natalChart={natalChart} dashaData={dashaData} activePDFData={activePDFData}
                lifeEvents={lifeEvents} isAdmin={isAdmin}
                autoMatches={autoMatches} autoMatchesComputed={autoMatchesComputed} autoMatchesLoading={autoMatchesLoading}
                expandedAutoMatch={expandedAutoMatch} setExpandedAutoMatch={setExpandedAutoMatch}
                setAutoMatchesKey={setAutoMatchesKey} setAutoMatches={setAutoMatches}
                savedPredictions={savedPredictions}
                handleLoadSavedPrediction={handleLoadSavedPrediction} handleDeleteSavedPrediction={handleDeleteSavedPrediction}
                csvPreviewEvents={csvPreviewEvents} setCsvPreviewEvents={setCsvPreviewEvents}
                dragActive={dragActive} csvError={csvError}
                handleDrag={handleDrag} handleDrop={handleDrop} handleFileChange={handleFileChange}
                handleLoadWorkspaceCSV={handleLoadWorkspaceCSV} handleBulkImport={handleBulkImport}
                handleUpdatePreviewEvent={handleUpdatePreviewEvent} handleToggleSelectAllPreview={handleToggleSelectAllPreview}
                newEvent={newEvent} setNewEvent={setNewEvent}
                addEventFormOpen={addEventFormOpen} setAddEventFormOpen={setAddEventFormOpen}
                eventsListOpen={eventsListOpen} setEventsListOpen={setEventsListOpen}
                selectedEventId={selectedEventId} predicting={predicting} predictionResults={predictionResults}
                handleAddEvent={handleAddEvent} handleDeleteEvent={handleDeleteEvent} handlePredictFuture={handlePredictFuture}
                predictionSaveNameInput={predictionSaveNameInput} setPredictionSaveNameInput={setPredictionSaveNameInput}
                handleSaveCurrentPrediction={handleSaveCurrentPrediction}
              />
            )}

            {activeTab === 'alignment-transits' && natalChart && (
              <AlignmentsTab
                handleScanDegreeAlignments={handleScanDegreeAlignments}
                scanningAlignments={scanningAlignments} hasScannedAlignments={hasScannedAlignments}
                degreeAlignments={degreeAlignments}
              />
            )}

            {activeTab === 'dasha-system' && natalChart && dashaData && (
              <DashaTab
                natalChart={natalChart} dashaData={dashaData} activePDFData={activePDFData}
                expandedDasha={expandedDasha} setExpandedDasha={setExpandedDasha}
              />
            )}

            {activeTab === 'panchanga' && <PanchangaTab birthDetails={birthDetails} />}

            {activeTab === 'compatibility' && <CompatibilityTab savedProfiles={savedProfiles} />}
          </Suspense>
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
