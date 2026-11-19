// Your own 1–10 rating of how well you played, per football or tennis session.
// Ratings in ratings.json (repo) come with the data; ratings you tap in the app are kept in this browser and win.
import { useCallback, useState } from "react";
import type { DataJson } from "../../engine/index";

const KEY = "crossover.ratings.v1";
const read = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}; } catch { return {}; } };

export function useRatings(d: DataJson) {
  const [local, setLocal] = useState<Record<string, number>>(read);
  const get = useCallback((id: string): number | undefined => local[id] ?? d.ratings?.[id], [local, d.ratings]);
  const set = useCallback((id: string, n: number | null) => setLocal((m) => {
    const next = { ...m };
    if (n == null) delete next[id]; else next[id] = n;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* keep in memory */ }
    return next;
  }), []);
  return { get, set };
}
