// Number and date formatting (DESIGN.md §4, §9). No sentences.
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = (day: string) => new Date(day + "T12:00:00Z");

export const weekday = (day: string) => WD[d(day).getUTCDay()];
export const dayMonth = (day: string) => `${d(day).getUTCDate()} ${MO[d(day).getUTCMonth()]}`;
export const weekdayDayMonth = (day: string) => `${weekday(day)} ${dayMonth(day)}`;

/** Arrow + absolute value: ↑ 6, ↓ 10. Zero → "0". */
export function signed(x: number, digits = 0): { arrow: "↑" | "↓" | ""; text: string } {
  const r = Number(x.toFixed(digits));
  return { arrow: r > 0 ? "↑" : r < 0 ? "↓" : "", text: Math.abs(r).toFixed(digits) };
}

/** Pace in s/km → "4:52". */
export const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export const DASH = "—";
