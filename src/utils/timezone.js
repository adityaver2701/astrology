// ── Timezone helpers ───────────────────────────────────────────────────────
// Derives the correct UTC offset for a birth moment from an IANA timezone id
// (e.g. "Asia/Kolkata") using the browser's Intl database. This replaces the
// old longitude/15 estimate, which was wrong for much of the world and ignored
// DST — a shifted offset moves the ascendant, so accuracy here matters.

/**
 * UTC offset (hours, may be fractional) of `timeZone` at a given instant.
 * @param {string} timeZone IANA id, e.g. "Asia/Kolkata"
 * @param {Date} instant a real UTC instant
 * @returns {number} offset in hours (east positive), e.g. 5.5
 */
export function offsetAtInstant(timeZone, instant) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const tzPart = dtf.formatToParts(instant).find(p => p.type === 'timeZoneName');
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzPart?.value || '');
  if (!m) return 0; // "GMT" with no offset = UTC
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 60 : 0));
}

/**
 * UTC offset (hours) that applied at a LOCAL wall-clock date/time in `timeZone`.
 * Uses two passes: first guess with the naive instant, then refine — this
 * resolves DST transitions correctly for all but the ambiguous 1-hour window.
 * @param {string} timeZone IANA id
 * @param {string} dateStr "YYYY-MM-DD" local date
 * @param {string} timeStr "HH:MM" local time
 * @returns {number|null} offset in hours, or null if the zone id is unknown
 */
export function offsetForLocalTime(timeZone, dateStr, timeStr) {
  try {
    const naive = new Date(`${dateStr}T${timeStr || '12:00'}:00Z`);
    if (Number.isNaN(naive.getTime())) return null;
    const guess = offsetAtInstant(timeZone, naive);
    // Refine: the actual instant is local time minus the offset.
    const instant = new Date(naive.getTime() - guess * 3600000);
    return offsetAtInstant(timeZone, instant);
  } catch {
    return null; // invalid/unsupported timezone id
  }
}

/** True if the browser's Intl database knows this timezone id. */
export function isValidTimeZone(timeZone) {
  if (!timeZone) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
