// Realistic fake history (≈12 weeks) so UI work never waits on real data.
// Deterministic: same seed → same file. Runs through the same engine.
import type { Session, Night, GymSet } from "./types";
import { addDays } from "./time";
import { rng } from "./stats";

export function generateFixture(today: string, weeks = 12, seed = 42): { sessions: Session[]; nights: Night[] } {
  const r = rng(seed);
  const between = (a: number, b: number) => a + (b - a) * r();
  const int = (a: number, b: number) => Math.round(between(a, b));
  const sessions: Session[] = [];
  const nights: Night[] = [];
  const first = addDays(today, -weeks * 7 + 1);
  let id = 0;
  const at = (day: string, h: number) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00Z`).toISOString();
  const hrSeries = (min: number, avg: number, spread: number): [number, number][] =>
    Array.from({ length: Math.floor((min * 60) / 5) }, (_, i) => [i * 5, Math.round(avg + spread * Math.sin(i / 7) + between(-4, 4))]);

  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(first, i);
    const dow = new Date(day + "T00:00:00Z").getUTCDay(); // 0 = Sun
    const progress = i / (weeks * 7); // fitness improves over the window
    nights.push({ date: day, sleepH: Math.round(between(5.6, 8.6) * 10) / 10, rmssd: Math.round(between(32, 58) * 10) / 10, rhr: int(54, 60) });

    if (dow === 2 || dow === 4 || (dow === 6 && r() < 0.7)) {
      const min = dow === 6 ? between(60, 95) : between(30, 50);
      const avgHr = int(142, 158);
      const paceSkm = 330 - 25 * progress + (avgHr - 150) * -1.5 + between(-8, 8);
      sessions.push({ id: `fx:${id++}`, sport: "running", source: "garmin", start: at(day, 7), durationMin: Math.round(min),
        avgHr, maxHr: avgHr + int(12, 25), distanceM: Math.round(((min * 60) / paceSkm) * 1000), elevGainM: int(10, 60) });
    }
    if (dow === 0) {
      sessions.push({ id: `fx:${id++}`, sport: "football", source: "fitbit", start: at(day, 18), durationMin: int(60, 90), hrSamples: hrSeries(75, 158, 14) });
    }
    if (dow === 3 || (dow === 5 && r() < 0.5)) {
      sessions.push({ id: `fx:${id++}`, sport: "bouldering", source: "fitbit", start: at(day, 19), durationMin: int(70, 110), hrSamples: hrSeries(90, 112, 10) });
    }
    if (dow === 1 && r() < 0.4) {
      sessions.push({ id: `fx:${id++}`, sport: "tennis", source: "fitbit", start: at(day, 18), durationMin: int(60, 90), hrSamples: hrSeries(75, 140, 15) });
    }
    if (dow === 5 && r() < 0.5) {
      const sets: GymSet[] = [
        ...Array.from({ length: 4 }, () => ({ exercise: "SQUAT", reps: int(5, 8), weightKg: 50 })),
        ...Array.from({ length: 3 }, () => ({ exercise: "PULL_UP", reps: int(6, 10), weightKg: 0 })),
        ...Array.from({ length: 3 }, () => ({ exercise: "BENCH_PRESS", reps: int(6, 10), weightKg: 50 })),
      ];
      sessions.push({ id: `fx:${id++}`, sport: "gym", source: "garmin", start: at(day, 12), durationMin: int(45, 65), avgHr: int(105, 120), sets });
    }
    if (dow === 6 && r() < 0.4) {
      sessions.push({ id: `fx:${id++}`, sport: "other", otherKind: "endurance", source: "garmin", start: at(day, 14), durationMin: int(30, 60), avgHr: int(110, 130) });
    }
  }
  return { sessions, nights };
}
