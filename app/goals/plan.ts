// Goals + a 10-day suggested plan. The plan is a small greedy simulation on top of the engine's fatigue state:
// each day it picks the most useful session whose capacities are fresh enough, applies that session's fatigue,
// lets everything recover overnight, and moves on. Race-week rules come first.
import type { Capacity, Sport } from "../../engine/types";
import type { DataJson } from "../../engine/index";
import { addDays, dayDiff } from "../../engine/time";

export interface Goal { sport: Sport; title: string; place?: string; date?: string }
export const GOALS: Goal[] = [   // same order as everywhere else: running, football, tennis, bouldering, gym
  { sport: "running", title: "Sub 25:00 5K", place: "Regent's Park", date: "2026-11-28" },
  { sport: "football", title: "Play better" },
  { sport: "tennis", title: "Play better" },
  { sport: "bouldering", title: "Climb V5", date: "2026-12-31" },
  { sport: "gym", title: "Improve fitness" },
]

export type Kind = "intervals" | "tempo" | "easy" | "openers" | "boulder" | "gymFull" | "gymUpper" | "football" | "tennis" | "rest";
export const SESSION: Record<Kind, { sport: Sport | null; name: string; detail: string; load: number; key?: boolean }> = {
  intervals: { sport: "running", name: "Intervals", detail: "5 × 1 km fast", load: 80, key: true },
  tempo: { sport: "running", name: "Tempo", detail: "3 km steady", load: 65, key: true },
  easy: { sport: "running", name: "Easy run", detail: "5 km easy", load: 45 },
  openers: { sport: "running", name: "Openers", detail: "3 km + strides", load: 28 },
  boulder: { sport: "bouldering", name: "Bouldering", detail: "V4–V5", load: 90 },
  gymFull: { sport: "gym", name: "Gym", detail: "Full body", load: 45 },
  gymUpper: { sport: "gym", name: "Gym", detail: "Upper body", load: 40 },
  football: { sport: "football", name: "Football", detail: "Sunday", load: 97 },
  tennis: { sport: "tennis", name: "Tennis", detail: "Match play", load: 100 },
  rest: { sport: null, name: "Rest", detail: "", load: 0 },
};

const CAPS: Capacity[] = ["engine", "speed", "legs", "pull"];
const NAME: Record<Capacity, string> = { engine: "Engine", speed: "Speed", legs: "Legs", pull: "Grip" };
export const MAX = 3, REF = 45;
type P = { recovered_threshold: number; tau_fat: Record<Capacity, number>; W: Record<string, Record<string, number>>; D: Record<string, Record<string, number>> };

export function demand(p: P, s: Sport): Record<Capacity, number> {
  const w = s === "gym" ? { legs: (p.W.gym_lower?.legs ?? 0) / 2, pull: (p.W.gym_pull?.pull ?? 0) / 2 } : p.W[s] ?? {};
  return Object.fromEntries(CAPS.map((c) => [c, (w as Record<string, number>)[c] ?? 0])) as Record<Capacity, number>;
}
export function readiness(p: P, s: Sport, f: Record<Capacity, number>) {
  const w = demand(p, s), thr = p.recovered_threshold;
  const sum = CAPS.reduce((a, c) => a + w[c], 0) || 1;
  return 1 - CAPS.reduce((a, c) => a + w[c] * Math.max(0, Math.min(1, (f[c] - thr) / (MAX - thr))), 0) / sum;
}
/** Fatigue one session adds, per capacity (same units as the engine's fatNorm). */
export function sessionCost(p: P, sport: Sport, load: number, gymKind: "gymFull" | "gymUpper" = "gymFull"): Record<Capacity, number> {
  const d = sport === "gym" ? (gymKind === "gymUpper" ? { engine: 0.05, pull: 0.9 } : { engine: 0.05, legs: 0.5, pull: 0.45 }) : p.D[sport] ?? {};
  return Object.fromEntries(CAPS.map((c) => [c, ((d as Record<string, number>)[c] ?? 0) * load / REF])) as Record<Capacity, number>;
}
/** A typical session load for this sport: median of your last 10. */
export function typicalLoad(d: DataJson, sport: Sport): number {
  const xs = d.sessions.filter((s) => s.sport === sport).slice(-10).map((s) => s.load).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : 60;
}
/** Morning fatigue per capacity for each of the next n days, if you rest except for the given sessions. */
export function fatigueDays(d: DataJson, extra: { day: string; sport: Sport }[], n = 30): Record<Capacity, number>[] {
  const p = d.params as unknown as P;
  let f = Object.fromEntries(CAPS.map((c) => [c, d.capacities[c].fatNorm])) as Record<Capacity, number>;
  const out: Record<Capacity, number>[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ ...f });
    const day = addDays(d.synced, i);
    for (const y of extra) if (y.day === day) { const c = sessionCost(p, y.sport, typicalLoad(d, y.sport)); for (const k of CAPS) f[k] += c[k]; }
    f = Object.fromEntries(CAPS.map((c) => [c, f[c] * Math.exp(-1 / p.tau_fat[c])])) as Record<Capacity, number>;
  }
  return out;
}

function cost(p: P, k: Kind): Record<Capacity, number> {
  const s = SESSION[k];
  if (!s.sport) return { engine: 0, speed: 0, legs: 0, pull: 0 };
  const d = k === "gymFull" ? { engine: 0.05, legs: 0.5, pull: 0.45 } : k === "gymUpper" ? { engine: 0.05, pull: 0.9 } : p.D[s.sport] ?? {};
  return Object.fromEntries(CAPS.map((c) => [c, ((d as Record<string, number>)[c] ?? 0) * s.load / REF])) as Record<Capacity, number>;
}

export interface PlanDay { day: string; kind: Kind; ready: number | null; why: string; runReady: number }

const YES_KIND: Record<Sport, Kind> = { running: "easy", football: "football", tennis: "tennis", bouldering: "boulder", gym: "gymFull" };

/** The 10-day plan. Sessions you've said yes to are fixed; everything else is planned around them. */
export function plan(d: DataJson, days = 10, yeses: { day: string; sport: Sport }[] = []): PlanDay[] {
  return planFull(d, days, yeses).days;
}

/** Plan plus the race-morning running readiness (for the race-day forecast). */
export function planFull(d: DataJson, days = 10, yeses: { day: string; sport: Sport }[] = []) {
  const race = GOALS[0].date!;
  const n = Math.max(days, dayDiff(d.synced, race) + 1);
  const fixed: Record<string, Kind> = Object.fromEntries(yeses.map((y) => {
    const k = YES_KIND[y.sport];
    return [y.day, k === "gymFull" && dayDiff(y.day, race) <= 10 ? "gymUpper" : k];
  }));
  // Race backbone first: if the free plan has no intervals, reserve the most run-ready free day in the window and replan.
  let out = simulate(d, n, fixed);
  if (!out.some((x) => x.kind === "intervals")) {
    const pickable = out.filter((x) => { const t = dayDiff(x.day, race); const wd = new Date(x.day + "T12:00:00Z").getUTCDay(); return t >= 5 && t <= 9 && wd !== 0 && x.kind !== "football" && !fixed[x.day]; });
    const best = pickable.sort((a, b) => b.runReady - a.runReady)[0];
    if (best) out = simulate(d, n, { ...fixed, [best.day]: "intervals" });
  }
  const raceDay = out.find((x) => x.day === race);
  return { days: out.slice(0, days), raceReady: raceDay?.runReady ?? null, yesDays: new Set(Object.keys(fixed)) };
}

/** Race-day 5K forecast range: your current estimate, a small freshness bonus, minus how tired your running capacities are that morning. */
export function raceForecast(d: DataJson, raceReady: number | null): { lo: number; mid: number; hi: number } | null {
  const e = est5k(d);
  if (!e || raceReady == null) return null;
  const mid = e.min * 0.97 * (1 + 0.12 * (1 - raceReady));
  return { lo: mid * 0.98, mid, hi: mid * 1.02 };
}

function simulate(d: DataJson, days: number, forced: Record<string, Kind>): PlanDay[] {
  const p = d.params as unknown as P;
  const race = GOALS[0].date!;
  let f = Object.fromEntries(CAPS.map((c) => [c, d.capacities[c].fatNorm])) as Record<Capacity, number>;
  const last: Record<string, number> = {};
  for (const s of d.sessions) if (s.sport !== "other") last[s.sport] = Math.max(last[s.sport] ?? -999, dayDiff(d.synced, s.day));
  const lastKind: Partial<Record<Kind, number>> = {};
  let streak = d.sessions.some((s) => s.day === addDays(d.synced, -1)) ? 1 : 0;
  const out: PlanDay[] = [];

  for (let i = 0; i < days; i++) {
    const day = addDays(d.synced, i);
    const toRace = dayDiff(day, race);
    const wd = new Date(day + "T12:00:00Z").getUTCDay();
    const r = (s: Sport) => readiness(p, s, f);
    const gap = (s: Sport) => i - (last[s] ?? -99);
    const need = (s: Sport, target: number) => Math.min(1.5, gap(s) / target);
    const boulders7 = out.slice(-6).filter((x) => x.kind === "boulder").length;

    const options: { k: Kind; score: number; why: string }[] = [];
    const add = (k: Kind, ok: boolean, score: number, why: string) => { if (ok) options.push({ k, score, why }); };

    if (toRace === 0) { /* race day */ }
    else if (forced[day]) add(forced[day], true, 1000, forced[day] === "intervals" ? "Your one key session before the race" : "You said yes");
    else if (toRace === 2) add("openers", true, 100, "Two days before the race");
    else if (toRace === 1 || toRace === 3) { /* rest */ }
    else {
      if (streak >= 3) { add("football", wd === 0 && toRace >= 4 && r("football") >= 0.6, 20, "Your usual Sunday game"); }
      else {
      add("intervals", lastKind.intervals == null && toRace >= 4 && toRace <= 9 && gap("running") >= 2 && r("running") >= 0.8 && (lastKind.tempo == null || i - lastKind.tempo >= 3), 10, "Race pace, 4+ days before the race");
      add("tempo", lastKind.tempo == null && lastKind.intervals == null && toRace >= 8 && gap("running") >= 2 && r("running") >= 0.75, 9, "Build speed while there's time");
      add("football", wd === 0 && toRace >= 4 && r("football") >= 0.6, 20, "Your usual Sunday game");
      add("boulder", gap("bouldering") >= 2 && boulders7 < 2 && toRace >= 3 && r("bouldering") >= 0.85, 6 * need("bouldering", 3.5), "Uses grip, leaves legs fresh");
      add("easy", gap("running") >= 2 && !Object.entries(forced).some(([fd, k]) => SESSION[k].sport === "running" && dayDiff(day, fd) === 1) && toRace >= 4 && r("running") >= 0.65, 7.5 * need("running", 2.5), "Keeps running ticking over");
      add(toRace <= 10 ? "gymUpper" : "gymFull", gap("gym") >= 5 && toRace >= 3 && r("gym") >= 0.8, 4 * need("gym", 5), toRace <= 10 ? "Upper body, legs stay fresh for the race" : "Strength supports running");
      // Tennis depends on friends being free, so it isn't planned; readiness for it shows on Now.
      }
    }
    const best = options.sort((a, b) => b.score - a.score)[0];
    const kind: Kind = best?.k ?? "rest";
    const sp = SESSION[kind].sport;
    out.push({ day, kind, ready: sp ? r(sp) : null, runReady: r("running"), why: best?.why ?? (toRace === 0 ? "Race day" : toRace === 1 ? "Race tomorrow" : toRace === 3 ? "Fresh legs for race day" : streak >= 3 ? "Three days in a row" : `${NAME[[...CAPS].sort((a, b) => f[b] - f[a])[0]]} needs a day`) });

    if (sp) { last[sp] = i; lastKind[kind] = i; streak++; const c = cost(p, kind); for (const k of CAPS) f[k] += c[k]; } else streak = 0;
    f = Object.fromEntries(CAPS.map((c) => [c, f[c] * Math.exp(-1 / p.tau_fat[c])])) as Record<Capacity, number>;
  }
  return out;
}

/** Best recent 5K estimate (Riegel) from runs of 3–10 km in the last 60 days. */
export function est5k(d: DataJson): { min: number; from: string } | null {
  let best: { min: number; from: string } | null = null;
  for (const s of d.sessions) {
    if (s.sport !== "running" || !s.km || s.km < 3 || s.km > 10 || dayDiff(s.day, d.synced) > 60) continue;
    const t = s.durationMin * Math.pow(5 / s.km, 1.06);
    if (!best || t < best.min) best = { min: t, from: s.day };
  }
  return best;
}
export const mmss = (min: number) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, "0")}`;
