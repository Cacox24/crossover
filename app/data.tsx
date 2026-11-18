import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { DataJson } from "../engine/index";

type State = { status: "loading" } | { status: "error"; synced?: string } | { status: "ready"; data: DataJson };

const Ctx = createContext<State>({ status: "loading" });
const ReloadCtx = createContext<() => Promise<DataJson | null>>(async () => null);
const file = () => (new URLSearchParams(location.search).has("fixture") ? "data.fixture.json" : "data.json");

/** Loads /data.json, or /data.fixture.json with ?fixture in the URL. reload() fetches it again, skipping caches. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    fetch(file())
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DataJson) => setState({ status: "ready", data }))
      .catch(() => setState({ status: "error" }));
  }, []);
  const reload = useCallback(async () => {
    try {
      const r = await fetch(`${file()}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return null;
      const data = (await r.json()) as DataJson;
      setState({ status: "ready", data });
      return data;
    } catch { return null; }
  }, []);
  return <ReloadCtx.Provider value={reload}><Ctx.Provider value={state}>{children}</Ctx.Provider></ReloadCtx.Provider>;
}

export const useDataState = () => useContext(Ctx);
export const useReload = () => useContext(ReloadCtx);
export function useData(): DataJson {
  const s = useContext(Ctx);
  if (s.status !== "ready") throw new Error("data not ready");
  return s.data;
}
