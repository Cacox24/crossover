// PROGRESSION_LOGIC §2.1: HRmax = highest plausible HR in all history, either
// device, sustained ≥ 5 s, ignoring readings > 215 bpm.
import type { Session } from "./types";

const SPIKE_BPM = 215;
const SUSTAIN_S = 5;
const MAX_GAP_S = 15; // a window spanning a recording gap doesn't count as sustained

/** Highest value v such that every sample in some ≥5 s span is ≥ v. */
export function sustainedMax(samples: [number, number][]): number | undefined {
  const s = samples.filter(([, b]) => b > 0 && b <= SPIKE_BPM).sort((a, b) => a[0] - b[0]);
  let best: number | undefined;
  for (let i = 0; i < s.length; i++) {
    let min = s[i][1];
    for (let j = i + 1; j < s.length; j++) {
      if (s[j][0] - s[j - 1][0] > MAX_GAP_S) break;
      min = Math.min(min, s[j][1]);
      if (s[j][0] - s[i][0] >= SUSTAIN_S) { if (best === undefined || min > best) best = min; break; }
    }
  }
  return best;
}

export interface HrMaxResult { hrMax: number; sessionId: string; method: "samples" | "summary" }

/**
 * Sessions with an HR stream use the sustained rule. Sessions with only a
 * device summary max (Garmin list API) use that value, which the device
 * already records from its 1 s stream; it can't be checked for 5 s.
 */
export function deriveHrMax(sessions: Session[]): HrMaxResult | undefined {
  let out: HrMaxResult | undefined;
  for (const x of sessions) {
    const fromSamples = x.hrSamples?.length ? sustainedMax(x.hrSamples) : undefined;
    const cand = fromSamples ?? (x.maxHr && x.maxHr <= SPIKE_BPM ? x.maxHr : undefined);
    if (cand !== undefined && (!out || cand > out.hrMax))
      out = { hrMax: cand, sessionId: x.id, method: fromSamples !== undefined ? "samples" : "summary" };
  }
  return out;
}
