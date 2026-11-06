/**
 * Date helpers. Date-only values (due dates, transaction dates) are represented as
 * `Date` at 00:00 UTC, matching Postgres `date` columns, so there is no timezone drift.
 * "Today" is resolved in the user's timezone (default Asia/Kolkata).
 */

const MS_PER_DAY = 86_400_000;

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function dateOnly(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function parseISODate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid date "${value}", expected YYYY-MM-DD`);
  const [, y, m, d] = match;
  const date = dateOnly(Number(y), Number(m) - 1, Number(d));
  if (toISODate(date) !== value) throw new RangeError(`Invalid calendar date "${value}"`);
  return date;
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in `timeZone`, as a date-only value. */
export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseISODate(iso);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function startOfMonth(date: Date): Date {
  return dateOnly(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return dateOnly(date.getUTCFullYear(), date.getUTCMonth(), daysInMonth(date.getUTCFullYear(), date.getUTCMonth()));
}

/**
 * Add whole months, keeping `day` (default: the date's own day) but clamping to the
 * month length, e.g. 31 Jan + 1 month = 28/29 Feb, and 31 Jan + 2 months = 31 Mar.
 */
export function addMonthsClamped(date: Date, months: number, day: number = date.getUTCDate()): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return dateOnly(year, month, Math.min(day, daysInMonth(year, month)));
}

/** The next date (on or after `from`) that falls on day-of-month `day`, clamped to month length. */
export function nextDayOfMonth(from: Date, day: number): Date {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new RangeError("Day of month must be 1-31");
  const thisMonth = addMonthsClamped(startOfMonth(from), 0, day);
  return thisMonth >= from ? thisMonth : addMonthsClamped(startOfMonth(from), 1, day);
}

export type RangePreset =
  | "TODAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "PREVIOUS_MONTH"
  | "LAST_3_MONTHS"
  | "LAST_6_MONTHS"
  | "THIS_YEAR"
  | "CUSTOM"
  | "ALL_TIME";

/** Inclusive date-only range. `null` on both ends means "all time". */
export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface RangeOptions {
  now?: Date;
  timeZone?: string;
  custom?: { from: Date; to: Date };
}

/**
 * Resolve a dashboard filter preset to an inclusive date range.
 * - THIS_WEEK: Monday to Sunday containing today.
 * - LAST_3_MONTHS / LAST_6_MONTHS: the current calendar month plus the previous 2 / 5 months, up to today.
 * - THIS_YEAR: calendar year (1 Jan to 31 Dec).
 */
export function resolveDateRange(preset: RangePreset, options: RangeOptions = {}): DateRange {
  const today = todayIn(options.timeZone ?? DEFAULT_TIMEZONE, options.now ?? new Date());

  switch (preset) {
    case "TODAY":
      return { from: today, to: today };
    case "THIS_WEEK": {
      const mondayOffset = (today.getUTCDay() + 6) % 7;
      const monday = addDays(today, -mondayOffset);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "THIS_MONTH":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "PREVIOUS_MONTH": {
      const previous = addMonthsClamped(startOfMonth(today), -1, 1);
      return { from: previous, to: endOfMonth(previous) };
    }
    case "LAST_3_MONTHS":
      return { from: addMonthsClamped(startOfMonth(today), -2, 1), to: today };
    case "LAST_6_MONTHS":
      return { from: addMonthsClamped(startOfMonth(today), -5, 1), to: today };
    case "THIS_YEAR":
      return {
        from: dateOnly(today.getUTCFullYear(), 0, 1),
        to: dateOnly(today.getUTCFullYear(), 11, 31),
      };
    case "CUSTOM": {
      const custom = options.custom;
      if (!custom) throw new RangeError("CUSTOM range needs a from and to date");
      if (custom.from > custom.to) throw new RangeError("Range start must not be after range end");
      return { from: custom.from, to: custom.to };
    }
    case "ALL_TIME":
      return { from: null, to: null };
  }
}
