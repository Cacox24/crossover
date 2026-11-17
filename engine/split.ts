// PROGRESSION_LOGIC §4: where load builds fitness (F) and where it costs fatigue (D).
import type { Params, Vec, Capacity, GymSet } from "./types";
import { CAPACITIES, zeroVec } from "./types";
import type { Loaded } from "./load";

export type Group = "lower" | "pull" | "push" | "core";
export type GroupShares = Record<Group, number>;

// §4.3 category → movement group [assumption: lookup table maintained in code].
// Anything not listed counts as UNKNOWN and is spread proportionally.
const EXACT: Record<string, Group> = {
  SQUAT: "lower", DEADLIFT: "lower", LUNGE: "lower", OLYMPIC_LIFT: "lower",
  PULL_UP: "pull", ROW: "pull", CURL: "pull", SHRUG: "pull",
  BENCH_PRESS: "push", PUSH_UP: "push", SHOULDER_PRESS: "push", TRICEPS_EXTENSION: "push", FLYE: "push", LATERAL_RAISE: "push",
  SIT_UP: "core", PLANK: "core",
};
const PREFIX: [string, Group][] = [["LEG_", "lower"], ["LAT_", "pull"], ["CORE_", "core"]];

export function groupOf(exercise: string): Group | undefined {
  const cat = exercise.split("/")[0];
  return EXACT[cat] ?? PREFIX.find(([p]) => cat.startsWith(p))?.[1];
}

/** share(group) = sets in group / known sets; undefined if no known sets. */
export function gymShares(sets: GymSet[] | undefined): GroupShares | undefined {
  const n: GroupShares = { lower: 0, pull: 0, push: 0, core: 0 };
  let known = 0;
  for (const s of sets ?? []) { const g = groupOf(s.exercise); if (g) { n[g]++; known++; } }
  if (!known) return undefined;
  for (const g of Object.keys(n) as Group[]) n[g] /= known;
  return n;
}

/** Fallback for gym sessions without known sets: mean shares over all gym sessions. */
export function meanGymShares(sessions: Loaded[]): GroupShares {
  const all = sessions.filter((s) => s.sport === "gym").map((s) => gymShares(s.sets)).filter((x): x is GroupShares => !!x);
  const m: GroupShares = { lower: 0.25, pull: 0.25, push: 0.25, core: 0.25 };
  if (!all.length) return m;
  for (const g of Object.keys(m) as Group[]) m[g] = all.reduce((a, x) => a + x[g], 0) / all.length;
  return m;
}

export interface Split { F: Vec; spec: number; D: Vec; shares?: GroupShares; interference?: boolean }

/** Fractions of load (multiply by load to get amounts). */
export function splitFor(sport: Loaded["sport"], otherKind: Loaded["otherKind"], shares: GroupShares | undefined, p: Params): Split {
  const F = zeroVec(), D = zeroVec();
  if (sport === "other") {
    const kind = otherKind ?? "endurance";
    Object.assign(F, p.other.F[kind]);
    Object.assign(D, p.other.D[kind]);
    return { F, spec: 0, D };
  }
  if (sport === "gym") {
    const sh = shares!;
    const fs = p.F.gym.split_from_sets, ds = p.D.gym.split_from_sets;
    F.engine = p.F.gym.engine; F.speed = p.F.gym.speed;
    F.legs = fs * sh.lower; F.pull = fs * sh.pull;
    const spec = p.F.gym.specific + fs * (sh.push + sh.core);
    D.engine = p.D.gym.engine + ds * sh.core; D.speed = p.D.gym.speed;
    D.legs = ds * sh.lower; D.pull = ds * sh.pull; // push fatigue → Specific (not shown)
    return { F, spec, D, shares: sh };
  }
  const f = p.F[sport] as Record<Capacity | "specific", number>, d = p.D[sport] as Record<Capacity, number>;
  for (const c of CAPACITIES) { F[c] = f[c]; D[c] = d[c]; }
  return { F, spec: f.specific, D };
}

/** Splits for every session, including the §4.4 interference rule. */
export function splitSessions(sessions: Loaded[], p: Params): Map<string, Split> {
  const fallback = meanGymShares(sessions);
  const out = new Map<string, Split>();
  const winMs = p.interference.window_h * 3600e3;
  for (const s of sessions) {
    const shares = s.sport === "gym" ? gymShares(s.sets) ?? fallback : undefined;
    const sp = splitFor(s.sport, s.otherKind, shares, p);
    if (s.sport === "gym" && shares!.lower >= p.interference.lower_share_min &&
        sessions.some((o) => (o.sport === "running" || o.sport === "football") && o.endMs <= s.startMs && s.startMs - o.endMs <= winMs)) {
      sp.F.legs *= p.interference.legs_fitness_multiplier;
      sp.interference = true;
    }
    out.set(s.id, sp);
  }
  return out;
}
