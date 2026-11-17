// PROGRESSION_LOGIC §9: add a hypothetical session and project 7 days ahead.
// Pure function over a context precomputed by the sync (data.json → whatif).
import type { Params, Sport, Capacity, Vec } from "./types";
import { CAPACITIES, SPORTS, zeroVec } from "./types";
import { splitFor, type GroupShares } from "./split";
import { wRow, type Refs } from "./progression";
import { fatStep } from "./state";
import { addDays } from "./time";
import type { Effect } from "./effects";

export type Intensity = "easy" | "normal" | "hard";

export interface WhatIfContext {
  today: string;
  fat: Vec;                         // fatigue store today, after today's sessions
  fatRef: Vec;                      // §5.4 ref[c]
  refs: Refs;                       // §6.1 references
  c: number;                        // §3.3 sRPE → TRIMP
  medianDurationMin: Record<Sport, number>;
  hrRatio: Partial<Record<Sport, number>>; // median TRIMP / median (sRPE × c), HR sports
  gymShares: GroupShares;
  effects: Effect[];
}

export interface WhatIfInput { sport: Sport; dayOffset: number; intensity: Intensity }

export interface WhatIfResult {
  load: number;
  days: string[];
  capacities: Record<Capacity, {
    now: number[];                  // FatNorm per day without the session
    projected: number[];            // FatNorm per day with it
    step: number[];                 // fatigue step of `projected`
    recoveredOn: string | null;     // with the session
    recoveredOnNow: string | null;  // without it
    fitGainPct: number;
  }>;
  sportGainPct: Record<Sport, number>;
  effects: Effect[];
}

function firstRecovered(fat0: number, add: number, offset: number, ref: number, tau: number, today: string, thr: number) {
  if (ref <= 0) return null;
  const start = add ? offset : 0; // judge from the session day onward
  for (let d = start; d <= 120; d++) {
    const f = fat0 * Math.exp(-d / tau) + (d >= offset ? add * Math.exp(-(d - offset) / tau) : 0);
    if (f / ref < thr) return d === start ? null : addDays(today, d); // null = never above light
  }
  return addDays(today, 120);
}

export function whatIf(ctx: WhatIfContext, input: WhatIfInput, p: Params): WhatIfResult {
  const { sport, dayOffset, intensity } = input;
  const rpe = p.whatif.rpe[intensity];
  const load = rpe * ctx.medianDurationMin[sport] * ctx.c * (ctx.hrRatio[sport] ?? 1);
  const sp = splitFor(sport, undefined, sport === "gym" ? ctx.gymShares : undefined, p);
  const tF = p.tau_fat as Record<Capacity, number>;
  const days = Array.from({ length: p.whatif.days + 1 }, (_, d) => addDays(ctx.today, d));

  const capacities = {} as WhatIfResult["capacities"];
  for (const c of CAPACITIES) {
    const ref = ctx.fatRef[c], tau = tF[c], add = sp.D[c] * load;
    const norm = (x: number) => (ref > 0 ? x / ref : 0);
    const now = days.map((_, d) => norm(ctx.fat[c] * Math.exp(-d / tau)));
    const projected = days.map((_, d) => norm(ctx.fat[c] * Math.exp(-d / tau) + (d >= dayOffset ? add * Math.exp(-(d - dayOffset) / tau) : 0)));
    capacities[c] = {
      now, projected, step: projected.map((x) => fatStep(x, p)),
      recoveredOn: firstRecovered(ctx.fat[c], add, dayOffset, ref, tau, ctx.today, p.recovered_threshold),
      recoveredOnNow: firstRecovered(ctx.fat[c], 0, 0, ref, tau, ctx.today, p.recovered_threshold),
      fitGainPct: ctx.refs.fit[c] > 0 ? (100 * sp.F[c] * load) / ctx.refs.fit[c] : 0,
    };
  }

  const sportGainPct = {} as Record<Sport, number>;
  for (const s of SPORTS) {
    const W = wRow(s, p);
    let g = 0;
    for (const c of CAPACITIES) g += W[c] * (ctx.refs.fit[c] > 0 ? (sp.F[c] * load) / ctx.refs.fit[c] : 0);
    if (s === sport && ctx.refs.spec[s] > 0) g += (W.specific * sp.spec * load) / ctx.refs.spec[s];
    sportGainPct[s] = 100 * g;
  }

  return { load, days, capacities, sportGainPct, effects: ctx.effects.filter((e) => e.from === sport && e.evidence >= 1) };
}

export { zeroVec };
