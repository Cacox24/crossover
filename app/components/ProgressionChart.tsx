// DESIGN.md §7.4 boost-stacked progression chart. Hand-written SVG + d3-shape.
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
  days: string[];                         // x domain, one per day
  layers: Layer[];                        // stacking order, bottom first
  base: number;                           // y value the stack starts from
  line: [string, number][];               // black line (measured or modelled)
  yDomain: [number, number];              // [bottom, top] in display order (pace: slow at bottom)
  format: (v: number) => string;
  lineLabel: string;
  layerValue: (key: SessionSport, i: number) => string; // tooltip value per layer
  markers: { day: string; sport: Sport }[];
  markerSports: Sport[];
}

const H = 320, M = { top: 12, right: 8, bottom: 28, left: 44 }, LANE = 12;

export function ProgressionChart({ spec, animKey }: { spec: ChartSpec; animKey: string }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const lanes = spec.markerSports.length;
  const plotH = H - M.top - M.bottom;
  const height = H + lanes * LANE + (lanes ? 8 : 0);
  const n = spec.days.length;
  const x = (i: number) => M.left + (i / Math.max(1, n - 1)) * (width - M.left - M.right);
  const [y0, y1] = spec.yDomain;
  const y = (v: number) => M.top + plotH - ((v - y0) / (y1 - y0)) * plotH;
  const dayIndex = useMemo(() => new Map(spec.days.map((d, i) => [d, i])), [spec.days]);

  const { paths, ticksY, ticksX } = useMemo(() => {
    const cum = spec.days.map(() => spec.base);
    const paths = spec.layers.map((L) => {
      const lo = [...cum];
      L.values.forEach((v, i) => (cum[i] += v));
      const hi = [...cum];
      const gen = area<number>().x((i) => x(i)).y0((i) => y(lo[i])).y1((i) => y(hi[i])).curve(curveMonotoneX);
      return { key: L.key, d: gen(spec.days.map((_, i) => i)) ?? "" };
    });
    const ticksY = niceTicks(Math.min(y0, y1), Math.max(y0, y1), 4);
    const step = n > 200 ? 61 : n > 100 ? 28 : 14;
    const ticksX = spec.days.map((d, i) => ({ d, i })).filter(({ i }) => (n - 1 - i) % step === 0);
    return { paths, ticksY, ticksX };
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

  return (
    <div ref={ref} className="pchart" style={{ height }}>
      <svg key={animKey} width={width} height={height} role="img" aria-label={spec.lineLabel}>
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{spec.format(t)}</text>
          </g>
        ))}
        {paths.map((p, i) => (
          <path key={p.key} d={p.d} fill={SPORT_META[p.key].color} stroke="var(--white)" strokeWidth={1}
            className="layer" style={{ animationDelay: `${240 + (i * 240) / steps}ms` }} />
        ))}
        <line x1={M.left} x2={width - M.right} y1={M.top + plotH} y2={M.top + plotH} className="axis" />
        {ticksX.map(({ d, i }) => (
          <text key={d} x={x(i)} y={M.top + plotH + 18} className="tick" textAnchor="middle">{dayMonth(d)}</text>
        ))}
        <path d={lineD} className="measured" pathLength={1} />
        {spec.markerSports.map((s, li) => (
          <g key={s} transform={`translate(0 ${H + 4 + li * LANE})`}>
            {spec.markers.filter((m) => m.sport === s && dayIndex.has(m.day)).map((m, k) => {
              const { Icon, color } = SPORT_META[s];
              return <Icon key={k} x={x(dayIndex.get(m.day)!) - 5} y={-5} width={10} height={10} color={color} weight="fill" aria-hidden />;
            })}
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} className="crosshair" />}
        {hoverLine && <circle cx={x(hoverLine[0])} cy={y(hoverLine[1])} r={4} className="hover-dot" />}
        <rect x={M.left} y={M.top} width={Math.max(0, width - M.left - M.right)} height={plotH} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <Tooltip x={Math.min(x(hover), width - 200)} y={M.top + plotH / 2}>
          <div className="t-small muted">{dayMonth(spec.days[hover])}</div>
          {hoverLine && <div className="t-fig-s">{spec.lineLabel} {spec.format(hoverLine[1])}</div>}
          {[...spec.layers].reverse().map((L) => (
            <div key={L.key} className="tt-row"><SportGlyph sport={L.key} size={12} /><span className="t-fig-s">{spec.layerValue(L.key, hover)}</span></div>
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
