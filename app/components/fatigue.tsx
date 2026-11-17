// DESIGN.md §3.3: fatigue = grey ramp + 45° hatch (1px lines, 4px apart, next darker step;
// white on steps 4–5). One definition feeds both CSS backgrounds (bars) and SVG patterns (body map).
export const FATIGUE_FILL = ["#F4F4F4", "#E2E2E2", "#BDBDBD", "#8C8C8C", "#555555", "#222222"];
export const FATIGUE_NAME = ["Fresh", "Light", "Moderate", "Heavy", "Very heavy", "Overloaded"];
const lineColor = (step: number) => (step >= 4 ? "#FFFFFF" : FATIGUE_FILL[step + 1]);
const T = 4 * Math.SQRT2; // tile size so diagonal lines are 4px apart

function tileContent(step: number) {
  const c = lineColor(step);
  return `<rect width="${T}" height="${T}" fill="${FATIGUE_FILL[step]}"/>` +
    `<path d="M${-T / 2},${T / 2} L${T / 2},${-T / 2} M0,${T} L${T},0 M${T / 2},${T * 1.5} L${T * 1.5},${T / 2}" stroke="${c}" stroke-width="1"/>`;
}

/** CSS background for HTML elements. Step 0 = flat, no hatch. */
export function fatigueBackground(step: number): string {
  if (step <= 0) return FATIGUE_FILL[0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">${tileContent(step)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / ${T}px ${T}px repeat`;
}

/** SVG fill value for shapes. Requires <FatigueDefs/> once in the page. */
export const fatigueFill = (step: number) => (step <= 0 ? FATIGUE_FILL[0] : `url(#fatigue-${step})`);

export function FatigueDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {[1, 2, 3, 4, 5].map((s) => (
          <pattern key={s} id={`fatigue-${s}`} width={T} height={T} patternUnits="userSpaceOnUse" dangerouslySetInnerHTML={{ __html: tileContent(s) }} />
        ))}
      </defs>
    </svg>
  );
}
