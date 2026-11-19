// Now: what can my body do today?
// Left: readiness per sport (crossover: each sport reads the capacities it draws on), last session,
// the next 7 days and the suggested next day. Right: sleep, what's tired, active load.
import { useEffect, useMemo, useState } from "react";
import { MoonStars } from "@phosphor-icons/react";
import type { Capacity, Sport } from "../../engine/types";
import { addDays } from "../../engine/time";
import { useData } from "../data";
import { CAPACITY_NAME, SPORT_ORDER, SPORT_META } from "../sports";
import { weekday } from "../format";
import { FATIGUE_NAME } from "../components/fatigue";
import { DarkPage, type DarkTheme } from "../components/DarkPage";
import { SportGlyph } from "../components/ui";
import { fatigueDays, planFull, raceForecast, mmss } from "../goals/plan";
import { useWhatIf, merge, MAX_YES } from "../whatif/store";
import "./progression-page.css";
import "./now.css";

const MONO: DarkTheme = { page: "#050505", mesh: ["#5E5E5E", "#2C2C2C", "#8A8A8A", "#161616"] };
const CAPS: Capacity[] = ["engine", "speed", "legs", "pull"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (day: string) => `${Number(day.slice(8))} ${MO[Number(day.slice(5, 7)) - 1]}`;
const wdm = (day: string) => `${weekday(day)} ${dm(day)}`;
const MAX = 3; // fatNorm at which a capacity counts as fully tired
const USES = 0.1;
const READY = 0.9; // sport readiness that counts as fresh // a sport "uses" a capacity when its demand weight is at least this

type P = { fatigue_steps: number[]; recovered_threshold: number; tau_fat: Record<Capacity, number>; W: Record<string, Record<string, number>> };

export function NowPage() {
  const d = useData();
  const p = d.params as unknown as P;
  const thr = p.recovered_threshold;
  const [hlCap, setHlCap] = useState<Capacity | null>(null);
  const [hlSport, setHlSport] = useState<Sport | null>(null);
  const k = 0;

  // What if I say yes: the sessions you're considering (plus the one under the mouse) are added to the fatigue model.
  const wi = useWhatIf();
  // "was" compares against your current plan; the effect shown is what trying (and hovering) adds to it.
  const active = useMemo(() => merge(wi.planned, wi.trying, wi.preview), [wi.planned, wi.trying, wi.preview]);
  const considering = useMemo(() => merge(wi.trying, wi.preview), [wi.trying, wi.preview]);
  const F = useMemo(() => fatigueDays(d, active, 45), [d, active]);
  const F0 = useMemo(() => fatigueDays(d, wi.planned, 45), [d, wi.planned]);

  // One meaning of fresh everywhere: fatigue below the recovered threshold.
  const fatAt = (c: Capacity, off: number, S = F) => S[Math.min(off, S.length - 1)][c];
  const daysToFresh = (c: Capacity, S = F) => { let last = -1; S.forEach((f, i) => { if (f[c] >= thr) last = i; }); return last + 1; };
  const tired = (c: Capacity, off: number, S = F) => Math.max(0, Math.min(1, (fatAt(c, off, S) - thr) / (MAX - thr)));
  const word = (c: Capacity, off: number) => { const f = fatAt(c, off); return f < thr ? "Fresh" : FATIGUE_NAME[p.fatigue_steps.filter((t) => f >= t).length]; };

  const demand = (s: Sport): Record<Capacity, number> => {
    const w = s === "gym"
      ? { legs: (p.W.gym_lower?.legs ?? 0) / 2, pull: (p.W.gym_pull?.pull ?? 0) / 2 }
      : p.W[s] ?? {};
    return Object.fromEntries(CAPS.map((c) => [c, (w as Record<string, number>)[c] ?? 0])) as Record<Capacity, number>;
  };
  const uses = (s: Sport) => CAPS.filter((c) => demand(s)[c] >= USES);




  const night = useMemo(() => {
    const ns = d.nights ?? [];
    const last = ns.at(-1);
    const prev = ns.slice(-31, -1);
    const avg = (f: (n: (typeof ns)[number]) => number | undefined) => {
      const xs = prev.map(f).filter((x): x is number => x != null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    if (!last) return null;
    return {
      date: last.date,
      rows: [
        { key: "sleep", label: "Slept", value: last.sleepH, unit: "h", digits: 1, avg: avg((n) => n.sleepH) },
        { key: "hrv", label: "HRV", value: last.rmssd, unit: "ms", digits: 0, avg: avg((n) => n.rmssd) },
        { key: "rhr", label: "Resting HR", value: last.rhr, unit: "bpm", digits: 0, avg: avg((n) => n.rhr) },
      ],
    };
  }, [d]);

  const dayName = (off: number) => off === 0 ? "Today" : off === 1 ? "Tomorrow" : wdm(addDays(d.synced, off));
  const load7 = d.sessions.filter((s) => s.day > addDays(d.synced, -7) && s.day <= d.synced && s.sport !== "other").reduce((a, s) => a + s.load, 0);
  const DAYS = 7;

  // Per sport: readiness for each of the next 7 days, last session, and the usual start time.
  const rows = useMemo(() => SPORT_ORDER.map((s) => {
    const w = demand(s);
    const sum = CAPS.reduce((a, c) => a + w[c], 0) || 1;
    const at = (off: number, S = F) => 1 - CAPS.reduce((a, c) => a + w[c] * tired(c, off, S), 0) / sum;
    const days = Array.from({ length: DAYS }, (_, i) => at(i));
    // Next good day for this sport, skipping days that already hold a different "yes".
    const busy = (off: number) => active.some((y) => y.day === addDays(d.synced, off) && y.sport !== s);
    const firstReady = (S: typeof F, skip: (o: number) => boolean) => { let n = 0; while ((at(n, S) < READY || skip(n)) && n < 40) n++; return n; };
    const next = firstReady(F, busy);
    const busyPlanned = (off: number) => wi.planned.some((y) => y.day === addDays(d.synced, off) && y.sport !== s);
    const was = firstReady(F0, busyPlanned);
    const mine = d.sessions.filter((x) => x.sport === s).sort((a, b) => a.start.localeCompare(b.start));
    const last = mine.at(-1);
    return { s, days, next, was, last };
  }), [d, F, F0, active, wi.planned]);

  // The one-line summary: what you're saying yes to, what it moves, and what it does to race day.
  const race = useMemo(() => {
    const now = raceForecast(d, planFull(d, 10, active).raceReady);
    const base = raceForecast(d, planFull(d, 10, wi.planned).raceReady);
    return { now, base };
  }, [d, active, wi.planned]);
  const moved = rows.filter((r) => r.next > r.was && !considering.some((y) => y.sport === r.s));
  const at = (list: { day: string; sport: Sport }[], s: Sport, off: number) => list.some((y) => y.sport === s && y.day === addDays(d.synced, off));
  const isYes = (s: Sport, off: number) => at(wi.trying, s, off);
  const isPlanned = (s: Sport, off: number) => at(wi.planned, s, off);
  const isPreview = (s: Sport, off: number) => wi.preview?.sport === s && wi.preview.day === addDays(d.synced, off) && !isYes(s, off) && !isPlanned(s, off);

  const lastText = (r: (typeof rows)[number]) => {
    if (!r.last) return "—";
    const ago = Math.round((Date.parse(d.synced) - Date.parse(r.last.day)) / 864e5);
    const when = ago === 0 ? "Today" : ago === 1 ? "Yesterday" : ago < 14 ? `${ago} days ago` : ago < 60 ? `${Math.round(ago / 7)} weeks ago` : dm(r.last.day);
    return when;
  };

  return (
    <div className="nowx">
      <DarkPage theme={MONO} />
      <h1 className="sr-only">Now</h1>

      <section className={`card nrd ${considering.length ? "has-wi" : ""}`} aria-label="Readiness" onMouseLeave={() => { setHlSport(null); wi.setPreview(null); }}>
        <div className={`nrd-wi ${considering.length ? "is-on" : ""}`} aria-live="polite">
          {considering.length > 0 && (
            <>
              <span className="nrd-wi-what">
                {considering.map((y) => (
                  <span key={y.day} className={`nrd-wi-chip ${wi.preview === y ? "is-preview" : ""}`}><SportGlyph sport={y.sport} size={14} />{SPORT_META[y.sport].name} {weekday(y.day).slice(0, 3)}</span>
                ))}
              </span>
              <span className="nrd-wi-effect">
                {moved.length ? moved.slice(0, 2).map((r) => `${SPORT_META[r.s].name} ready ${dayName(r.next).replace(/ \d+ \w+$/, "")} (was ${dayName(r.was).replace(/ \d+ \w+$/, "")})`).join(", ") : "Nothing else moves"}
                {race.now && <>, race 5K <b>{mmss(race.now.lo)}–{mmss(race.now.hi)}</b>{race.base && Math.round((race.now.mid - race.base.mid) * 60) !== 0 && <> ({Math.round((race.now.mid - race.base.mid) * 60) > 0 ? "+" : "−"}{Math.abs(Math.round((race.now.mid - race.base.mid) * 60))} s)</>}</>}
              </span>
              {wi.trying.length > 0 && (
                <span className="nrd-wi-actions">
                  <button type="button" onClick={wi.undo}>Undo</button>
                  <button type="button" className="is-primary" onClick={wi.addToPlan}>Add to plan</button>
                </span>
              )}
            </>
          )}
        </div>
        <div className="nrd-grid nrd-headrow">
          <span className="t-eyebrow">Readiness</span>
          <span />
          <span className="nrd-h">Last session</span>
          <span className="nrd-days">{Array.from({ length: DAYS }, (_, i) => <span key={i} className={i === 0 ? "is-today" : ""}>{i === 0 ? "Today" : weekday(addDays(d.synced, i)).slice(0, 3)}</span>)}</span>
          <span className="nrd-h nrd-right">Suggested</span>
        </div>
        {rows.map((r, i) => {
          const faded = (hlSport && hlSport !== r.s) || (hlCap && demand(r.s)[hlCap] < USES);
          const now = r.days[0];
          return (
            <div key={r.s} className={`nrd-grid nrd-row ${faded ? "is-faded" : ""}`} tabIndex={0} style={{ animationDelay: `${120 + i * 70}ms` }}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setHlSport(r.s); }} onFocus={() => setHlSport(r.s)} onBlur={() => setHlSport(null)}>
              <span className="nrd-sport"><SportGlyph sport={r.s} size={22} />{SPORT_META[r.s].name}</span>
              <span className="nrd-pct">{Math.round(100 * now)}<small>%</small></span>
              <span className="nrd-last">{lastText(r)}{r.last && <small>{Math.round(r.last.durationMin)} min</small>}</span>
              <span className="nrd-days" onMouseLeave={() => wi.setPreview(null)}>
                {r.days.map((v, j) => {
                  const yes = isYes(r.s, j), pre = isPreview(r.s, j), inPlan = isPlanned(r.s, j);
                  const full = !yes && !inPlan && wi.trying.length >= MAX_YES && !wi.trying.some((y) => y.day === addDays(d.synced, j));
                  return (
                    <button key={j} type="button" className={`nrd-cell ${v >= READY ? "is-ready" : ""} ${j === r.next ? "is-next" : ""} ${yes ? "is-yes" : ""} ${pre ? "is-preview" : ""} ${inPlan ? "is-planned" : ""}`}
                      style={{ ["--v" as string]: v.toFixed(3), animationDelay: `${250 + i * 60 + j * 30}ms` }}
                      aria-pressed={yes || inPlan} disabled={full}
                      aria-label={`${inPlan ? "Take out of plan:" : yes ? "Stop trying:" : "Try saying yes to"} ${SPORT_META[r.s].name} ${dayName(j)}, ${Math.round(100 * v)}% ready`}
                      title={`${inPlan ? "In your plan, click to take it out" : yes ? "Trying, click to remove" : "What if I say yes"}: ${SPORT_META[r.s].name} ${dayName(j)}`}
                      onPointerEnter={(e) => { if (e.pointerType === "mouse") wi.setPreview({ day: addDays(d.synced, j), sport: r.s }); }}
                      onClick={() => { wi.toggle({ day: addDays(d.synced, j), sport: r.s }); wi.setPreview(null); }}>
                      {(yes || pre || inPlan) && <SportGlyph sport={r.s} size={14} />}
                    </button>
                  );
                })}
              </span>
              <span className="nrd-next">
                <span className="nrd-sug">{dayName(r.next)}</span>
                {r.next !== r.was && <small className="nrd-was">was {dayName(r.was).replace(/ \d+ \w+$/, "")}</small>}
              </span>
            </div>
          );
        })}
      </section>

      <div className="now-stack">
        <section className="card nsleep" aria-label="Sleep last night">
          <div className="n-head">
            <span className="t-eyebrow ns-title"><MoonStars size={16} weight="regular" /> Sleep</span>
            <span className="n-muted">{night && night.date !== d.synced ? wdm(night.date) : "Last night"}</span>
          </div>
          <div className="ns-row">
            {night ? night.rows.map((r) => (
              <div key={r.key} className="ns">
                <span className="ns-num">{r.value != null ? r.value.toFixed(r.digits) : "—"}<small>{r.unit}</small></span>
                <span className="ns-label">{r.label}</span>
              </div>
            )) : <span className="n-muted">No sleep data</span>}
          </div>
        </section>

        <section className="nt-grid" aria-label="Tiredness" onMouseLeave={() => setHlCap(null)}>
            {CAPS.map((c, i) => {
              const lit = hlSport ? demand(hlSport)[c] >= USES : hlCap ? hlCap === c : true;
              const fresh = fatAt(c, 0) < thr;
              const days = daysToFresh(c);
              const v = Math.min(1, fatAt(c, 0) / MAX);
              const R = 26, C = 2 * Math.PI * R;
              return (
                <div key={c} className={`card nt ${lit ? "" : "is-faded"} ${fresh ? "is-fresh" : ""}`} tabIndex={0} style={{ animationDelay: `${200 + i * 70}ms` }}
                  onMouseEnter={() => setHlCap(c)} onFocus={() => setHlCap(c)} onBlur={() => setHlCap(null)}
                  title={fresh ? `${CAPACITY_NAME[c]} fresh` : `${CAPACITY_NAME[c]} ${word(c, 0)}, fresh ${dayName(days)}`}>
                  <svg className="nt-ring" viewBox="0 0 64 64" aria-hidden>
                    <circle cx="32" cy="32" r={R} className="nt-ring-bg" />
                    <circle cx="32" cy="32" r={R} className="nt-ring-fg" strokeDasharray={C} style={{ ["--off" as string]: `${C * (1 - v)}`, ["--c" as string]: `${C}` }} />
                    <text x="32" y="32" className="nt-ring-num">{fresh ? "✓" : days}</text>
                    {!fresh && <text x="32" y="45" className="nt-ring-unit">{days === 1 ? "day" : "days"}</text>}
                  </svg>
                  <span className="nt-name">{CAPACITY_NAME[c]}</span>
                  <span className="nt-word">{word(c, 0)}</span>
                </div>
              );
            })}
        </section>

        <section className="card nload" aria-label="Active load">
          <span className="t-eyebrow">Active load</span>
          <span className="nl-num">{Math.round(load7)}</span>
          <span className="n-muted">Last 7 days</span>
        </section>
      </div>
    </div>
  );
}

