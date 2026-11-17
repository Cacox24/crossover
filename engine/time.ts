// Day keys are local calendar dates "YYYY-MM-DD" in the athlete's time zone.
export const DAY_MS = 864e5;

const fmts = new Map<string, Intl.DateTimeFormat>();
export function dayKey(t: string | number, tz: string): string {
  let f = fmts.get(tz);
  if (!f) fmts.set(tz, (f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })));
  return f.format(new Date(t));
}

const toMs = (day: string) => Date.parse(day + "T00:00:00Z");
export const addDays = (day: string, n: number) => new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS); // b − a
export const mondayOf = (day: string) => addDays(day, -((new Date(toMs(day)).getUTCDay() + 6) % 7));

export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
