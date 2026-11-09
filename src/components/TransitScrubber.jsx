// ── Transit time controls ─────────────────────────────────────────────────
// Date + time inputs, the 1950–2060 timeline slider and quick step buttons.
// Used under the transit chart in the Interactive Kundali tab AND inside the
// enlarged chart modal, so scrubbing works at either size. Both instances
// drive the same App-level transitDateInput / transitTimeInput state, so the
// tab and the modal always show the same moment.
//
// `idPrefix` keeps input ids unique when both copies are in the DOM.

const MIN_YEAR = 1950;
const MAX_YEAR = 2060;

const toDate = (date, time) => new Date(`${date}T${time || '12:00'}:00Z`);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export default function TransitScrubber({
  transitDateInput, setTransitDateInput,
  transitTimeInput, setTransitTimeInput,
  idPrefix = 'transit', showInputs = true, compact = false, children,
}) {
  const current = toDate(transitDateInput, transitTimeInput);
  const valid = !Number.isNaN(current.getTime());

  const apply = (d) => {
    if (Number.isNaN(d.getTime())) return;
    const y = d.getUTCFullYear();
    if (y < MIN_YEAR - 1 || y > MAX_YEAR + 1) return;
    setTransitDateInput(d.toISOString().split('T')[0]);
    setTransitTimeInput(d.toISOString().substring(11, 16));
  };

  const step = (days = 0, months = 0) => {
    if (!valid) return;
    const d = new Date(current.getTime());
    if (months) {
      // Keep the day of month where possible (31 Jan + 1 month → 28/29 Feb).
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + months);
      d.setUTCDate(Math.min(day, daysInMonth(d.getUTCFullYear(), d.getUTCMonth())));
    }
    if (days) d.setUTCDate(d.getUTCDate() + days);
    apply(d);
  };

  // Slider value in fractional years (monthly resolution).
  const sliderValue = valid
    ? current.getUTCFullYear() + current.getUTCMonth() / 12
    : new Date().getUTCFullYear();

  const onSlide = (e) => {
    const val = parseFloat(e.target.value);
    const year = Math.floor(val);
    const month = Math.min(11, Math.round((val - year) * 12));
    const day = valid ? Math.min(current.getUTCDate(), daysInMonth(year, month)) : 1;
    const [hh, mm] = (transitTimeInput || '12:00').split(':').map(Number);
    apply(new Date(Date.UTC(year, month, day, hh || 0, mm || 0)));
  };

  return (
    <div className={`transit-scrubber${compact ? ' is-compact' : ''}`}>
      {showInputs && (
        <div className="slider-row">
          <div className="input-group flex-1">
            <label htmlFor={`${idPrefix}Date`} className="input-label">Transit Date</label>
            <input type="date" id={`${idPrefix}Date`} value={transitDateInput}
              onChange={(e) => setTransitDateInput(e.target.value)} className="text-input" />
          </div>
          <div className="input-group flex-1">
            <label htmlFor={`${idPrefix}Time`} className="input-label">Transit Time (UTC)</label>
            <input type="time" id={`${idPrefix}Time`} value={transitTimeInput}
              onChange={(e) => setTransitTimeInput(e.target.value)} className="text-input" />
          </div>
          {children}
        </div>
      )}

      {/* Timeline scrubber: monthly precision, 1950–2060 */}
      <div className="scrubber-range-container">
        <div className="scrubber-head">
          <label htmlFor={`${idPrefix}Scrubber`} className="input-label" style={{ marginBottom: 0 }}>
            Timeline Scrubber
          </label>
          <span className="scrubber-current">
            {valid
              ? current.toLocaleDateString(undefined, { year: 'numeric', month: 'long', ...(compact ? { day: 'numeric' } : {}), timeZone: 'UTC' })
              : '—'}
          </span>
        </div>
        <input
          type="range"
          id={`${idPrefix}Scrubber`}
          min={MIN_YEAR}
          max={MAX_YEAR}
          step="0.0833"
          value={sliderValue}
          onChange={onSlide}
          className="range-scrubber"
          aria-valuetext={valid ? current.toLocaleDateString(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' }) : undefined}
        />
        <div className="scrubber-legend">
          <span>{MIN_YEAR}</span>
          <span>{Math.round((MIN_YEAR + MAX_YEAR) / 2)}</span>
          <span>{MAX_YEAR}</span>
        </div>
      </div>

      <div className="scrub-steps" role="group" aria-label="Step the transit time">
        <button type="button" className="scrub-step" onClick={() => step(0, -1)} title="Back one month">« 1 mo</button>
        <button type="button" className="scrub-step" onClick={() => step(-1)} title="Back one day">‹ 1 day</button>
        <button type="button" className="scrub-step scrub-now" onClick={() => apply(new Date())} title="Jump to the current moment">Now</button>
        <button type="button" className="scrub-step" onClick={() => step(1)} title="Forward one day">1 day ›</button>
        <button type="button" className="scrub-step" onClick={() => step(0, 1)} title="Forward one month">1 mo »</button>
      </div>
    </div>
  );
}
