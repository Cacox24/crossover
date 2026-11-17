# Crossover: design system

This file is the source of truth for how Crossover looks and behaves. Anyone
building UI for this project, human or AI, follows it. If something isn't
covered here, choose the quieter option and add the decision to this file.

---

## 1. What we're designing

**Subject:** a personal training tool for one amateur athlete who plays five
sports (running, football, tennis, bouldering, gym) whenever friends are free,
tracked across two wearables (Garmin and Fitbit).

**Audience:** me first. For the demo, Palantir product designers clicking
through my real data.

**Primary job:** show how each sport affects the others, in two directions:
- **Cost:** short‑term fatigue on shared capacities (fades in days)
- **Boost:** long‑term fitness that carries over into other sports (fades in weeks)

The app never tells me what to do. It shows load, consequences and evidence.
I decide.

---

## 2. Principles

1. **Black and white, plus sport colors.** The only color in the entire app
   is the five sport colors. Everything else (fatigue, fitness, UI, text) is
   black, white and grey.
2. **Numbers, not sentences.** No explanatory text, no descriptions, no
   helper copy, no onboarding. Labels are one or two words. If a screen
   needs a sentence to be understood, redesign the screen.
3. **Show, don't decide.** No verdicts, scores or recommendations.
4. **Two effects, always together.** Wherever a session appears, its cost
   and its boost are both visible.
5. **Evidence is visible.** Every learned effect shows its sample size and
   strength as a glyph, not a sentence.
6. **Quiet frame, one loud moment.** The boost‑stacked progression chart
   (§7.4) is the only bold, animated element.
7. **The model stays in the background.** How sports feed capacities (§7.1)
   is the logic behind every number, not something drawn on screen.

---

## 3. Color

### 3.1 Neutrals

Pure greys with no tint.

| Token | Hex | Use |
|---|---|---|
| `--white` | `#FFFFFF` | Panels, chart surfaces |
| `--page` | `#F4F4F4` | App background |
| `--black` | `#000000` | Primary text, fitness marks, key numbers |
| `--grey-1` | `#555555` | Secondary text, units |
| `--grey-2` | `#8C8C8C` | Muted labels, axis ticks |
| `--grey-3` | `#BDBDBD` | Axes, baselines, strong borders |
| `--grey-4` | `#E2E2E2` | Hairlines, gridlines, panel borders |

### 3.2 Sports (the only color)

Fixed order, which also sets stacking order. Never cycle, never reassign,
never use for anything except "this came from that sport".

| # | Sport | Token | Hex | Glyph (Phosphor) |
|---|---|---|---|---|
| 1 | Running | `--sport-run` | `#2A78D6` | `Sneaker` |
| 2 | Football | `--sport-football` | `#1BAF7A` | `SoccerBall` |
| 3 | Tennis | `--sport-tennis` | `#EDA100` | `TennisBall` |
| 4 | Bouldering | `--sport-boulder` | `#4A3AA7` | `Mountains` |
| 5 | Gym | `--sport-gym` | `#E87BA4` | `Barbell` |

Validated with the dataviz palette checker on white, all‑pairs:
- Pass: lightness band, chroma floor, normal‑vision separation (worst ΔE 16.3)
- Warn: colour‑blind separation, worst ΔE 6.1 (gym vs football). Because of
  this, a sport color never appears without its glyph or name.
- Warn: football, tennis and gym are below 3:1 contrast on white. Never use
  sport colors for text. Sport names are always black.

### 3.2a Other

Activities that aren't one of the five sports (e‑bike, cycling, hiking,
basketball, padel, jump rope) are grouped as **Other**. They are grey, not a
color: fill `--grey-2` (`#8C8C8C`), glyph Phosphor `DotsThreeCircle`. Other
is never a sport chip and never has its own progression. It appears only as
the last layer in stacks (progression contributions, weekly load bars) and
in the session strip.

### 3.3 Fatigue (greyscale + texture)

Fatigue is a grey ramp, light to dark, always drawn with a 45° hatch so it
can never be confused with solid black fitness.

| Step | Fill | Meaning |
|---|---|---|
| `--fatigue-0` | `#F4F4F4`, no hatch | Fresh |
| `--fatigue-1` | `#E2E2E2` + hatch | Light |
| `--fatigue-2` | `#BDBDBD` + hatch | Moderate |
| `--fatigue-3` | `#8C8C8C` + hatch | Heavy |
| `--fatigue-4` | `#555555` + hatch | Very heavy |
| `--fatigue-5` | `#222222` + hatch | Overloaded |

Hatch: 1px lines, 4px spacing, 45°, in the next darker step (white on steps 4 and 5).

### 3.4 Fitness (boost)

Total fitness is solid `--black`. When split by source, each segment takes
its sport color in sport order, with 2px white gaps between segments.

### 3.5 Projection ("what if")

A projected change is drawn as a 1.5px dashed `--black` outline extending
the current bar, with no fill.

### 3.6 Evidence

Three dots in `--black`, filled or hollow, followed by the number of sessions.

| Strength | Display |
|---|---|
| Strong | `●●● 24` |
| Some | `●●○ 9` |
| Weak | `●○○ 4` |

### 3.7 Dark mode

Out of scope for v1.

---

## 4. Typography

One family: **Archivo** (Google Fonts, variable, `wdth` 62–125, `wght`
100–900). Wide for titles, normal for labels, narrow for numbers.

| Role | Size / line | Weight | Width | Notes |
|---|---|---|---|---|
| Title | 40 / 44 | 700 | 125 | One per screen. Tracking −0.02em. |
| Heading | 20 / 26 | 650 | 112 | Panel titles, one or two words |
| Label | 14 / 20 | 500 | 100 | Names, controls |
| Small | 12 / 16 | 450 | 100 | Units, axis labels, evidence counts |
| Figure L | 56 / 56 | 600 | 87 | Hero numbers. `tabular-nums`. |
| Figure M | 24 / 28 | 600 | 87 | Panel numbers. `tabular-nums`. |
| Figure S | 14 / 20 | 550 | 87 | Tables, tooltips. `tabular-nums`. |

Rules:
- Sentence case. No all‑caps, no tracked‑out labels.
- No monospace. Numbers use Archivo narrow with tabular figures.
- Units small and in `--grey-1`: **4:52** /km.
- Changes as signed numbers with arrows: ↑ 6%, ↓ 10 s/km.

---

## 5. Space, shape and depth

- **Base unit 4px.** Scale: 4, 8, 12, 16, 24, 32, 48, 64.
- **Radius by hierarchy:**
  - Panels: 12px
  - Controls: 8px
  - Data marks: 4px on the value end only, square at the baseline
- **Depth:** panels are white on `--page` with a 1px `--grey-4` border. A
  shadow only on floating layers (tooltip, drawer):
  `0 8px 24px rgba(0,0,0,0.12)`.
- No gradients.

---

## 6. Layout

Desktop first (1280–1440 wide); usable down to 390px.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Crossover          Now   Progression   Mix          [ What if ]      │  top bar, 64px
├──────────────────────────────────────────────────────────────────────┤
│                                                        Synced 22 Nov │  12px, grey-2
│  Title                                                               │
│                                                                      │
│  ┌──────────── 8 cols ────────────┐  ┌──────── 4 cols ────────┐      │
│  │ Primary visual                 │  │ Key numbers            │      │
│  │                                │  │ (figures + evidence)   │      │
│  └────────────────────────────────┘  └────────────────────────┘      │
│  ┌──────────────────────── 12 cols ─────────────────────────────┐    │
│  │ Sessions / table view                                        │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

- 12‑column grid, 24px gutters, 1200px max width, left‑aligned.
- Visual left, key numbers right. Below 900px they stack: visual first.
- One primary visual per screen.
- No subtitle or description under the title.

### Screens

| Screen | Title | Primary visual | Right column |
|---|---|---|---|
| Now | Now | Capacity rows + body map | Fitness and fatigue per capacity |
| Progression | Progression | Boost‑stacked chart, one sport at a time | Change, split by source sport |
| Mix | Mix | Weekly load by sport (§7.8) | Share of load per sport |
| What if (drawer) | What if | Projected capacity rows | Recovery date per capacity, learned effects |

"Today" is fixed to the snapshot date in the demo.

---

## 7. Components

### 7.1 Transfer model (logic only, never drawn)

Every session feeds shared capacities (Engine, Speed, Legs, Pull & grip)
according to a sport → capacity transfer table. Each contribution adds
fitness (slow decay) and fatigue (fast decay). Progression in any sport is
its own sessions plus the boosts arriving through shared capacities.

This model produces every number in the app: capacity rows, fatigue, the
contribution stack in progression, "what if" projections and learned
effects. It is not shown as a diagram. It only appears as the result:
colored contributions inside a sport's progression (§7.4).

### 7.2 Capacity row

Order: Engine, Speed, Legs, Pull & grip.

```
Engine       ████████████████████░░░░   78  ↑ 6%
             ▨▨▨▨▨▨░░░░░░░░░░░░░░░░░░
```

- Top bar: fitness, solid black (or split by sport, §3.4), with the number
  and change on the right.
- Bottom bar: fatigue in the matching grey + hatch step (§3.3), with no number.
  Length is FatNorm ÷ 3, capped, so a full bar means overloaded.
- Never merged into a single score.

### 7.3 Body map

Front and back silhouettes in flat regions with a 1px `--grey-3` outline.
Each region fills with its fatigue step (§3.3). Regions map to capacities:
legs and hips for Legs; forearms, shoulders and upper back for Pull & grip;
chest and core for Engine and Speed. No labels on the drawing; region names
appear on hover.

P0 (front only) uses one region group per capacity: chest = Engine, core =
Speed, shoulders and arms = Pull & grip, hips and legs = Legs. Hovering a
region highlights its capacity row, and the reverse.

### 7.4 Boost‑stacked progression chart

- One sport at a time, switched with five glyph chips above the chart.
- X: weeks. Y: the sport's metric (running: pace at fixed heart rate; gym:
  estimated 1‑rep max; bouldering: top grade).
- A 2px black line for the measured metric.
- Under it, a stacked area of estimated contributions in sport colors, own
  sport first.
- Other sports' sessions shown as 8px glyph markers along the x‑axis.
- One y‑axis only.
- Load animation (the one loud moment): the black line draws first, then the
  contribution layers fill in from the bottom, staggered by sport order,
  600ms total. Switching sport replays it. Instant under
  `prefers-reduced-motion`.

### 7.5 What if drawer

Right side, 420px wide.

Inputs: sport (five glyph chips), when (`Tonight` · `Tomorrow` · time
picker), intensity (`Easy` · `Normal` · `Hard`).

Output, top to bottom:
1. Capacity rows with the projected fatigue as a dashed outline (§3.5),
   plus a recovery date per capacity (`Legs · Thu`).
2. Fitness change per capacity (`Engine +0.4%`).
3. Learned effects, one line each: glyph → glyph, number, evidence.
   `[football] → [run]  +10 s/km  ●●○ 9`

No recommendation. The only action is `Close`.

### 7.6 Session chip

`[glyph] 90 min · Sun 15 Nov`, with the glyph in the sport color and the
text in black. The device source (Garmin or Fitbit) appears only in the
table view.

### 7.7 Post‑session check‑in

A bottom sheet with no instructions:
- Effort: 1–10 number row, targets 44px or larger
- Soreness: tap regions on the body map
- Top grade (bouldering only)
- Buttons: `Save` / `Skip`

### 7.8 Weekly load by sport (Mix)

- One bar per week (last 12 weeks), stacked by sport in sport order with
  2px white gaps. Bar height is total load.
- Right column: share of load per sport for the selected period
  (`[glyph] Football 31%`), sorted in sport order, not by size.
- Hover a week: tooltip with each sport's load and session count.

---

## 8. Data visualization rules

- Lines 2px. Markers 8px or larger. Bars have a 4px radius on the value
  end and are square at the baseline.
- 2px white gap between stacked or adjacent fills.
- Gridlines are `--grey-4` hairlines, horizontal only. The axis is `--grey-3`.
- Sport identity always has a glyph or name next to the color.
- Hover on everything: crosshair + tooltip on lines and areas, per‑mark
  tooltip on bars and markers. Tooltips contain numbers only.
- Every chart has a table toggle (a table icon, no label).
- Never two y‑axes.
- All text in black or grey, never in a sport color.

---

## 9. Text rules

- No explanatory text anywhere: no descriptions, tooltips with sentences,
  empty‑state paragraphs or onboarding.
- Labels are nouns, one or two words: `Engine`, `Legs`, `Fatigue`, `Close`.
- Numbers carry the meaning: signed, with units, with arrows.
- Empty state: a single grey dash `—`.
- Error: an icon plus the last sync date (`⚠ 22 Nov`).
- Exact wording is still to be decided.

---

## 10. Accessibility floor

- Text contrast is 4.5:1 or higher (black and `--grey-1` on white and `--page`).
- Visible keyboard focus: 2px black outline with a 2px offset.
- Respect `prefers-reduced-motion`.
- Every chart has a table view.
- Sport identity is never color alone; fatigue is never grey alone (hatch).
- Icon‑only controls have an `aria-label`.

---

## 11. Implementation tokens

```css
:root {
  /* neutrals */
  --white: #FFFFFF;
  --page: #F4F4F4;
  --black: #000000;
  --grey-1: #555555;
  --grey-2: #8C8C8C;
  --grey-3: #BDBDBD;
  --grey-4: #E2E2E2;

  /* sports: the only color, fixed order */
  --sport-run: #2A78D6;
  --sport-football: #1BAF7A;
  --sport-tennis: #EDA100;
  --sport-boulder: #4A3AA7;
  --sport-gym: #E87BA4;

  /* fatigue (always with hatch from step 1) */
  --fatigue-0: #F4F4F4;
  --fatigue-1: #E2E2E2;
  --fatigue-2: #BDBDBD;
  --fatigue-3: #8C8C8C;
  --fatigue-4: #555555;
  --fatigue-5: #222222;

  /* type */
  --font: "Archivo", system-ui, sans-serif;

  /* space */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px;
  --s5: 24px; --s6: 32px; --s7: 48px; --s8: 64px;

  /* shape */
  --r-panel: 12px;
  --r-control: 8px;
  --r-mark: 4px;
  --shadow-float: 0 8px 24px rgba(0, 0, 0, 0.12);
}
```
