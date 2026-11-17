// BUILD_PLAN §5.3: how much do I lean on each sport?
import { useState } from "react";
import { useData } from "../data";
import { SOURCE_ORDER, SPORT_META } from "../sports";
import { dayMonth, DASH } from "../format";
import { WeeklyBars, type Week } from "../components/WeeklyBars";
import { Panel, SportGlyph, TableToggle, DataTable, type Column } from "../components/ui";
import "../components/progression.css";
import "./mix.css";

const WEEKS = 12;

export function MixPage() {
  const d = useData();
  const [table, setTable] = useState(false);
  const weeks = d.weeks.slice(-WEEKS) as Week[];

  const sums = Object.fromEntries(SOURCE_ORDER.map((k) => [k, weeks.reduce((a, w) => a + (w.loadBySport[k] ?? 0), 0)]));
  const all = Object.values(sums).reduce((a, b) => a + b, 0);
  const share = SOURCE_ORDER.filter((k) => sums[k] > 0).map((k) => ({ k, pct: (100 * sums[k]) / all }));
  // Integer shares that sum to 100 (largest remainder).
  const floors = share.map((s) => Math.floor(s.pct));
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  share.map((s, i) => ({ i, r: s.pct - floors[i] })).sort((a, b) => b.r - a.r).forEach(({ i }) => { if (rest-- > 0) floors[i]++; });

  const cols: Column<Week>[] = [
    { key: "w", label: "Week", render: (w) => dayMonth(w.start) },
    ...SOURCE_ORDER.filter((k) => sums[k] > 0).map((k): Column<Week> => ({
      key: k, label: SPORT_META[k].name, numeric: true,
      render: (w) => (w.loadBySport[k] ? `${w.loadBySport[k]} (${w.countBySport[k]})` : DASH),
    })),
    { key: "t", label: "Total", numeric: true, render: (w) => SOURCE_ORDER.reduce((a, k) => a + (w.loadBySport[k] ?? 0), 0) || DASH },
  ];

  return (
    <>
      <h1 className="t-title page-title">Mix</h1>
      <div className="grid">
        <section className="panel col-8">
          <div className="panel-head">
            <h2 className="t-heading">Load</h2>
            <TableToggle table={table} onToggle={() => setTable((t) => !t)} />
          </div>
          {table ? <DataTable columns={cols} rows={weeks} /> : <WeeklyBars weeks={weeks} />}
        </section>
        <Panel title="Share" className="col-4">
          {all === 0 && <span className="t-label faint">{DASH}</span>}
          {share.map((s, i) => (
            <div key={s.k} className="share-row">
              <SportGlyph sport={s.k} size={16} />
              <span className="t-label">{SPORT_META[s.k].name}</span>
              <span className="t-fig-m">{floors[i]}<span className="t-small unit">%</span></span>
              <div className="share-bar" aria-hidden><div style={{ width: `${s.pct}%`, background: SPORT_META[s.k].color }} /></div>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}
