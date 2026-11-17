// PROGRESSION_LOGIC §3: one load number per session (TRIMP scale).
import type { Session, Night, Params, SessionSport } from "./types";
import { addDays, dayKey, DAY_MS } from "./time";
import { median, sd, mean, sum } from "./stats";

export type LoadMethod = "trimp" | "srpe" | "estimated";

export interface Loaded extends Omit<Session, "hrSamples"> {
  day: string;
  startMs: number;
  endMs: number;
  load: number;
  method: LoadMethod;
  hrFromAvg?: boolean;          // TRIMP from average HR only (§3.1: less accurate)
  hrr?: number;                 // average fraction of HR reserve, if usable HR
  hrCv?: number;                // HR coefficient of variation, if a usable stream
  trimp?: number;
  rpeUsed?: number;
  rpeEstimated?: boolean;
}

const HR_SPORTS: SessionSport[] = ["running", "football", "tennis", "other"];
export const isHrSport = (s: SessionSport) => HR_SPORTS.includes(s);

/** §2.1 HRrest: rolling median of daily resting HR over the window ending on `day`. */
export function hrRestLookup(nights: Night[], p: Params) {
  const rhr = nights.filter((n) => n.rhr).sort((a, b) => a.date.localeCompare(b.date));
  if (!rhr.length) throw new Error("no resting HR data: HRrest can't be derived");
  const w = p.hrrest_window_days;
  const earliest = median(rhr.slice(0, w).map((n) => n.rhr!)); // before Fitbit history starts
  return (day: string) => {
    const from = addDays(day, -w + 1);
    const xs = rhr.filter((n) => n.date >= from && n.date <= day).map((n) => n.rhr!);
    return xs.length ? median(xs) : day < rhr[0].date ? earliest : median(rhr.slice(-w).map((n) => n.rhr!));
  };
}

const hrrOf = (hr: number, rest: number, max: number) => Math.min(1, Math.max(0, (hr - rest) / (max - rest)));

/** §2.5: stream usable unless > max_missing missing or flat. */
function streamQuality(samples: [number, number][], durationS: number, p: Params) {
  const s = [...samples].sort((a, b) => a[0] - b[0]);
  if (s.length < 2) return { ok: false as const };
  const dts = s.map((x, i) => (i + 1 < s.length ? Math.min(s[i + 1][0] - x[0], p.hr_quality.max_gap_s) : 0));
  const covered = sum(dts);
  const missing = 1 - Math.min(1, covered / durationS);
  const bpm = s.map((x) => x[1]);
  const ok = missing <= p.hr_quality.max_missing && sd(bpm) >= p.hr_quality.min_sd_bpm;
  return { ok, s, dts, covered, cv: sd(bpm) / mean(bpm) };
}

/** §3.4: estimate RPE from average %HRR. */
export function rpeFromHrr(hrr: number, sport: SessionSport, p: Params): number {
  const t = p.rpe_from_hrr;
  let i = t.bands.findIndex((b) => hrr < b);
  if (i < 0) i = t.bands.length;
  let rpe = t.rpe[i];
  if (sport === "gym" || sport === "bouldering") rpe = Math.min(t.cap, rpe + t.strength_bonus);
  return rpe;
}

export interface LoadResult { sessions: Loaded[]; c: number; cFitted: boolean }

export function computeLoads(sessions: Session[], nights: Night[], hrMax: number, tz: string, p: Params): LoadResult {
  const hrRest = hrRestLookup(nights, p);
  const { k, a } = p.trimp;

  // Pass 1: HR → TRIMP and %HRR where HR is usable.
  const out: Loaded[] = sessions.map((x) => {
    const { hrSamples, ...rest } = x;
    const startMs = Date.parse(x.start), durS = x.durationMin * 60;
    const L: Loaded = { ...rest, day: dayKey(startMs, tz), startMs, endMs: startMs + durS * 1000, load: 0, method: "estimated" };
    const R = hrRest(L.day);
    if (hrSamples?.length) {
      const q = streamQuality(hrSamples, durS, p);
      if (q.ok) {
        let trimp = 0, hrrSum = 0;
        q.s.forEach(([, b], i) => { const h = hrrOf(b, R, hrMax); trimp += (q.dts[i] / 60) * h * a * Math.exp(k * h); hrrSum += h * q.dts[i]; });
        L.trimp = trimp * Math.max(1, durS / q.covered); // scale the covered part up to the full session
        L.hrr = hrrSum / q.covered;
        L.hrCv = q.cv;
      }
    } else if (x.avgHr) {
      const h = hrrOf(x.avgHr, R, hrMax);
      L.trimp = x.durationMin * h * a * Math.exp(k * h);
      L.hrr = h;
      L.hrFromAvg = true;
    }
    return L;
  });

  // §3.3: refit c on sessions with both TRIMP and a real (check-in) RPE.
  const both = out.filter((x) => x.trimp !== undefined && x.rpe);
  let c = p.srpe_to_trimp_c, cFitted = false;
  if (both.length >= p.srpe_c_refit_min) {
    const sr = both.map((x) => x.rpe! * x.durationMin), tr = both.map((x) => x.trimp!);
    c = sum(sr.map((s, i) => s * tr[i])) / sum(sr.map((s) => s * s)); // least squares through the origin
    cFitted = true;
  }

  // Pass 2: RPE (real > HR estimate > 90-day sport median > default), then load.
  for (const x of out) {
    if (x.rpe) { x.rpeUsed = x.rpe; x.rpeEstimated = false; }
    else if (x.hrr !== undefined) { x.rpeUsed = rpeFromHrr(x.hrr, x.sport, p); x.rpeEstimated = true; }
  }
  for (const x of out) {
    if (x.rpeUsed === undefined) {
      const from = x.startMs - p.rpe_from_hrr.median_days * DAY_MS;
      const xs = out.filter((y) => y.sport === x.sport && y.rpeUsed !== undefined && y.rpeEstimated && y.startMs >= from && y.startMs <= x.startMs).map((y) => y.rpeUsed!);
      x.rpeUsed = xs.length ? median(xs) : (p.default_rpe as Record<string, number>)[x.sport] ?? p.default_rpe.other;
      x.rpeEstimated = true;
    }
    if (isHrSport(x.sport) && x.trimp !== undefined) { x.load = x.trimp; x.method = "trimp"; }
    else { x.load = x.rpeUsed! * x.durationMin * c; x.method = x.rpeEstimated ? "estimated" : "srpe"; }
  }
  return { sessions: out, c, cFitted };
}
