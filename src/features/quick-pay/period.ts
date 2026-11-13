import { addDays, parseISODate, toISODate } from "@/lib/finance";

/**
 * The period a total is shown for, and how the arrows step through it. Dates are YYYY-MM-DD in India time.
 *
 *   Day     Today, Yesterday, Day before yesterday, then the date ("13 October 2026").
 *   Week    this week (Monday to Sunday), last week, then "3 Nov – 9 Nov 2026".
 *   Month   this month, last month, then "October 2026".
 *   Year    this year, last year, then "2025".
 *   Custom  one chosen date, or a From and To range.
 * The arrows never go past today.
 */

export type Period =
  | { kind: "day"; date: string }
  | { kind: "week" | "month" | "year"; anchor: string }
  | { kind: "custom"; from: string; to: string };

export type PresetKind = "day" | "week" | "month" | "year" | "custom";

export const PRESETS: readonly { kind: PresetKind; label: string }[] = [
  { kind: "day", label: "Today" },
  { kind: "week", label: "This week" },
  { kind: "month", label: "This month" },
  { kind: "year", label: "This year" },
  { kind: "custom", label: "Custom" },
];

const shift = (date: string, days: number) => toISODate(addDays(parseISODate(date), days));
const parts = (date: string) => {
  const d = parseISODate(date);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
const iso = (y: number, m: number, d: number) => toISODate(new Date(Date.UTC(y, m, d)));
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** The period a preset opens on: Today, this week, this month, this year. Custom starts as today. */
export function periodFor(kind: PresetKind, today: string): Period {
  if (kind === "day") return { kind: "day", date: today };
  if (kind === "custom") return { kind: "custom", from: today, to: today };
  return { kind, anchor: today };
}

/** The first and last day (inclusive) a period covers. */
export function periodRange(period: Period): { from: string; to: string } {
  switch (period.kind) {
    case "day":
      return { from: period.date, to: period.date };
    case "custom":
      return period.from <= period.to ? { from: period.from, to: period.to } : { from: period.to, to: period.from };
    case "week": {
      const weekday = (parseISODate(period.anchor).getUTCDay() + 6) % 7; // Monday = 0
      const from = shift(period.anchor, -weekday);
      return { from, to: shift(from, 6) };
    }
    case "month": {
      const { y, m } = parts(period.anchor);
      return { from: iso(y, m, 1), to: iso(y, m, lastDayOf(y, m)) };
    }
    case "year": {
      const { y } = parts(period.anchor);
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    }
  }
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const longDate = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const monthYear = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

/** What the button shows: "Today", "Yesterday", "Day before yesterday", "13 October 2026", "This week", … */
export function periodLabel(period: Period, today: string): string {
  const { from, to } = periodRange(period);
  const current = periodRange(periodFor(period.kind === "custom" ? "day" : period.kind, today));
  const isCurrent = period.kind !== "custom" && from === current.from;
  const isLast = period.kind !== "custom" && from === periodRange(stepPeriod(periodFor(period.kind, today), -1)).from;

  switch (period.kind) {
    case "day": {
      const back = Math.round((parseISODate(today).getTime() - parseISODate(period.date).getTime()) / 86_400_000);
      if (back === 0) return "Today";
      if (back === 1) return "Yesterday";
      if (back === 2) return "Day before yesterday";
      return longDate.format(parseISODate(period.date));
    }
    case "week":
      return isCurrent ? "This week" : isLast ? "Last week" : `${dayMonth.format(parseISODate(from))} – ${longDate.format(parseISODate(to))}`;
    case "month":
      return isCurrent ? "This month" : isLast ? "Last month" : monthYear.format(parseISODate(from));
    case "year":
      return isCurrent ? "This year" : isLast ? "Last year" : String(parts(from).y);
    case "custom":
      return from === to ? longDate.format(parseISODate(from)) : `${dayMonth.format(parseISODate(from))} – ${longDate.format(parseISODate(to))}`;
  }
}

/** One step back (-1) or forward (+1). A custom period does not step. */
export function stepPeriod(period: Period, by: -1 | 1): Period {
  switch (period.kind) {
    case "day":
      return { kind: "day", date: shift(period.date, by) };
    case "week":
      return { kind: "week", anchor: shift(period.anchor, 7 * by) };
    case "month": {
      const { y, m } = parts(period.anchor);
      return { kind: "month", anchor: iso(y, m + by, 1) };
    }
    case "year": {
      const { y } = parts(period.anchor);
      return { kind: "year", anchor: iso(y + by, 0, 1) };
    }
    case "custom":
      return period;
  }
}

/** Whether the arrow can be used: nothing later than today, and a custom range does not step. */
export function canStep(period: Period, by: -1 | 1, today: string): boolean {
  if (period.kind === "custom") return false;
  if (by < 0) return true;
  return periodRange(stepPeriod(period, 1)).from <= today;
}
