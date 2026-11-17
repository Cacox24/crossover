# Crossover: instructions for Claude Code

Crossover is a personal training app for the Palantir Product Design Show &
Tell (Lens A). It shows how my five sports (running, football, tennis,
bouldering, gym) affect each other's short-term fatigue and long-term
progression, using my real Garmin and Fitbit data.

## Source of truth: read before writing code

1. `BUILD_PLAN.md`: architecture, data contract, pages, schedule, data findings (§1a)
2. `PROGRESSION_LOGIC.md`: every formula and parameter (§11 is the params JSON)
3. `DESIGN.md`: every visual decision (tokens in §11)

If code and these files disagree, the files win. If a file is wrong or
incomplete, say so and propose an edit; don't silently diverge.

## Hard rules

- **Secrets:** never print, log or commit the contents of `.env`, `secrets/`,
  or any access/refresh token. `.env`, `secrets/` and `raw/` are git-ignored;
  keep it that way.
- **Privacy:** drop all latitude/longitude and GPS fields at ingestion. Only
  fields the app uses go into `public/data.json`.
- **UI:** black, white and grey plus the five sport colors only. Other = grey.
  No explanatory sentences in the UI. Sentence case. Archivo only.
- **Logic:** the engine lives in `engine/` as TypeScript and is used both by
  the sync (Node) and the browser (What if). Never duplicate a formula.
- **Honesty:** values marked [assumption] in PROGRESSION_LOGIC.md stay
  parameters in `engine/params.json`, never hard-coded constants.

## Data access (already working)

- Garmin: `sync/test-garmin.mjs`, `sync/garmin-fetch-all.mjs`. Token endpoint returns a bare JWT.
- Fitbit via Google Health API: `sync/test-google.mjs`. Refresh token in `secrets/google_token.json`.
- Raw responses from the tests are in `raw/garmin/` and `raw/fitbit/`.

## Working style

- Work in the blocks of BUILD_PLAN.md §6. At the end of each block:
  run what you built, show the result, and append one entry to `PROCESS.md`:
  `## <time> <block>` + what I asked, what you produced, what I changed and why.
- Prefer small, verifiable steps. Run code before claiming it works.
- Ask before adding a dependency not listed in BUILD_PLAN.md §2.
