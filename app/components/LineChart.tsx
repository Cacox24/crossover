// Revolut-style line: one smooth line, fading fill, no grid. Scrub to read a day.
// Optional: a highlighted band (one sport's share of the line), session dots, and a peak marker.
import { useEffect, useMemo, useRef, useState, useId } from "react";
import { area, line, curveMonotoneX } from "d3-shape";
import { dayMonth } from "../format";

export interface Dot { i: number; color: string; strong?: boolean }

export function LineChart({ days, values, accent, onScrub, height = 260, animKey, band, bandColor, dots = [], peakLabel, dim }: {
  days: string[]; values: number[]; accent: string; onScrub: (i: number | null) => void; height?: number; animKey: string;
  band?: number[] | null; bandColor?: string; dots?: Dot[]; peakLabel?: string; dim?: boolean;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 720, h: height });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, Math.floor(e.contentRect.width)), h: Math.max(160, Math.floor(e.contentRect.height)) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const width = size.w; height = size.h;
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const pad = { top: 40, bottom: 36, x: 4 };
  const n = values.length;
  const { lo, hi, peak } = useMemo(() => {
    const mn = Math.min(...values), mx = Math.max(...values);
    const span = Math.max(4, mx - mn);
    return { lo: Math.max(0, mn - span * 0.25), hi: mx + span * 0.12, peak: values.indexOf(mx) };
  }, [values]);
  const x = (i: number) => pad.x + (i / Math.max(1, n - 1)) * (width - 2 * pad.x);
  const y = (v: number) => pad.top + (1 - (v - lo) / (hi - lo)) * (height - pad.top - pad.bottom);
  const base = height - pad.bottom;
  const idx = values.map((_, i) => i);
  const lineD = line<number>().x(x).y((i) => y(values[i])).curve(curveMonotoneX)(idx) ?? "";
  const areaD = area<number>().x(x).y0(base).y1((i) => y(values[i])).curve(curveMonotoneX)(idx) ?? "";
  // Band: the slice of the line that one sport contributes, hanging from the line downwards.
  const bandD = band ? area<number>().x(x).y0((i) => Math.min(base, y(Math.max(lo, values[i] - band[i])))).y1((i) => y(values[i])).curve(curveMonotoneX)(idx) ?? "" : "";

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left - pad.x) / (r.width - 2 * pad.x)) * (n - 1))));
    setHover(i); onScrub(i);
  };
  const leave = () => { setHover(null); onScrub(null); };
  const mark = hover ?? n - 1;
  const px = x(peak), py = y(values[peak]);
  const anchor = px > width - 140 ? "end" : px < 140 ? "start" : "middle";

  return (
    <div ref={box} className={`lchart ${band ? "has-band" : ""} ${dim ? "is-dim" : ""}`}>
      <svg key={animKey} width={width} height={height} role="img" aria-label="Fitness over time"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)} onPointerDown={(e) => pick(e.clientX, e.currentTarget)} onPointerLeave={leave}>
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#fill-${gid})`} className="lc-area" />
        {band && <path d={bandD} fill={bandColor} className="lc-band" />}
        <path d={lineD} className="lc-line" stroke={accent} pathLength={1} />
        <line x1={0} x2={width} y1={base + 0.5} y2={base + 0.5} className="lc-base" />

        {dots.map((d, k) => (
          <circle key={k} cx={x(d.i)} cy={base - 8} r={d.strong ? 3.5 : 2.5} fill={d.color} className={`lc-sdot ${d.strong ? "is-strong" : ""}`} />
        ))}

        {peakLabel && hover === null && (
          <g className="lc-peak">
            <line x1={px} x2={px} y1={py - 10} y2={py - 24} />
            <text x={px} y={py - 30} textAnchor={anchor}>{peakLabel}</text>
          </g>
        )}

        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top - 8} y2={base} className="lc-cross" />}
        <circle cx={x(mark)} cy={y(values[mark])} r={hover !== null ? 6 : 5} fill={accent} className="lc-dot" />
        <circle cx={x(mark)} cy={y(values[mark])} r={hover !== null ? 12 : 10} fill={accent} opacity={0.18} className="lc-dot" />
        <text x={pad.x} y={height - 10} className="lc-tick">{dayMonth(days[0])}</text>
        <text x={width - pad.x} y={height - 10} className="lc-tick" textAnchor="end">{hover !== null ? dayMonth(days[hover]) : "Today"}</text>
      </svg>
    </div>
  );
}
