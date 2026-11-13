import { addDays, parseISODate, toISODate } from "@/lib/finance";

/** How dates and times are shown in the GPay screens: "04th October, 2026" and "06:00 PM". Dates are YYYY-MM-DD, times HH:mm (24 hour). */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
export const MONTH_NAMES: readonly string[] = MONTHS;

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st, 22nd. */
export function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
}

/** "2026-10-04" becomes "04th October, 2026". An empty or invalid value gives "". */
export function formatLongDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  try {
    const d = parseISODate(value);
    const day = d.getUTCDate();
    return `${String(day).padStart(2, "0")}${ordinalSuffix(day)} ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
  } catch {
    return "";
  }
}

/** "2026-10" becomes "October 2026". */
export function formatMonthYear(value: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
}

/** The day after (or before) a date. */
export const shiftDate = (value: string, days: number): string => toISODate(addDays(parseISODate(value), days));

/** The six rows of a month's calendar (Monday first); days outside the month are null. */
export function calendarWeeks(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => toISODate(new Date(Date.UTC(year, month, i + 1))))];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface Clock12 {
  /** 1 to 12 */
  hour: number;
  minute: number;
  pm: boolean;
}

/** "18:05" becomes { hour: 6, minute: 5, pm: true }. */
export function toClock12(value: string): Clock12 | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: Number(m[2]), pm: h >= 12 };
}

/** { hour: 6, minute: 5, pm: true } becomes "18:05". */
export function fromClock12(c: Clock12): string {
  const h = (c.hour % 12) + (c.pm ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
}

/** "18:00" becomes "06:00 PM". */
export function formatClock(value: string): string {
  const c = toClock12(value);
  return c ? `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")} ${c.pm ? "PM" : "AM"}` : "";
}
