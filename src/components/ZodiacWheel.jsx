import { useId } from 'react';
import { SIGN_GLYPHS } from '../constants';

// ── Decorative zodiac wheel ───────────────────────────────────────────────
// Pure SVG (no assets), coloured from CSS custom properties so it follows the
// theme. Used as the brand mark, on the sign-in screen and as a loader.
//
//   variant="mark"   – compact logo: rings + sun, no glyphs (reads at 28px)
//   variant="full"   – 12 sign glyphs around the rim
//   spin             – slow rotation (disabled by prefers-reduced-motion)

const R_OUT = 48;
const R_GLYPH = 40.5;
const R_IN = 33;

export default function ZodiacWheel({ size = 120, variant = 'full', spin = false, className = '', title }) {
  // Unique per instance: a gradient referenced across SVGs breaks when the
  // first SVG carrying the id is display:none (e.g. a hidden breakpoint copy).
  const gid = `zw-sun-${useId().replace(/:/g, '')}`;
  const showGlyphs = variant === 'full';
  const ticks = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg
      className={`zodiac-wheel zodiac-wheel--${variant}${spin ? ' is-spinning' : ''} ${className}`}
      width={size} height={size} viewBox="-50 -50 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      <defs>
        <radialGradient id={gid} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(14)">
          <stop offset="0" style={{ stopColor: 'var(--wheel-sun-hi, #fde68a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wheel-sun, #d97706)' }} />
        </radialGradient>
      </defs>

      <g className="zodiac-wheel-rotor">
        <circle r={R_OUT} className="zw-ring zw-ring-out" />
        <circle r={R_IN} className="zw-ring" />
        {variant === 'mark' && <circle r="24" className="zw-ring zw-ring-faint" />}

        {/* 12 spokes dividing the signs */}
        {ticks.map(i => {
          const a = (i * 30 - 90) * Math.PI / 180;
          const r1 = variant === 'mark' ? 24 : R_IN;
          return (
            <line key={i} className="zw-spoke"
              x1={Math.cos(a) * r1} y1={Math.sin(a) * r1}
              x2={Math.cos(a) * R_OUT} y2={Math.sin(a) * R_OUT} />
          );
        })}

        {showGlyphs && SIGN_GLYPHS.map((g, i) => {
          // Centre each glyph in its 30° segment.
          const a = (i * 30 + 15 - 90) * Math.PI / 180;
          return (
            <text key={i} className="zw-glyph"
              x={Math.cos(a) * R_GLYPH} y={Math.sin(a) * R_GLYPH}
              textAnchor="middle" dominantBaseline="central">{g}</text>
          );
        })}
      </g>

      {/* Sun at the centre — does not rotate */}
      <circle r={variant === 'mark' ? 12 : 11} fill={`url(#${gid})`} className="zw-sun" />
      {variant !== 'mark' && <circle r="20" className="zw-ring zw-ring-faint" />}
    </svg>
  );
}
