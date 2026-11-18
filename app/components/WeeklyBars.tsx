// DESIGN.md §7.8: one bar per week, stacked by sport in sport order, 2px white gaps,
// 4px radius on the value end, square at the baseline.
import { useState } from "react";
import type { SessionSport } from "../../engine/types";
import { SOURCE_ORDER, SPORT_META } from "../sports";
import { dayMonth } from "../format";
import { useWidth } from "../hooks";
import { niceTicks } from "./ProgressionChart";
import { SportGlyph, Tooltip } from "./ui";

export interface Week { start: string; loadBySport: Partial<Record<SessionSport, number>>; countBySport: Partial<Record<SessionSport, number>> }

const H = 340, M = { top: 12, right: 8, bottom: 28, left: 44 }, GAP = 2, R = 4;

const total = (w: Week) => SOURCE_ORDER.reduce((a, k) => a + (w.loadBySport[k] ?? 0), 0);

export function WeeklyBars({ weeks }: { weeks: Week[] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const plotW = width - M.left - M.right, plotH = H - M.top - M.bottom;
  const max = Math.max(1, ...weeks.map(total));
  const ticks = niceTicks(0, max * 1.05, 4);
  const top = Math.max(max, ticks.at(-1) ?? max);
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const band = plotW / weeks.length, bw = Math.min(48, band * 0.64);
  const bx = (i: number) => M.left + i * band + (band - bw) / 2;

  return (
    <div ref={ref} className="wbars" style={{ position: "relative" }}>
      <svg width={width} height={H} role="img" aria-label="Weekly load">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--grey-4)" />
            <text x={M.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const segs = SOURCE_ORDER.filter((k) => (w.loadBySport[k] ?? 0) > 0);
          let acc = 0;
          return (
            <g key={w.start} opacity={hover === null || hover === i ? 1 : 0.4}>
              {segs.map((k, j) => {
                const v = w.loadBySport[k]!;
                const yb = y(acc) - (j > 0 ? GAP : 0), yt = y(acc + v);
                acc += v;
                const h = yb - yt;
                if (h <= 0) return null;
                const x = bx(i), last = j === segs.length - 1, r = Math.min(R, h, bw / 2);
                const d = last
                  ? `M${x},${yb} L${x},${yt + r} Q${x},${yt} ${x + r},${yt} L${x + bw - r},${yt} Q${x + bw},${yt} ${x + bw},${yt + r} L${x + bw},${yb} Z`
                  : `M${x},${yb} L${x},${yt} L${x + bw},${yt} L${x + bw},${yb} Z`;
                return <path key={k} d={d} className="bar" style={{ animationDelay: `${150 + i * 40}ms` }} fill={k === "other" ? "var(--grey-3)" : SPORT_META[k].color} />;
              })}
            </g>
          );
        })}
        <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="var(--grey-3)" />
        {weeks.map((w, i) => ((weeks.length - 1 - i) % (width < 600 ? 3 : 2) === 0 ? (
          <text key={w.start} x={bx(i) + bw / 2} y={H - 8} className="tick" textAnchor="middle">{dayMonth(w.start)}</text>
        ) : null))}
        {weeks.map((w, i) => (
          <rect key={w.start} x={M.left + i * band} y={M.top} width={band} height={plotH} fill="transparent"
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && (
        <Tooltip x={Math.min(bx(hover) + bw, width - 180)} y={M.top + plotH / 2}>
          <div className="t-small muted">{dayMonth(weeks[hover].start)}</div>
          <div className="t-fig-s">{Math.round(total(weeks[hover]))}</div>
          {SOURCE_ORDER.filter((k) => weeks[hover].loadBySport[k]).reverse().map((k) => (
            <div key={k} className="tt-row">
              <SportGlyph sport={k} size={12} />
              <span className="t-fig-s">{weeks[hover].loadBySport[k]}</span>
              <span className="t-small muted">× {weeks[hover].countBySport[k]}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}
