// Progression: one sport at a time. A themed hero with a scrubbable line,
// what built it (hover links to the chart), and four key numbers.
import { useEffect, useMemo, useState } from "react";
import { DarkPage } from "../components/DarkPage";
import type { Sport, SessionSport } from "../../engine/types";
import { SOURCES } from "../../engine/types";
import { addDays, dayDiff } from "../../engine/time";
import { useData } from "../data";
import { SPORT_ORDER, SPORT_META } from "../sports";
import { dayMonth, pace, DASH } from "../format";
import { LineChart, type Dot } from "../components/LineChart";
import { SportGlyph } from "../components/ui";
import "./progression-page.css";

/** Whole page goes dark in the sport's colour. Set to false to go back to the light page. */
const DARK_PAGE = true;

const RANGES = { "1M": 30, "3M": 91, "6M": 182, "1Y": 364 } as const;
type Range = keyof typeof RANGES;
const RANGE_NAME: Record<Range, string> = { "1M": "Past month", "3M": "Past 3 months", "6M": "Past 6 months", "1Y": "Past year" };
const FEW_SESSIONS = 3;

/** Deep, quiet themes per sport. page = dark page background, bg = hero, tint = light page. */
export const THEME: Record<Sport, { bg: string; page: string; accent: string; tint: string; mesh: [string, string, string, string] }> = {
  running:    { bg: "#0E2A55", page: "#050E24", accent: "#8DB8FF", tint: "#F3F6FB", mesh: ["#1F5BFF", "#6A3DFF", "#00B8FF", "#0A2A8A"] },
  football:   { bg: "#0C3D2E", page: "#03140F", accent: "#6FE3B0", tint: "#F2F8F5", mesh: ["#00A86B", "#00C7B7", "#5FD35A", "#08594A"] },
  tennis:     { bg: "#3D300C", page: "#140F03", accent: "#F4C84E", tint: "#FAF8F1", mesh: ["#E8A300", "#FF6A1A", "#FFD23F", "#7A4A00"] },
  bouldering: { bg: "#231B57", page: "#0A0720", accent: "#B3A8FF", tint: "#F5F4FB", mesh: ["#5B3BFF", "#A63BFF", "#2F6BFF", "#2A1478"] },
  gym:        { bg: "#4A1631", page: "#16050E", accent: "#FF9FC6", tint: "#FBF4F7", mesh: ["#FF3D7F", "#A83BFF", "#FF7A4D", "#6A0F3A"] },
};

export function ProgressionPage() {
  const d = useData();
  const [sport, setSport] = useState<Sport>("running");
  const [range, setRange] = useState<Range>("1Y");
  const [scrub, setScrub] = useState<number | null>(null);
  const [focus, setFocus] = useState<SessionSport | null>(null);
  const S = d.sports[sport];
  const T = THEME[sport];

  useEffect(() => {
    if (DARK_PAGE) return;
    document.documentElement.style.setProperty("--page-tint", T.tint);
    return () => { document.documentElement.style.removeProperty("--page-tint"); };
  }, [T]);

  const v = useMemo(() => {
    const all = S.model.values.map((_, i) => addDays(S.model.start, i));
    const from = Math.max(0, all.length - 1 - RANGES[range]);
    const days = all.slice(from);
    const values = S.model.values.slice(from).map((x) => 100 * x);
    const series = (k: SessionSport) => days.map((_, i) => 100 * (S.contributions[k]?.[from + i] ?? 0));
    const keys = [sport, ...SOURCES.filter((k) => k !== sport)].filter((k) => S.contributions[k]?.slice(from).some((x) => x > 0.0005)) as SessionSport[];
    const contrib = Object.fromEntries(keys.map((k) => [k, series(k)])) as Record<SessionSport, number[]>;
    const inRange = d.sessions.filter((s) => s.day >= days[0]);
    const own = inRange.filter((s) => s.sport === sport);
    return { days, values, contrib, keys, inRange, own };
  }, [S, sport, range, d.sessions]);

  const last = v.values.length - 1;
  const i = scrub ?? last;
  const total = v.keys.reduce((a, k) => a + v.contrib[k][last], 0);
  const parts = v.keys.map((k) => ({ k, now: v.contrib[k][last], at: v.contrib[k][i] })).filter((p) => total > 0 && p.now / total >= 0.005);
  const change = v.values[last] - v.values[0];

  // Peak marker (and name it when it was a long run, i.e. the marathon).
  const peakI = v.values.indexOf(Math.max(...v.values));
  const peakDay = v.days[peakI];
  const longRun = sport === "running" && v.own.some((s) => Math.abs(dayDiff(s.day, peakDay)) <= 1 && s.durationMin >= 180);
  const peakLabel = `${longRun ? "Marathon · " : "Peak · "}${Math.round(v.values[peakI])}`;

  // Session dots only for the sport hovered in "Built by".
  const dotSport = focus && focus !== sport ? focus : null;
  const dayIdx = new Map(v.days.map((x, k) => [x, k]));
  const dots: Dot[] = dotSport ? v.inRange.filter((s) => s.sport === dotSport && dayIdx.has(s.day)).map((s) => ({ i: dayIdx.get(s.day)!, color: SPORT_META[dotSport].color, strong: !!focus })) : [];

  const few = v.own.length < FEW_SESSIONS;
  const series = S.metric?.series ?? [];
  const paceNow = series.at(-1);
  const paceStart = [...series].reverse().find(([day]) => day <= v.days[0]) ?? series[0];
  const lastSession = v.own.at(-1);
  const hours = v.own.reduce((a, s) => a + s.durationMin, 0) / 60;
  const perWeek = v.own.length / (RANGES[range] / 7);

  return (
    <div className="prog" style={{ ["--accent" as string]: T.accent, ["--hero" as string]: T.bg }}>
      {DARK_PAGE && <DarkPage theme={T} />}
      <h1 className="sr-only">Progression</h1>
      <div className="prog-body">
        <section className="hero" aria-label={`${SPORT_META[sport].name} fitness`}>
          <div className="sport-tabs" role="tablist" aria-label="Sport">
            {SPORT_ORDER.map((s) => {
              const { Icon, name, color } = SPORT_META[s];
              return (
                <button key={s} role="tab" aria-selected={s === sport} className={`sport-tab ${s === sport ? "is-on" : ""}`}
                  style={{ ["--c" as string]: color }} onClick={() => { setSport(s); setScrub(null); setFocus(null); }}>
                  <Icon size={17} weight="light" aria-hidden /><span>{name}</span>
                </button>
              );
            })}
          </div>

          <div className="hero-head">
            <div>
              <span className="hero-eyebrow"><SportGlyph sport={sport} size={16} />{SPORT_META[sport].name} fitness</span>
              <div className="hero-value">
                <span className="hero-num">{Math.round(v.values[i])}</span>
                <span className="hero-of">/ 100</span>
              </div>
              <div className="hero-sub">
                {scrub !== null && <span className="hero-muted">{dayMonth(v.days[i])} · {parts.map((p) => `${SPORT_META[p.k].name} ${Math.round(p.at)}`).join(" · ")}</span>}
              </div>
            </div>
            <div className="hero-side">
              <span className="hero-muted">{RANGE_NAME[range]}</span>
              <span className="hero-side-num">{change >= 0 ? "+" : "−"}{Math.abs(change).toFixed(0)}</span>
            </div>
          </div>

          <div className="chart-wrap">
            <LineChart days={v.days} values={v.values} accent={T.accent} onScrub={setScrub} animKey={`${sport}-${range}`}
              band={focus && focus !== sport ? v.contrib[focus] : null} bandColor={focus ? SPORT_META[focus].color : undefined}
              dots={dots} peakLabel={few ? undefined : peakLabel} dim={few} />
          </div>

          <div className="range-pills" role="group" aria-label="Range">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <button key={r} className={r === range ? "is-on" : ""} aria-pressed={r === range} onClick={() => { setRange(r); setScrub(null); }}>{r}</button>
            ))}
          </div>
        </section>

        <div className="prog-cards">
          <section className="card card-built" aria-label="What built it" onMouseLeave={() => setFocus(null)}>
            <span className="t-eyebrow">Built by</span>
            <ul className={`built-list ${parts.length >= 5 ? "is-dense" : ""}`}>
              {parts.map((p, k) => (
                <li key={p.k} className={`${focus && focus !== p.k ? "is-faded" : ""} ${focus === p.k ? "is-focus" : ""}`}
                  style={{ ["--c" as string]: SPORT_META[p.k].color, animationDelay: `${200 + k * 90}ms` }}
                  onMouseEnter={() => setFocus(p.k)} onFocus={() => setFocus(p.k)} onBlur={() => setFocus(null)} tabIndex={0}>
                  <span className="built-name"><SportGlyph sport={p.k} size={18} /><span>{SPORT_META[p.k].name}</span></span>
                  <span className="built-pct">{Math.round((100 * p.now) / total)}<small>%</small></span>
                  <span className="built-track"><span style={{ width: `${(100 * p.now) / total}%`, animationDelay: `${350 + k * 90}ms` }} /></span>
                </li>
              ))}
              {parts.length === 0 && <li className="built-empty">{DASH}</li>}
            </ul>
          </section>

          <section className="card-side" aria-label="Key numbers">
            <div className="kn"><span className="kn-label">Sessions</span><span className="kn-num">{v.own.length}</span><span className="kn-sub">{perWeek >= 0.1 ? `${perWeek.toFixed(1)} per week` : DASH}</span></div>
            <div className="kn"><span className="kn-label">Training</span><span className="kn-num">{Math.round(hours)}<small>h</small></span><span className="kn-sub">{v.own.length ? `${Math.round((60 * hours) / v.own.length)} min avg` : DASH}</span></div>
            {S.metric && paceNow ? (
              <div className="kn is-accent"><span className="kn-label">Pace at 150 bpm</span><span className="kn-num">{pace(paceNow[1])}<small>/km</small></span><span className="kn-sub">{paceStart ? `${signed(paceNow[1] - paceStart[1])} s/km` : DASH}</span></div>
            ) : (
              <div className="kn is-accent"><span className="kn-label">Peak</span><span className="kn-num">{Math.round(v.values[peakI])}</span><span className="kn-sub">{dayMonth(peakDay)}</span></div>
            )}
            <div className="kn"><span className="kn-label">Last session</span><span className="kn-num">{lastSession ? <>{dayDiff(lastSession.day, d.synced)}<small>d ago</small></> : DASH}</span><span className="kn-sub">{lastSession ? `${Math.round(lastSession.durationMin)} min` : DASH}</span></div>
          </section>
        </div>
      </div>
    </div>
  );
}

const signed = (x: number) => { const r = Math.round(x); return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : "0"; };
