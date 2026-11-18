// BUILD_PLAN §5.4 / DESIGN.md §7.5. Runs engine/whatif.ts live in the browser.
import { useMemo, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import type { Sport } from "../../engine/types";
import { whatIf, type Intensity } from "../../engine/whatif";
import { addDays } from "../../engine/time";
import { fatStep } from "../../engine/state";
import { useData } from "../data";
import { SPORT_ORDER, CAPACITY_ORDER, CAPACITY_NAME, SPORT_META } from "../sports";
import { weekday, DASH } from "../format";
import { CapacityRow } from "../components/CapacityRow";
import { SportChip, SportGlyph, Evidence } from "../components/ui";
import "./whatif.css";

const INTENSITY: [Intensity, string][] = [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]];

export function WhatIfDrawer() {
  const d = useData();
  const [sport, setSport] = useState<Sport>("football");
  const [offset, setOffset] = useState(0);
  const [intensity, setIntensity] = useState<Intensity>("normal");

  const r = useMemo(() => whatIf(d.whatif, { sport, dayOffset: offset, intensity }, d.params), [d, sport, offset, intensity]);

  const pct = (v: number) => `${v >= 0.05 ? "+" : ""}${v.toFixed(1)}%`;

  return (
    <div className="whatif">
      <div className="wi-inputs">
        <div className="chips" role="group" aria-label="Sport">
          {SPORT_ORDER.map((s) => <SportChip key={s} sport={s} showName={false} selected={s === sport} onClick={() => setSport(s)} />)}
        </div>
        <div className="wi-days" role="group" aria-label="When">
          {Array.from({ length: d.params.whatif.days }, (_, o) => {
            const day = addDays(d.synced, o);
            return (
              <button key={o} type="button" className={`wi-day ${offset === o ? "is-selected" : ""}`} aria-pressed={offset === o} onClick={() => setOffset(o)}>
                <span className="t-small">{o === 0 ? "Today" : weekday(day)}</span>
                <span className="t-fig-s">{Number(day.slice(8))}</span>
              </button>
            );
          })}
        </div>
        <div className="seg" role="group" aria-label="Intensity">
          {INTENSITY.map(([k, label]) => (
            <button key={k} type="button" className={`t-label ${intensity === k ? "is-selected" : ""}`} aria-pressed={intensity === k} onClick={() => setIntensity(k)}>{label}</button>
          ))}
        </div>
      </div>

      <section className="wi-block" aria-label="Capacities">
        <div className="wi-cols t-small"><span /><span>Fitness · fatigue</span><span>Fresh</span></div>
        {CAPACITY_ORDER.map((c) => {
          const v = r.capacities[c], cap = d.capacities[c];
          return (
            <CapacityRow key={c} capacity={c} fitIndex={cap.fitIndex} projectedFitIndex={cap.fitIndex + v.fitGainPct}
              fatNorm={v.now[offset]} fatStep={fatStep(v.now[offset], d.params)}
              projectedFatNorm={v.projected[offset]}
              aside={<span className="t-label">{v.recoveredOn ? `${weekday(v.recoveredOn)} ${Number(v.recoveredOn.slice(8))}` : "Now"}</span>} />
          );
        })}
      </section>

      <section className="wi-block">
        <h3 className="t-eyebrow wi-h">Fitness gain</h3>
        <div className="wi-list">
          {CAPACITY_ORDER.map((c) => (
            <div key={c} className="wi-li"><span className="t-label">{CAPACITY_NAME[c]}</span><span className="t-fig-s">{pct(r.capacities[c].fitGainPct)}</span></div>
          ))}
        </div>
        <div className="wi-list wi-sports">
          {SPORT_ORDER.map((s) => (
            <div key={s} className="wi-li"><span className="wi-sport"><SportGlyph sport={s} size={16} /><span className="t-label">{SPORT_META[s].name}</span></span><span className="t-fig-s">{pct(r.sportGainPct[s])}</span></div>
          ))}
        </div>
      </section>

      <section className="wi-block">
        <h3 className="t-eyebrow wi-h">From your history</h3>
        {r.effects.length === 0 && <span className="t-label faint">{DASH}</span>}
        {r.effects.map((e, i) => (
          <div key={i} className="wi-effect">
            <SportGlyph sport={e.from} size={16} />
            <ArrowRight size={12} color="var(--grey-2)" aria-label="to" />
            <SportGlyph sport={e.to} size={16} />
            <span className="t-fig-s">{e.unit === "r" ? `r ${fmtSigned(e.effect, 2)}` : `${fmtSigned(e.effect, 0)} ${e.unit}`}</span>
            <span className="t-small faint">{e.window === "next_day" ? "1d" : "wk"}</span>
            <Evidence level={e.evidence} n={e.n} />
          </div>
        ))}
      </section>
    </div>
  );
}

const fmtSigned = (v: number, digits: number) => {
  const r = Number(v.toFixed(digits));
  return r > 0 ? `+${r.toFixed(digits)}` : r < 0 ? `−${Math.abs(r).toFixed(digits)}` : (0).toFixed(digits);
};
