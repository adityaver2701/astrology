import { useEffect, useRef } from 'react';
import { PRIMARY_TABS, SECONDARY_TABS, TABS } from '../constants';

// ── Mobile bottom navigation ──────────────────────────────────────────────
// Replaces the horizontally-scrolling tab strip on phones. Eight tabs with
// labels like "Degree & Nakshatra Transits" cannot fit across a 400px screen,
// and a scrolling strip hides most of them off-edge with no affordance — you
// have to drag blindly to find out what exists.
//
// So: the four most-used tabs sit in a fixed bottom bar within thumb reach,
// and the rest live in a "More" sheet that shows each tab's full label AND its
// description, which the strip never had room for.
//
// Rendered at all viewport sizes; CSS hides it above 768px, where the original
// `.tab-menu` takes over. Keeping both mounted means no layout shift or
// remount when rotating a tablet across the breakpoint.

export default function MobileNav({ activeTab, setActiveTab, moreOpen, setMoreOpen }) {
  const sheetRef = useRef(null);
  const activeIsSecondary = SECONDARY_TABS.some(t => t.id === activeTab);

  // Lock background scrolling while the sheet is open, and restore the exact
  // previous value rather than assuming it was ''.
  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [moreOpen]);

  // Escape closes the sheet (hardware Back is handled in App.jsx, which owns
  // the priority order across every overlay).
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen, setMoreOpen]);

  // Move focus into the sheet so screen readers and keyboards follow it open.
  useEffect(() => {
    if (moreOpen) sheetRef.current?.focus();
  }, [moreOpen]);

  const choose = (id) => {
    setActiveTab(id);
    setMoreOpen(false);
    // Jumping tabs mid-scroll leaves you deep inside the new tab's content.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeTabMeta = TABS.find(t => t.id === activeTab);

  return (
    <>
      {/* ── Bottom bar ── */}
      <nav className="mobile-nav" aria-label="Main">
        {PRIMARY_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`mobile-nav-btn ${activeTab === tab.id && !moreOpen ? 'active' : ''}`}
            onClick={() => choose(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            <span className="mobile-nav-icon" aria-hidden="true">{tab.icon}</span>
            <span className="mobile-nav-label">{tab.short}</span>
          </button>
        ))}

        <button
          type="button"
          className={`mobile-nav-btn ${moreOpen || activeIsSecondary ? 'active' : ''}`}
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
        >
          <span className="mobile-nav-icon" aria-hidden="true">☰</span>
          {/* When a secondary tab is active, show which one rather than a
              generic "More" — otherwise the bar looks like nothing is selected. */}
          <span className="mobile-nav-label">
            {activeIsSecondary ? activeTabMeta?.short : 'More'}
          </span>
        </button>
      </nav>

      {/* ── More sheet ── */}
      {moreOpen && (
        <div
          className="mobile-sheet-overlay"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="mobile-sheet"
            role="menu"
            tabIndex={-1}
            ref={sheetRef}
            aria-label="All sections"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-sheet-grip" aria-hidden="true" />
            <h2 className="mobile-sheet-title">All sections</h2>

            <div className="mobile-sheet-list">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="menuitem"
                  className={`mobile-sheet-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => choose(tab.id)}
                >
                  <span className="mobile-sheet-icon" aria-hidden="true">{tab.icon}</span>
                  <span className="mobile-sheet-text">
                    <span className="mobile-sheet-label">{tab.label}</span>
                    <span className="mobile-sheet-desc">{tab.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
