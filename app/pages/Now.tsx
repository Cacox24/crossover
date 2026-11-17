// BUILD_PLAN §5.1: where am I tired, and where am I built up?
import { useState } from "react";
import type { Capacity } from "../../engine/types";
import { addDays } from "../../engine/time";
import { useData } from "../data";
import { CAPACITY_ORDER, CAPACITY_NAME } from "../sports";
import { weekday, DASH } from "../format";
import { CapacityRow } from "../components/CapacityRow";
import { BodyMap } from "../components/BodyMap";
import { Panel, Change, SessionChip, Tooltip } from "../components/ui";
import "./now.css";

export function NowPage() {
  const d = useData();
  const [hl, setHl] = useState<Capacity | null>(null);
  const [tip, setTip] = useState<{ i: number; x: number } | null>(null);
  const from = addDays(d.synced, -6);
  const recent = d.sessions.filter((s) => s.day >= from && s.day <= d.synced);
  const steps = Object.fromEntries(CAPACITY_ORDER.map((c) => [c, d.capacities[c].fatStep])) as Record<Capacity, number>;

  return (
    <>
      <h1 className="t-title page-title">Now</h1>
      <div className="grid">
        <Panel className="col-8">
          <div className="now-visual">
            <div className="now-rows">
              {CAPACITY_ORDER.map((c) => {
                const v = d.capacities[c];
                return (
                  <CapacityRow key={c} capacity={c} fitIndex={v.fitIndex} fatNorm={v.fatNorm} fatStep={v.fatStep}
                    showFigure={false} highlighted={hl === c} onHover={(on) => setHl(on ? c : null)} />
                );
              })}
            </div>
            <BodyMap steps={steps} highlighted={hl} onHover={setHl} />
          </div>
        </Panel>

        <Panel className="col-4">
          <div className="now-table" role="table" aria-label="Capacities">
            <div className="now-tr now-th t-small" role="row">
              <span role="columnheader" />
              <span role="columnheader">Fitness</span>
              <span role="columnheader">28d</span>
              <span role="columnheader">Recovered</span>
            </div>
            {CAPACITY_ORDER.map((c) => {
              const v = d.capacities[c];
              return (
                <div key={c} role="row" className={`now-tr ${hl === c ? "is-hl" : ""}`}
                  onMouseEnter={() => setHl(c)} onMouseLeave={() => setHl(null)}>
                  <span role="cell" className="t-label">{CAPACITY_NAME[c]}</span>
                  <span role="cell" className="t-fig-m">{v.fitIndex}</span>
                  <span role="cell"><Change value={v.fitChange28d * 100} unit="%" /></span>
                  <span role="cell" className="t-fig-s">{v.recoveredOn ? weekday(v.recoveredOn) : DASH}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Sessions" className="col-12">
          <div className="strip" onMouseLeave={() => setTip(null)}>
            {recent.length === 0 && <span className="t-label faint">{DASH}</span>}
            {recent.map((s, i) => (
              <button key={s.id} type="button" className="strip-item"
                onMouseEnter={(e) => setTip({ i, x: e.currentTarget.offsetLeft })}
                onFocus={(e) => setTip({ i, x: e.currentTarget.offsetLeft })} onBlur={() => setTip(null)}>
                <SessionChip sport={s.sport} durationMin={s.durationMin} day={s.day} />
              </button>
            ))}
            {tip && recent[tip.i] && (
              <Tooltip x={tip.x - 12} y={-28}>
                <div className="tt-grid">
                  <span className="t-small muted">Load</span><span className="t-fig-s">{Math.round(recent[tip.i].load)}</span>
                  <span className="t-small muted">Duration</span><span className="t-fig-s">{Math.round(recent[tip.i].durationMin)} min</span>
                </div>
              </Tooltip>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
