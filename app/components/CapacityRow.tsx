// DESIGN.md §7.2: fitness bar (black or split by sport) over a hatched fatigue bar.
import type { Capacity, SessionSport } from "../../engine/types";
import { CAPACITY_NAME, SOURCE_ORDER, SPORT_META } from "../sports";
import { fatigueBackground, FATIGUE_NAME } from "./fatigue";
import { Change } from "./ui";

/** Fatigue bar length: FatNorm / FAT_SCALE, capped (DESIGN.md §7.2). */
export const FAT_SCALE = 3;
const fatPct = (fatNorm: number) => Math.min(1, Math.max(0, fatNorm / FAT_SCALE)) * 100;

export interface CapacityRowProps {
  capacity: Capacity;
  fitIndex: number;
  fitChange?: number;                                  // fraction, e.g. 0.06
  fitBySport?: Partial<Record<SessionSport, number>>;  // shares, sum ≈ 1
  split?: boolean;
  fatNorm: number;
  fatStep: number;
  projectedFatNorm?: number;                           // §3.5 dashed outline
  projectedFatStep?: number;
  highlighted?: boolean;
  onHover?: (on: boolean) => void;
}

export function CapacityRow(p: CapacityRowProps) {
  const fit = Math.max(0, Math.min(100, p.fitIndex));
  const segs = p.split && p.fitBySport
    ? SOURCE_ORDER.filter((k) => (p.fitBySport![k] ?? 0) > 0).map((k) => ({ k, w: (p.fitBySport![k] ?? 0) * fit }))
    : [{ k: "total" as const, w: fit }];
  const proj = p.projectedFatNorm;
  const fatW = fatPct(p.fatNorm), projW = proj !== undefined ? fatPct(proj) : undefined;
  return (
    <div className={`cap-row ${p.highlighted ? "is-hl" : ""}`} onMouseEnter={() => p.onHover?.(true)} onMouseLeave={() => p.onHover?.(false)}>
      <span className="t-label cap-name">{CAPACITY_NAME[p.capacity]}</span>
      <div className="cap-bars">
        <div className="bar-track" role="img" aria-label={`${CAPACITY_NAME[p.capacity]} fitness ${fit}`}>
          <div className="bar-fit" style={{ width: `${fit}%` }}>
            {segs.map((s) => (
              <div key={s.k} className="bar-seg" style={{ flexGrow: s.w, background: s.k === "total" ? "var(--black)" : SPORT_META[s.k].color }} />
            ))}
          </div>
        </div>
        <div className="bar-track fat" role="img" aria-label={`${CAPACITY_NAME[p.capacity]} fatigue ${FATIGUE_NAME[p.fatStep]}`}>
          <div className="bar-fat" style={{ width: `${fatW}%`, background: fatigueBackground(p.fatStep) }} />
          {projW !== undefined && projW > fatW && (
            <div className="bar-proj" style={{ left: `${fatW}%`, width: `${projW - fatW}%` }} />
          )}
        </div>
      </div>
      <span className="cap-fig">
        <span className="t-fig-m">{fit}</span>
        {p.fitChange !== undefined && <Change value={p.fitChange * 100} unit="%" />}
      </span>
    </div>
  );
}
