// ── North-Indian Kundali chart (SVG) ───────────────────────────────────────
// Shared by the natal, transit, varga and zoom-modal views. When `draggable`,
// pointer-down on a planet reports (planetId, startAngle) via onDragStart so
// the parent can run its time-scrub logic.
import { PLANET_ABBRS } from '../constants';
import { getHouseFromLagna } from '../astrologyEngine';

export default function KundaliChart({ planets: planetsList, lagnaSign, draggable = false, transitDragInfo = null, onDragStart, svgRef }) {
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
        ref={draggable ? svgRef : undefined}
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
                      // touchAction: 'none' stops the browser from treating a drag on this
                      // glyph as a page-scroll gesture. React registers touchstart/touchmove
                      // as passive by default, so calling preventDefault() in onTouchStart
                      // below has no effect — the CSS property is what actually blocks it.
                      style={draggable ? { cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' } : undefined}
                      onMouseDown={draggable ? (e) => {
                        e.preventDefault();
                        const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        if (!r) return;
                        const x = (e.clientX - r.left) / r.width * 400 - 200;
                        const y = (e.clientY - r.top) / r.height * 400 - 200;
                        const angle = Math.atan2(x, -y);
                        if (onDragStart) onDragStart(p.id, angle);
                      } : undefined}
                      onTouchStart={draggable ? (e) => {
                        const t = e.touches[0];
                        const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        if (!r) return;
                        const x = (t.clientX - r.left) / r.width * 400 - 200;
                        const y = (t.clientY - r.top) / r.height * 400 - 200;
                        if (onDragStart) onDragStart(p.id, Math.atan2(x, -y));
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
}
