// raw/ → data/sessions.json (Session[]) + data/nights.json (Night[]) + data/profile.json
// BUILD_PLAN §3, PROGRESSION_LOGIC §2.1, §2.2b, §2.5.
// Run: npx tsx sync/normalise.ts
import type { Session, Night, GymSet } from "../engine/types";
import params from "../engine/params.json";
import { deriveHrMax } from "../engine/hrmax";
import { readJson, writeJson, stripGps } from "./lib";
import { mapGarmin, mapFitbit, MIN_SESSION_MIN, type Mapped } from "./mapping";
import type { GarminActivity } from "./garmin";

const round1 = (x: number) => Math.round(x * 10) / 10;
const excluded: Record<string, number> = {};
const exclude = (src: string, type: string) => { const k = `${src}:${type}`; excluded[k] = (excluded[k] ?? 0) + 1; };
let tooShort = 0;

interface Candidate { session: Session; startMs: number; endMs: number }

// --- Garmin -------------------------------------------------------------------
const garmin = readJson<GarminActivity[]>("raw/garmin/activities_all.json");
const garminIntervals = garmin.map((a) => ({ id: a.activityId, startMs: a.beginTimestamp, endMs: a.beginTimestamp + (a.elapsedS ?? a.durationS) * 1000 }));

function gymSets(a: GarminActivity): GymSet[] {
  const out: GymSet[] = [];
  for (const s of a.summarizedExerciseSets ?? []) {
    const n = Math.max(1, s.sets);
    const base = Math.floor(s.reps / n), extra = s.reps - base * n;
    const exercise = s.subCategory ? `${s.category}/${s.subCategory}` : s.category;
    for (let i = 0; i < n; i++) out.push({ exercise, reps: base + (i < extra ? 1 : 0), weightKg: (s.maxWeight ?? 0) / 1000 });
  }
  return out;
}

const garminSessions: Candidate[] = [];
for (const a of garmin) {
  const m = mapGarmin(a.typeKey);
  if (!m) { exclude("garmin", a.typeKey); continue; }
  const durationMin = a.durationS / 60;
  if (durationMin < MIN_SESSION_MIN) { tooShort++; continue; }
  const s: Session = {
    id: `garmin:${a.activityId}`, ...sportOf(m), source: "garmin",
    start: new Date(a.beginTimestamp).toISOString(), durationMin: round1(durationMin),
    avgHr: a.averageHR, maxHr: a.maxHR,
  };
  if (m.sport === "running") { s.distanceM = a.distanceM && Math.round(a.distanceM); s.elevGainM = a.elevGainM; }
  if (m.sport === "gym") s.sets = gymSets(a);
  garminSessions.push({ session: s, startMs: a.beginTimestamp, endMs: a.beginTimestamp + (a.elapsedS ?? a.durationS) * 1000 });
}

function sportOf(m: Mapped): Pick<Session, "sport" | "otherKind"> {
  return m.sport === "other" ? { sport: "other", otherKind: m.otherKind } : { sport: m.sport };
}

// --- Fitbit -------------------------------------------------------------------
const exercise = readJson<any[]>("raw/fitbit/exercise_all.json");
const hrBySession = readJson<Record<string, [string, number][]>>("raw/fitbit/exercise_hr.json");
const parseDur = (d?: string) => (d ? Number(d.replace("s", "")) : undefined);

const overlap = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) =>
  Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs)) /
  Math.min(a.endMs - a.startMs, b.endMs - b.startMs);

const fitbitSessions: Candidate[] = [];
const duplicates: { fitbit: string; garmin: number; overlap: number }[] = [];
for (const p of exercise) {
  const e = p.exercise;
  const m = mapFitbit(e.exerciseType);
  if (!m) { exclude("fitbit", e.exerciseType); continue; }
  const startMs = Date.parse(e.interval.startTime), endMs = Date.parse(e.interval.endTime);
  const durationMin = (parseDur(e.activeDuration) ?? (endMs - startMs) / 1000) / 60;
  if (durationMin < MIN_SESSION_MIN) { tooShort++; continue; }

  // §2.5 dedupe: overlap ≥ dedupe_min_overlap of the shorter one → Garmin wins.
  const dup = garminIntervals.find((g) => overlap(g, { startMs, endMs }) >= params.dedupe_min_overlap);
  if (dup) { duplicates.push({ fitbit: e.interval.startTime, garmin: dup.id, overlap: round1(overlap(dup, { startMs, endMs })) }); continue; }

  const samples: [number, number][] = (hrBySession[p.name] ?? []).map(([t, b]) => [Math.round((Date.parse(t) - startMs) / 1000), b]);
  const summaryHr = Number(e.metricsSummary?.averageHeartRateBeatsPerMinute) || undefined;
  const s: Session = {
    id: `fitbit:${p.name.split("/").pop()}`, ...sportOf(m), source: "fitbit",
    start: new Date(startMs).toISOString(), durationMin: round1(durationMin),
    avgHr: summaryHr ?? (samples.length ? Math.round(samples.reduce((n, [, b]) => n + b, 0) / samples.length) : undefined),
    maxHr: samples.length ? Math.max(...samples.map(([, b]) => b)) : undefined,
    hrSamples: samples.length ? samples : undefined,
  };
  if (m.sport === "running") {
    const mm = Number(e.metricsSummary?.distanceMillimeters);
    if (mm) s.distanceM = Math.round(mm / 1000);
  }
  fitbitSessions.push({ session: s, startMs, endMs });
}

const sessions = stripGps([...garminSessions, ...fitbitSessions].map((c) => c.session))
  .sort((a, b) => a.start.localeCompare(b.start));

// --- Nights -------------------------------------------------------------------
// Night.date = local wake-up date (Fitbit daily RHR/HRV use the same day).
const ymd = (d: { year: number; month: number; day: number }) =>
  `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
const localDate = (iso: string, offset?: string) =>
  new Date(Date.parse(iso) + (parseDur(offset) ?? 0) * 1000).toISOString().slice(0, 10);

const nights = new Map<string, Night>();
const night = (date: string) => nights.get(date) ?? nights.set(date, { date }).get(date)!;

for (const p of readJson<any[]>("raw/fitbit/sleep_all.json")) {
  const sl = p.sleep;
  const asleepMin = Number(sl.summary?.minutesAsleep);
  const main = sl.metadata?.mainSleep ?? asleepMin >= 180;
  if (!main || !asleepMin) continue;
  const n = night(localDate(sl.interval.endTime, sl.interval.endUtcOffset));
  n.sleepH = round1((n.sleepH ?? 0) + asleepMin / 60);
}
for (const p of readJson<any[]>("raw/fitbit/daily-resting-heart-rate_all.json")) {
  const r = p.dailyRestingHeartRate;
  const bpm = Number(r?.beatsPerMinute);
  if (bpm) night(ymd(r.date)).rhr = bpm;
}
for (const p of readJson<any[]>("raw/fitbit/daily-heart-rate-variability_all.json")) {
  const h = p.dailyHeartRateVariability;
  if (h?.averageHeartRateVariabilityMilliseconds) night(ymd(h.date)).rmssd = h.averageHeartRateVariabilityMilliseconds;
}
const nightList = [...nights.values()].sort((a, b) => a.date.localeCompare(b.date));

// --- HRmax --------------------------------------------------------------------
const hrMax = deriveHrMax(sessions);

writeJson("data/sessions.json", sessions);
writeJson("data/nights.json", nightList, true);
writeJson("data/profile.json", { hrMax: hrMax?.hrMax, hrMaxFrom: hrMax }, true);

// --- Report -------------------------------------------------------------------
const cols = ["running", "football", "tennis", "bouldering", "gym", "other"] as const;
const byMonth: Record<string, Record<string, number>> = {};
for (const s of sessions) {
  const m = s.start.slice(0, 7);
  byMonth[m] ??= {};
  byMonth[m][s.sport] = (byMonth[m][s.sport] ?? 0) + 1;
}
console.log("\nSessions per sport per month");
console.log(["month  ", ...cols.map((c) => c.slice(0, 5).padStart(6))].join(""));
for (const m of Object.keys(byMonth).sort())
  console.log([m, ...cols.map((c) => String(byMonth[m][c] ?? "·").padStart(6))].join(""));
console.log(["total  ", ...cols.map((c) => String(sessions.filter((s) => s.sport === c).length).padStart(6))].join(""));
console.log(`\nSessions: ${sessions.length} (garmin ${garminSessions.length}, fitbit ${fitbitSessions.length}, fitbit with HR samples ${fitbitSessions.filter((c) => c.session.hrSamples).length})`);
console.log(`Duplicates removed (Fitbit copy dropped, Garmin kept): ${duplicates.length}`);
for (const d of duplicates) console.log(`  ${d.fitbit}  ↔ garmin ${d.garmin}  overlap ${d.overlap}`);
console.log(`Dropped < ${MIN_SESSION_MIN} min: ${tooShort}`);
console.log("Excluded by type:", excluded);
const withAll = nightList.filter((n) => n.sleepH && n.rmssd && n.rhr).length;
console.log(`\nNights: ${nightList.length} (${nightList[0]?.date} → ${nightList.at(-1)?.date})`);
console.log(`  with sleep ${nightList.filter((n) => n.sleepH).length}, HRV ${nightList.filter((n) => n.rmssd).length}, RHR ${nightList.filter((n) => n.rhr).length}, all three ${withAll}`);
console.log(`\nHRmax: ${hrMax?.hrMax} bpm (${hrMax?.method}, ${hrMax?.sessionId})`);
