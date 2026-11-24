/** Sleep Tracker rules that need no database: the status of a night, the colours, and how a duration is written. */

/** The reporting targets of the application (not medical advice): under 7 hours, 7 to 8 hours inclusive, over 8 hours. */
export const INSUFFICIENT_BELOW_MINUTES = 7 * 60;
export const NORMAL_UP_TO_MINUTES = 8 * 60;

export type SleepStatus = "INSUFFICIENT" | "NORMAL" | "OVERTIME";

export function sleepStatus(minutes: number): SleepStatus {
  if (minutes < INSUFFICIENT_BELOW_MINUTES) return "INSUFFICIENT";
  if (minutes <= NORMAL_UP_TO_MINUTES) return "NORMAL";
  return "OVERTIME";
}

/** One set of names and colours for the records, the chart and every report. */
export const STATUS: Record<SleepStatus, { label: string; /** text */ text: string; /** soft background */ soft: string; /** solid fill of a bar */ bar: string }> = {
  INSUFFICIENT: { label: "Insufficient Sleep", text: "text-red-600", soft: "bg-red-50 text-red-700", bar: "bg-red-500" },
  NORMAL: { label: "Normal Sleep", text: "text-green-600", soft: "bg-green-50 text-green-700", bar: "bg-green-500" },
  OVERTIME: { label: "Overtime Sleep", text: "text-orange-600", soft: "bg-orange-50 text-orange-700", bar: "bg-orange-500" },
};

/** 445 minutes as "7 hours 25 minutes"; "45 minutes" and "2 hours" are written without the empty part. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hours = h > 0 ? `${h} hour${h === 1 ? "" : "s"}` : "";
  const mins = r > 0 ? `${r} minute${r === 1 ? "" : "s"}` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
}

/** The same in a few characters for a chart: "7h 25m". */
export function shortDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Whole minutes between two instants, from their full timestamps (so a night that crosses midnight, or several days, is exact). */
export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

/** Two sessions finishing on the same day are one day's sleep. */
export function dayStatus(totalMinutes: number): SleepStatus {
  return sleepStatus(totalMinutes);
}

/** Monday of the week a date (YYYY-MM-DD) falls in. */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday is 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function addDaysTo(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The seven dates Monday to Sunday of the week starting on `monday`. */
export const weekDates = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDaysTo(monday, i));
