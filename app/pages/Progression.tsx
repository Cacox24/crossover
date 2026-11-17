// BUILD_PLAN §5.2 / DESIGN.md §7.4. Attribution for the selected range uses the engine's own function.
import { useMemo, useState } from "react";
import type { Sport, SessionSport } from "../../engine/types";
import { SOURCES } from "../../engine/types";
import { attributeDelta } from "../../engine/attribution";
import { addDays } from "../../engine/time";
import { useData } from "../data";
import { SPORT_ORDER, SPORT_META } from "../sports";
import { dayMonth, pace, DASH } from "../format";
import { ProgressionChart, type ChartSpec } from "../components/ProgressionChart";
import { Panel, SportChip, SportGlyph, Figure, Change, Evidence, DataTable, TableToggle, type Column } from "../components/ui";
import "../components/progression.css";

const RANGES = { "12w": 84, "6m": 182, "1y": 364 } as const;
type Range = keyof typeof RANGES;

export function ProgressionPage() {
  const d = useData();
  const [sport, setSport] = useState<Sport>("running");
  const [range, setRange] = useState<Range>("12w");
  const [table, setTable] = useState(false);
  const S = d.sports[sport];

  const view = useMemo(() => {
    const all = S.model.values.map((_, i) => addDays(S.model.start, i));
    const from = Math.max(0, all.length - 1 - RANGES[range]);
    const days = all.slice(from);
    const contrib = (k: SessionSport, i: number) => S.contributions[k]?.[from + i] ?? 0;
    const order: SessionSport[] = [sport, ...SOURCES.filter((k) => k !== sport && k !== "other"), "other"];
    const keys = order.filter((k) => S.contributions[k]?.slice(from).some((v) => v > 0));
    const cal = S.calibration?.calibrated ? S.calibration : null;
    const model = (i: number) => S.model.values[from + i];

    let spec: ChartSpec;
    const markers = d.sessions.filter((x) => x.sport !== "other" && x.sport !== sport && x.day >= days[0]).map((x) => ({ day: x.day, sport: x.sport as Sport }));
    const markerSports = SPORT_ORDER.filter((s) => markers.some((m) => m.sport === s));
    if (cal && S.metric) {
      // Measured units: stack = a + b × Σ contributions; pace axis inverted (faster = up).
      const line = S.metric.series.filter(([day]) => day >= days[0]);
      const stackTop = days.map((_, i) => cal.a + cal.b * model(i));
      const vals = [...line.map(([, v]) => v), ...stackTop, cal.a];
      const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.08 || 5;
      spec = {
        days, base: cal.a, line, markers, markerSports,
        layers: keys.map((k) => ({ key: k, values: days.map((_, i) => cal.b * contrib(k, i)) })),
        yDomain: cal.b < 0 ? [hi + pad, lo - pad] : [lo - pad, hi + pad],
        format: (v) => pace(v), lineLabel: "Pace @150",
        layerValue: (k, i) => `${Math.round(cal.b * contrib(k, i))} s/km`,
      };
    } else {
      spec = {
        days, base: 0, markers, markerSports,
        line: days.map((day, i) => [day, 100 * model(i)] as [string, number]),
        layers: keys.map((k) => ({ key: k, values: days.map((_, i) => 100 * contrib(k, i)) })),
        yDomain: [0, 100], format: (v) => String(Math.round(v)), lineLabel: "Fitness",
        layerValue: (k, i) => (100 * contrib(k, i)).toFixed(1),
      };
    }

    const at = (i: number) => Object.fromEntries(SOURCES.map((k) => [k, contrib(k, i)])) as Record<SessionSport, number>;
    const delta = attributeDelta(sport, at(0), at(days.length - 1), cal, "s/km");
    const series = S.metric?.series ?? [];
    const lastPace = series.at(-1);
    const startPace = [...series].reverse().find(([day]) => day <= days[0]) ?? series.find(([day]) => day >= days[0]);
    return { spec, delta, keys, lastPace, startPace, days, contrib, model, cal };
  }, [S, sport, range, d.sessions]);

  type Row = { i: number };
  const rows: Row[] = view.days.map((_, i) => ({ i })).filter(({ i }) => (view.days.length - 1 - i) % 7 === 0);
  const columns: Column<Row>[] = [
    { key: "d", label: "Week", render: (r) => dayMonth(view.days[r.i]) },
    { key: "m", label: view.spec.lineLabel, numeric: true, render: (r) => {
      const pt = [...view.spec.line].reverse().find(([day]) => day <= view.days[r.i]);
      return pt ? view.spec.format(pt[1]) : DASH;
    } },
    ...view.keys.map((k): Column<Row> => ({ key: k, label: SPORT_META[k].name, numeric: true, render: (r) => view.spec.layerValue(k, r.i) })),
  ];

  const unitDigits = view.delta.unit === "%" ? 1 : 0;
  const deltaOrder: SessionSport[] = [sport, ...SOURCES.filter((k) => k !== sport)];

  return (
    <>
      <h1 className="t-title page-title">Progression</h1>
      <div className="prog-controls">
        <div className="chips" role="group" aria-label="Sport">
          {SPORT_ORDER.map((s) => <SportChip key={s} sport={s} selected={s === sport} onClick={() => setSport(s)} />)}
        </div>
        <div className="seg" role="group" aria-label="Range">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <button key={r} type="button" className={`t-label ${r === range ? "is-selected" : ""}`} aria-pressed={r === range} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="grid">
        <section className="panel col-8">
          <div className="panel-head">
            <h2 className="t-heading">{view.spec.lineLabel}</h2>
            <TableToggle table={table} onToggle={() => setTable((t) => !t)} />
          </div>
          {table ? <DataTable columns={columns} rows={rows} /> : <ProgressionChart spec={view.spec} animKey={`${sport}-${range}`} />}
        </section>

        <Panel className="col-4">
          {S.metric && view.lastPace && (
            <div className="stat">
              <span className="t-label muted">Pace @150</span>
              <Figure size="l" value={pace(view.lastPace[1])} unit="/km" />
              {view.startPace && <Change value={view.lastPace[1] - view.startPace[1]} unit=" s/km" />}
            </div>
          )}
          {!view.cal && (
            <div className="stat">
              <span className="t-label muted">Fitness</span>
              <Figure size="l" value={Math.round(100 * view.model(view.days.length - 1))} />
            </div>
          )}
          <div className="stat">
            <span className="t-label muted">Change</span>
            <Figure value={signedText(view.delta.total, unitDigits)} unit={view.delta.unit === "%" ? "%" : "s/km"} />
            <div>
              {deltaOrder.filter((k) => view.delta.bySport[k] !== undefined).map((k) => (
                <div key={k} className="split-row">
                  <SportGlyph sport={k} size={16} />
                  <span className="t-label">{SPORT_META[k].name}</span>
                  <span className="t-fig-s">{signedText(view.delta.bySport[k]!, unitDigits)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="stat">
            <span className="t-label muted">Evidence</span>
            <Evidence level={S.evidence} n={S.calibration?.n} />
          </div>
        </Panel>
      </div>
    </>
  );
}

/** "+6.3" / "−1.2" / "0" with a real minus sign. */
function signedText(v: number, digits: number) {
  const r = Number(v.toFixed(digits));
  return r > 0 ? `+${r.toFixed(digits)}` : r < 0 ? `−${Math.abs(r).toFixed(digits)}` : (0).toFixed(digits);
}
