# Process log

## 2026-11-17 11:07 Block 1: data (full fetch + normalise)

**Asked:** set up the repo (git, package.json as ES module, TypeScript + tsx, no UI);
turn the working test scripts into `sync/garmin.ts` and `sync/google.ts` with
full pagination; write `sync/normalise.ts` to produce `Session[]` and `Night[]`
per BUILD_PLAN §3 with the type mapping, exclusions, Other, dedupe and GPS
stripping; run it end to end and report.

**Produced:**
- `package.json`, `tsconfig.json`, dev deps `typescript`, `tsx`, `@types/node`; `npm run sync` runs all three steps.
- `engine/params.json`, extracted verbatim from PROGRESSION_LOGIC §11 (normalise reads `dedupe_min_overlap` from it).
- `engine/types.ts` (data contract) and `engine/hrmax.ts` (§2.1 HRmax rule, so the formula lives in the engine).
- `sync/garmin.ts`: 291 activities, slimmed to the fields we use, no lat/long → `raw/garmin/activities_all.json`.
- `sync/google.ts`: exercise since 2026‑08‑01 (194), sleep (136), RHR (159), HRV (78); HR samples for 56 kept sessions (26,951 samples) → `raw/fitbit/*_all.json`, `exercise_hr.json`.
- `sync/normalise.ts` → `data/sessions.json` (310 sessions), `data/nights.json` (134 nights), `data/profile.json`.
- Result: 31 Fitbit duplicates removed (all full overlap with a Garmin activity, Garmin kept);
  5 sessions < 10 min dropped; nights with sleep 130, HRV 78, RHR 134; **HRmax 197 bpm**
  (Garmin run, 29 Apr 2025; Fitbit's best sustained 5 s is 192 in football).

**Decisions and issues raised:**
- The Google Health filter rejects `<=` on sample time; the HR window uses `< end + 1 s`.
- Data contract extended: `sport` may be `"other"` with `otherKind: "endurance" | "court"`, and `maxHr` was added (needed for HRmax). BUILD_PLAN §3 should be updated to match.
- Fitbit types not in the §2.2b mapping are excluded as the spec says: SWIMMING 8, CARDIO_WORKOUT 4, ELECTRIC_BIKE 3, RACKET_SPORTS 3, SPORT 2, VOLLEYBALL_BEACH 1. Open question whether the mapping should be extended.
- Garmin's list API has no HR stream, so Garmin HRmax uses the device's summary max (can't check the 5 s rule).
- Garmin gym `summarizedExerciseSets` only give totals per exercise; they're expanded into N sets with reps spread evenly and the 50 kg default weight.
- `data/` added to `.gitignore` (intermediate files with personal data; only `public/data.json` ships).

**What I changed and why:** _(to fill in)_

## 2026-11-17 11:15 Block 1 follow-up: extend Fitbit type mapping

**Asked:** map the Fitbit types that the original §2.2b mapping left out.

**Produced:** PROGRESSION_LOGIC §2.2b and `sync/mapping.ts` now map `ELECTRIC_BIKE` and `SWIMMING` to
Other (endurance), and `RACKET_SPORTS` and `VOLLEYBALL_BEACH` to Other (court). Re-fetched Fitbit HR
(71 kept sessions, 39,706 samples) and re-normalised: 325 sessions (+15 Other), 121 Other in total.
`CARDIO_WORKOUT` (4) and `SPORT` (2) stay excluded because they're too generic to place. HRmax is unchanged at 197.

**Note:** swimming uses the endurance split, which is mostly legs. That's wrong for an upper-body sport,
but it's only 8 sessions and Other load only. A swim-specific split would need a new params entry.

**What I changed and why:** _(to fill in)_

## 2026-11-17 11:25 Block 2: engine

**Asked:** build the engine (BUILD_PLAN §6): load → split → state → progression → attribution →
effects, with params from §11 and a fixture generator, writing `data.json` and `data.fixture.json`.

**Produced:**
- `engine/` (pure TypeScript, no I/O, so the browser can use it too):
  - `load.ts` (§3): TRIMPexp from the HR stream, or from avg HR when there's no stream; sRPE with RPE estimated from %HRR; refit of `c`.
  - `split.ts` (§4): F/D splits, gym movement groups from set counts, the interference rule.
  - `state.ts` (§5): daily fitness stores per capacity × source sport, fatigue stores with the sleep/HRV/RHR modifier, FatNorm, fatigue step, recovery day.
  - `progression.ts` (§6): W rows, 365-day refs, pace @150 bpm on steady runs, calibration.
  - `attribution.ts` (§7), `effects.ts` (§8.1 + §8.3 with seeded bootstrap), `whatif.ts` (§9).
  - `fixture.ts` (12 weeks of fake data) and `index.ts` (`runEngine` → the §12 shape).
- `sync/build.ts` → `public/data.json` (124 KB, engine 37 ms) and `public/data.fixture.json`. Data and fixture both run through the same engine.
- `engine/test/engine.test.ts`: 7 checks, all passing (`npm test`).
  - §3.1 worked example ≈ 96.
  - RPE bands.
  - F/D rows sum to 1.
  - Gym shares.
  - Contributions sum to the model.
  - Deltas sum to the total.
  - What if < 50 ms and adds fatigue only.
- Normalise now writes the time zone (Europe/London) into `profile.json` and applies an optional `checkins.json`.
- §11 in PROGRESSION_LOGIC and `params.json` match (checked by script). New keys are the [assumption] values that were only in the prose, plus the decisions below.

**Real-data result:**
- Engine fitness 75 (−11% over 28 d), Speed 90, Legs 88, Pull 20.
- 84 steady runs. Pace @150 trend is 386 s/km.
- Running calibration R² 0.07 → not calibrated (●○○), so deltas are shown in modelled index points.
- Learned effects that pass the evidence rules:
  - run the day before a run → +28 s/km (n=12, ●●○)
  - gym-heavy weeks → faster pace trend (r −0.42, n=40, ●●●)

**Decisions made in code (new params, all [assumption]):**
- The HR stream counts as flat if its SD is < 2 bpm. Gaps are capped at 10 s.
- The HR-CV steadiness check only applies to runs with a stream (3 of 96). Other runs skip it.
- The gym progression row is 50/50 `gym_lower`/`gym_pull`.
- The interference rule applies to "lower-body" gym sessions, meaning sessions where ≥ 50% of known sets are lower-body.
- Gym sessions without known sets use the mean group shares.
- Calibration evidence: R² ≥ 0.5 → ●●●.
- Long-term effects are hidden when |r| < 0.3.
- Uncalibrated 12-week deltas use index points, not % of the start value (that blew up when the start was near 0).

**Open issue found:** the §5.4 FatNorm reference includes Other sessions. The 25 short e-bike rides in 90 days
pull the "typical session" down, so Engine reads 5.1 (overloaded) and Legs 3.5. Without Other in the
reference it would be 2.2 and 1.35.

**What I changed and why:** _(to fill in)_

## 2026-11-17 11:35 Block 2 follow-up: FatNorm reference without Other

**Asked:** leave Other sessions out of the §5.4 FatNorm reference.

**Produced:** PROGRESSION_LOGIC §5.4 updated and `fatigueRefs` filters out Other. Other still adds fatigue;
it just no longer defines the "typical session". New test, 8 of 8 tests pass.
- Engine 5.10 → 2.24 (very heavy, recovered 25 Nov).
- Legs 3.52 → 1.35 (heavy, 20 Nov).
- Speed 0.52 → 0.47 (light).

**What I changed and why:** chose to exclude Other because short e-bike commutes were defining the
"typical session" and made a normal week read as overloaded.
