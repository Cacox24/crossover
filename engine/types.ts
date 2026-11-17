// Data contract between sync and app (BUILD_PLAN §3).
// Extension vs §3: `sport` also allows "other" with `otherKind`, because
// PROGRESSION_LOGIC §2.2b / §11 need Other (endurance/court) load sessions.

export type Sport = "running" | "football" | "tennis" | "bouldering" | "gym";
export type Capacity = "engine" | "speed" | "legs" | "pull";
export type OtherKind = "endurance" | "court";

export interface GymSet { exercise: string; reps: number; weightKg: number }

export interface Session {
  id: string;
  sport: Sport | "other";
  otherKind?: OtherKind;            // only when sport === "other"
  source: "garmin" | "fitbit";
  start: string;                    // ISO 8601, UTC
  durationMin: number;
  avgHr?: number;
  maxHr?: number;
  hrSamples?: [number, number][];   // [secondsFromStart, bpm]
  distanceM?: number;               // running only
  elevGainM?: number;               // running only
  sets?: GymSet[];                  // gym only
  rpe?: number;
  topGrade?: number;
}

export interface Night { date: string; sleepH?: number; rmssd?: number; rhr?: number }
