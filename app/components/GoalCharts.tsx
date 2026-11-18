// Small chart set for Goals, in the same language as LineChart: accent colour, soft fill, hover to read one value.
import { useEffect, useRef, useState, type ReactNode } from "react";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [s, set] = useState({ w: 600, h: 300 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => set({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, s] as const;
}

export interface Bar { key: string; label: string; value: number; parts?: { key: string; value: number }[] }

/** Vertical bars (optionally stacked by `parts`). Hover reports the index; others dim. */
export function Bars({ bars, accent, onHover, partShade, animKey, ticks }: {
  bars: Bar[]; accent: string; onHover: (i: number | null) => void; partShade?: (key: string) => number; animKey: string; ticks?: [string, string];
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 28, bottom: 30 };
  const n = Math.max(1, bars.length);
  const gap = Math.min(10, Math.max(2, (w / n) * 0.28));
  const bw = Math.max(4, (w - gap * (n - 1)) / n);
  const max = Math.max(1e-9, ...bars.map((b) => b.value));
  const hh = h - pad.top - pad.bottom;
  const set = (i: number | null) => { setHover(i); onHover(i); };
  return (
    <div className="gc" ref={ref} onPointerLeave={() => set(null)}>
      <svg width={w} height={h} key={animKey}>
        {bars.map((b, i) => {
          const x = i * (bw + gap), bh = (hh * b.value) / max;
          let y0 = pad.top + hh;
          const dim = hover !== null && hover !== i;
          return (
            <g key={b.key} className={`gc-bar ${dim ? "is-dim" : ""}`} style={{ animationDelay: `${120 + i * 25}ms` }} onPointerEnter={() => set(i)}>
              <rect x={x} y={pad.top} width={bw} height={hh} fill="transparent" />
              {b.parts && partShade ? b.parts.map((p) => {
                const ph = (hh * p.value) / max; y0 -= ph;
                return <rect key={p.key} x={x} y={y0 + 1} width={bw} height={Math.max(0, ph - 2)} rx={Math.min(5, bw / 2)} fill={accent} fillOpacity={partShade(p.key)} />;
              }) : <rect x={x} y={pad.top + hh - bh} width={bw} height={Math.max(2, bh)} rx={Math.min(6, bw / 2)} fill={accent} fillOpacity={0.85} />}
              {hover === i && <text x={x + bw / 2} y={pad.top + hh - bh - 10} className="gc-val" textAnchor="middle">{b.label}</text>}
            </g>
          );
        })}
        <line x1="0" x2={w} y1={pad.top + hh + 0.5} y2={pad.top + hh + 0.5} className="gc-base" />
        {ticks && <><text x="0" y={h - 8} className="gc-tick">{ticks[0]}</text><text x={w} y={h - 8} className="gc-tick" textAnchor="end">{ticks[1]}</text></>}
      </svg>
    </div>
  );
}

/** Horizontal bars with a label column, for a handful of categories. */
export function HBars({ rows, accent, onHover }: { rows: { key: string; name: ReactNode; value: number; note?: string }[]; accent: string; onHover: (k: string | null) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  const set = (k: string | null) => { setHover(k); onHover(k); };
  return (
    <ul className="gh" onPointerLeave={() => set(null)}>
      {rows.map((r, i) => (
        <li key={r.key} className={hover && hover !== r.key ? "is-dim" : ""} onPointerEnter={() => set(r.key)} style={{ animationDelay: `${150 + i * 70}ms` }}>
          <span className="gh-name">{r.name}</span>
          <span className="gh-track"><i style={{ width: `${(100 * r.value) / max}%`, background: accent, animationDelay: `${250 + i * 70}ms` }} /></span>
          <span className="gh-val">{r.value}{r.note && <small>{r.note}</small>}</span>
        </li>
      ))}
    </ul>
  );
}
