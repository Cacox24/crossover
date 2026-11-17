// Crossover: Garmin Personal API connection test
// Run from the repo root:  node sync/test-garmin.mjs
// Needs Node 18+ (built-in fetch). No packages required.
// Reads GARMIN_PERSONAL_API_KEY and GARMIN_BASE_URL from .env.
// Writes raw responses to raw/garmin/ (git-ignored). Never prints the key or token.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// --- load .env -------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const KEY = env.GARMIN_PERSONAL_API_KEY;
const BASE = env.GARMIN_BASE_URL || "https://personal.connectapi.garmin.com";
if (!KEY) throw new Error("GARMIN_PERSONAL_API_KEY missing in .env");

mkdirSync("raw/garmin", { recursive: true });
const save = (name, data) => writeFileSync(`raw/garmin/${name}`, JSON.stringify(data, null, 2));
const ok = (msg) => console.log(`✓ ${msg}`);
const bad = (msg) => console.log(`✗ ${msg}`);

// --- 1. key -> access token -----------------------------------------------
const tokRes = await fetch(`${BASE}/personalapitoken-service/personal-api/personal-api-key/token`, {
  method: "POST",
  headers: { Authorization: `ApiKey ${KEY}` },
});
if (!tokRes.ok) {
  bad(`token request failed: HTTP ${tokRes.status} ${await tokRes.text()}`);
  process.exit(1);
}
// The endpoint may return a bare JWT string or a JSON object; handle both.
const tokText = (await tokRes.text()).trim();
let token;
try {
  const tok = JSON.parse(tokText);
  token = typeof tok === "string" ? tok : (tok.access_token ?? tok.accessToken ?? tok.token);
} catch {
  token = tokText.replace(/^"|"$/g, "");
}
if (!token || token.split(".").length !== 3) {
  bad("token response was not a recognisable access token");
  process.exit(1);
}
ok("access token received");

const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
};

// --- 2. recent activities -------------------------------------------------
const list = await get("/activitylist-service/activities/search/activities?start=0&limit=100");
if (list.status !== 200 || !Array.isArray(list.body)) {
  bad(`activity list: HTTP ${list.status}`);
  console.log(typeof list.body === "string" ? list.body.slice(0, 400) : list.body);
  process.exit(1);
}
save("activities_latest100.json", list.body);
ok(`activity list: ${list.body.length} activities`);

const typeOf = (a) => a.activityType?.typeKey ?? "unknown";
const counts = {};
for (const a of list.body) counts[typeOf(a)] = (counts[typeOf(a)] ?? 0) + 1;
console.log("  types:", counts);
const oldest = list.body.at(-1)?.startTimeLocal;
console.log(`  newest: ${list.body[0]?.startTimeLocal}  oldest of these 100: ${oldest}`);

// --- 3. one run: details + HR ---------------------------------------------
const run = list.body.find((a) => typeOf(a).includes("running"));
if (run) {
  console.log(`  run sample: ${run.startTimeLocal}, ${Math.round(run.duration / 60)} min, ` +
    `${(run.distance / 1000).toFixed(1)} km, avgHR ${run.averageHR ?? "—"}, maxHR ${run.maxHR ?? "—"}`);
  const det = await get(`/activity-service/activity/${run.activityId}`);
  save("run_details.json", det.body);
  det.status === 200 ? ok("run details") : bad(`run details: HTTP ${det.status}`);
} else bad("no running activity in the latest 100");

// --- 4. one strength session: are sets available? -------------------------
const gym = list.body.find((a) => typeOf(a).includes("strength"));
if (gym) {
  console.log(`  gym sample: ${gym.startTimeLocal}, ${Math.round(gym.duration / 60)} min, avgHR ${gym.averageHR ?? "—"}`);
  const sets = await get(`/activity-service/activity/${gym.activityId}/exerciseSets`);
  save("gym_exerciseSets.json", sets.body);
  if (sets.status === 200) {
    const all = sets.body?.exerciseSets ?? [];
    const active = all.filter((s) => s.setType === "ACTIVE");
    ok(`exercise sets endpoint works: ${active.length} active sets`);
    console.log("  first sets:", active.slice(0, 3).map((s) => ({
      exercise: s.exercises?.[0]?.name ?? s.exercises?.[0]?.category,
      reps: s.repetitionCount,
      weightKg: s.weight != null ? s.weight / 1000 : null,
    })));
  } else {
    bad(`exercise sets: HTTP ${sets.status} → fallback: FIT file via /download-service`);
    const wk = await get(`/activity-service/activity/${gym.activityId}/workouts`);
    save("gym_workouts.json", wk.body);
    console.log(`  /workouts: HTTP ${wk.status}`);
  }
} else bad("no strength activity in the latest 100");

// --- 5. how far back does history go? -------------------------------------
const deep = await get("/activitylist-service/activities/search/activities?start=0&limit=1&startDate=2024-01-01&endDate=2024-12-31");
console.log(`  2024 history reachable: ${deep.status === 200 && Array.isArray(deep.body) && deep.body.length > 0 ? "yes" : "no / empty"}`);

console.log("\nDone. Raw responses are in raw/garmin/ (git-ignored).");
