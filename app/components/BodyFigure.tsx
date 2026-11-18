// Front-view figure for Now. Segmented like a mannequin: each muscle group is its own shape with a small gap.
// Left half is drawn (viewer's left) and mirrored numerically. Intensity 0..1 per capacity drives the fill.
import { forwardRef } from "react";
import type { Capacity } from "../../engine/types";
import { CAPACITY_NAME } from "../sports";

const SIDE: Record<Capacity, string[]> = {
  pull: [
    "M86,76 C74,76 62,79 56,86 C50,93 48,103 49,113 C55,106 62,101 69,99 C72,89 78,81 86,76 Z",      // deltoid
    "M52,118 C48,131 47,145 48,158 L59,160 C61,147 65,133 68,120 C64,113 57,113 52,118 Z",        // biceps
    "M47,164 L59,166 C58,183 55,200 52,217 L43,216 C42,199 44,181 47,164 Z",                      // forearm
  ],
  engine: [
    "M97,82 L89,81 C80,85 74,93 72,103 C71,113 75,121 83,124 C89,126 94,125 97,122 Z",             // chest
  ],
  speed: [
    "M97,129 L85,130 C83,136 83,143 84,149 L97,149 Z",                                            // abs 1
    "M97,153 L84,153 C83,160 83,166 84,172 L97,172 Z",                                            // abs 2
    "M97,176 L84,176 C84,187 89,198 97,206 Z",                                                    // abs 3
    "M80,129 C76,143 75,161 77,177 C78,183 80,187 82,190 C81,170 80,149 81,129 Z",               // oblique
  ],
  legs: [
    "M80,194 C78,204 75,214 73,224 L97,227 L97,213 C90,208 84,202 80,194 Z",                       // hip
    "M72,230 C68,254 70,279 75,300 L95,300 C97,279 98,256 97,232 Z",                               // thigh
    "M76,304 L94,304 C94,308 93,312 92,314 L78,314 C77,311 76,307 76,304 Z",                       // knee
    "M78,318 L92,318 C95,343 93,369 90,391 L81,391 C77,369 75,343 77,316 Z",                       // calf
  ],
};
const NEUTRAL_SIDE = [
  "M43,220 L52,221 C54,231 52,241 47,244 C42,242 40,232 43,220 Z",   // hand
  "M81,395 L90,395 C92,401 92,407 90,409 L72,409 C72,403 76,397 81,395 Z", // foot
];
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)},${y}`);
const both = (ds: string[]) => [...ds, ...ds.map(mirror)];

/** Callout anchors in viewBox units: where each card's line lands. */
export const ANCHOR: Record<Capacity, { x: number; y: number; side: "l" | "r" }> = {
  pull: { x: 52, y: 138, side: "l" },
  legs: { x: 82, y: 268, side: "l" },
  engine: { x: 116, y: 100, side: "r" },
  speed: { x: 110, y: 162, side: "r" },
};
export const VIEWBOX = { x: 30, y: 6, w: 140, h: 408 };

export const BodyFigure = forwardRef<SVGSVGElement, {
  level: Record<Capacity, number>;
  highlighted: Capacity[];
  onHover: (c: Capacity | null) => void;
}>(function BodyFigure({ level, highlighted, onHover }, ref) {
  const beat = Math.max(0.5, 1.6 - 1.1 * level.engine);
  return (
    <svg ref={ref} viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`} className={`figure ${highlighted.length ? "has-hl" : ""}`} role="img" aria-label="Fatigue by body area">
      <defs>
        <filter id="fig-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" /></filter>
        <radialGradient id="fig-glow"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="100" cy="220" rx="90" ry="200" fill="url(#fig-glow)" className="fig-halo" />
      {(Object.keys(SIDE) as Capacity[]).map((c) => (
        <g key={`g${c}`} className="fig-heat" filter="url(#fig-blur)" style={{ opacity: Math.pow(level[c], 1.6) }}>
          {both(SIDE[c]).map((d, i) => <path key={i} d={d} />)}
        </g>
      ))}
      <g className="fig-neutral">
        <ellipse cx="100" cy="35" rx="18" ry="22" />
        <path d="M91,57 C92,64 91,69 88,73 L112,73 C109,69 108,64 109,57 C103,60 97,60 91,57 Z" />
        {both(NEUTRAL_SIDE).map((d, i) => <path key={i} d={d} />)}
      </g>
      {(Object.keys(SIDE) as Capacity[]).map((c) => (
        <g key={c} className={`fig-region ${highlighted.includes(c) ? "is-hl" : ""}`}
          style={{ ["--lvl" as string]: level[c].toFixed(3) }}
          onPointerEnter={() => onHover(c)} onPointerLeave={() => onHover(null)}
          tabIndex={0} onFocus={() => onHover(c)} onBlur={() => onHover(null)} aria-label={CAPACITY_NAME[c]}>
          {both(SIDE[c]).map((d, i) => <path key={i} d={d} className="fig-fill" />)}
        </g>
      ))}
      <g className="fig-heart" style={{ ["--beat" as string]: `${beat.toFixed(2)}s` }} aria-hidden>
        <circle cx="114" cy="104" r="9" className="heart-ring" />
        <circle cx="114" cy="104" r="3.2" className="heart-dot" />
      </g>
    </svg>
  );
});
