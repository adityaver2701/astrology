import { useState } from 'react';

// ── First-run guided walkthrough ──────────────────────────────────────────
// A step carousel that introduces the layout: the Birth & Location Profile,
// each analysis tab (built from the same TABS metadata the nav uses), profiles,
// and the AI reading. Shown automatically the first time a user signs in, and
// re-openable any time from the header "?" button.
function buildSteps(tabs, isAdmin) {
  const steps = [];

  steps.push({
    icon: '☉',
    title: 'Welcome to Astro-Transit Chart',
    body: (
      <>
        <p>This is a Vedic astrology (Jyotish) workbench. In a minute you can cast a
        sidereal birth chart, watch live transits, and match real life events to
        planetary periods.</p>
        <p>This quick tour explains every part of the screen. Use <strong>Next</strong> /
        <strong> Back</strong>, or <strong>Skip</strong> anytime — you can reopen it from
        the <strong>?</strong> button in the header.</p>
      </>
    ),
  });

  steps.push({
    icon: '📍',
    title: '1. Fill your Birth & Location Profile',
    body: (
      <>
        <p>Everything starts from the panel on the <strong>left</strong>. Click its
        header to expand it, then enter the <strong>name, date and exact time of
        birth</strong>.</p>
        <p>For the place, type a city in the <strong>search box</strong> and pick a match —
        it auto-fills latitude, longitude and timezone. Accurate time and place are what
        make the ascendant and houses correct.</p>
        <p>The panel collapses to a thin strip once you’re done, to give the charts room.</p>
      </>
    ),
  });

  tabs.forEach((t, idx) => {
    steps.push({
      icon: t.icon,
      title: `${idx + 1 < 10 ? '' : ''}Menu: ${t.label}`,
      body: (
        <>
          <p>{t.desc}</p>
          <p className="guide-tip">Tip: press <kbd>{idx + 1}</kbd> to jump to this tab.</p>
        </>
      ),
    });
  });

  steps.push({
    icon: '⊙',
    title: 'Profiles — save & switch charts',
    body: (
      <>
        <p>Reading more than one person’s chart? Use <strong>+ Save Current</strong> in the
        profile bar to store the chart on screen, then click any saved chip to switch
        instantly.</p>
        <p>The header <strong>⊙ Profiles</strong> button opens the manager to rename, edit,
        delete, or attach an <strong>AstroSage PDF</strong> (which unlocks Ashtakvarga,
        Pratyantar timing and more). <strong>Sync ↑</strong> updates a saved profile with
        your latest edits.</p>
      </>
    ),
  });

  steps.push({
    icon: '✨',
    title: 'AI Astrologer',
    body: (
      <>
        <p>On the <strong>Birth Details</strong> tab you’ll find the <strong>AI Astrologer</strong>
        card. Pick a focus — Personality, Career, Relationships or Current Dasha — and get a
        written Vedic interpretation of your chart.</p>
        <p>It’s for reflection, not certainty: astrology isn’t scientifically validated, so
        treat readings as food for thought.</p>
      </>
    ),
  });

  steps.push({
    icon: '🔒',
    title: 'Your data is private',
    body: (
      <>
        <p>Your profiles, charts and uploaded reports are tied to your account and visible
        only to you. They sync to the cloud automatically, so they’re there on any device
        when you sign in.</p>
        {isAdmin && <p>As an admin, you also have the <strong>☁ Sync</strong> settings in the
        header for advanced configuration.</p>}
      </>
    ),
  });

  steps.push({
    icon: '✦',
    title: 'You’re all set!',
    body: (
      <>
        <p>Start by opening the <strong>Birth &amp; Location Profile</strong> on the left and
        entering your details. The chart and every tab update automatically.</p>
        <p>Need this again? Click the <strong>?</strong> in the header anytime.</p>
      </>
    ),
  });

  return steps;
}

export default function GuideTour({ tabs = [], isAdmin = false, onClose, onFinish }) {
  const steps = buildSteps(tabs, isAdmin);
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card" onClick={e => e.stopPropagation()}>
        <button className="guide-close" onClick={onClose} aria-label="Close guide">✕</button>
        <div className="guide-icon">{step.icon}</div>
        <h2 className="guide-title">{step.title}</h2>
        <div className="guide-body">{step.body}</div>

        <div className="guide-dots">
          {steps.map((_, d) => (
            <button
              key={d}
              type="button"
              className={`guide-dot${d === i ? ' active' : ''}`}
              onClick={() => setI(d)}
              aria-label={`Step ${d + 1}`}
            />
          ))}
        </div>

        <div className="guide-actions">
          <button type="button" className="guide-skip" onClick={onClose}>
            {last ? 'Close' : 'Skip tour'}
          </button>
          <div className="guide-nav">
            {i > 0 && (
              <button type="button" className="btn btn-secondary guide-btn" onClick={() => setI(i - 1)}>Back</button>
            )}
            {last ? (
              <button type="button" className="btn btn-primary guide-btn" onClick={() => (onFinish || onClose)?.()}>Get started ✦</button>
            ) : (
              <button type="button" className="btn btn-primary guide-btn" onClick={() => setI(i + 1)}>Next</button>
            )}
          </div>
        </div>
        <div className="guide-step-count">{i + 1} / {steps.length}</div>
      </div>
    </div>
  );
}
