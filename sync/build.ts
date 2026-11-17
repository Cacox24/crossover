// data/*.json → engine → public/data.json, plus public/data.fixture.json.
// Run: npx tsx sync/build.ts
import type { Session, Night, Params } from "../engine/types";
import params from "../engine/params.json";
import { runEngine, type DataJson } from "../engine/index";
import { generateFixture } from "../engine/fixture";
import { dayKey } from "../engine/time";
import { readJson, writeJson } from "./lib";
import { statSync } from "node:fs";

const profile = readJson<{ hrMax: number; timezone: string }>("data/profile.json");
const sessions = readJson<Session[]>("data/sessions.json");
const nights = readJson<Night[]>("data/nights.json");
const tz = profile.timezone;
const today = dayKey(Date.now(), tz);

const t0 = performance.now();
const data = runEngine({ sessions, nights, hrMax: profile.hrMax, tz, today, params: params as Params });
const ms = performance.now() - t0;
writeJson("public/data.json", data);

const fx = generateFixture(today);
const fxData = runEngine({ ...fx, hrMax: 195, tz, today, params: params as Params });
writeJson("public/data.fixture.json", fxData);

report("real", data, ms);
report("fixture", fxData);

function report(label: string, d: DataJson, ms?: number) {
  const file = label === "real" ? "public/data.json" : "public/data.fixture.json";
  console.log(`\n=== ${label}: ${file} (${Math.round(statSync(file).size / 1024)} KB${ms ? `, engine ${Math.round(ms)} ms` : ""}) ===`);
  console.log(`synced ${d.synced}  HRmax ${d.hrMax}  c ${d.c.value}${d.c.fitted ? " (fitted)" : " (default)"}`);
  const m: Record<string, number> = {};
  for (const s of d.sessions) m[s.method + (s.avgHrOnly ? "/avgHR" : "")] = (m[s.method + (s.avgHrOnly ? "/avgHR" : "")] ?? 0) + 1;
  console.log("load methods (365 d):", m);
  console.log("\ncapacity  fitIdx  Δ28d   fatNorm step  recovered  fitBySport");
  for (const [c, v] of Object.entries(d.capacities))
    console.log(`${c.padEnd(9)} ${String(v.fitIndex).padStart(5)}  ${(v.fitChange28d * 100).toFixed(0).padStart(4)}%  ${v.fatNorm.toFixed(2).padStart(6)}  ${v.fatStep}    ${(v.recoveredOn ?? "—").padEnd(10)} ${Object.entries(v.fitBySport).map(([k, x]) => `${k} ${(x! * 100).toFixed(0)}%`).join(", ")}`);
  console.log("\nsport       model  evidence  delta12w");
  for (const [s, v] of Object.entries(d.sports))
    console.log(`${s.padEnd(11)} ${(100 * v.model.values.at(-1)!).toFixed(0).padStart(5)}  ${v.evidence}         ${v.delta12w.total} ${v.delta12w.unit}  ${JSON.stringify(v.delta12w.bySport)}`);
  const run = d.sports.running;
  if (run.metric) console.log(`running pace@150: ${run.metric.points.length} steady runs, latest trend ${run.metric.series.at(-1)?.join(" → ")} s/km; calibration ${JSON.stringify(run.calibration)}`);
  console.log(`effects: ${d.effects.length ? "" : "none pass evidence rules"}`);
  for (const e of d.effects) console.log(`  ${e.from} → ${e.to} (${e.window}): ${e.effect} ${e.unit}, n=${e.n}, evidence ${e.evidence}`);
  const last = d.weeks.slice(-4).map((w) => `${w.start} ${JSON.stringify(w.loadBySport)}`);
  console.log("last 4 weeks load:\n  " + last.join("\n  "));
}
