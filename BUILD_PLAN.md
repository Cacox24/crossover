# Crossover: build plan

The plan for building Crossover for the Palantir Design Show & Tell
(Lens A: make it work). Read with `DESIGN.md` (how it looks) and
`PROGRESSION_LOGIC.md` (what the numbers mean).

Decisions confirmed 17 Nov: built with **Claude Code**; data via **APIs with export fallback**; demo pages **Progression, Now, Mix, What if**; the 3 hours cover **the build only** (planning, account setup and the video are outside it).

---

## 1. Deliverables and deadline

| Deliverable | Format | Due |
|---|---|---|
| Working app on my real data | Live URL (Vercel) | Sun 23 Nov 2026 (7 days from receipt) |
| Source + process | GitHub repo | Same |
| Video, 3 min max | Unlisted YouTube | Same |
| Submission | Email to designchallenge@palantir.com with both links | Same |

**Time rule:** a maximum of 3 hours on the exercise. The build (§6) is
planned to fit inside that. The 3 hours cover the build only:
planning, account setup, the data spike prep and the video are outside it.

---

## 1a. Data findings (connection tests done 17 Nov)

Both sources work. Raw test output is in `raw/` (git‑ignored).

| Source | Status | What's there |
|---|---|---|
| Garmin Personal API | ✓ | 291 activities, Apr 2025 → today. Token: POST key → bare JWT (not JSON), valid 24 h. List: `/activitylist-service/activities/search/activities?start=N&limit=100`, page until < 100. |
| Google Health API (Fitbit) | ✓ | OAuth in Testing mode, me as test user; 3 scopes granted; refresh token in `secrets/google_token.json`. `exercise` (25 per page), `heart-rate` (5,000 per page), `sleep`, `daily-resting-heart-rate`, `daily-heart-rate-variability`. All paginated via `nextPageToken`. |

Implications for the build:
- Paginate everything; Fitbit history from Aug 2026, Garmin from Apr 2025.
- Deduplicate overlapping sessions across devices; Garmin wins.
- Exclude walking. E‑bike, cycling, hiking, basketball, padel, jump rope → grey **Other** load.
- Gym: last session May 2026, weights are a default 50 kg → gym is **modelled only**; split by set counts.
- Strip latitude/longitude from Garmin summaries at ingestion.
- Working test scripts to reuse: `sync/test-garmin.mjs`, `sync/garmin-fetch-all.mjs`, `sync/test-google.mjs`.

## 2. Architecture

```
┌─────────────── my laptop ───────────────┐          ┌──────── browser ────────┐
│  sync/                                   │          │  app/ (static site)     │
│   garmin.ts     → raw/garmin/*.json      │          │                         │
│   google.ts     → raw/fitbit/*.json      │          │  reads data.json        │
│   (or exports)  → raw/exports/*          │          │                         │
│        │                                 │          │  engine/ (same code)    │
│        ▼                                 │          │   re‑runs §4–5 for      │
│   engine/  ← PROGRESSION_LOGIC.md        │          │   "What if"             │
│        │                                 │          │                         │
│        ▼                                 │  push    │                         │
│   public/data.json  ─────────────────────┼─────────►│  Vercel                 │
└──────────────────────────────────────────┘          └─────────────────────────┘
```

Key decisions:
- **One engine, written once in TypeScript.** It runs in Node during sync to
  produce `data.json`, and in the browser for "What if". No logic is
  duplicated.
- **Snapshot hosting.** Keys and tokens never leave my laptop. Reviewers get
  a link that can't break. "Today" is fixed to the sync date.
- **Privacy.** No GPS, only the fields the app uses, an unlisted URL.

### Stack

| Layer | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript | Fast to scaffold, static output, AI tools are fluent in it |
| Charts | Hand‑written SVG (+ d3‑shape for areas) | Full control to match DESIGN.md; no chart‑library look |
| Styling | Plain CSS with the DESIGN.md tokens | Tokens are already written as CSS variables |
| Icons | Phosphor (React) | Has all five sport glyphs |
| Font | Archivo variable (Google Fonts) | DESIGN.md §4 |
| Sync | Node + TypeScript scripts (`tsx`) | Same language as the engine |
| Hosting | GitHub → Vercel | Free, auto‑deploy on push |

### Repo structure

```
crossover/
├── DESIGN.md
├── PROGRESSION_LOGIC.md
├── BUILD_PLAN.md
├── PROCESS.md              ← running log of AI use, for the video
├── engine/
│   ├── params.json         ← PROGRESSION_LOGIC §11
│   ├── load.ts             ← §3 TRIMP, sRPE, conversion
│   ├── split.ts            ← §4 F, D, gym sets, interference
│   ├── state.ts            ← §5 fitness/fatigue stores, modifier, FatNorm
│   ├── progression.ts      ← §6 metrics, calibration
│   ├── attribution.ts      ← §7
│   ├── effects.ts          ← §8
│   └── whatif.ts           ← §9
├── sync/
│   ├── garmin.ts
│   ├── google.ts
│   ├── fromExports.ts      ← fallback
│   ├── normalise.ts        ← → Session[], Night[]
│   └── build.ts            ← runs the engine, writes public/data.json
├── app/
│   ├── tokens.css
│   ├── components/         ← shared UI (§4)
│   ├── pages/              ← Now, Progression, Mix (§5)
│   └── drawers/            ← WhatIf, CheckIn
└── public/data.json
```

---

## 3. Data contract

The one interface between sync and app. Defined first, so the UI can be
built against fixture data while the sync is still in progress.

```ts
type Sport = "running" | "football" | "tennis" | "bouldering" | "gym";
type Capacity = "engine" | "speed" | "legs" | "pull";

interface Session {
  id: string; sport: Sport; source: "garmin" | "fitbit";
  start: string; durationMin: number;
  avgHr?: number; hrSamples?: [number, number][];   // [secondsFromStart, bpm]
  distanceM?: number; elevGainM?: number;           // running only
  sets?: { exercise: string; reps: number; weightKg: number }[]; // gym only
  rpe?: number; topGrade?: number;                  // check‑in
}

interface Night { date: string; sleepH?: number; rmssd?: number; rhr?: number; }
```

`data.json` shape: see PROGRESSION_LOGIC.md §12.

A fixture file `public/data.fixture.json` with about 12 weeks of
realistic fake sessions is generated by the engine itself, so UI work never
waits on real data.

---

## 4. Shared components (built once, used on every page)

| Component | DESIGN.md | Used on |
|---|---|---|
| App shell: top bar, nav, "What if" button, synced date | §6 | All |
| Sport glyph + chip (color + Phosphor icon + aria‑label) | §3.2, §7.6 | All |
| Capacity row (fitness bar + hatched fatigue bar) | §7.2 | Now, What if |
| Fatigue hatch pattern (SVG `<pattern>`, 6 steps) | §3.3 | Now, What if, body map |
| Evidence dots `●●○ 9` | §3.6 | Progression, What if |
| Figure (L/M/S, tabular nums, unit, signed change) | §4 | All |
| Tooltip (numbers only) | §8 | All charts |
| Table toggle (icon‑only) + table view | §8 | All charts |
| Panel (white, 12px radius, 1px border) | §5 | All |

---

## 5. Pages

Priorities: **P0** must be in the demo, **P2** after submission.
P0 pages: Progression, Now, Mix, What if.

### 5.1 Now (P0)

**Question it answers:** where am I tired, and where am I built up?

| Area | Content | Data |
|---|---|---|
| Title | `Now` | — |
| Left (8 cols) | Four capacity rows; body map (front/back) beside or under them | `capacities.*.fitIndex`, `fatNorm`, `fatStep` |
| Right (4 cols) | Per capacity: fitness index, 28‑day change, recovery day | `fitChange28d`, `recoveredOn` |
| Bottom | Last 7 days of session chips | `sessions` (last 7 days) |

Interactions: hover a capacity row → matching body regions highlight;
hover a body region → its capacity row highlights; hover a session chip →
tooltip with load and duration.

Acceptance:
- [ ] Four rows render from data.json; fatigue uses the right hatch step
- [ ] Body map regions match capacity fatigue
- [ ] Recovery day shows as a weekday (`Thu`) or `—` if already fresh
- [ ] No sentences anywhere on the page

Body map scope: **P0 = a simplified front‑only silhouette with 4 region
groups**; P1 = front + back.

### 5.2 Progression (P0, the demo's main moment)

**Question it answers:** how is this sport improving, and which sports are
helping?

| Area | Content | Data |
|---|---|---|
| Top | Five sport glyph chips (switch sport) + range (`12w` · `6m` · `1y`) | — |
| Left (8 cols) | Boost‑stacked chart: black measured line, contribution layers by sport, other‑sport glyph markers on the x‑axis | `sports[s].metric.series`, `contributions` |
| Right (4 cols) | Total change in units; change split by sport (glyph + signed number); calibration evidence dots | `delta12w`, `calibration` |

Interactions: crosshair + tooltip (date, metric, each contribution);
switching sport replays the load animation (DESIGN.md §7.4); table toggle.

Per sport:
- Running: pace @150 bpm (s/km, inverted axis so up = faster)
- Gym: modelled only (no real weights logged, no gym since May 2026)
- Bouldering: top grade (if check‑in data exists; otherwise modelled only)
- Football, tennis: modelled fitness index only, evidence `●○○`

Acceptance:
- [ ] Running chart shows real pace @150 with contributions summing to the modelled line
- [ ] Animation: line draws first, then layers fill by sport order, 600ms total
- [ ] Reduced motion → no animation
- [ ] Right column numbers sum to the total (rounding goes to own sport)

### 5.3 Mix (P0)

**Question it answers:** how much do I lean on each sport?

| Area | Content | Data |
|---|---|---|
| Left (8 cols) | Weekly stacked bars, last 12 weeks, by sport | `weeks[].loadBySport` |
| Right (4 cols) | Share of load per sport over the range | derived |

Acceptance:
- [ ] Bars stack in sport order with 2px gaps
- [ ] Hover a week → tooltip with load and session count per sport

### 5.4 What if drawer (P0)

**Question it answers:** if I play X at time Y, what happens?

| Area | Content | Data |
|---|---|---|
| Inputs | Sport (5 chips), when (`Tonight` · `Tomorrow` · time), intensity (`Easy` · `Normal` · `Hard`) | — |
| Output 1 | Capacity rows with a dashed projection, recovery day per capacity | `engine/whatif.ts` live |
| Output 2 | Fitness gain per capacity, and to each other sport via W | live |
| Output 3 | Learned effects for that sport, with evidence | `effects[]` |
| Action | `Close` only | — |

Acceptance:
- [ ] Changing any input updates the outputs in under 50ms
- [ ] Projection is computed by the same engine code as the sync
- [ ] Effects with fewer than 3 sessions are hidden

### 5.5 Check‑in sheet (P2)

A bottom sheet with effort 1–10, soreness regions and top grade. On a static
demo site, reviewers' entries can't be saved for real (they'd stay in their
browser only). Proposal: **leave it out of the demo** and enter my real
RPEs straight into a local `checkins.json` that the sync reads. Mention it
in the video as "next".

---

## 6. The 3‑hour build schedule

| Time | Block | Output | Cut if behind |
|---|---|---|---|
| 0:00–0:20 | **Full fetch.** Turn the working test scripts into `sync/garmin.ts` and `sync/google.ts` with pagination; save all raw data | All raw data in `raw/` | Use the raw files already fetched |
| 0:20–0:40 | **Normalise.** `Session[]` and `Night[]` from raw; strip GPS; check‑ins from `checkins.json` | `sessions.json` | Skip HR streams, use avg HR |
| 0:40–1:10 | **Engine.** load → split → state → progression → attribution → effects; params from §11; fixture generator | `data.json` + `data.fixture.json` | Skip interference + sleep modifier |
| 1:10–1:25 | **Shell + shared components.** Tokens, Archivo, shell, glyphs, capacity row, hatch, figures | App shell running | Skip table toggle |
| 1:25–2:00 | **Progression page.** Chart + animation + right column | P0 page done | Skip markers on the x‑axis |
| 2:00–2:25 | **Now page.** Capacity rows + simple body map + session strip | P0 page done | Body map → capacity rows only |
| 2:25–2:40 | **What if drawer.** Engine in browser + outputs | P0 drawer done | Drop learned effects block |
| 2:40–2:50 | **Mix page.** Weekly stacked bars + share column | P0 page done | Drop the hover tooltip |
| 2:50–3:00 | **Ship.** Real sync, deploy to Vercel, check the link in a private window | Live URL | — |

Not counted in the 3 hours (setup and submission):
- Creating a Vercel account (sign in with GitHub), getting the Garmin key, requesting exports as a backup
- No manual effort ratings: past RPE is estimated from heart rate (PROGRESSION_LOGIC §3.4)
- Recording and editing the video

---

## 7. How AI is used (and captured for the video)

| Where | Tool | What it does | Captured as |
|---|---|---|---|
| Problem framing and critique | Claude (this chat) | Challenged the idea, sharpened it from "track everything" to "how sports affect each other" | Screenshots of key turns |
| Design system | Claude + dataviz palette validator | DESIGN.md; sport colors checked for color‑blind safety | DESIGN.md diff history |
| Sports science | Claude + web research | PROGRESSION_LOGIC.md with 25+ sources, assumptions marked | The file itself |
| Build | Claude Code | Engine, sync, UI from the three .md files | Screen recording + PROCESS.md |
| Verification | Engine tests + a second AI pass reviewing the engine against the logic file | Test output | Terminal recording |

`PROCESS.md` gets a line per session: prompt intent, what AI produced, what
I changed and why. The video needs evidence of judgement, not just output.

---

## 8. Video outline (≤ 3 min)

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:20 | Why: five sports, two watches, friends decide my week, and no app shows how they affect each other | Me + both watches; two apps side by side |
| 0:20–0:50 | How I broke it down: capacities, cost vs boost, "show, don't decide" | DESIGN.md + PROGRESSION_LOGIC.md scrolling; the critique moments with AI |
| 0:50–1:50 | Demo: Progression animation (running built partly by football), Now, What if for "football tonight" | The live app |
| 1:50–2:30 | Where AI came in, and where I overruled it (ribbons cut, no verdicts, B&W) | PROCESS.md, chat excerpts |
| 2:30–2:50 | Honest limits + next: learn personal transfer values, check‑in, live sync | Evidence table from the logic file |

---

## 9. Risks

| Risk | Likelihood | Fallback |
|---|---|---|
| Google Health API needs a privacy review even in test mode | Medium | Google Takeout export of Fitbit data |
| Garmin Personal API doesn't return strength sets | Medium | Garmin export (FIT files) or enter key lifts manually into `checkins.json` |
| Fitbit wrist HR noisy in tennis | Medium | Use sRPE for tennis when HR CV is extreme |
| Too little history for learned effects | Medium | Garmin has ~2 years (running, gym) but Fitbit only since Aug 2026 (~15 weeks of football, tennis, bouldering). Effects involving those sports will mostly be ●○○ or ●●○. Show only those that pass evidence rules; that honesty is part of the pitch |
| Running out of the 3 hours | Medium | Cut list in §6; protect Progression first, then What if, Now, Mix |

---

## 10. Definition of done

- [ ] Live URL opens with no login, on desktop and mobile, in a private window
- [ ] Real data, synced the day of submission
- [ ] Progression, Now, Mix and What if work with no errors in the console
- [ ] No sentences in the UI; only sport colors are colored
- [ ] Repo has README, the three .md files and PROCESS.md
- [ ] Video ≤ 3 min, unlisted, plays without context
- [ ] Email sent with both links
