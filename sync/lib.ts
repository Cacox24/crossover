import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env", "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

export function writeJson(path: string, data: unknown, pretty = false) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, pretty ? 2 : undefined));
}

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));

/** Recursively drop any latitude/longitude/GPS-like keys. */
export function stripGps<T>(o: T): T {
  return JSON.parse(JSON.stringify(o, (k, v) => (/lat(itude)?$|lon(gitude)?$|lng$|gps|polyline|geo/i.test(k) ? undefined : v)));
}
