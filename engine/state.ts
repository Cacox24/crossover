// PROGRESSION_LOGIC §5: daily fitness and fatigue stores per capacity.
import type { Night, Params, Capacity, Sport, SessionSport, Vec } from "./types";
import { CAPACITIES, SPORTS, SOURCES, zeroVec } from "./types";
import type { Loaded } from "./load";
import type { Split } from "./split";
import { addDays, dayRange, dayDiff } from "./time";
import { mean, sd, median } from "./stats";

export interface State {
  days: string[];
  fit: Record<Capacity, Record<SessionSport, number[]>>; // per source sport (§5.1)
  spec: Record<Sport, number[]>;
  fat: Record<Capacity, number[]>;
  m: number[];
}

/** §5.3 recovery modifier for the night that ends on `day`. */
export function recoveryModifier(day: string, nights: Map<string, Night>, p: Params): number {
  const r = p.recovery_modifier;
  const n = nights.get(day);
  if (!n) return 1;
  const base = Array.from({ length: r.baseline_days }, (_, i) => nights.get(addDays(day, -1 - i))).filter((x): x is Night => !!x);
  let m = 1;
  if (n.sleepH !== undefined) {
    if (n.sleepH < r.sleep_short_h) m += r.sleep_short;
    else if (n.sleepH >= r.sleep_long_h) m += r.sleep_long;
  }
  const lnB = base.filter((b) => b.rmssd).map((b) => Math.log(b.rmssd!));
  if (n.rmssd && lnB.length >= 3) {
    const z = (Math.log(n.rmssd) - mean(lnB)) / sd(lnB);
    if (z < -r.hrv_low_sd) m += r.hrv_low;
    else if (z > r.hrv_high_sd) m += r.hrv_high;
  }
  const rB = base.filter((b) => b.rhr).map((b) => b.rhr!);
  if (n.rhr && rB.length >= 3 && n.rhr - mean(rB) >= r.rhr_high_bpm) m += r.rhr_high;
  return Math.min(r.clamp[1], Math.max(r.clamp[0], m));
}

export function simulate(sessions: Loaded[], splits: Map<string, Split>, nights: Night[], from: string, to: string, p: Params): State {
  const days = dayRange(from, to);
  const N = days.length;
  const arr = () => new Array<number>(N).fill(0);
  const fit = Object.fromEntries(CAPACITIES.map((c) => [c, Object.fromEntries(SOURCES.map((k) => [k, arr()]))])) as State["fit"];
  const spec = Object.fromEntries(SPORTS.map((s) => [s, arr()])) as State["spec"];
  const fat = Object.fromEntries(CAPACITIES.map((c) => [c, arr()])) as State["fat"];
  const m = arr();
  const nightMap = new Map(nights.map((n) => [n.date, n]));

  const byDay = new Map<string, Loaded[]>();
  for (const s of sessions) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);

  const tf = p.tau_fit as Record<Capacity | "specific", number>, tF = p.tau_fat as Record<Capacity, number>;
  for (let i = 0; i < N; i++) {
    m[i] = recoveryModifier(days[i], nightMap, p);
    for (const c of CAPACITIES) {
      const dFit = Math.exp(-1 / tf[c]), dFat = Math.exp(-1 / (tF[c] * m[i]));
      for (const k of SOURCES) fit[c][k][i] = i ? fit[c][k][i - 1] * dFit : 0;
      fat[c][i] = i ? fat[c][i - 1] * dFat : 0;
    }
    const dSpec = Math.exp(-1 / tf.specific);
    for (const s of SPORTS) spec[s][i] = i ? spec[s][i - 1] * dSpec : 0;
    for (const s of byDay.get(days[i]) ?? []) {
      const sp = splits.get(s.id)!;
      for (const c of CAPACITIES) { fit[c][s.sport][i] += sp.F[c] * s.load; fat[c][i] += sp.D[c] * s.load; }
      if (s.sport !== "other") spec[s.sport][i] += sp.spec * s.load;
    }
  }
  return { days, fit, spec, fat, m };
}

export const fitTotal = (st: State, c: Capacity, i: number) => SOURCES.reduce((a, k) => a + st.fit[c][k][i], 0);

/** Max over the trailing window ending at index i (inclusive). */
export function trailingMax(xs: (i: number) => number, i: number, window: number): number {
  let m = 0;
  for (let j = Math.max(0, i - window + 1); j <= i; j++) m = Math.max(m, xs(j));
  return m;
}

/** §5.4 ref[c] = median of D[c] × load over recent five-sport sessions where D[c] ≥ 0.2 (widens if none). Other is excluded. */
export function fatigueRefs(sessions: Loaded[], splits: Map<string, Split>, today: string, p: Params): Vec {
  const ref = zeroVec();
  for (const c of CAPACITIES) {
    for (const window of [p.state.fat_ref_days, 365, Infinity]) {
      const xs = sessions
        .filter((s) => s.sport !== "other" && dayDiff(s.day, today) < window && dayDiff(s.day, today) >= 0 && splits.get(s.id)!.D[c] >= p.state.fat_ref_min_share)
        .map((s) => splits.get(s.id)!.D[c] * s.load);
      if (xs.length) { ref[c] = median(xs); break; }
    }
  }
  return ref;
}

export const fatStep = (fatNorm: number, p: Params) => p.fatigue_steps.filter((t) => fatNorm >= t).length;

/** §5.4 recovery day: first day FatNorm < threshold, with m = 1. null = already fresh enough. */
export function recoveredOn(fatNorm: number, tauFat: number, today: string, p: Params): string | null {
  if (fatNorm < p.recovered_threshold) return null;
  return addDays(today, Math.max(1, Math.ceil(tauFat * Math.log(fatNorm / p.recovered_threshold))));
}
