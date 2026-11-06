import { addDays, addMonthsClamped } from "./dates";

export type Recurrence = "ONCE" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

const MONTH_STEP: Record<Exclude<Recurrence, "ONCE" | "WEEKLY">, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

const MAX_OCCURRENCES = 2000;

export interface RecurrenceRule {
  recurrence: Recurrence;
  startDate: Date;
  endDate?: Date | null;
  /** For month-based rules: pin the due day (e.g. 5). Defaults to the start date's day. */
  dayOfMonth?: number | null;
}

/**
 * Every due date of the rule that falls inside [from, to] (inclusive), never before the
 * start date or after the end date. Pure and deterministic, so running the generator
 * twice yields the same dates (the DB unique key then makes inserts idempotent).
 * Month-end days clamp: day 31 gives 28/29 Feb, 30 Apr, and so on.
 */
export function generateDueDates(rule: RecurrenceRule, from: Date, to: Date): Date[] {
  const upper = rule.endDate && rule.endDate < to ? rule.endDate : to;
  const lower = rule.startDate > from ? rule.startDate : from;
  if (lower > upper) return [];

  const dates: Date[] = [];

  if (rule.recurrence === "ONCE") {
    if (rule.startDate >= lower && rule.startDate <= upper) dates.push(rule.startDate);
    return dates;
  }

  if (rule.recurrence === "WEEKLY") {
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const date = addDays(rule.startDate, i * 7);
      if (date > upper) break;
      if (date >= lower) dates.push(date);
    }
    return dates;
  }

  const step = MONTH_STEP[rule.recurrence];
  const day = rule.dayOfMonth ?? rule.startDate.getUTCDate();
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const date = addMonthsClamped(rule.startDate, i * step, day);
    if (date > upper) break;
    // With a pinned day earlier than the start date, the first occurrence can precede startDate.
    if (date >= lower && date >= rule.startDate) dates.push(date);
  }
  return dates;
}

/** Date a reminder should fire: `daysBefore` days ahead of the due date. */
export function reminderDateFor(dueDate: Date, daysBefore: number): Date {
  return addDays(dueDate, -Math.max(0, daysBefore));
}
