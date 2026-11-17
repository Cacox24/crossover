export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN);
export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export function ols(x: number[], y: number[]) {
  const mx = mean(x), my = mean(y);
  const sxx = sum(x.map((v) => (v - mx) ** 2));
  const b = sxx ? sum(x.map((v, i) => (v - mx) * (y[i] - my))) / sxx : 0;
  const a = my - b * mx;
  const ssTot = sum(y.map((v) => (v - my) ** 2));
  const ssRes = sum(y.map((v, i) => (v - a - b * x[i]) ** 2));
  return { a, b, r2: ssTot ? 1 - ssRes / ssTot : 0 };
}
export function pearson(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  const num = sum(x.map((v, i) => (v - mx) * (y[i] - my)));
  const den = Math.sqrt(sum(x.map((v) => (v - mx) ** 2)) * sum(y.map((v) => (v - my) ** 2)));
  return den ? num / den : 0;
}
/** Deterministic PRNG (mulberry32) so bootstrap CIs and fixtures are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
