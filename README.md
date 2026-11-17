# Crossover

A personal training app that shows how five sports (running, football,
tennis, bouldering, gym) affect each other: short-term fatigue on shared
capacities, and long-term fitness that carries over between sports. It runs on
my real Garmin and Fitbit data.

Built for the Palantir Product Design Show & Tell (Lens A).

## Read first

| File | What it decides |
|---|---|
| [`BUILD_PLAN.md`](BUILD_PLAN.md) | Architecture, data contract, pages, schedule |
| [`PROGRESSION_LOGIC.md`](PROGRESSION_LOGIC.md) | Every formula and parameter, with sources and assumptions |
| [`DESIGN.md`](DESIGN.md) | Every visual decision |
| [`PROCESS.md`](PROCESS.md) | How the build went, block by block, including where I overruled the AI |

## How it works

```
Garmin + Fitbit APIs ─► sync/ ─► data/*.json ─► engine/ ─► public/data.json ─► app/ (static, Vercel)
                                                  ▲                               │
                                                  └──────── same engine ◄─────────┘  (What if, in the browser)
```

- **`sync/`** fetches every activity, night and heart-rate sample, drops GPS,
  maps activity types, removes cross-device duplicates (Garmin wins) and
  writes `Session[]` / `Night[]`.
- **`engine/`** is plain TypeScript with no I/O: session load (TRIMP / sRPE),
  capacity split, fitness and fatigue stores, progression, attribution,
  learned effects and the what-if projection. All assumptions live in
  `engine/params.json`, mirrored in PROGRESSION_LOGIC §11.
- **`app/`** is Vite + React and reads the snapshot. The What if drawer imports
  the same engine, so no formula exists twice.

The live site is a snapshot: "today" is the sync date, and no keys or tokens
leave my laptop.

## Commands

```bash
npm install
npm run sync     # fetch Garmin + Fitbit, normalise, run the engine → public/data.json
npm test         # engine checks against the logic file
npm run dev      # local app; add ?fixture to use generated fake data
npm run build    # static site → dist/
```

`sync` needs `.env` (Garmin key) and `secrets/` (Google OAuth). Both are git-ignored.

## Privacy

No GPS, no raw heart-rate streams and no tokens are in the repo or on the site.
`public/data.json` holds only per-session load, duration and the derived
numbers the pages show.
