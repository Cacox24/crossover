// DESIGN.md §7.4 boost-stacked progression chart. Hand-written SVG + d3-shape.
// Layers are labelled at the right edge; Other recedes as a light hatch.
import { useMemo, useState } from "react";
import { useWidth } from "../hooks";
import { area, line, curveMonotoneX } from "d3-shape";
import type { Sport, SessionSport } from "../../engine/types";
import { SPORT_META } from "../sports";
import { dayMonth, pace } from "../format";
import { SportGlyph, Tooltip } from "./ui";
import "./progression.css";

export interface Layer { key: SessionSport; values: number[] }   // in y units, per day (not cumulative)
export interface ChartSpec {
  days: string[];
  layers: Layer[];                        // stacking order, bottom first
  base: number;
  line: [string, number][];
  yDomain: [number, number];
  format: (v: number) => string;
  lineLabel: string;
  layerValue: (key: SessionSport, i: number) => string;
  markers: { day: string; sport: Sport }[];
  markerSports: Sport[];
}

const H = 420, M = { top: 16, right: 132, bottom: 32, left: 36 }, LANE = 20;
const fillOf = (k: SessionSport) => (k === "other" ? "url(#other-hatch)" : SPORT_META[k].color);

export function ProgressionChart({ spec, animKey }: { spec: ChartSpec; animKey: string }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const lanes = spec.markerSports.length;
  const plotH = H - M.top - M.bottom;
  const height = H + (lanes ? 20 + lanes * LANE : 0);
  const n = spec.days.length;
  const x = (i: number) => M.left + (i / Math.max(1, n - 1)) * (width - M.left - M.right);
  const [y0, y1] = spec.yDomain;
  const y = (v: number) => M.top + plotH - ((v - y0) / (y1 - y0)) * plotH;
  const dayIndex = useMemo(() => new Map(spec.days.map((d, i) => [d, i])), [spec.days]);

  const { paths, ticksY, ticksX, labels } = useMemo(() => {
    const cum = spec.days.map(() => spec.base);
    const last = n - 1;
    const raw: { key: SessionSport; y: number }[] = [];
    const paths = spec.layers.map((L) => {
      const lo = [...cum];
      L.values.forEach((v, i) => (cum[i] += v));
      const hi = [...cum];
      if (hi[last] - lo[last] >= (y1 - y0) * 0.005) raw.push({ key: L.key, y: (y(lo[last]) + y(hi[last])) / 2 });
      const gen = area<number>().x((i) => x(i)).y0((i) => y(lo[i])).y1((i) => y(hi[i])).curve(curveMonotoneX);
      return { key: L.key, d: gen(spec.days.map((_, i) => i)) ?? "" };
    });
    // Resolve label collisions: keep 22px apart, inside the plot.
    const labels = [...raw].sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 22);
    const over = labels.length ? labels[labels.length - 1].y - (M.top + plotH - 8) : 0;
    if (over > 0) labels.forEach((l) => (l.y -= over));
    const ticksY = niceTicks(Math.min(y0, y1), Math.max(y0, y1), 4);
    const step = n > 200 ? 61 : n > 100 ? 28 : 14;
    const ticksX = spec.days.map((d, i) => ({ d, i })).filter(({ i }) => (n - 1 - i) % step === 0);
    return { paths, ticksY, ticksX, labels };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, width]);

  const linePts = spec.line.filter(([d]) => dayIndex.has(d)).map(([d, v]) => [dayIndex.get(d)!, v] as const);
  const lineD = line<readonly [number, number]>().x((p) => x(p[0])).y((p) => y(p[1])).curve(curveMonotoneX)(linePts) ?? "";

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hoverLine = hover !== null ? nearest(linePts, hover) : undefined;
  const steps = Math.max(1, spec.layers.length);
  const xEnd = width - M.right;

  return (
    <div ref={ref} className="pchart" style={{ height }}>
      <svg key={animKey} width={width} height={height} role="img" aria-label={spec.lineLabel}>
        <defs>
          <pattern id="other-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#FFFFFF" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#CFCFCF" strokeWidth="1.5" />
          </pattern>
        </defs>
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={xEnd} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.left - 10} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{spec.format(t)}</text>
          </g>
        ))}
        {paths.map((p, i) => (
          <path key={p.key} d={p.d} fill={fillOf(p.key)} stroke="var(--wash)" strokeWidth={1}
            className="layer" style={{ animationDelay: `${300 + (i * 420) / steps}ms` }} />
        ))}
        <line x1={M.left} x2={xEnd} y1={M.top + plotH} y2={M.top + plotH} className="axis" />
        {ticksX.map(({ d, i }) => (
          <text key={d} x={x(i)} y={M.top + plotH + 22} className="tick" textAnchor="middle">{dayMonth(d)}</text>
        ))}
        <path d={lineD} className="measured" pathLength={1} />

        {labels.map((l, i) => {
          const { Icon, color, name } = SPORT_META[l.key];
          return (
            <g key={l.key} className="end-label" transform={`translate(${xEnd + 14} ${l.y})`} style={{ animationDelay: `${700 + i * 60}ms` }}>
              <Icon x={0} y={-8} width={16} height={16} color={l.key === "other" ? "var(--grey-2)" : color} weight="fill" aria-hidden />
              <text x={22} y={0} dominantBaseline="middle" className="end-name">{name}</text>
              <text x={M.right - 18} y={0} dominantBaseline="middle" textAnchor="end" className="end-val">
                {spec.layerValue(l.key, n - 1).replace(/ s\/km$/, "")}
              </text>
            </g>
          );
        })}

        {spec.markerSports.map((s, li) => {
          const yy = H + 14 + li * LANE;
          const { Icon, color } = SPORT_META[s];
          return (
            <g key={s}>
              <Icon x={M.left - 26} y={yy - 7} width={14} height={14} color={color} weight="fill" aria-hidden />
              <line x1={M.left} x2={xEnd} y1={yy} y2={yy} className="lane" />
              {spec.markers.filter((m) => m.sport === s && dayIndex.has(m.day)).map((m, k) => (
                <circle key={k} cx={x(dayIndex.get(m.day)!)} cy={yy} r={3.5} fill={color} />
              ))}
            </g>
          );
        })}

        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} className="crosshair" />}
        {hoverLine && <circle cx={x(hoverLine[0])} cy={y(hoverLine[1])} r={4.5} className="hover-dot" />}
        <rect x={M.left} y={M.top} width={Math.max(0, xEnd - M.left)} height={plotH} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <Tooltip x={Math.min(x(hover), width - 220)} y={M.top + plotH / 2}>
          <div className="t-small muted">{dayMonth(spec.days[hover])}</div>
          {hoverLine && <div className="t-fig-s">{spec.lineLabel} {spec.format(hoverLine[1])}</div>}
          {[...spec.layers].reverse().map((L) => (
            <div key={L.key} className="tt-row"><SportGlyph sport={L.key} size={12} /><span className="t-small">{SPORT_META[L.key].name}</span><span className="t-fig-s tt-val">{spec.layerValue(L.key, hover)}</span></div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

function nearest(pts: (readonly [number, number])[], i: number) {
  let best: readonly [number, number] | undefined;
  for (const p of pts) if (p[0] <= i && (!best || p[0] > best[0])) best = p;
  return best ?? pts[0];
}

export function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo || 1;
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Number(t.toFixed(6)));
  return out;
}

export const fmtPace = (v: number) => pace(v);
