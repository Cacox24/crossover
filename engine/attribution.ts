// PROGRESSION_LOGIC §7: split a sport's change over a window by source sport.
import type { Sport, SessionSport } from "./types";
import { SOURCES } from "./types";
import type { Calibration } from "./progression";
import { round } from "./stats";

export interface Delta { unit: string; total: number; bySport: Partial<Record<SessionSport, number>> }

/**
 * ΔMeasured[s] from k = b × ΔContribution[s ← k] when calibrated; otherwise
 * modelled % (index points). Rounding remainder goes to s itself.
 */
export function attributeDelta(
  s: Sport, contribStart: Record<SessionSport, number>, contribEnd: Record<SessionSport, number>,
  cal: Calibration | null, unit: string,
): Delta {
  // Uncalibrated: change in modelled index points (Model × 100, where 100 = 365-day best).
  // Relative % of the start value explodes when the window starts near zero.
  const useUnits = !!cal?.calibrated;
  const scale = useUnits ? cal!.b : 100;
  const digits = useUnits ? 0 : 1;
  const raw = Object.fromEntries(SOURCES.map((k) => [k, scale * (contribEnd[k] - contribStart[k])])) as Record<SessionSport, number>;
  const total = round(SOURCES.reduce((a, k) => a + raw[k], 0), digits);
  const bySport: Delta["bySport"] = {};
  let others = 0;
  for (const k of SOURCES) {
    if (k === s) continue;
    const v = round(raw[k], digits);
    if (v !== 0) { bySport[k] = v; others += v; }
  }
  bySport[s] = round(total - others, digits);
  return { unit: useUnits ? unit : "%", total, bySport };
}
