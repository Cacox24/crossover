// Engine checks against PROGRESSION_LOGIC worked examples and invariants.
// Run: npx tsx --test engine/test/engine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import params from "../params.json";
import type { Params, Session, Night } from "../types";
import { SOURCES } from "../types";
import { computeLoads, rpeFromHrr } from "../load";
import { splitFor, gymShares } from "../split";
import { runEngine } from "../index";
import { whatIf } from "../whatif";
import { generateFixture } from "../fixture";

const p = params as Params;
const nights: Night[] = Array.from({ length: 40 }, (_, i) => ({ date: `2026-10-${String(i % 30 + 1).padStart(2, "0")}`, rhr: 55 }));

test("§3.1 worked example: 60 min at avg HR 150, rest 55, max 195 ≈ 96", () => {
  const s: Session = { id: "a", sport: "running", source: "garmin", start: "2026-10-20T08:00:00Z", durationMin: 60, avgHr: 150 };
  const { sessions } = computeLoads([s], nights, 195, "Europe/London", p);
  assert.ok(Math.abs(sessions[0].load - 96) < 3, `got ${sessions[0].load}`);
  assert.equal(sessions[0].method, "trimp");
});

test("§3.4 RPE bands, +1 for strength sports, capped", () => {
  assert.equal(rpeFromHrr(0.3, "running", p), 3);
  assert.equal(rpeFromHrr(0.6, "running", p), 5);
  assert.equal(rpeFromHrr(0.9, "running", p), 8);
  assert.equal(rpeFromHrr(0.9, "bouldering", p), 9);
});

test("§4 F rows sum to 1, D rows sum to 1 (non-gym)", () => {
  for (const s of ["running", "football", "tennis", "bouldering"] as const) {
    const sp = splitFor(s, undefined, undefined, p);
    assert.ok(Math.abs(Object.values(sp.F).reduce((a, b) => a + b, 0) + sp.spec - 1) < 1e-9, s);
    assert.ok(Math.abs(Object.values(sp.D).reduce((a, b) => a + b, 0) - 1) < 1e-9, s);
  }
});

test("§4.3 gym shares ignore UNKNOWN; fitness keeps 100% of load", () => {
  const sh = gymShares([{ exercise: "SQUAT", reps: 5, weightKg: 50 }, { exercise: "PULL_UP", reps: 5, weightKg: 0 }, { exercise: "UNKNOWN", reps: 5, weightKg: 50 }])!;
  assert.deepEqual(sh, { lower: 0.5, pull: 0.5, push: 0, core: 0 });
  const sp = splitFor("gym", undefined, sh, p);
  assert.ok(Math.abs(Object.values(sp.F).reduce((a, b) => a + b, 0) + sp.spec - 1) < 1e-9);
});

const fx = generateFixture("2026-11-17");
const data = runEngine({ ...fx, hrMax: 195, tz: "Europe/London", today: "2026-11-17", params: p });

test("§7 contributions sum to the modelled line", () => {
  for (const [s, v] of Object.entries(data.sports))
    v.model.values.forEach((m, i) => {
      const sum = SOURCES.reduce((a, k) => a + (v.contributions[k]?.[i] ?? 0), 0);
      assert.ok(Math.abs(sum - m) < 1e-3, `${s} day ${i}: ${sum} vs ${m}`);
    });
});

test("§7 delta by sport sums to the total", () => {
  for (const [s, v] of Object.entries(data.sports)) {
    const sum = Object.values(v.delta12w.bySport).reduce((a, b) => a + b!, 0);
    assert.ok(Math.abs(sum - v.delta12w.total) < 1e-6, `${s}: ${sum} vs ${v.delta12w.total}`);
  }
});

test("§9 what if: adds fatigue, never removes it, runs in < 50 ms", () => {
  const t0 = performance.now();
  const r = whatIf(data.whatif, { sport: "football", dayOffset: 0, intensity: "hard" }, p);
  assert.ok(performance.now() - t0 < 50);
  for (const c of Object.values(r.capacities)) c.projected.forEach((x, i) => assert.ok(x >= c.now[i] - 1e-12));
  assert.ok(r.capacities.legs.projected[0] > r.capacities.legs.now[0]);
  assert.ok(r.sportGainPct.running > 0 && r.sportGainPct.football > r.sportGainPct.running);
});

test("§5.4 FatNorm reference ignores Other sessions", async () => {
  const { fatigueRefs } = await import("../state");
  const { splitSessions } = await import("../split");
  const base: Session[] = [{ id: "r", sport: "running", source: "garmin", start: "2026-10-20T08:00:00Z", durationMin: 60, avgHr: 150 }];
  const withOther: Session[] = [...base, ...Array.from({ length: 5 }, (_, i): Session => ({ id: `o${i}`, sport: "other", otherKind: "endurance", source: "garmin", start: `2026-10-2${i + 1}T08:00:00Z`, durationMin: 15, avgHr: 110 }))];
  const ref = (xs: Session[]) => { const { sessions } = computeLoads(xs, nights, 195, "Europe/London", p); return fatigueRefs(sessions, splitSessions(sessions, p), "2026-10-30", p); };
  assert.deepEqual(ref(withOther), ref(base));
});
