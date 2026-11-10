import { addDays, parseISODate, toISODate } from "@/lib/finance";

/**
 * Date and time handling for Quick Pay. Entries are stored as exact instants (UTC) and shown and
 * entered in Indian Standard Time, which has no daylight saving, so the +05:30 offset is fixed.
 */

export const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeParts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const longDate = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "long", day: "numeric", year: "numeric" });
const clock = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long" });

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

/** The instant for a date (YYYY-MM-DD) and time (HH:mm) entered in IST. Throws for an invalid date or time. */
export function istInstant(date: string, time: string): Date {
  parseISODate(date); // throws RangeError for a bad date
  if (!isValidTime(time)) throw new RangeError(`Invalid time "${time}", expected HH:mm`);
  return new Date(`${date}T${time}:00.000${IST_OFFSET}`);
}

/** Calendar date (YYYY-MM-DD) of an instant in IST. */
export function istDateOf(instant: Date): string {
  return dateParts.format(instant);
}

/** Clock time (HH:mm, 24 hour) of an instant in IST. */
export function istTimeOf(instant: Date): string {
  return timeParts.format(instant);
}

/**
 * Two-line display of an instant: "June 25, 2026" and "9:21 AM – Sunday".
 * The weekday is calculated from the date itself.
 */
export function formatTransactionWhen(instant: Date): { date: string; timeAndDay: string } {
  const time = clock.format(instant).replace(/[  ]/g, " ");
  return { date: longDate.format(instant), timeAndDay: `${time} – ${weekday.format(instant)}` };
}

/** First and last day of a month ("2026-06" -> 2026-06-01 .. 2026-06-30), or null if invalid. */
export function monthBounds(month: string): { from: string; to: string } | null {
  if (!isValidMonth(month)) return null;
  const first = parseISODate(`${month}-01`);
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  return { from: toISODate(first), to: toISODate(addDays(next, -1)) };
}

/** Database bounds for an inclusive IST date range: from 00:00 on `from`, up to (not including) 00:00 the day after `to`. */
export function rangeToInstants(from: string | null, to: string | null): { gte?: Date; lt?: Date } {
  const bounds: { gte?: Date; lt?: Date } = {};
  if (from) bounds.gte = istInstant(from, "00:00");
  if (to) bounds.lt = istInstant(toISODate(addDays(parseISODate(to), 1)), "00:00");
  return bounds;
}
