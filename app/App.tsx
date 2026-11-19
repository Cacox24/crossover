// App shell: centred top bar, sources menu, quiet crossfade between pages.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowsClockwise, Warning, X } from "@phosphor-icons/react";
import { useDataState, useReload } from "./data";
import { dayMonth, DASH } from "./format";
import { FatigueDefs } from "./components/fatigue";
import { NowPage } from "./pages/Now";
import { ProgressionPage } from "./pages/Progression";
import { GoalsPage } from "./pages/Goals";
import { KitPage } from "./pages/Kit";
import { WhatIfProvider } from "./whatif/store";
import "./shell.css";
import "./mobile.css";

const ROUTES = { progression: "Progression", now: "Now", goals: "Goals" } as const;
type Route = keyof typeof ROUTES | "kit";
const START: Route = "progression";

function readRoute(): Route {
  const r = location.hash.replace(/^#\/?/, "");
  return r in ROUTES || (r === "kit" && import.meta.env.DEV) ? (r as Route) : START;
}

/** Route with a short fade-out before the next page fades in. */
function useRoute(): [Route, boolean] {
  const [target, setTarget] = useState<Route>(readRoute);
  const [shown, setShown] = useState<Route>(target);
  useEffect(() => {
    const on = () => setTarget(readRoute());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    if (target === shown) return;
    const t = setTimeout(() => { setShown(target); scrollTo({ top: 0 }); }, 200);
    return () => clearTimeout(t);
  }, [target, shown]);
  return [shown, target !== shown];
}

/** Mount/unmount with an exit animation. */
function usePresence(open: boolean, ms: number) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    else if (mounted) { const t = setTimeout(() => setMounted(false), ms); return () => clearTimeout(t); }
  }, [open, mounted, ms]);
  return { mounted, closing: mounted && !open };
}

export function App() {
  const [route, leaving] = useRoute();
  const state = useDataState();

  let body: ReactNode;
  if (state.status === "loading") body = null;
  else if (state.status === "error") body = <p className="t-label muted"><Warning size={16} aria-label="Error" /> {DASH}</p>;
  else body = <WhatIfProvider synced={state.data.synced}>{route === "now" ? <NowPage /> : route === "progression" ? <ProgressionPage /> : route === "goals" ? <GoalsPage /> : <KitPage />}</WhatIfProvider>;

  return (
    <>
      <FatigueDefs />
      <header className="topbar">
        <div className="container topbar-inner">
          <a href={`#${START}`} className="wordmark">Crossover</a>
          <nav className="nav" aria-label="Pages">
            {(Object.keys(ROUTES) as (keyof typeof ROUTES)[]).map((r) => (
              <a key={r} href={`#${r}`} className={`nav-link t-label ${route === r ? "is-active" : ""}`} aria-current={route === r ? "page" : undefined}>
                {ROUTES[r]}
              </a>
            ))}
          </nav>
          <div className="topbar-right">
            {state.status === "ready" && <Sources synced={state.data.synced} generatedAt={state.data.generatedAt} />}
          </div>
        </div>
      </header>
      <main className="container main">
        <div key={route} className={`page ${leaving ? "is-leaving" : ""}`}>{body}</div>
      </main>
    </>
  );
}

const DEVICES = [
  { name: "Garmin", model: "Forerunner", img: "devices/garmin.png", detail: "Running · gym · history" },
  { name: "Fitbit", model: "Air", img: "devices/fitbit.png", detail: "Football · climbing · sleep · HRV" },
];

type SyncState = "idle" | "starting" | "running" | "deploying" | "done" | "current" | "cooldown" | "error" | "unavailable";
const SYNC_TEXT: Record<SyncState, string> = {
  idle: "", starting: "Starting…", running: "Getting your data…", deploying: "Updating the page…",
  done: "Updated just now", current: "Already up to date", cooldown: "Synced a few minutes ago", error: "Couldn't sync, try again", unavailable: "Sync runs on the live site",
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts the sync Action, follows it, then waits for the redeployed data.json and swaps it in. */
function useSync(generatedAt?: string) {
  const reload = useReload();
  const [state, setState] = useState<SyncState>("idle");
  const busy = state === "starting" || state === "running" || state === "deploying";
  const run = useCallback(async () => {
    if (busy) return;
    setState("starting");
    let r: Response | null = null;
    try { r = await fetch("api/sync", { method: "POST" }); } catch { r = null; }
    if (!r || r.status === 404 || r.status === 503 || !(r.headers.get("content-type") ?? "").includes("json")) { setState("unavailable"); return; }
    if (r.status === 429) { setState("cooldown"); return; }
    if (!r.ok) { setState("error"); return; }
    setState("running");
    const t0 = Date.now();
    let ok = false;
    while (Date.now() - t0 < 6 * 60_000) {
      await wait(5000);
      const s = await fetch("api/sync").then((x) => x.json()).catch(() => null);
      const run = s?.run;
      if (run && Date.parse(run.createdAt) >= t0 - 60_000 && run.status === "completed") { ok = run.conclusion === "success"; break; }
    }
    if (!ok) { setState("error"); return; }
    setState("deploying");
    while (Date.now() - t0 < 9 * 60_000) {
      await wait(6000);
      const d = await reload();
      if (d && d.generatedAt !== generatedAt) { setState("done"); return; }
    }
    setState("current");
  }, [busy, generatedAt, reload]);
  useEffect(() => {
    if (state === "idle" || busy) return;
    const t = setTimeout(() => setState("idle"), 5000);
    return () => clearTimeout(t);
  }, [state, busy]);
  return { state, busy, run };
}

function ago(iso?: string) {
  if (!iso) return null;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

function Sources({ synced, generatedAt }: { synced: string; generatedAt?: string }) {
  const [open, setOpen] = useState(false);
  const pop = usePresence(open, 220);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const sync = useSync(generatedAt);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("pointerdown", onDown); addEventListener("keydown", onKey);
    return () => { removeEventListener("pointerdown", onDown); removeEventListener("keydown", onKey); };
  }, [open, close]);
  const when = ago(generatedAt) ?? dayMonth(synced);
  return (
    <div className="sources" ref={ref}>
      <button type="button" className={`sources-btn ${sync.busy ? "is-syncing" : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <span className="sources-icons" aria-hidden>
          {DEVICES.map((d) => <img key={d.name} className="dev-img" src={d.img} alt="" />)}
        </span>
        <span className="t-small">{sync.busy ? "Syncing" : dayMonth(synced)}</span>
      </button>
      {pop.mounted && (
        <div className={`sources-pop ${pop.closing ? "is-closing" : ""}`} role="dialog" aria-label="Sources">
          {DEVICES.map((d) => (
            <div key={d.name} className="src-row">
              <span className="src-icon"><img className="dev-img" src={d.img} alt="" /></span>
              <span className="src-meta">
                <span className="t-label">{d.name} <span className="faint">{d.model}</span></span>
                <span className="t-small faint">{d.detail}</span>
              </span>
            </div>
          ))}
          <div className="src-sync">
            <span className={`sync-msg t-small ${sync.state === "idle" ? "faint" : ""}`} aria-live="polite">{SYNC_TEXT[sync.state] || `Synced ${when}`}</span>
            <button type="button" className={`sync-btn is-${sync.state}`} onClick={sync.run} disabled={sync.busy}>
              {sync.busy ? <i className="sync-spin" aria-hidden /> : <ArrowsClockwise size={15} weight="bold" aria-hidden />}
              {sync.busy ? "Syncing" : "Sync"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Right-side drawer; drifts in and out with the open/close easing. */
export function Drawer({ title, onClose, closing, children }: { title: string; onClose: () => void; closing?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={closing ? "is-closing" : ""}>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <h2 className="t-heading">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
