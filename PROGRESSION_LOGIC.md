# Crossover: progression logic

This file defines how Crossover turns raw Garmin and Fitbit data into
short‑term fatigue, long‑term fitness, and the boosts each sport gives
the others. Every number on screen comes from this logic. The design system
(`DESIGN.md`) decides how it looks; this file decides what it means.

Status: v1. Parameters are research‑informed starting values (priors), then
checked against my own data. Anything marked **[assumption]** is a
judgement call, not a measured value, and is the first thing to revisit.

---

## 0. The pipeline at a glance

```
 Garmin (run, gym)      Fitbit (football, tennis, bouldering, sleep, HRV, RHR)      Check‑in (RPE, grade)
        │                               │                                                  │
        └───────────────┬───────────────┴──────────────────────────────────────────────────┘
                        ▼
 1. SESSION LOAD          one number per session, same unit for every sport
                        ▼
 2. CAPACITY SPLIT        where that load builds fitness and where it costs fatigue
                        ▼
 3. FITNESS & FATIGUE     two decaying stores per capacity, adjusted by sleep / HRV
                        ▼
 4. SPORT PROGRESSION     each sport's measured metric (pace @ HR, e1RM, grade)
                        ▼
 5. ATTRIBUTION           how much of a sport's progress came from each sport
                        ▼
 6. LEARNED EFFECTS       personal "X before Y" patterns, with evidence strength
                        ▼
 7. WHAT IF               add a hypothetical session, project 7 days forward
```

All steps are deterministic and run in the sync script. Their output is
written to `data.json`. The app only reads and displays it, except the
"what if" projection, which re‑runs steps 2–3 in the browser.

---

## 1. The core idea, from the research

**Fitness–fatigue (impulse–response) model.** <!-- Banister 1975 -->
Every session produces two effects: a fitness gain and a fatigue cost. Both
fade exponentially, fitness slowly and fatigue quickly. Performance is
fitness minus fatigue. The classic time constants are about 42 days for
fitness and 7 days for fatigue, the defaults behind TrainingPeaks'
CTL/ATL. With these simple assumptions, the model can explain a large share
of the variation in measured performance (over 90% in some studies) once
calibrated to an individual.

**Crossover's extension.** The classic model treats an athlete as one
system. Crossover splits the body into four shared **capacities**, so load
from one sport can build (or tire) something another sport depends on.

| Capacity | What it is | Why it transfers |
|---|---|---|
| **Engine** | Central aerobic capacity: heart, blood volume, VO₂max | Central adaptations transfer across sports; peripheral ones mostly don't (Tanaka 1994) |
| **Speed** | Repeated high‑intensity efforts, sprints, changes of direction | Shared by football, tennis and running intervals |
| **Legs** | Lower‑body strength and tissue tolerance | Built by gym, football and running; needed by all three |
| **Pull & grip** | Upper‑body pulling and finger/forearm strength | Built by bouldering and gym pulling; needed by both |

Each sport also has a **sport‑specific** component (technique, movement
economy, tendon adaptations specific to that movement) that only that
sport can build. This is what stops the model from claiming football can
fully replace running.

---

## 2. Inputs: what data, from where, for which sport

### 2.1 Personal constants

| Constant | Source | Notes |
|---|---|---|
| `HRmax` | Highest plausible HR in all history, either device: highest value sustained ≥ 5 s, ignoring readings > 215 bpm (sensor spikes) | Re‑checked each sync |
| `HRrest` | Fitbit `daily-resting-heart-rate`, 30‑day rolling median | Updated daily |
| `k` (TRIMP sex factor) | 1.92 (male) | Banister |
| Body mass | 75 kg | Used for bouldering/body‑weight load only |

### 2.2 Per sport

| Sport | Device | Data used | Load method | Progression metric |
|---|---|---|---|---|
| Running | Garmin | duration, distance, avg pace, HR stream (or avg HR), elevation gain | TRIMP (HR) | Pace at reference HR (efficiency factor) |
| Gym | Garmin | duration, exercise sets: exercise name, reps, weight; avg HR | sRPE (+ volume load for the split) | Estimated 1RM per key lift |
| Football | Fitbit | exercise session start/end, HR samples in that window | TRIMP (HR), sRPE if logged | None measured (modelled only) |
| Tennis | Fitbit | exercise session start/end, HR samples in that window | TRIMP (HR), sRPE if logged | None measured (modelled only) |
| Bouldering | Fitbit | exercise session start/end, HR samples | sRPE (HR underestimates isometric work) | Top grade (check‑in) |
| Other | Garmin, Fitbit | duration, avg HR / HR samples | TRIMP (HR) | None (load only, never its own sport) |

### 2.2a Real data (confirmed 17 Nov 2026)

- **Garmin:** 291 activities, Apr 2025 → today. Running, football, bouldering,
  tennis and gym are all on Garmin up to Aug 2026; after that mostly running.
- **Fitbit (Fitbit Air):** football, indoor climbing and runs since Aug 2026.
  Most Fitbit sessions are auto‑detected walks.
- **Some runs exist on both devices** (e.g. 11 and 16 Nov 2026), so
  deduplication is required (§2.5).
- **Gym:** 32 sessions, the last on 27 May 2026. No per‑set endpoint (404);
  each activity has `summarizedExerciseSets` (category, sets, reps, volume,
  maxWeight). Weights are a 50 kg default, not real loads.
- **Recovery:** Fitbit daily resting HR, daily HRV (RMSSD) and staged sleep.

### 2.2b Activity type mapping

| Source type | Sport |
|---|---|
| Garmin `running`, `treadmill_running`, `trail_running`; Fitbit `RUNNING` | Running |
| Garmin `soccer`; Fitbit `SOCCER` | Football |
| Garmin `tennis`, `tennis_v2`; Fitbit `TENNIS` | Tennis |
| Garmin `bouldering`, `indoor_climbing`; Fitbit `INDOOR_CLIMBING`, `CLIMBING`, `BOULDERING` | Bouldering |
| Garmin `strength_training`; Fitbit `WEIGHTLIFTING`, `STRENGTH_TRAINING` | Gym |
| Garmin `cycling`, `e_bike_fitness`, `hiking`; Fitbit `BIKING`, `ELECTRIC_BIKE`, `HIKING`, `SWIMMING` | Other (endurance) |
| Garmin `basketball`, `paddelball`, `jump_rope`; Fitbit `RACKET_SPORTS`, `VOLLEYBALL_BEACH` | Other (court) |
| Walking (both), `breathwork`, anything else | Excluded |

### 2.3 Daily recovery signals (Fitbit, worn at night)

| Signal | Google Health API data type | Use |
|---|---|---|
| Sleep duration | `sleep` | Fatigue clearance modifier (§5.3) |
| Overnight HRV (RMSSD) | `daily-heart-rate-variability` | Fatigue clearance modifier |
| Resting HR | `daily-resting-heart-rate` | Fatigue clearance modifier, `HRrest` |

### 2.4 Check‑in (optional, under 10 seconds)

| Field | Scale | Used for |
|---|---|---|
| Effort | CR‑10 RPE (1–10) | sRPE load (§3.2) |
| Soreness | Body regions tapped | Validates the fatigue split (§4.2); not used in maths in v1 |
| Top grade | V‑scale (bouldering only) | Bouldering progression |

### 2.5 Cleaning rules

- Drop sessions shorter than 10 minutes.
- Drop GPS tracks entirely; keep only summary distance, pace and elevation.
- If more than 30% of an HR stream is missing or flat, treat HR as missing
  and use the sRPE path.
- Walking and breathwork are excluded from load.
- **Deduplication:** two sessions from different devices are the same session
  if their time ranges overlap by ≥ 50% of the shorter one. Keep the
  Garmin version (better HR and summary data); take the sport from Garmin.
- Garmin activity summaries contain start/end coordinates: drop all
  latitude/longitude fields at ingestion.

---

## 3. Step 1: session load (one currency for all sports)

Load is **internal load**: how hard the session was for my body, not how far
or how heavy. This lets a tennis match and a squat session be compared.

### 3.1 HR method: Banister TRIMPexp (running, football, tennis)

For every minute (or sample interval) of the session:

```
HRr   = (HR − HRrest) / (HRmax − HRrest)          // fraction of heart‑rate reserve
TRIMP = Σ  Δt_min × HRr × 0.64 × e^(k × HRr)       // k = 1.92 (male)
```

The exponential weighting makes high‑intensity minutes count
disproportionately more, based on the observed HR–lactate relationship. If
only average HR is available, use it with total duration (less accurate,
flagged in data).

Worked example: 60 min run at avg HR 150, HRrest 55, HRmax 195:
HRr = 0.68 → 60 × 0.68 × 0.64 × e^(1.30) ≈ **96 load points**.

### 3.2 Effort method: session RPE (bouldering, gym, and fallback)

```
sRPE = RPE (CR‑10) × duration_min                  // Foster et al. 2001
```

Session‑RPE has been validated across many sports and can stand alone as a
load measure. HR methods agree less well with sRPE in strength and
functional sessions, because HR barely reflects isometric or heavy
low‑rep work. So for **bouldering and gym, sRPE is the primary method**.

### 3.3 Converting sRPE to the TRIMP scale

sRPE and TRIMP use different units. Foster also noted that session‑RPE
scores come out higher in absolute terms than HR scores. Convert with a
personal factor:

```
load = sRPE × c        // c fitted on sessions that have both HR and RPE (usually runs)
c_default = 0.33       // [assumption] from the worked example: RPE 5 × 60 min = 300 ≈ 96–100 TRIMP
```

Refit `c` whenever there are 10 or more sessions with both values.

### 3.4 Missing RPE: estimate from heart rate

No past sessions have a check‑in, so RPE is estimated from the session's
average heart‑rate reserve and marked `estimated` **[assumption]**:

| Avg %HRR | Estimated RPE |
|---|---|
| < 40% | 3 |
| 40–55% | 4 |
| 55–65% | 5 |
| 65–75% | 6 |
| 75–85% | 7 |
| ≥ 85% | 8 |

- Gym and bouldering: **+1** (HR understates isometric and heavy low‑rep work), capped at 9.
- No usable HR: that sport's median estimated RPE over 90 days, else 6.
- A real check‑in RPE always replaces the estimate.

### 3.5 Output

Every session becomes: `{date, sport, load, method: "trimp" | "srpe" | "estimated"}`.

---

## 4. Step 2: capacity split

Each session's load is split two ways, because what a sport **builds** is
not the same as what it **costs**. Football builds mostly Engine, but the
fatigue lands mostly in the Legs (decelerations, impacts).

### 4.1 Fitness split F: where the load builds fitness

Fractions of session load. Each row sums to 1. `Specific` is the
sport‑specific component that only feeds that sport (§6).

| Sport | Engine | Speed | Legs | Pull & grip | Specific |
|---|---|---|---|---|---|
| Running | 0.50 | 0.05 | 0.10 | 0 | 0.35 |
| Football | 0.35 | 0.20 | 0.10 | 0 | 0.35 |
| Tennis | 0.25 | 0.20 | 0.05 | 0.05 | 0.45 |
| Bouldering | 0.05 | 0 | 0 | 0.50 | 0.45 |
| Gym | from sets (§4.3) | 0 | from sets | from sets | 0.40 |
| Other (endurance) | 0.70 | 0 | 0.30 | 0 | — |
| Other (court) | 0.45 | 0.30 | 0.25 | 0 | — |

Why these values:
- **Running is mainly Engine.** It also builds some Legs tolerance, and a
  large share is specific (running economy, tendon adaptations) that other
  sports can't build.
- **Football is a strong Engine builder.** Recreational small‑sided football
  is played at about 80–85% of HRmax and stimulates both aerobic and
  anaerobic energy turnover. In untrained men, 12 weeks at 78–84% HRmax
  raised VO₂max by 8–13%. Hence a high Engine share plus a real Speed share.
- **Tennis is intermittent.** Match HR averages 70–80% of HRmax with peaks
  of 90–100%, so it's less aerobic than football and more Speed. It has a
  large skill component, so Specific is high.
- **Bouldering is almost all Pull & grip.** It consists of roughly
  8‑second isometric holds within 30–40 second problems, so the aerobic
  contribution is small. Bouldering training increases finger strength and
  isometric pull‑up strength.
- **Gym** is split from what was actually lifted (§4.3).

### 4.2 Fatigue split D: where the cost lands

Each row sums to 1.

| Sport | Engine | Speed | Legs | Pull & grip |
|---|---|---|---|---|
| Running | 0.40 | 0.05 | 0.55 | 0 |
| Football | 0.25 | 0.25 | 0.50 | 0 |
| Tennis | 0.25 | 0.25 | 0.35 | 0.15 |
| Bouldering | 0.05 | 0 | 0.05 | 0.90 |
| Gym | 0.05 | 0 | from sets | from sets |
| Other (endurance) | 0.40 | 0 | 0.60 | 0 |
| Other (court) | 0.25 | 0.25 | 0.50 | 0 |

**Other** has no Specific store and no progression of its own. It only adds
load to capacities, so fatigue is honest, and it appears as a grey
contribution layer (DESIGN.md §3.2a).
Why: after football, recovery markers stay affected for up to 72 hours,
and sprint performance can stay down for up to 96 hours. That's longer
than for most other team sports, so football puts the heaviest load on
Legs and Speed. Body‑map regions follow the capacity: Legs = legs and
hips; Pull & grip = forearms, shoulders, upper back; Engine and Speed =
chest and core.

### 4.3 Gym: split from logged sets

Garmin strength activities carry per‑set exercise, reps and weight (the FIT
set message). Each exercise maps to a movement group **[assumption: lookup
table maintained in code]**:

| Group | Example exercises | Fitness → | Fatigue → |
|---|---|---|---|
| Lower | squat, deadlift, lunge, leg press, RDL | Legs | Legs |
| Pull | pull‑up, row, lat pulldown, curl | Pull & grip | Pull & grip |
| Push | bench, overhead press, dips | Specific (gym) | Specific (not shown) |
| Core / other | plank, carries | Specific (gym) | Engine |

```
share(group) = Σ sets in group / Σ sets in session
```

Logged weights are a 50 kg default, so shares use **set counts**, not
volume. `UNKNOWN` sets are spread proportionally over the known groups.
Category mapping: `SQUAT, DEADLIFT, LUNGE, OLYMPIC_LIFT, LEG_*` → Lower;
`PULL_UP, ROW, CURL, SHRUG, LAT_*` → Pull; `BENCH_PRESS, PUSH_UP,
SHOULDER_PRESS, TRICEPS_EXTENSION, FLYE, LATERAL_RAISE` → Push;
`SIT_UP, PLANK, CORE_*` → Core.

The gym session's non‑Specific fitness (0.60 of load) and its fatigue
(0.95 of load) are then distributed by `share(group)`.

**Heavy‑set weighting (disabled for now).** High‑load strength training
(≥80% of 1RM) improves running economy; lighter loads showed no clear
effect. This rule needs real weights, so it is off until weights are logged.

### 4.4 Interference (negative transfer)

The evidence is mixed. A 2012 meta‑analysis found strength training done
alongside running (not cycling) reduced hypertrophy and strength gains. A
2022 meta‑analysis found no interference for maximal strength or muscle
size, but found that explosive‑strength gains can be blunted, especially
when aerobic and strength work happen in the same session.

v1 rule **[assumption, weak evidence]**: if a lower‑body gym session starts
within 6 hours after a run or football session, its Legs fitness gain is
multiplied by 0.85. The app surfaces this only as a learned effect (§8) if
my own data supports it.

---

## 5. Step 3: fitness and fatigue per capacity

### 5.1 Two decaying stores per capacity

For each capacity `c`, updated daily (sessions on the same day are summed):

```
Fit[c](t) = Fit[c](t−1) × e^(−1/τ_fit[c])  + Σ_sessions F[sport][c] × load
Fat[c](t) = Fat[c](t−1) × e^(−1/τ_fat[c]·m(t)) + Σ_sessions D[sport][c] × load
```

The Specific store per sport works the same way as `Fit`, using that
sport's `τ_fit`.

**Fitness is tracked per source sport.** `Fit[c]` is stored as a sum of
per‑sport parts (`Fit[c][run]`, `Fit[c][football]`, …). Because the model
is linear, these parts add up exactly to the total, which is what makes
attribution (§7) possible.

### 5.2 Time constants

| Capacity | τ_fit (days) | τ_fat (days) | Basis |
|---|---|---|---|
| Engine | 42 | 5 | Classic 42‑day fitness constant. VO₂max drops measurably within 2–4 weeks of stopping. Systemic fatigue: Performance Manager guidance suggests 4–5 days can suit some athletes instead of 7. |
| Speed | 30 | 2 | Faster‑fading anaerobic qualities **[assumption]**. Sprint/jump markers mostly recover within 48 hours. |
| Legs | 60 | 2.5 | Strength is kept longer, roughly 3–4 weeks, before it declines. Post‑football sprint recovery can take up to 96 hours. |
| Pull & grip | 60 | 3 | Strength retention as above. Resistance‑training recovery is about 48–72 hours, and longer when training to failure. |
| Specific (all sports) | 42 | — | Default **[assumption]** |

Sanity check: a 90‑minute football game at avg HR 160 gives about
180 load points → about 90 into Legs fatigue. With τ = 2.5 days, it takes
about 3 days to fall below the "light" threshold (§5.4). That matches the
roughly 72‑hour recovery window in the research. A typical bouldering
session (FatNorm 1.0) clears Pull & grip in about 50 hours, inside the
48–72 hour strength‑recovery range. A typical leg session in the gym
clears in about 42 hours.

### 5.3 Recovery modifier m(t) from last night

Fatigue clears more slowly after bad sleep or when the body is stressed.
`m` scales the fatigue time constant (m > 1 means slower clearance):

| Signal (last night vs my 7‑day baseline) | Effect on m |
|---|---|
| Sleep < 6 h | +0.20 |
| Sleep ≥ 8 h | −0.10 |
| ln(RMSSD) below 7‑day mean by more than 1 SD | +0.20 |
| ln(RMSSD) above 7‑day mean by more than 1 SD | −0.05 |
| Resting HR ≥ 5 bpm above 7‑day mean | +0.10 |

`m = clamp(1 + Σ effects, 0.85, 1.5)` **[assumption: heuristic weights]**

Why: HRV is widely used as a marker of how the body is adapting to
training stress. HRV‑guided training trains hard when readiness is high and
backs off when it isn't. Sleep loss reduces sport‑specific performance in
athletes. Resting HR alone is a blunt signal: by the time it has risen
3–5 bpm, it may already be late, which is why it gets the smallest weight.

### 5.4 What the app shows

**Fitness index (0–100)** per capacity:
```
FitIndex[c] = 100 × Fit[c](today) / max(Fit[c]) over the last 365 days
```
100 = my best ever on that capacity. The change is shown as % vs 28 days ago.

**Fatigue level** per capacity, in "typical sessions still in the body":
```
FatNorm[c] = Fat[c](today) / ref[c]
ref[c]     = median of D[sport][c] × load over sessions in the last 90 days where D[sport][c] ≥ 0.2
```

| FatNorm | Step (DESIGN.md §3.3) |
|---|---|
| < 0.25 | Fresh |
| 0.25–0.5 | Light |
| 0.5–1.0 | Moderate |
| 1.0–2.0 | Heavy |
| 2.0–3.0 | Very heavy |
| ≥ 3.0 | Overloaded |

**Recovery date** per capacity: the first day `FatNorm < 0.5` (light or
better), solved forward with `m = 1`:
```
days = τ_fat[c] × ln(FatNorm / 0.5)
```

---

## 6. Step 4: sport progression (what each sport draws on)

### 6.1 Draw matrix W: what each sport's performance depends on

| Sport | Specific | Engine | Speed | Legs | Pull & grip |
|---|---|---|---|---|---|
| Running | 0.35 | 0.45 | 0.05 | 0.15 | 0 |
| Football | 0.35 | 0.25 | 0.25 | 0.15 | 0 |
| Tennis | 0.45 | 0.15 | 0.25 | 0.10 | 0.05 |
| Bouldering | 0.45 | 0.05 | 0 | 0.05 | 0.45 |
| Gym (lower lift) | 0.40 | 0 | 0 | 0.60 | 0 |
| Gym (pull lift) | 0.40 | 0 | 0 | 0 | 0.60 |

**Modelled fitness** for sport `s`:
```
Model[s](t) = W[s][Specific] × Spec[s](t)/ref + Σ_c W[s][c] × Fit[c](t)/ref[c]
```
Each term is normalised by its own reference (365‑day max) so units match.

### 6.2 Measured progression metrics

| Sport | Metric | How |
|---|---|---|
| Running | **Pace at reference HR** | Efficiency factor EF = speed (m/min) ÷ avg HR, on steady runs only (≥ 20 min, HR CV < 8%, elevation gain < 15 m/km). Shown as pace at 150 bpm = 1 / (EF × 150). Trend = 28‑day rolling median. |
| Gym | **Modelled only** | No real weights logged and no gym since May 2026, so no measured metric. Epley e1RM (weight × (1 + reps/30)) is kept in code for when weights are logged. |
| Bouldering | **Top grade** | From check‑in, V‑grade as a number. Trend = best of the last 4 sessions. |
| Football, tennis | None | Modelled fitness only, marked as modelled. |

Why these metrics: EF compares output (pace) to input (HR), and a rising
trend means better aerobic fitness. Epley is the most widely used 1RM
estimate and is accurate to within about 5% for sets of 10 reps or fewer
taken close to failure. For bouldering, number of pull‑ups and bent‑arm
hang time are the strongest predictors of climbing performance; top grade
is the practical stand‑in.

### 6.3 Calibration: linking model to measurement

Per sport with a measured metric:
```
Measured[s](t) ≈ a_s + b_s × Model[s](t)       // least squares on all measurement days
```
- Needs ≥ 8 measurements. Report R².
- R² ≥ 0.3 → attribution shown in measured units (s/km, kg).
- R² < 0.3 → attribution shown as modelled % only, with evidence ●○○.

v2 (not in the 3‑hour build): learn personal `W` and `F` values with ridge
regression shrunk toward the priors above.

---

## 7. Step 5: attribution (the boost stack)

Because every fitness store is tracked per source sport (§5.1), the
modelled fitness of sport `s` splits exactly by where it came from:

```
Contribution[s ← k](t) = Σ_c W[s][c] × Fit[c][k](t)/ref[c]
                       + (k == s ? W[s][Specific] × Spec[s](t)/ref : 0)
```

For the chart over a window (default 12 weeks):
```
ΔMeasured[s] from k = b_s × (Contribution[s ← k](end) − Contribution[s ← k](start))
```

Example output: *Running pace @150 bpm improved 9 s/km: running −5,
football −3, tennis −1.* The rounding remainder goes to the sport itself.

The stacked area in the progression chart plots `Contribution[s ← k](t)` for
every `k`, in sport order, with own sport first (DESIGN.md §7.4).

---

## 8. Step 6: learned effects (personal patterns + evidence)

These are the "X before Y" patterns shown in the "what if" drawer. They
are measured from my own history, not from the model.

### 8.1 Short‑term: does X the day before change Y?

For each Y session with a measured metric:
1. **Residual:** metric minus its 28‑day rolling baseline (e.g. EF residual).
2. **Exposed** if a session of sport X ended 6–36 hours before Y started.
3. **Effect** = mean residual (exposed) − mean residual (not exposed),
   converted to display units (s/km at 150 bpm, kg of e1RM).

Pairs computed: every X ∈ {all five sports} → Y ∈ {running, gym, bouldering}.

### 8.2 Evidence strength

| Dots | Rule |
|---|---|
| ●●● Strong | n_exposed ≥ 15, and the 90% bootstrap CI excludes 0 |
| ●●○ Some | n_exposed ≥ 6, and abs(effect) ≥ smallest worthwhile change (0.2 × SD of the baseline) |
| ●○○ Early signal | n_exposed ≥ 3 |
| hidden | n_exposed < 3 |

Effects below the smallest worthwhile change are hidden even with large
n, so the UI doesn't fill up with noise.

### 8.3 Long‑term: do X‑heavy weeks lift Y?

Weekly: X's share of load vs the slope of Y's measured metric over the
following 2 weeks. Pearson r, shown only with ≥ 8 weeks of data, using the
same evidence rules with n = weeks. This is the data check on the model's
transfer priors (§1, §4.1): if football‑heavy weeks don't improve my
running EF, the Football → Engine prior is too generous for me.

---

## 9. Step 7: what if

Inputs: sport, start time, intensity.

| Intensity | RPE | Duration |
|---|---|---|
| Easy | 3 | Median duration for that sport (90 days) |
| Normal | 5 | Median |
| Hard | 7 | Median |

1. Load = RPE × duration × c (§3.3). For HR sports, scale by the ratio of
   that sport's median TRIMP to its median sRPE when known.
2. Insert the session at its start time, then re‑run §4–§5 for the next 7
   days with `m = 1`.
3. Output:
   - Projected fatigue per capacity (dashed outline) and new recovery dates
   - Fitness gain per capacity: `F[sport][c] × load / ref[c]` as %
   - Gain to each other sport via W (e.g. *running +0.4%*)
   - Learned effects (§8) where X = chosen sport, if they pass evidence rules

No verdict and no recommendation, per DESIGN.md.

---

## 10. What is evidence and what is assumption

| Element | Status |
|---|---|
| Fitness–fatigue structure, 42/7‑day defaults | Established (Banister; TrainingPeaks PMC) |
| TRIMPexp formula and k = 1.92 | Established (Banister) |
| sRPE as load, preferred for strength work | Established (Foster 2001; Haddad 2017 review) |
| Central aerobic adaptations transfer, peripheral don't | Established (Tanaka 1994) |
| Football → Engine (strong) | Established for recreational football (Milanović 2015 meta‑analysis) |
| Tennis demands (70–80% HRmax, intermittent) | Established (Fernandez‑Fernandez) |
| Bouldering → finger and pull strength | Supported (Stien 2021; Saeterbakken 2024 review) |
| Heavy strength → running economy | Supported, small effect (Llanos‑Lagos 2024 meta‑analysis) |
| Football fatigue ~72–96 h | Supported (Doeven 2018 review; Wiig 2019) |
| Exact F, D, W numbers | **Assumption**, informed by the above, checked by §8.3 |
| Capacity‑specific τ values | **Partly assumption**, anchored to recovery/detraining research |
| Sleep/HRV modifier weights | **Assumption**, direction supported (Plews; Fullagar 2015) |
| Interference rule | **Assumption, weak/mixed evidence** (Wilson 2012 vs 2022 meta‑analysis) |

The demo should say this plainly when asked: research sets the structure
and starting values; my own data checks them.

---

## 11. All parameters in one place

```json
{
  "trimp": { "k": 1.92, "a": 0.64 },
  "srpe_to_trimp_c": 0.33,
  "other": {
    "F": { "endurance": { "engine": 0.70, "legs": 0.30 }, "court": { "engine": 0.45, "speed": 0.30, "legs": 0.25 } },
    "D": { "endurance": { "engine": 0.40, "legs": 0.60 }, "court": { "engine": 0.25, "speed": 0.25, "legs": 0.50 } }
  },
  "dedupe_min_overlap": 0.5,
  "gym_weights_reliable": false,
  "default_rpe": { "gym": 6, "bouldering": 6, "football": 6, "tennis": 5, "running": 5 },
  "capacities": ["engine", "speed", "legs", "pull"],
  "tau_fit": { "engine": 42, "speed": 30, "legs": 60, "pull": 60, "specific": 42 },
  "tau_fat": { "engine": 5, "speed": 2, "legs": 2.5, "pull": 3 },
  "F": {
    "running":    { "engine": 0.50, "speed": 0.05, "legs": 0.10, "pull": 0.00, "specific": 0.35 },
    "football":   { "engine": 0.35, "speed": 0.20, "legs": 0.10, "pull": 0.00, "specific": 0.35 },
    "tennis":     { "engine": 0.25, "speed": 0.20, "legs": 0.05, "pull": 0.05, "specific": 0.45 },
    "bouldering": { "engine": 0.05, "speed": 0.00, "legs": 0.00, "pull": 0.50, "specific": 0.45 },
    "gym":        { "engine": 0.00, "speed": 0.00, "split_from_sets": 0.60, "specific": 0.40 }
  },
  "D": {
    "running":    { "engine": 0.40, "speed": 0.05, "legs": 0.55, "pull": 0.00 },
    "football":   { "engine": 0.25, "speed": 0.25, "legs": 0.50, "pull": 0.00 },
    "tennis":     { "engine": 0.25, "speed": 0.25, "legs": 0.35, "pull": 0.15 },
    "bouldering": { "engine": 0.05, "speed": 0.00, "legs": 0.05, "pull": 0.90 },
    "gym":        { "engine": 0.05, "speed": 0.00, "split_from_sets": 0.95 }
  },
  "W": {
    "running":    { "specific": 0.35, "engine": 0.45, "speed": 0.05, "legs": 0.15, "pull": 0.00 },
    "football":   { "specific": 0.35, "engine": 0.25, "speed": 0.25, "legs": 0.15, "pull": 0.00 },
    "tennis":     { "specific": 0.45, "engine": 0.15, "speed": 0.25, "legs": 0.10, "pull": 0.05 },
    "bouldering": { "specific": 0.45, "engine": 0.05, "speed": 0.00, "legs": 0.05, "pull": 0.45 },
    "gym_lower":  { "specific": 0.40, "legs": 0.60 },
    "gym_pull":   { "specific": 0.40, "pull": 0.60 }
  },
  "heavy_set_threshold": 0.80,
  "light_set_weight": 0.5,
  "interference": { "window_h": 6, "legs_fitness_multiplier": 0.85 },
  "recovery_modifier": {
    "sleep_short_h": 6, "sleep_short": 0.20,
    "sleep_long_h": 8, "sleep_long": -0.10,
    "hrv_low_sd": 1, "hrv_low": 0.20,
    "hrv_high_sd": 1, "hrv_high": -0.05,
    "rhr_high_bpm": 5, "rhr_high": 0.10,
    "clamp": [0.85, 1.5]
  },
  "fatigue_steps": [0.25, 0.5, 1.0, 2.0, 3.0],
  "recovered_threshold": 0.5,
  "progression": {
    "run_ref_hr": 150,
    "steady_run": { "min_minutes": 20, "max_hr_cv": 0.08, "max_gain_m_per_km": 15 },
    "e1rm_max_reps": 10,
    "calibration_min_points": 8,
    "calibration_min_r2": 0.3
  },
  "learned_effects": {
    "window_h": [6, 36],
    "baseline_days": 28,
    "swc_sd": 0.2,
    "strong_n": 15, "some_n": 6, "weak_n": 3,
    "bootstrap_ci": 0.90,
    "longterm_min_weeks": 8
  }
}
```

---

## 12. Output written to data.json (shape)

```json
{
  "synced": "2026-11-22",
  "capacities": {
    "engine": { "fitIndex": 78, "fitChange28d": 0.06, "fatNorm": 0.6, "fatStep": 2, "recoveredOn": "2026-11-23",
                "fitBySport": { "running": 0.52, "football": 0.31, "tennis": 0.12, "bouldering": 0.02, "gym": 0.03 } }
  },
  "sports": {
    "running": {
      "metric": { "name": "pace_at_150", "unit": "s/km", "series": [["2026-09-01", 312], ["…"]] },
      "contributions": { "running": [["2026-09-01", 0.41]], "football": [["…"]] },
      "calibration": { "r2": 0.46, "b": -48.2 },
      "delta12w": { "total": -9, "bySport": { "running": -5, "football": -3, "tennis": -1 } }
    }
  },
  "effects": [
    { "from": "football", "to": "running", "window": "next_day", "effect": 10, "unit": "s/km", "n": 9, "evidence": 2 }
  ],
  "weeks": [ { "start": "2026-11-16", "loadBySport": { "running": 210, "football": 180 } } ],
  "params": "…copy of §11 for the what‑if engine…"
}
```

---

## Sources

- Banister impulse–response model, parameters and explained variance: [JSSM 17(3):402](https://jssm.org/17-3-402.p_d_f)
- 42/7‑day defaults and PMC time‑constant guidance: [intervals.icu forum, quoting TrainingPeaks](https://forum.intervals.icu/t/change-fatigue-atl-and-fitness-ctl-factors/300/5), [Roadman Cycling](https://roadmancycling.com/tools/training-load)
- TRIMPexp formula and constants: [Better Workouts](https://betterworkouts.helpscoutdocs.com/article/12-what-is-training-load), [arXiv 2508.11613](https://arxiv.org/html/2508.11613v2)
- Session‑RPE: [Haddad et al. 2017, Front Neurosci](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5673663/), [Foster et al. 2001](https://paulogentil.com/pdf/A%20New%20Approach%20to%20Monitoring%20Exercise%20Training.pdf), [sRPE vs HR in strength sessions (rowers)](https://link.springer.com/10.1186/s13102-025-01247-7)
- Recreational football and VO₂max: [Milanović et al. 2015 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/26210229/), [Krustrup et al. 2010 review](https://test01.ku.dk/:obvius/pureproxy/3974268/en/publications/recreational-football-as-a-health-promoting-activity-a-topical-re), [Krustrup et al. 2010 muscle adaptations](https://researchprofiles.ku.dk/da/publications/muscle-adaptations-and-performance-enhancements-of-soccer-trainin/)
- Tennis demands: [Fernandez‑Fernandez et al. (PMC4657421)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4657421)
- Bouldering demands and strength: [Bevins & Ashby (White & Olsen 2010 data)](https://pureportal.coventry.ac.uk/en/publications/finger-flexor-strength-and-the-effect-of-acute-handgrip-fatigue-i/), [Stien et al. 2021](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.661167/epub), [Saeterbakken et al. 2024](https://link.springer.com/content/pdf/10.1186/s40798-024-00677-w.pdf)
- Strength training and running economy: [Llanos‑Lagos et al. 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11052887/)
- Concurrent training: [Wilson et al. 2012](https://www.academia.edu/72153118/Concurrent_Training), [2022 meta‑analysis, Sports Med](https://link.springer.com/article/10.1007/s40279-021-01587-7)
- Football recovery: [Doeven et al. 2018, BMJ Open SEM](https://bmjopensem.bmj.com/content/4/1/e000264), [Science for Sport summary](https://www.scienceforsport.com/how-long-does-it-take-to-fully-recover-after-a-competitive-match/), [Wiig et al. 2019](https://frontiersin.org/article/10.3389/fphys.2019.00689/full)
- Resistance training recovery: [Morán‑Navarro et al. 2017](https://pubmed.ncbi.nlm.nih.gov/28965198/), [Korak et al.](https://core.ac.uk/download/43646094.pdf)
- Detraining: [Firstbeat summary of Mujika & Padilla](https://firstbeat.com/en/blog/how-long-does-it-take-to-lose-your-fitness)
- Cross‑training transfer: [JSSM 15:41](https://www.jssm.org/jssm-15-41.xml-Fulltext)
- HRV and readiness: [Athletica (Plews)](https://athletica.ai/?p=251048), [TrainingPeaks on HRV and RHR](https://trainingpeaks.com/blog/using-heart-rate-variability-to-schedule-the-intensity-of-your-training)
- Sleep and performance: [Fullagar et al. 2015 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/25315456/)
- Efficiency factor: [TrainingPeaks help](https://help.trainingpeaks.com/hc/en-us/articles/204071724-Aerobic-Decoupling-and-Efficiency-Factor)
- Epley 1RM: [Planfit](https://planfit.ai/en/tools/one-rep-max-calculator), [Rep Fitness](https://repfitness.com/blogs/training/one-rep-max-new-research)
- Data types: [Google Health API data types](https://developers.google.com/health/data-types), [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview), [Garmin FIT set messages for strength](https://the5krunner.com/2026/03/24/garmin-connect-plus-strength-apps/)
