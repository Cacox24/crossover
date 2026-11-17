// PROGRESSION_LOGIC §8: learned personal effects with evidence strength.
import type { Params, Sport, SessionSport } from "./types";
import { SPORTS } from "./types";
import type { Loaded } from "./load";
import type { MetricPoint } from "./progression";
import { dayDiff, mondayOf, addDays } from "./time";
import { mean, median, sd, quantile, rng, ols, pearson, round } from "./stats";

export interface Effect {
  from: Sport; to: Sport; window: "next_day" | "weeks";
  effect: number; unit: string; n: number; evidence: 1 | 2 | 3;
}

const H = 3600e3;

function bootstrapCI(fn: (r: () => number) => number, p: Params, seed: number): [number, number] {
  const r = rng(seed), xs: number[] = [];
  for (let b = 0; b < p.learned_effects.bootstrap_n; b++) xs.push(fn(r));
  const a = (1 - p.learned_effects.bootstrap_ci) / 2;
  return [quantile(xs, a), quantile(xs, 1 - a)];
}
const resample = <T>(xs: T[], r: () => number) => xs.map(() => xs[Math.floor(r() * xs.length)]);

/** §8.1: residual vs trailing baseline, exposed if X ended 6–36 h before Y. */
export function shortTermEffects(to: Sport, pts: MetricPoint[], unit: string, sessions: Loaded[], p: Params): Effect[] {
  const le = p.learned_effects;
  const res = pts.map((pt) => {
    const base = pts.filter((q) => q.startMs < pt.startMs && dayDiff(q.day, pt.day) <= le.baseline_days).map((q) => q.value);
    return base.length >= 3 ? { pt, r: pt.value - median(base) } : null;
  }).filter((x): x is { pt: MetricPoint; r: number } => !!x);
  if (res.length < 2) return [];
  const swc = le.swc_sd * sd(res.map((x) => x.r));
  const [lo, hi] = le.window_h;
  const out: Effect[] = [];
  SPORTS.forEach((from, fi) => {
    const exposed: number[] = [], unexposed: number[] = [];
    for (const { pt, r } of res) {
      const hit = sessions.some((s) => s.sport === from && s.startMs !== pt.startMs && pt.startMs - s.endMs >= lo * H && pt.startMs - s.endMs <= hi * H);
      (hit ? exposed : unexposed).push(r);
    }
    const n = exposed.length;
    if (n < le.weak_n || !unexposed.length) return;
    const effect = mean(exposed) - mean(unexposed);
    if (Math.abs(effect) < swc) return; // below smallest worthwhile change: hidden
    let evidence: Effect["evidence"] = 1;
    if (n >= le.some_n) evidence = 2;
    if (n >= le.strong_n) {
      const [a, b] = bootstrapCI((r) => mean(resample(exposed, r)) - mean(resample(unexposed, r)), p, 1000 + fi);
      if (a > 0 || b < 0) evidence = 3;
    }
    out.push({ from, to, window: "next_day", effect: round(effect, 1), unit, n, evidence });
  });
  return out;
}

/** §8.3: X's weekly load share vs slope of Y's metric over the next 2 weeks. */
export function longTermEffects(to: Sport, pts: MetricPoint[], sessions: Loaded[], p: Params): Effect[] {
  const le = p.learned_effects;
  const weeks = new Map<string, Record<string, number>>();
  for (const s of sessions) {
    const w = mondayOf(s.day);
    const rec = weeks.get(w) ?? {};
    rec[s.sport] = (rec[s.sport] ?? 0) + s.load;
    weeks.set(w, rec);
  }
  const rows: { share: Record<string, number>; slope: number }[] = [];
  for (const [w, rec] of weeks) {
    const from = addDays(w, 7), to14 = addDays(w, 21);
    const next = pts.filter((q) => q.day >= from && q.day < to14);
    if (next.length < 2) continue;
    const total = Object.values(rec).reduce((a, b) => a + b, 0);
    const share = Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v / total]));
    rows.push({ share, slope: ols(next.map((q) => dayDiff(from, q.day)), next.map((q) => q.value)).b });
  }
  const n = rows.length;
  if (n < le.longterm_min_weeks) return [];
  const out: Effect[] = [];
  SPORTS.forEach((from, fi) => {
    const x = rows.map((r) => r.share[from] ?? 0), y = rows.map((r) => r.slope);
    if (x.every((v) => v === 0)) return;
    const r = pearson(x, y);
    if (Math.abs(r) < le.longterm_min_abs_r) return;
    let evidence: Effect["evidence"] = n >= le.some_n ? 2 : 1;
    if (n >= le.strong_n) {
      const idx = rows.map((_, i) => i);
      const [a, b] = bootstrapCI((rr) => { const s = resample(idx, rr); return pearson(s.map((i) => x[i]), s.map((i) => y[i])); }, p, 2000 + fi);
      if (a > 0 || b < 0) evidence = 3;
    }
    out.push({ from, to, window: "weeks", effect: round(r, 2), unit: "r", n, evidence });
  });
  return out;
}

export type { SessionSport };
