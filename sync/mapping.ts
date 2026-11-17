// PROGRESSION_LOGIC §2.2b: source activity type → sport. Anything unmapped is excluded.
import type { Sport, OtherKind } from "../engine/types";

export type Mapped = { sport: Sport } | { sport: "other"; otherKind: OtherKind };

const GARMIN: Record<string, Mapped> = {
  running: { sport: "running" }, treadmill_running: { sport: "running" }, trail_running: { sport: "running" },
  soccer: { sport: "football" },
  tennis: { sport: "tennis" }, tennis_v2: { sport: "tennis" },
  bouldering: { sport: "bouldering" }, indoor_climbing: { sport: "bouldering" },
  strength_training: { sport: "gym" },
  cycling: { sport: "other", otherKind: "endurance" }, e_bike_fitness: { sport: "other", otherKind: "endurance" },
  hiking: { sport: "other", otherKind: "endurance" },
  basketball: { sport: "other", otherKind: "court" }, paddelball: { sport: "other", otherKind: "court" },
  jump_rope: { sport: "other", otherKind: "court" },
};

const FITBIT: Record<string, Mapped> = {
  RUNNING: { sport: "running" },
  SOCCER: { sport: "football" },
  TENNIS: { sport: "tennis" },
  INDOOR_CLIMBING: { sport: "bouldering" }, CLIMBING: { sport: "bouldering" }, BOULDERING: { sport: "bouldering" },
  WEIGHTLIFTING: { sport: "gym" }, STRENGTH_TRAINING: { sport: "gym" },
  BIKING: { sport: "other", otherKind: "endurance" }, ELECTRIC_BIKE: { sport: "other", otherKind: "endurance" },
  HIKING: { sport: "other", otherKind: "endurance" }, SWIMMING: { sport: "other", otherKind: "endurance" },
  RACKET_SPORTS: { sport: "other", otherKind: "court" }, VOLLEYBALL_BEACH: { sport: "other", otherKind: "court" },
};

export const mapGarmin = (typeKey: string): Mapped | undefined => GARMIN[typeKey];
export const mapFitbit = (type: string): Mapped | undefined => FITBIT[type];

/** §2.5: drop sessions shorter than 10 minutes. */
export const MIN_SESSION_MIN = 10;
