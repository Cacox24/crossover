// Google Health API (Fitbit): exercise (from 2026-08-01), sleep, daily RHR,
// daily HRV, and HR samples inside each kept exercise session.
// Run: npx tsx sync/google.ts  → raw/fitbit/*.json
// Reuses the saved refresh token; never prints tokens.
import { readFileSync, existsSync } from "node:fs";
import { writeJson } from "./lib";
import { mapFitbit, MIN_SESSION_MIN } from "./mapping";

const EXERCISE_FROM = "2026-08-01T00:00:00Z";
const BASE = "https://health.googleapis.com/v4/users/me/dataTypes";
const TOKEN_FILE = "secrets/google_token.json";

if (!existsSync(TOKEN_FILE)) { console.error("✗ no saved Google sign-in; run node sync/test-google.mjs once"); process.exit(1); }
const cs = JSON.parse(readFileSync("secrets/client_secret.json", "utf8")).installed;
const saved = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
const tr = await fetch(cs.token_uri, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: cs.client_id, client_secret: cs.client_secret, grant_type: "refresh_token", refresh_token: saved.refresh_token }),
});
const tb = await tr.json();
if (!tr.ok) { console.error(`✗ google token HTTP ${tr.status}: ${tb.error}`); process.exit(1); }
const access: string = tb.access_token;
console.log("✓ google token");

async function page(type: string, params: Record<string, string>) {
  const url = new URL(`${BASE}/${type}/dataPoints`);
  url.search = new URLSearchParams(params).toString();
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
    if (r.status === 429 && attempt < 5) { await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); continue; }
    const text = await r.text();
    if (!r.ok) throw new Error(`${type} HTTP ${r.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as { dataPoints?: any[]; nextPageToken?: string };
  }
}

/** Page until no nextPageToken, or until `stop(page)` says older data isn't needed. */
async function listAll(type: string, params: Record<string, string>, stop?: (pts: any[]) => boolean) {
  const out: any[] = [];
  let token: string | undefined;
  do {
    const b = await page(type, token ? { ...params, pageToken: token } : params);
    const pts = b.dataPoints ?? [];
    out.push(...pts);
    token = b.nextPageToken;
    if (stop?.(pts)) break;
  } while (token);
  return out;
}

// --- exercise ---------------------------------------------------------------
// Results come newest first; stop once a whole page is older than the cutoff.
const exAll = await listAll("exercise", { pageSize: "25" },
  (pts) => pts.length > 0 && pts.every((p) => p.exercise.interval.startTime < EXERCISE_FROM));
const exercise = exAll.filter((p) => p.exercise.interval.startTime >= EXERCISE_FROM);
writeJson("raw/fitbit/exercise_all.json", exercise);
console.log(`✓ exercise since ${EXERCISE_FROM.slice(0, 10)}: ${exercise.length}`);

// --- daily recovery ---------------------------------------------------------
for (const [type, file, size] of [
  ["sleep", "sleep_all.json", "25"],
  ["daily-resting-heart-rate", "daily-resting-heart-rate_all.json", "100"],
  ["daily-heart-rate-variability", "daily-heart-rate-variability_all.json", "100"],
] as const) {
  const pts = await listAll(type, { pageSize: size });
  writeJson(`raw/fitbit/${file}`, pts);
  console.log(`✓ ${type}: ${pts.length}`);
}

// --- HR samples per kept exercise session ----------------------------------
const durMin = (p: any) => (Date.parse(p.exercise.interval.endTime) - Date.parse(p.exercise.interval.startTime)) / 60000;
const kept = exercise.filter((p) => mapFitbit(p.exercise.exerciseType) && durMin(p) >= MIN_SESSION_MIN);
const hr: Record<string, [string, number][]> = {};
for (const p of kept) {
  const { startTime, endTime } = p.exercise.interval;
  // The API only accepts >= and < here; +1 s makes the end inclusive.
  const endExcl = new Date(Date.parse(endTime) + 1000).toISOString().replace(".000Z", "Z");
  const pts = await listAll("heart-rate", {
    pageSize: "10000",
    filter: `heart_rate.sample_time.physical_time >= "${startTime}" AND heart_rate.sample_time.physical_time < "${endExcl}"`,
  });
  hr[p.name] = pts
    .map((s): [string, number] => [s.heartRate.sampleTime.physicalTime, Number(s.heartRate.beatsPerMinute)])
    .sort((a, b) => a[0].localeCompare(b[0]));
}
writeJson("raw/fitbit/exercise_hr.json", hr);
const nSamples = Object.values(hr).reduce((n, s) => n + s.length, 0);
console.log(`✓ HR samples for ${kept.length} kept sessions: ${nSamples} samples`);
