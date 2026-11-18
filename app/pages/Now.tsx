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

  // One meaning of fresh everywhere: fatigue below the recovered threshold.
  const fatAt = (c: Capacity, off: number) => d.capacities[c].fatNorm * Math.exp(-off / p.tau_fat[c]);
  const daysToFresh = (c: Capacity) => { const f = d.capacities[c].fatNorm; return f < thr ? 0 : Math.max(1, Math.ceil(p.tau_fat[c] * Math.log(f / thr))); };
  const tired = (c: Capacity, off: number) => Math.max(0, Math.min(1, (fatAt(c, off) - thr) / (MAX - thr)));
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
    const at = (off: number) => 1 - CAPS.reduce((a, c) => a + w[c] * tired(c, off), 0) / sum;
    const days = Array.from({ length: DAYS }, (_, i) => at(i));
    let next = 0;
    while (at(next) < READY && next < 60) next++;
    const mine = d.sessions.filter((x) => x.sport === s).sort((a, b) => a.start.localeCompare(b.start));
    const last = mine.at(-1);
    return { s, days, next, last };
  }), [d]);

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

      <section className="card nrd" aria-label="Readiness" onMouseLeave={() => setHlSport(null)}>
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
              onMouseEnter={() => setHlSport(r.s)} onFocus={() => setHlSport(r.s)} onBlur={() => setHlSport(null)}>
              <span className="nrd-sport"><SportGlyph sport={r.s} size={22} />{SPORT_META[r.s].name}</span>
              <span className="nrd-pct">{Math.round(100 * now)}<small>%</small></span>
              <span className="nrd-last">{lastText(r)}{r.last && <small>{Math.round(r.last.durationMin)} min</small>}</span>
              <span className="nrd-days">
                {r.days.map((v, j) => (
                  <i key={j} className={`${v >= READY ? "is-ready" : ""} ${j === r.next ? "is-next" : ""}`}
                    style={{ ["--v" as string]: v.toFixed(3), animationDelay: `${250 + i * 60 + j * 30}ms` }} title={`${dayName(j)} ${Math.round(100 * v)}%`} />
                ))}
              </span>
              <span className="nrd-next">
                <span className="nrd-sug">{dayName(r.next)}</span>
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

