import { NAV_GROUPS, TABS } from '../constants';

// ── Section navigation (tablet & desktop) ─────────────────────────────────
// Replaces the old wrapping pill strip, where eight long labels broke onto two
// rows and the active tab jumped around as the window resized.
//
//   ≥ 1100px  sticky left sidebar, tabs grouped under headings
//   769–1099  one horizontally scrolling row above the content (CSS only)
//   ≤ 768px   hidden — components/MobileNav.jsx takes over
//
// Buttons keep the `.tab-btn` class: e2e/smoke.spec.js counts them, and the
// keyboard shortcut number shown on hover matches TABS order (1–8).

export default function SideNav({ activeTab, setActiveTab }) {
  return (
    <nav className="side-nav" aria-label="Sections">
      {NAV_GROUPS.map(group => (
        <div key={group.id} className="side-nav-group" role="group" aria-labelledby={`nav-group-${group.id}`}>
          <div className="side-nav-heading" id={`nav-group-${group.id}`}>{group.label}</div>
          {TABS.filter(t => t.group === group.id).map(tab => {
            const n = TABS.indexOf(tab) + 1;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-tab={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-btn${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={`${tab.desc} (shortcut: ${n})`}
              >
                <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
                <kbd className="tab-kbd" aria-hidden="true">{n}</kbd>
              </button>
            );
          })}
        </div>
      ))}
      <p className="side-nav-foot">
        Tip: press <kbd>1</kbd>–<kbd>{TABS.length}</kbd> to jump between sections
      </p>
    </nav>
  );
}
