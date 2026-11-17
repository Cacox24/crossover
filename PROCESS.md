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
