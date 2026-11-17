import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DataJson } from "../engine/index";

type State = { status: "loading" } | { status: "error"; synced?: string } | { status: "ready"; data: DataJson };

const Ctx = createContext<State>({ status: "loading" });

/** Loads /data.json, or /data.fixture.json with ?fixture in the URL. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const file = new URLSearchParams(location.search).has("fixture") ? "/data.fixture.json" : "/data.json";
    fetch(file)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DataJson) => setState({ status: "ready", data }))
      .catch(() => setState({ status: "error" }));
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useDataState = () => useContext(Ctx);
export function useData(): DataJson {
  const s = useContext(Ctx);
  if (s.status !== "ready") throw new Error("data not ready");
  return s.data;
}
