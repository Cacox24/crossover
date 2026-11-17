// Dev-only component sheet at #/kit (not in nav). Real data, every shared component.
import { useState } from "react";
import { useData } from "../data";
import { CAPACITY_ORDER, SOURCE_ORDER, SPORT_ORDER, CAPACITY_NAME } from "../sports";
import { CapacityRow } from "../components/CapacityRow";
import { Panel, SportChip, SportGlyph, Figure, Evidence, SessionChip, Tooltip, ChartPanel, type Column } from "../components/ui";
import { fatigueBackground, FATIGUE_NAME } from "../components/fatigue";
import { weekday, DASH } from "../format";
import type { Sport, Capacity } from "../../engine/types";

export function KitPage() {
  const d = useData();
  const [sport, setSport] = useState<Sport>("running");
  const [hl, setHl] = useState<Capacity | null>(null);
  const last7 = d.sessions.filter((s) => s.day >= addDaysLocal(d.synced, -6));
  type Row = { cap: Capacity };
  const cols: Column<Row>[] = [
    { key: "c", label: "Capacity", render: (r) => CAPACITY_NAME[r.cap] },
    { key: "f", label: "Fitness", numeric: true, render: (r) => d.capacities[r.cap].fitIndex },
    { key: "n", label: "Fatigue", numeric: true, render: (r) => d.capacities[r.cap].fatNorm.toFixed(2) },
    { key: "r", label: "Recovered", numeric: true, render: (r) => (d.capacities[r.cap].recoveredOn ? weekday(d.capacities[r.cap].recoveredOn!) : DASH) },
  ];

  return (
    <>
      <h1 className="t-title page-title">Kit</h1>
      <div className="grid">
        <Panel title="Capacity" className="col-8">
          {CAPACITY_ORDER.map((c) => (
            <CapacityRow key={c} capacity={c} {...pick(d.capacities[c])} highlighted={hl === c} onHover={(on) => setHl(on ? c : null)} />
          ))}
        </Panel>
        <Panel title="Split" className="col-4">
          {CAPACITY_ORDER.map((c) => (
            <CapacityRow key={c} capacity={c} {...pick(d.capacities[c])} split
              projectedFatNorm={d.capacities[c].fatNorm + 0.8} />
          ))}
        </Panel>

        <Panel title="Sports" className="col-8">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SPORT_ORDER.map((s) => <SportChip key={s} sport={s} selected={s === sport} onClick={() => setSport(s)} />)}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            {SOURCE_ORDER.map((s) => <SportGlyph key={s} sport={s} size={24} />)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 16 }}>
            {last7.map((s) => <SessionChip key={s.id} sport={s.sport} durationMin={s.durationMin} day={s.day} />)}
          </div>
        </Panel>
        <Panel title="Figures" className="col-4">
          <Figure size="l" value="4:52" unit="/km" />
          <div><Figure value={d.capacities.engine.fitIndex} change={{ value: d.capacities.engine.fitChange28d * 100, unit: "%" }} /></div>
          <div><Figure size="s" value="−10" unit="s/km" /></div>
          <div style={{ display: "grid", gap: 4, marginTop: 12 }}>
            <Evidence level={3} n={24} /><Evidence level={2} n={9} /><Evidence level={1} n={4} />
          </div>
        </Panel>

        <Panel title="Fatigue" className="col-8">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {FATIGUE_NAME.map((n, i) => (
              <div key={n}>
                <div style={{ height: 48, borderRadius: 4, background: fatigueBackground(i), border: i ? "none" : "1px solid var(--grey-4)" }} />
                <span className="t-small muted">{n}</span>
              </div>
            ))}
          </div>
          <svg width="100%" height="56" style={{ marginTop: 12 }} aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={`${i * 16.6}%`} y="0" width="15%" height="56" rx="4" fill={i ? `url(#fatigue-${i})` : "#F4F4F4"} />)}
          </svg>
        </Panel>
        <Panel title="Tooltip" className="col-4" style={{ position: "relative", minHeight: 140 }}>
          <Tooltip x={0} y={70}><span className="t-fig-s">17 Nov · 386 s/km</span></Tooltip>
        </Panel>

        <ChartPanel<Row> title="Table" className="col-12" chart={<span className="t-label muted">{DASH}</span>}
          columns={cols} rows={CAPACITY_ORDER.map((cap) => ({ cap }))} />
      </div>
    </>
  );
}

function pick(c: { fitIndex: number; fitChange28d: number; fitBySport: Record<string, number> | object; fatNorm: number; fatStep: number }) {
  return { fitIndex: c.fitIndex, fitChange: c.fitChange28d, fitBySport: c.fitBySport as never, fatNorm: c.fatNorm, fatStep: c.fatStep };
}
const addDaysLocal = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
