// PROGRESSION_LOGIC §6: modelled fitness per sport, measured metrics, calibration.
import type { Params, Capacity, Sport, Vec } from "./types";
import { CAPACITIES, SPORTS, zeroVec } from "./types";
import type { Loaded } from "./load";
import { type State, fitTotal, trailingMax } from "./state";
import { dayDiff } from "./time";
import { median, ols, sd, mean } from "./stats";

export type WRow = Vec & { specific: number };

/** §6.1 draw row; gym mixes the lower and pull rows (gym_lift_mix). */
export function wRow(s: Sport, p: Params): WRow {
  const W = p.W as Record<string, Partial<WRow>>;
  const row = (r: Partial<WRow>): WRow => ({ ...zeroVec(), specific: 0, ...r });
  if (s !== "gym") return row(W[s]);
  const lo = row(W.gym_lower), pu = row(W.gym_pull), mx = p.gym_lift_mix;
  return Object.fromEntries((["specific", ...CAPACITIES] as const).map((k) => [k, mx.lower * lo[k] + mx.pull * pu[k]])) as WRow;
}

export interface Refs { fit: Vec; spec: Record<Sport, number> }

/** §6.1 references: 365-day max of each store, ending today (fixed, so the model stays linear). */
export function modelRefs(st: State, p: Params): Refs {
  const i = st.days.length - 1, w = p.state.fit_ref_days;
  const fit = zeroVec();
  for (const c of CAPACITIES) fit[c] = trailingMax((j) => fitTotal(st, c, j), i, w);
  const spec = Object.fromEntries(SPORTS.map((s) => [s, trailingMax((j) => st.spec[s][j], i, w)])) as Record<Sport, number>;
  return { fit, spec };
}

const safe = (x: number, ref: number) => (ref > 0 ? x / ref : 0);

/** §7 Contribution[s ← k](i); Model[s](i) is the sum over k. */
export function contribution(st: State, refs: Refs, W: WRow, s: Sport, k: Sport | "other", i: number): number {
  let v = 0;
  for (const c of CAPACITIES as Capacity[]) v += W[c] * safe(st.fit[c][k][i], refs.fit[c]);
  if (k === s) v += W.specific * safe(st.spec[s][i], refs.spec[s]);
  return v;
}

export interface MetricPoint { day: string; startMs: number; value: number }

/** §6.2 running: pace at reference HR on steady runs. Returns s/km. */
export function runPoints(sessions: Loaded[], p: Params): MetricPoint[] {
  const q = p.progression.steady_run, ref = p.progression.run_ref_hr;
  return sessions
    .filter((s) => s.sport === "running" && s.durationMin >= q.min_minutes && s.distanceM && s.avgHr &&
      (s.elevGainM ?? 0) / (s.distanceM / 1000) < q.max_gain_m_per_km &&
      (s.hrCv === undefined || s.hrCv < q.max_hr_cv)) // CV only checkable with an HR stream
    .map((s) => {
      const ef = s.distanceM! / s.durationMin / s.avgHr!; // m/min per bpm
      return { day: s.day, startMs: s.startMs, value: (1000 / (ef * ref)) * 60 };
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/** Trailing rolling median over `days`, evaluated at each point. */
export function rollingMedian(pts: MetricPoint[], days: number): [string, number][] {
  return pts.map((pt) => [pt.day, median(pts.filter((q) => q.startMs <= pt.startMs && dayDiff(q.day, pt.day) < days).map((q) => q.value))]);
}

export interface Calibration { n: number; a: number; b: number; r2: number; calibrated: boolean; evidence: 1 | 2 | 3 }

/** §6.3 Measured ≈ a + b × Model on measurement days. */
export function calibrate(pts: MetricPoint[], model: (day: string) => number, p: Params): Calibration | null {
  const pp = p.progression;
  if (pts.length < pp.calibration_min_points) return null;
  const { a, b, r2 } = ols(pts.map((x) => model(x.day)), pts.map((x) => x.value));
  const calibrated = r2 >= pp.calibration_min_r2;
  return { n: pts.length, a, b, r2, calibrated, evidence: !calibrated ? 1 : r2 >= pp.calibration_strong_r2 ? 3 : 2 };
}

export { sd, mean };
