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

## 2026-11-17 11:50 Block 3: shell + shared components

**Asked:** build the app shell and the shared components (BUILD_PLAN §4, DESIGN.md §3–§11).

**Produced:**
- Vite + React + TypeScript, with `index.html` at the root and the app in `app/`. Dependencies are from BUILD_PLAN §2:
  `react`, `@phosphor-icons/react`, `vite`, `@vitejs/plugin-react`.
- `app/tokens.css`: the DESIGN.md §11 tokens and the §4 type roles. Archivo variable comes from Google Fonts with both axes;
  width is set via `font-stretch`.
- Shell: 64 px top bar, nav (Now · Progression · Mix, hash routes), What if button, synced date, 12-column
  grid that stacks below 900 px, and a 420 px right drawer with `Close` (contents come in the What if block). Error state is `⚠ —`.
- Components:
  - Sport glyph and chip (Phosphor, sport color, aria-label). Other = grey `DotsThreeCircle`.
  - Capacity row: black or sport-split fitness bar with 2 px gaps, hatched fatigue bar, dashed projection.
  - Fatigue hatch: one tile definition used as both a CSS background and an SVG `<pattern>`.
  - Figure L/M/S, signed change `↓ 11%`, evidence `●●○ 9`, session chip, tooltip, icon-only table toggle and table view.
- `#/kit` (not in the nav): every component rendered with real data, for checking.
- Checked in the browser: desktop and 390 px (no horizontal scroll), table toggle, drawer open/Escape,
  no console errors. `vite build` passes (264 KB JS, 82 KB gzipped).

**Design decision added to DESIGN.md §7.2:** the fatigue bar length is FatNorm ÷ 3, capped, so a full bar = overloaded.

**What I changed and why:** _(to fill in)_

## 2026-11-17 12:10 Block 4: Progression page

**Asked:** build the Progression page (BUILD_PLAN §5.2, DESIGN.md §7.4): the boost-stacked chart, its animation and the right column.

**Produced:**
- `app/components/ProgressionChart.tsx`: hand-written SVG with `d3-shape` (from the §2 list).
  - Contributions are stacked in sport colors with the own sport first and Other last, and a 2 px black line on top.
  - Other sports' sessions show as glyph markers in lanes under the x-axis.
  - Crosshair and a numbers-only tooltip. The chart has one y-axis.
  - Animation: the line draws in 240 ms, then the layers fill up from the bottom, staggered in sport order, all within 600 ms. Switching sport or range replays it, and with reduced motion it's instant.
- `app/pages/Progression.tsx`:
  - Five sport chips and a `12w · 6m · 1y` range switch.
  - Table toggle with one row per week.
  - Right column: Pace @150 with its change (running), Fitness, the change split by sport, and evidence.
  - The split for the chosen range is computed in the browser with the engine's own `attributeDelta`, so it isn't a second copy of the formula. The split rows add up to the total.
- Two chart modes, picked automatically:
  - **Calibrated** (R² ≥ 0.3): the y-axis is pace in s/km, flipped so faster is up. The stack is a + b × contributions and the line is the measured pace. Checked with the fixture (R² 0.48).
  - **Not calibrated:** the y-axis is modelled fitness from 0 to 100, and the line is the model total. Measured pace moves to the right column.
- Checked in the browser on real and fixture data: 12w, 1y, football, table view, 390 px width with no horizontal
  scroll, no console errors. The tests and the build pass.

**Open issue:** with real data, running isn't calibrated (R² 0.07, and b has the wrong sign), so the
chart shows modelled fitness rather than the real pace @150. BUILD_PLAN's acceptance line "Running chart
shows real pace @150" isn't met by the real data. Real pace is shown as numbers only.

**What I changed and why:** kept the modelled view for running. A pace chart claiming a link that the data
doesn't support (R² 0.07) would be dishonest. Showing the weak evidence is part of the pitch. BUILD_PLAN §5.2
acceptance was updated to match.

## 2026-11-17 12:30 Block 5: Now page

**Asked:** build the Now page (BUILD_PLAN §5.1): capacity rows, a simple body map, the right column and the session strip.

**Produced:**
- `app/components/BodyMap.tsx`: front-only silhouette with 4 region groups. Each region is filled with its
  capacity's fatigue step, using the same hatch definition as the bars.
  - Mirroring the paths with an SVG transform also flipped the hatch into chevrons. I now mirror the coordinates
    instead, so the 45° hatch keeps one direction.
- `app/pages/Now.tsx`:
  - Left: four capacity rows (fitness bar + hatched fatigue bar, no numbers) with the body map beside them,
    or under them on a phone.
  - Right: a table of Fitness, 28d change and Recovered weekday (or `—`).
  - Bottom: the last 7 days of session chips, with a Load / Duration tooltip.
  - Hovering a row, a map region or a right-column row highlights the same capacity in all three.
- `CapacityRow` got a `showFigure` option, so the numbers aren't shown twice.
- Checked in the browser:
  - Engine is very heavy (until Wed), Legs heavy (until Fri), Speed and Pull light (`—`). The map regions match.
  - Hover links work both ways, and the football chip tooltip reads Load 124 / 61 min.
  - 390 px with no horizontal scroll. The build passes.
- DESIGN.md §7.3: added the P0 region mapping (chest = Engine, core = Speed).

**What I changed and why:** _(to fill in)_
