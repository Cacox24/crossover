// Runs PROGRESSION_LOGIC §3–§8 and assembles data.json (§12). Pure: no I/O.
import type { Session, Night, Params, Sport, SessionSport, Capacity } from "./types";
import { CAPACITIES, SPORTS, SOURCES, zeroVec } from "./types";
import { computeLoads, isHrSport, type LoadMethod } from "./load";
import { splitSessions, meanGymShares } from "./split";
import { simulate, fitTotal, trailingMax, fatigueRefs, fatStep, recoveredOn } from "./state";
import { wRow, modelRefs, contribution, runPoints, rollingMedian, calibrate, type Calibration } from "./progression";
import { attributeDelta, type Delta } from "./attribution";
import { shortTermEffects, longTermEffects, type Effect } from "./effects";
import type { WhatIfContext } from "./whatif";
import { addDays, dayDiff, mondayOf } from "./time";
import { median, round } from "./stats";

export interface EngineInput { sessions: Session[]; nights: Night[]; hrMax: number; tz: string; today: string; params: Params }

export interface DataJson {
  synced: string;
  tz: string;
  hrMax: number;
  c: { value: number; fitted: boolean };
  capacities: Record<Capacity, {
    fitIndex: number; fitChange28d: number; fatNorm: number; fatStep: number; recoveredOn: string | null;
    fitBySport: Partial<Record<SessionSport, number>>;
  }>;
  sports: Record<Sport, {
    model: { start: string; values: number[] };                       // daily, 0–1 (×100 = index)
    contributions: Partial<Record<SessionSport, number[]>>;           // daily, same dates, sum = model
    metric: null | { name: string; unit: string; points: [string, number][]; series: [string, number][] };
    calibration: Calibration | null;
    evidence: number;
    delta12w: Delta;
  }>;
  effects: Effect[];
  weeks: { start: string; loadBySport: Partial<Record<SessionSport, number>>; countBySport: Partial<Record<SessionSport, number>> }[];
  sessions: { id: string; sport: SessionSport; otherKind?: string; start: string; day: string; durationMin: number; load: number; method: LoadMethod; avgHrOnly?: boolean }[];
  whatif: WhatIfContext;
  params: Params;
}

const r4 = (x: number) => round(x, 4);

export function runEngine({ sessions: raw, nights, hrMax, tz, today, params: p }: EngineInput): DataJson {
  const { sessions: all, c, cFitted } = computeLoads(raw, nights, hrMax, tz, p);
  const sessions = all.filter((s) => s.day <= today);
  const splits = splitSessions(sessions, p);
  const first = sessions.reduce((m, s) => (s.day < m ? s.day : m), today);
  const st = simulate(sessions, splits, nights, first, today, p);
  const iT = st.days.length - 1;

  // --- §5.4 capacities --------------------------------------------------------
  const fatRef = fatigueRefs(sessions, splits, today, p);
  const capacities = {} as DataJson["capacities"];
  for (const cap of CAPACITIES) {
    const now = fitTotal(st, cap, iT);
    const max = trailingMax((j) => fitTotal(st, cap, j), iT, p.state.fit_ref_days);
    const back = fitTotal(st, cap, Math.max(0, iT - p.state.fit_change_days));
    const fatNorm = fatRef[cap] > 0 ? st.fat[cap][iT] / fatRef[cap] : 0;
    const fitBySport: Partial<Record<SessionSport, number>> = {};
    for (const k of SOURCES) if (now > 0 && st.fit[cap][k][iT] > 0) fitBySport[k] = r4(st.fit[cap][k][iT] / now);
    capacities[cap] = {
      fitIndex: max > 0 ? Math.round((100 * now) / max) : 0,
      fitChange28d: back > 0 ? r4(now / back - 1) : 0,
      fatNorm: round(fatNorm, 2), fatStep: fatStep(fatNorm, p),
      recoveredOn: recoveredOn(fatNorm, (p.tau_fat as Record<Capacity, number>)[cap], today, p),
      fitBySport,
    };
  }

  // --- §6–§7 sports -----------------------------------------------------------
  const refs = modelRefs(st, p);
  const iStart = Math.max(0, iT - p.state.fit_ref_days + 1);
  const iDelta = Math.max(0, iT - p.progression.delta_window_days);
  const idx = (day: string) => Math.min(iT, Math.max(0, dayDiff(st.days[0], day)));
  const runPts = runPoints(sessions, p);
  const sports = {} as DataJson["sports"];
  for (const s of SPORTS) {
    const W = wRow(s, p);
    const contribAt = (i: number) => Object.fromEntries(SOURCES.map((k) => [k, contribution(st, refs, W, s, k, i)])) as Record<SessionSport, number>;
    const model = (i: number) => SOURCES.reduce((a, k) => a + contribution(st, refs, W, s, k, i), 0);
    const contributions: Partial<Record<SessionSport, number[]>> = {};
    for (const k of SOURCES) {
      const xs = st.days.slice(iStart).map((_, j) => r4(contribution(st, refs, W, s, k, iStart + j)));
      if (xs.some((v) => v > 0)) contributions[k] = xs;
    }
    const isRun = s === "running";
    const cal = isRun ? calibrate(runPts, (d) => model(idx(d)), p) : null;
    sports[s] = {
      model: { start: st.days[iStart], values: st.days.slice(iStart).map((_, j) => r4(model(iStart + j))) },
      contributions,
      metric: isRun ? {
        name: "pace_at_150", unit: "s/km",
        points: runPts.map((x) => [x.day, round(x.value)]),
        series: rollingMedian(runPts, p.progression.run_trend_days).map(([d, v]) => [d, round(v)]),
      } : null,
      calibration: cal && { ...cal, a: round(cal.a, 2), b: round(cal.b, 2), r2: round(cal.r2, 3) },
      evidence: cal?.evidence ?? 1,
      delta12w: attributeDelta(s, contribAt(iDelta), contribAt(iT), cal, isRun ? "s/km" : "%"),
    };
  }

  // --- §8 effects -------------------------------------------------------------
  const effects = [...shortTermEffects("running", runPts, "s/km", sessions, p), ...longTermEffects("running", runPts, sessions, p)];

  // --- weeks (Mix) and sessions ----------------------------------------------
  const weekMap = new Map<string, DataJson["weeks"][number]>();
  for (const s of sessions) {
    if (dayDiff(s.day, today) >= 365) continue;
    const w = mondayOf(s.day);
    const rec = weekMap.get(w) ?? { start: w, loadBySport: {}, countBySport: {} };
    rec.loadBySport[s.sport] = (rec.loadBySport[s.sport] ?? 0) + s.load;
    rec.countBySport[s.sport] = (rec.countBySport[s.sport] ?? 0) + 1;
    weekMap.set(w, rec);
  }
  const weeks: DataJson["weeks"] = [];
  for (let w = mondayOf(addDays(today, -364)); w <= today; w = addDays(w, 7)) {
    const rec = weekMap.get(w) ?? { start: w, loadBySport: {}, countBySport: {} };
    for (const k of Object.keys(rec.loadBySport) as SessionSport[]) rec.loadBySport[k] = Math.round(rec.loadBySport[k]!);
    weeks.push(rec);
  }

  // --- what-if context ---------------------------------------------------------
  const recent = (s: Sport) => sessions.filter((x) => x.sport === s && dayDiff(x.day, today) < p.whatif.median_days);
  const medianDurationMin = Object.fromEntries(SPORTS.map((s) => {
    const xs = recent(s).length ? recent(s) : sessions.filter((x) => x.sport === s);
    return [s, xs.length ? round(median(xs.map((x) => x.durationMin)), 1) : 60];
  })) as Record<Sport, number>;
  const hrRatio: WhatIfContext["hrRatio"] = {};
  for (const s of SPORTS) {
    if (!isHrSport(s)) continue;
    const xs = sessions.filter((x) => x.sport === s && x.method === "trimp" && x.rpeUsed);
    if (xs.length) hrRatio[s] = round(median(xs.map((x) => x.load)) / median(xs.map((x) => x.rpeUsed! * x.durationMin * c)), 3);
  }
  const fatToday = zeroVec();
  for (const cap of CAPACITIES) fatToday[cap] = r4(st.fat[cap][iT]);
  const whatif: WhatIfContext = {
    today, fat: fatToday, fatRef, refs, c, medianDurationMin, hrRatio,
    gymShares: meanGymShares(sessions), effects,
  };

  return {
    synced: today, tz, hrMax, c: { value: round(c, 3), fitted: cFitted },
    capacities, sports, effects, weeks,
    // Opaque ids: device activity ids aren't needed by the app and don't belong in a public file.
    sessions: sessions.filter((s) => dayDiff(s.day, today) < 365).map((s, i) => ({
      id: `s${i}`, sport: s.sport, ...(s.otherKind ? { otherKind: s.otherKind } : {}), start: s.start, day: s.day,
      durationMin: s.durationMin, load: round(s.load, 1), method: s.method, ...(s.hrFromAvg && s.method === "trimp" ? { avgHrOnly: true } : {}),
    })),
    whatif, params: p,
  };
}
