// Garmin Personal API: page through ALL activities, keep only needed fields.
// Run: npx tsx sync/garmin.ts  → raw/garmin/activities_all.json
// Never prints the API key or token.
import { readEnv, writeJson, stripGps } from "./lib";

export interface GarminActivity {
  activityId: number;
  typeKey: string;
  beginTimestamp: number;         // ms, UTC
  startTimeLocal: string;
  durationS: number;
  elapsedS?: number;
  distanceM?: number;
  elevGainM?: number;
  averageHR?: number;
  maxHR?: number;
  summarizedExerciseSets?: { category: string; subCategory?: string; reps: number; sets: number; maxWeight?: number; volume?: number }[];
}

const env = readEnv();
const BASE = env.GARMIN_BASE_URL || "https://personal.connectapi.garmin.com";

const tr = await fetch(`${BASE}/personalapitoken-service/personal-api/personal-api-key/token`, {
  method: "POST", headers: { Authorization: `ApiKey ${env.GARMIN_PERSONAL_API_KEY}` },
});
if (!tr.ok) { console.error(`✗ token HTTP ${tr.status}`); process.exit(1); }
const tt = (await tr.text()).trim();
let token: string;
try { const j = JSON.parse(tt); token = typeof j === "string" ? j : (j.access_token ?? j.accessToken); } catch { token = tt; }
console.log("✓ garmin token");

const PAGE = 100;
const all: any[] = [];
for (let start = 0; start < 10000; start += PAGE) {
  const r = await fetch(`${BASE}/activitylist-service/activities/search/activities?start=${start}&limit=${PAGE}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(body)) { console.error(`✗ page start=${start}: HTTP ${r.status}`); process.exit(1); }
  all.push(...body);
  if (body.length < PAGE) break;
}

const seen = new Set<number>();
const slim: GarminActivity[] = all
  .filter((a) => !seen.has(a.activityId) && (seen.add(a.activityId), true))
  .map((a) => stripGps({
    activityId: a.activityId,
    typeKey: a.activityType?.typeKey ?? "unknown",
    beginTimestamp: a.beginTimestamp,
    startTimeLocal: a.startTimeLocal,
    durationS: a.duration,
    elapsedS: a.elapsedDuration ?? undefined,
    distanceM: a.distance ?? undefined,
    elevGainM: a.elevationGain ?? undefined,
    averageHR: a.averageHR ?? undefined,
    maxHR: a.maxHR ?? undefined,
    summarizedExerciseSets: a.summarizedExerciseSets?.map((s: any) => ({
      category: s.category, subCategory: s.subCategory, reps: s.reps, sets: s.sets, maxWeight: s.maxWeight, volume: s.volume,
    })),
  }));

writeJson("raw/garmin/activities_all.json", slim);
console.log(`✓ garmin activities: ${slim.length} → raw/garmin/activities_all.json`);
