// "What if I say yes?": sessions you're trying out (tentative) and the ones you've added to your plan.
// Now shows both; Goals plans around the added ones only. Kept in the browser; nothing leaves this device.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Sport } from "../../engine/types";

export interface Yes { day: string; sport: Sport }
export const MAX_YES = 3;      // trying out at once
export const MAX_PLANNED = 6;  // added to the plan
const KEY = "crossover.whatif.v2";
const TRY_KEY = "crossover.whatif.trying";

interface Store {
  trying: Yes[];
  planned: Yes[];
  preview: Yes | null;
  setPreview: (y: Yes | null) => void;
  toggle: (y: Yes) => void;   // try a day, or take it out (trying or planned)
  undo: () => void;           // drop the last one you tried
  addToPlan: () => void;      // keep everything you're trying
}
const noop = () => {};
const Ctx = createContext<Store>({ trying: [], planned: [], preview: null, setPreview: noop, toggle: noop, undo: noop, addToPlan: noop });

const same = (a: Yes, b: Yes) => a.day === b.day && a.sport === b.sport;
const read = (synced: string, store: "local" | "session" = "local"): Yes[] => {
  try {
    const xs = JSON.parse((store === "local" ? localStorage.getItem(KEY) : sessionStorage.getItem(TRY_KEY)) ?? "[]") as Yes[];
    return Array.isArray(xs) ? xs.filter((y) => y.day >= synced).slice(-MAX_PLANNED) : [];
  } catch { return []; }
};

export function WhatIfProvider({ synced, children }: { synced: string; children: ReactNode }) {
  const [planned, setPlanned] = useState<Yes[]>(() => read(synced));
  const [trying, setTrying] = useState<Yes[]>(() => read(synced, "session").slice(-MAX_YES));
  const [preview, setPreview] = useState<Yes | null>(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(planned)); } catch { /* private mode: keep in memory */ } }, [planned]);
  useEffect(() => { try { sessionStorage.setItem(TRY_KEY, JSON.stringify(trying)); } catch { /* keep in memory */ } }, [trying]);

  const toggle = useCallback((y: Yes) => {
    if (planned.some((x) => same(x, y))) { setPlanned((xs) => xs.filter((x) => !same(x, y))); return; }
    setTrying((xs) => {
      if (xs.some((x) => same(x, y))) return xs.filter((x) => !same(x, y));
      return [...xs.filter((x) => x.day !== y.day), y].slice(-MAX_YES);   // one sport per day
    });
  }, [planned]);
  const undo = useCallback(() => setTrying((xs) => xs.slice(0, -1)), []);
  const addToPlan = useCallback(() => {
    setPlanned((ps) => [...ps.filter((p) => !trying.some((t) => t.day === p.day)), ...trying].slice(-MAX_PLANNED));
    setTrying([]);
  }, [trying]);

  const value = useMemo(() => ({ trying, planned, preview, setPreview, toggle, undo, addToPlan }), [trying, planned, preview, toggle, undo, addToPlan]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useWhatIf = () => useContext(Ctx);

/** Merge lists, later ones winning a day: e.g. planned, then trying, then the hovered one. */
export function merge(...lists: (Yes[] | Yes | null)[]): Yes[] {
  const out = new Map<string, Yes>();
  for (const l of lists) for (const y of l == null ? [] : Array.isArray(l) ? l : [l]) out.set(y.day, y);
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day));
}
