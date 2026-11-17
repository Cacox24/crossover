// App shell (DESIGN.md §6): top bar, nav, What if button, synced date.
import { useEffect, useState, type ReactNode } from "react";
import { Warning, X } from "@phosphor-icons/react";
import { useDataState } from "./data";
import { dayMonth, DASH } from "./format";
import { FatigueDefs } from "./components/fatigue";
import { NowPage } from "./pages/Now";
import { ProgressionPage } from "./pages/Progression";
import { MixPage } from "./pages/Mix";
import { KitPage } from "./pages/Kit";
import { WhatIfDrawer } from "./drawers/WhatIf";
import "./shell.css";

const ROUTES = { now: "Now", progression: "Progression", mix: "Mix" } as const;
type Route = keyof typeof ROUTES | "kit";

function useRoute(): Route {
  const read = (): Route => {
    const r = location.hash.replace(/^#\/?/, "");
    return r in ROUTES || r === "kit" ? (r as Route) : "now";
  };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const state = useDataState();
  const [whatIf, setWhatIf] = useState(false);

  let body: ReactNode;
  if (state.status === "loading") body = null;
  else if (state.status === "error") body = <p className="t-label muted">{DASH}</p>;
  else body = route === "now" ? <NowPage /> : route === "progression" ? <ProgressionPage /> : route === "mix" ? <MixPage /> : <KitPage />;

  return (
    <>
      <FatigueDefs />
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/now" className="wordmark">Crossover</a>
          <nav className="nav" aria-label="Pages">
            {(Object.keys(ROUTES) as (keyof typeof ROUTES)[]).map((r) => (
              <a key={r} href={`#/${r}`} className={`nav-link t-label ${route === r ? "is-active" : ""}`} aria-current={route === r ? "page" : undefined}>
                {ROUTES[r]}
              </a>
            ))}
          </nav>
          <button type="button" className="btn-primary t-label" onClick={() => setWhatIf(true)} disabled={state.status !== "ready"}>What if</button>
        </div>
      </header>
      <main className="main">
        <div className="synced t-small">
          {state.status === "ready" && <>Synced {dayMonth(state.data.synced)}</>}
          {state.status === "error" && <><Warning size={14} aria-label="Error" /> {DASH}</>}
        </div>
        {body}
      </main>
      {whatIf && state.status === "ready" && <Drawer title="What if" onClose={() => setWhatIf(false)}><WhatIfDrawer /></Drawer>}
    </>
  );
}

/** §7.5 right-side drawer, 420px. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <h2 className="t-heading">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        <div className="drawer-foot"><button type="button" className="btn-secondary t-label" onClick={onClose}>Close</button></div>
      </aside>
    </>
  );
}
