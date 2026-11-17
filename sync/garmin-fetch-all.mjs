// Crossover: fetch ALL Garmin activities (pages of 100) + check recent ones
// Run from the repo root:  node sync/garmin-fetch-all.mjs
// Writes raw/garmin/activities_all.json (git-ignored). Never prints the key or token.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = env.GARMIN_BASE_URL || "https://personal.connectapi.garmin.com";
mkdirSync("raw/garmin", { recursive: true });

// token (bare JWT or JSON)
const tr = await fetch(`${BASE}/personalapitoken-service/personal-api/personal-api-key/token`, {
  method: "POST", headers: { Authorization: `ApiKey ${env.GARMIN_PERSONAL_API_KEY}` },
});
if (!tr.ok) { console.log(`✗ token HTTP ${tr.status}`); process.exit(1); }
const tt = (await tr.text()).trim();
let token; try { const j = JSON.parse(tt); token = typeof j === "string" ? j : (j.access_token ?? j.accessToken); } catch { token = tt; }
console.log("✓ access token");

const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};

// 1. Page through everything
const all = [];
for (let start = 0; start < 5000; start += 100) {
  const r = await get(`/activitylist-service/activities/search/activities?start=${start}&limit=100`);
  if (r.status !== 200 || !Array.isArray(r.body)) { console.log(`✗ page start=${start}: HTTP ${r.status}`); break; }
  all.push(...r.body);
  process.stdout.write(`  page ${start / 100 + 1}: ${r.body.length}\n`);
  if (r.body.length < 100) break;
}
const seen = new Set(); const uniq = all.filter((a) => !seen.has(a.activityId) && seen.add(a.activityId));
writeFileSync("raw/garmin/activities_all.json", JSON.stringify(uniq));
console.log(`✓ total activities: ${uniq.length}`);

// 2. Range, by month and type
const byStart = [...uniq].sort((a, b) => a.startTimeLocal.localeCompare(b.startTimeLocal));
console.log(`  oldest: ${byStart[0]?.startTimeLocal}   newest: ${byStart.at(-1)?.startTimeLocal}`);
const months = {};
for (const a of uniq) {
  const m = a.startTimeLocal.slice(0, 7), t = a.activityType?.typeKey ?? "unknown";
  months[m] ??= {}; months[m][t] = (months[m][t] ?? 0) + 1;
}
for (const m of Object.keys(months).sort()) console.log(`  ${m}`, JSON.stringify(months[m]));

// 3. Explicit check for activities after the marathon
for (const q of [
  "startDate=2026-10-11&endDate=2026-11-30",
  "startDate=2026-10-11",
]) {
  const r = await get(`/activitylist-service/activities/search/activities?start=0&limit=50&${q}`);
  const n = Array.isArray(r.body) ? r.body.length : `HTTP ${r.status}`;
  console.log(`  after marathon (${q}): ${n}`);
  if (Array.isArray(r.body)) for (const a of r.body.slice(0, 5)) console.log(`    ${a.startTimeLocal} ${a.activityType?.typeKey}`);
}

// 4. Daily summary for yesterday (does wellness data sync at all?)
const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const ds = await get(`/usersummary-service/v2/dailysummaries?startDate=${y}&endDate=${y}`);
console.log(`  daily summary ${y}: HTTP ${ds.status} ${JSON.stringify(ds.body).slice(0, 200)}`);

console.log("\nDone. All activities saved to raw/garmin/activities_all.json");
