// Goals: one goal at a time, like Progression. The page takes the goal's sport colour.
// Hero: where I am against the target, with the line that got me here. Right: next sessions and key numbers.
// Far right: a slim 10-day calendar for every goal (date + icon), the selected goal's days lit.
import { useMemo, useState } from "react";
import { Flag } from "@phosphor-icons/react";
import type { Sport } from "../../engine/types";
import { addDays, dayDiff } from "../../engine/time";
import { useData } from "../data";
import { SPORT_META } from "../sports";
import { weekday, dayMonth, DASH } from "../format";
import { Bars, HBars, type Bar } from "../components/GoalCharts";
import type { DataJson } from "../../engine/index";
import type { ReactNode } from "react";
import { DarkPage } from "../components/DarkPage";
import { LineChart } from "../components/LineChart";
import { SportGlyph } from "../components/ui";
import { GOALS, SESSION, planFull, raceForecast, mmss } from "../goals/plan";
import { useWhatIf } from "../whatif/store";
import { useRatings } from "../goals/ratings";
import { THEME } from "./Progression";
import "./progression-page.css";
import "./goals.css";

const TARGET_5K = 25;

export function GoalsPage() {
  const d = useData();
  const wi = useWhatIf();
  const planned = useMemo(() => planFull(d, 10, wi.planned), [d, wi.planned]);
  const days = planned.days;
  const forecast = useMemo(() => raceForecast(d, planned.raceReady), [d, planned.raceReady]);
  const [sport, setSport] = useState<Sport>(GOALS[0].sport);
  const g = GOALS.find((x) => x.sport === sport)!;
  const T = THEME[sport];
  const race = GOALS[0].date!;
  const rel = (day: string) => { const n = dayDiff(d.synced, day); return n === 0 ? "Today" : n === 1 ? "Tomorrow" : `${weekday(day)} ${dayMonth(day)}`; };
  const pick = (s: Sport) => { setSport(s); setFocus(null); setRateId(null); };

  const [focus, setFocus] = useState<number | string | null>(null);
  const ratings = useRatings(d);
  const [rateId, setRateId] = useState<string | null>(null);
  const rateSession = rateId ? d.sessions.find((s) => s.id === rateId) : undefined;
  const rate = useMemo(() => ({ get: ratings.get, pick: setRateId, selected: rateId }), [ratings.get, rateId]);
  const v = useMemo(() => goalView(d, sport, forecast, rate), [d, sport, forecast, rate]);
  const left = g.date ? dayDiff(d.synced, g.date) : null;
  const mine = days.filter((x) => SESSION[x.kind].sport === sport);
  const hover = v.hover(focus);

  return (
    <div className="prog goalsp" style={{ ["--accent" as string]: T.accent, ["--hero" as string]: T.bg }}>
      <DarkPage theme={T} />
      <h1 className="sr-only">Goals</h1>
      <div className="prog-body">
        <section className="hero" aria-label={g.title}>
          <div className="sport-tabs" role="tablist" aria-label="Goal">
            {GOALS.map((x) => {
              const { Icon, name, color } = SPORT_META[x.sport];
              return (
                <button key={x.sport} role="tab" aria-selected={x.sport === sport} className={`sport-tab ${x.sport === sport ? "is-on" : ""}`}
                  style={{ ["--c" as string]: color }} onClick={() => pick(x.sport)}>
                  <Icon size={17} weight="light" aria-hidden /><span>{name}</span>
                </button>
              );
            })}
          </div>

          <div className="hero-head">
            <div>
              <span className="hero-eyebrow"><SportGlyph sport={sport} size={16} />{g.title}</span>
              <div className="hero-value">
                <span className="hero-num">{hover?.big ?? v.big}</span>
                {(hover?.unit ?? v.unit) && <span className="hero-of">{hover?.unit ?? v.unit}</span>}
              </div>
              <div className="hero-sub"><span className="hero-muted">{hover?.sub ?? v.sub}</span></div>
            </div>
            <div className="hero-side">
              <span className="hero-muted">{v.side.label}</span>
              <span className="hero-side-num">{v.side.value}</span>
              {v.side.note && <span className="hero-muted">{v.side.note}</span>}
            </div>
          </div>

          <div className="chart-wrap g-chart">
            {v.chart(T.accent, setFocus)}
            {rateSession && (
              <div className="g-rate" role="dialog" aria-label="Rate this session" onKeyDown={(e) => e.key === "Escape" && setRateId(null)}>
                <div className="g-rate-head">
                  <span><b>How did you play?</b> {weekday(rateSession.day)} {dayMonth(rateSession.day)}</span>
                  <button type="button" className="g-rate-x" onClick={() => setRateId(null)} aria-label="Close">×</button>
                </div>
                <div className="g-rate-row">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" className={ratings.get(rateSession.id) === n ? "is-on" : ""}
                      onClick={() => { ratings.set(rateSession.id, n); setRateId(null); }}>{n}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="prog-cards">
          <section className="card g-next" aria-label="Next sessions">
            <div className="g-next-head">
              <span className="t-eyebrow">Next sessions</span>
            </div>
            {mine.length ? (
              <ul className="g-next-list">
                {mine.slice(0, 4).map((x, i) => (
                  <li key={x.day} className={planned.yesDays.has(x.day) ? "is-yes" : ""} style={{ animationDelay: `${200 + i * 80}ms` }}>
                    <span className="g-day">{rel(x.day)}</span>
                    <span className="g-what"><b>{SESSION[x.kind].name}</b><small>{planned.yesDays.has(x.day) ? "In your plan" : SESSION[x.kind].detail}</small></span>
                  </li>
                ))}
                {sport === "running" && (
                  <li className="is-race" style={{ animationDelay: `${200 + mine.length * 80}ms` }}>
                    <span className="g-day">{rel(race)}</span>
                    <span className="g-what"><b>5K race</b><small>{g.place}</small></span>
                  </li>
                )}
              </ul>
            ) : <div className="g-none">When friends are free</div>}
          </section>

          <section className="card-side g-tiles" aria-label="Key numbers">
            {[...v.tiles, ...(left != null && sport !== "running" ? [{ label: "Deadline", num: <>{left}<small>days</small></>, sub: dayMonth(g.date!) }] : [])].slice(0, 2).map((t, i) => (
              <div key={t.label} className={`kn ${i === 0 ? "is-accent" : ""}`}><span className="kn-label">{t.label}</span><span className="kn-num">{t.num}</span><span className="kn-sub">{t.sub}</span></div>
            ))}
          </section>
        </div>

        <nav className="card g-strip" aria-label="Next 10 days">
          {days.map((x, i) => {
            const s = SESSION[x.kind];
            const on = s.sport === sport;
            return (
              <button key={x.day} type="button" className={`gs ${on ? "is-on" : ""} ${s.sport ? "" : "is-rest"} ${i === 0 ? "is-today" : ""} ${planned.yesDays.has(x.day) ? "is-yes" : ""}`}
                title={`${rel(x.day)}: ${s.name}${s.detail ? `, ${s.detail}` : ""}`} disabled={!s.sport} onClick={() => s.sport && pick(s.sport)}
                style={{ animationDelay: `${150 + i * 40}ms` }}>
                <span className="gs-date"><small>{weekday(x.day).slice(0, 1)}</small>{Number(x.day.slice(8))}</span>
                <span className="gs-ic">{s.sport ? <SportGlyph sport={s.sport} size={18} /> : <i />}</span>
              </button>
            );
          })}
          <button type="button" className={`gs is-race ${sport === "running" ? "is-on" : ""}`} title={`${rel(race)}: 5K race`} onClick={() => pick("running")}
            style={{ animationDelay: "600ms" }}>
            <span className="gs-date"><small>{weekday(race).slice(0, 1)}</small>{Number(race.slice(8))}</span>
            <span className="gs-ic"><Flag size={16} weight="fill" /></span>
          </button>
        </nav>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// One view per goal. Each shows the thing that goal is about, not what Progression already shows.

type Tile = { label: string; num: ReactNode; sub: string };
type HoverText = { big: ReactNode; unit?: string; sub: string } | null;
interface View {
  big: ReactNode; unit?: string; sub: string;
  side: { label: string; value: ReactNode; note?: string };
  chart: (accent: string, onFocus: (f: number | string | null) => void) => ReactNode;
  hover: (f: number | string | null) => HoverText;
  tiles: Tile[];
}
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7"];
const REGIONS: [string, string][] = [["chest", "Chest"], ["back", "Back"], ["shoulders", "Shoulders"], ["arms", "Arms"], ["legs", "Legs"], ["core", "Core"]];

type Rate = { get: (id: string) => number | undefined; pick: (id: string | null) => void; selected: string | null };
function goalView(d: DataJson, sport: Sport, forecast: { lo: number; hi: number } | null, rate: Rate): View {
  const own = d.sessions.filter((s) => s.sport === sport).sort((a, b) => a.day.localeCompare(b.day));
  const empty = (msg: string) => () => <div className="g-empty">{msg}</div>;

  if (sport === "running") {
    const runs = own.filter((s) => s.km && s.km >= 3 && s.km <= 12 && dayDiff(s.day, d.synced) <= 182);
    const est = runs.map((s) => s.durationMin * Math.pow(5 / s.km!, 1.06));
    const vals = runs.map((s, i) => 60 - Math.min(...est.filter((_, j) => j <= i && dayDiff(runs[j].day, s.day) <= 42)));
    const now = vals.length ? 60 - vals.at(-1)! : null;
    const race = GOALS[0].date!;
    return {
      big: now != null ? mmss(now) : DASH, sub: "Estimated 5K now",
      side: { label: "Target", value: "25:00", note: now != null ? `${mmss(now - TARGET_5K)} to go` : undefined },
      chart: (accent, on) => vals.length > 1
        ? <LineChart days={runs.map((s) => s.day)} values={vals} accent={accent} onScrub={on} animKey="goal-running" />
        : empty("Not enough runs yet")(),
      hover: (f) => typeof f === "number" ? { big: mmss(60 - vals[f]), sub: `Best estimate on ${dayMonth(runs[f].day)}` } : null,
      tiles: [
        { label: "Pace needed", num: <>5:00<small>/km</small></>, sub: now != null ? `Now ${mmss(now / 5)}/km` : DASH },
        { label: "Race-day forecast", num: forecast ? <>{mmss(forecast.lo)}<small>–{mmss(forecast.hi)}</small></> : DASH, sub: `In ${dayDiff(d.synced, race)} days, with this plan` },
      ],
    };
  }

  if (sport === "bouldering") {
    const log = Object.entries(d.climbs ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const bars: Bar[] = log.map(([day, g]) => ({
      key: day, label: `${Object.values(g).reduce((a, b) => a + b, 0)}`, value: Object.values(g).reduce((a, b) => a + b, 0),
      parts: GRADES.filter((x) => g[x]).map((x) => ({ key: x, value: g[x] })),
    }));
    const sends = (min: number) => log.reduce((a, [, g]) => a + GRADES.slice(min).reduce((n, x) => n + (g[x] ?? 0), 0), 0);
    const hardest = log.length ? GRADES.filter((x) => log.some(([, g]) => g[x])).at(-1) : undefined;
    const total = bars.reduce((a, b) => a + b.value, 0);
    const used = GRADES.filter((x) => log.some(([, g]) => g[x]));
    const shade = (k: string) => used.length < 2 ? 0.9 : [0.2, 0.42, 0.68, 1][Math.round((3 * used.indexOf(k)) / (used.length - 1))] ?? 1;
    return {
      big: hardest ?? DASH, sub: log.length ? "Hardest send" : "No climbs logged yet",
      side: { label: "Target", value: "V5", note: `${sends(5)} sent` },
      chart: (accent, on) => bars.length
        ? <div className="g-stack">
            <div className="g-legend">{GRADES.filter((x) => log.some(([, g]) => g[x])).map((x) => <span key={x}><i style={{ background: accent, opacity: shade(x) }} />{x}</span>)}</div>
            <Bars bars={bars} accent={accent} onHover={on} partShade={shade} animKey="goal-boulder" ticks={[dayMonth(bars[0].key), dayMonth(bars.at(-1)!.key)]} />
          </div>
        : empty("Your watches don't record grades. Add sends to climbs.json and they show up here.")(),
      hover: (f) => {
        if (typeof f !== "number") return null;
        const [day, g] = log[f];
        return { big: bars[f].value, unit: "climbs", sub: `${dayMonth(day)}: ${GRADES.filter((x) => g[x]).map((x) => `${g[x]} × ${x}`).join(", ")}` };
      },
      tiles: [
        { label: "V4 and up", num: sends(4), sub: total ? `of ${total} climbs` : "No climbs logged" },
      ],
    };
  }

  if (sport === "football" || sport === "tennis") {
    // Chart as before (football: km per game, tennis: games per month). The goal is to play better, so the big
    // number is your average self-rating and the side shows how it's moving. Hover a bar for the rating; click to rate.
    const games = own.filter((s) => dayDiff(s.day, d.synced) <= (sport === "tennis" ? 365 : 182));
    const r = (s: (typeof games)[number]) => rate.get(s.id);
    const rated = games.filter((s) => r(s) != null);
    const avg = (xs: typeof games) => xs.length ? xs.reduce((a, s) => a + r(s)!, 0) / xs.length : null;
    const last5 = avg(rated.slice(-5)), prev5 = avg(rated.slice(-10, -5));
    const trend = last5 != null && prev5 != null ? last5 - prev5 : null;
    const signed1 = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;
    const rateText = (n: number | null | undefined) => n != null ? `${n.toFixed(Number.isInteger(n) ? 0 : 1)}/10` : "not rated";
    const head = {
      big: last5 != null ? last5.toFixed(1) : DASH, unit: last5 != null ? "/ 10" : undefined,
      sub: rated.length ? `Average rating, last ${Math.min(5, rated.length)} ${rated.length === 1 ? "game" : "games"}` : "No games rated yet",
      side: { label: "Progression", value: trend != null ? signed1(trend) : DASH, note: trend != null ? "Last 5 vs 5 before" : undefined },
    };

    if (sport === "football") {
      const withKm = games.filter((s) => s.km);
      const km = withKm.reduce((a, s) => a + s.km!, 0);
      const best = withKm.length ? Math.max(...withKm.map((s) => s.km!)) : 0;
      const bars: Bar[] = games.map((s) => ({ key: s.id, label: r(s) != null ? `${r(s)}/10` : `${(s.km ?? 0).toFixed(1)} km`, value: s.km ?? 0 }));
      const sel = rate.selected ? games.findIndex((s) => s.id === rate.selected) : -1;
      return {
        ...head,
        chart: (accent, on) => games.length
          ? <Bars bars={bars} accent={accent} onHover={on} onPick={(i) => rate.pick(games[i].id)} selected={sel >= 0 ? sel : null}
              animKey="goal-football" ticks={[dayMonth(games[0].day), dayMonth(games.at(-1)!.day)]} />
          : empty("No games yet")(),
        hover: (f) => {
          if (typeof f !== "number") return null;
          const g = games[f];
          return { big: g.km ? g.km.toFixed(1) : DASH, unit: g.km ? "km" : undefined, sub: `${weekday(g.day)} ${dayMonth(g.day)}, ${Math.round(g.durationMin)} min, rated ${rateText(r(g))}` };
        },
        tiles: [
          { label: "Per game", num: <>{withKm.length ? (km / withKm.length).toFixed(1) : DASH}<small>km</small></>, sub: `${games.length} games, past 6 months` },
          { label: "Longest", num: <>{best ? best.toFixed(1) : DASH}<small>km</small></>, sub: "In one game" },
        ],
      };
    }

    const months = Array.from({ length: 6 }, (_, i) => { const m = new Date(d.synced + "T12:00:00Z"); m.setUTCMonth(m.getUTCMonth() - 5 + i, 1); return m.toISOString().slice(0, 7); });
    const inMonth = (m: string) => games.filter((s) => s.day.startsWith(m));
    const bars: Bar[] = months.map((m) => { const ss = inMonth(m); const a = avg(ss.filter((s) => r(s) != null)); return { key: m, label: ss.length ? (a != null ? `${a.toFixed(1)}/10` : `${ss.length}`) : "0", value: ss.length }; });
    const hours = games.reduce((a, s) => a + s.durationMin, 0) / 60;
    return {
      ...head,
      chart: (accent, on) => <Bars bars={bars} accent={accent} onHover={on} onPick={(i) => { const ss = inMonth(months[i]); if (ss.length) rate.pick(ss.at(-1)!.id); }}
        animKey="goal-tennis" ticks={[MO[Number(months[0].slice(5)) - 1], MO[Number(months[5].slice(5)) - 1]]} />,
      hover: (f) => {
        if (typeof f !== "number") return null;
        const ss = inMonth(months[f]); const a = avg(ss.filter((s) => r(s) != null));
        return { big: a != null ? a.toFixed(1) : DASH, unit: a != null ? "/ 10" : undefined,
          sub: `${MO[Number(months[f].slice(5)) - 1]}: ${ss.length} ${ss.length === 1 ? "game" : "games"}, ${(ss.reduce((x, s) => x + s.durationMin, 0) / 60).toFixed(1)} h${ss.length && a == null ? `, ${rateText(null)}` : ""}` };
      },
      tiles: [
        { label: "Time played", num: <>{hours.toFixed(1)}<small>h</small></>, sub: `${games.length} ${games.length === 1 ? "game" : "games"}, past year` },
        { label: "Per game", num: <>{games.length ? Math.round((60 * hours) / games.length) : DASH}<small>min</small></>, sub: "On average" },
      ],
    };
  }

  // gym: sets per body region
  const withSets = own.filter((s) => s.regions);
  const tot = (r: string) => withSets.reduce((a, s) => a + ((s.regions as Record<string, number>)[r] ?? 0), 0);
  const rows = REGIONS.map(([k, name]) => ({ key: k, name, value: tot(k) })).sort((a, b) => b.value - a.value);
  const all = rows.reduce((a, r) => a + r.value, 0);
  const least = [...rows].sort((a, b) => a.value - b.value)[0];
  return {
    big: all, unit: "sets", sub: `Across ${withSets.length} logged workouts`,
    side: { label: "Most trained", value: rows[0]?.value ? rows[0].name : DASH },
    chart: (accent, on) => all ? <HBars rows={rows.map((r) => ({ ...r, note: `${Math.round((100 * r.value) / all)}%` }))} accent={accent} onHover={on} /> : empty("No sets logged")(),
    hover: (f) => {
      if (typeof f !== "string") return null;
      const r = rows.find((x) => x.key === f)!;
      return { big: r.value, unit: "sets", sub: `${r.name}, ${Math.round((100 * r.value) / all)}% of all sets` };
    },
    tiles: [
      { label: "Least trained", num: least?.name ?? DASH, sub: `${least?.value ?? 0} ${least?.value === 1 ? "set" : "sets"}` },
      { label: "Unlabelled", num: tot("other"), sub: "Sets without an exercise" },
    ],
  };
}
