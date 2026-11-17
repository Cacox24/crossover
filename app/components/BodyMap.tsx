// DESIGN.md §7.3 body map, P0: front-only silhouette with 4 region groups.
// Legs = hips + legs; Pull & grip = shoulders + arms; Engine = chest; Speed = core.
import type { Capacity } from "../../engine/types";
import { CAPACITY_NAME } from "../sports";
import { fatigueFill, FATIGUE_NAME } from "./fatigue";

// Left half of the figure (viewer's left), absolute M/L/Q/C/Z commands in a 200-wide box.
const SIDE: Record<Capacity, string[]> = {
  engine: ["M100,72 L80,72 Q68,74 66,86 L68,146 L100,146 Z"],
  speed: ["M100,150 L68,150 Q66,180 72,212 L100,212 Z"],
  pull: [
    "M76,70 Q54,70 50,92 L46,140 L58,142 L64,100 Q66,84 76,74 Z",   // shoulder + upper arm
    "M46,144 L58,146 Q56,176 52,204 L42,204 Q42,174 46,144 Z",        // forearm
  ],
  legs: [
    "M72,216 L100,216 L100,246 Q99,274 97,300 L77,300 Q70,262 72,216 Z", // hip + thigh
    "M77,304 L97,304 Q97,340 94,370 L82,370 Q77,340 77,304 Z",          // shin
  ],
};
const NEUTRAL_SIDE = ["M42,208 L52,208 Q53,222 50,232 Q44,236 41,228 Z", "M82,374 L94,374 L96,388 L74,388 Q76,378 82,374 Z"];

// Mirror numerically (not with a transform) so the 45° hatch keeps its direction.
const mirrorPath = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)},${y}`);
const both = (ds: string[]) => [...ds, ...ds.map(mirrorPath)];

export function BodyMap({ steps, highlighted, onHover }: {
  steps: Record<Capacity, number>;
  highlighted: Capacity | null;
  onHover: (c: Capacity | null) => void;
}) {
  return (
    <svg viewBox="0 0 200 396" className="bodymap" role="img" aria-label="Body map">
      <g className="neutral">
        <circle cx="100" cy="38" r="22" />
        <path d="M93,59 L107,59 L108,70 L92,70 Z" />
        {both(NEUTRAL_SIDE).map((d, i) => <path key={i} d={d} />)}
      </g>
      {(Object.keys(SIDE) as Capacity[]).map((c) => (
        <g key={c} className={`region ${highlighted === c ? "is-hl" : ""}`} fill={fatigueFill(steps[c])}
          onPointerEnter={() => onHover(c)} onPointerLeave={() => onHover(null)}
          tabIndex={0} onFocus={() => onHover(c)} onBlur={() => onHover(null)}
          aria-label={`${CAPACITY_NAME[c]} ${FATIGUE_NAME[steps[c]]}`}>
          <title>{CAPACITY_NAME[c]}</title>
          {both(SIDE[c]).map((d, i) => <path key={i} d={d} />)}
        </g>
      ))}
    </svg>
  );
}
