import { monthBounds } from "@/features/quick-pay/datetime";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export interface PagePeriod {
  from: string;
  to: string;
  /** The month the period starts in ("2026-11"): what a month-based control edits. */
  month: string;
  /** True when From and To dates were chosen instead of a month. */
  custom: boolean;
}

/**
 * The period a page covers, from its address: ?from=…&to=… for dates, ?month=… for a month, and the current month when neither
 * is there. Every page that has the month and From/To controls reads it this way, so they all agree.
 */
export function periodFromParams(params: Record<string, string | string[] | undefined>, today: string): PagePeriod {
  const rawFrom = one(params.from);
  const rawTo = one(params.to);
  if (isDate(rawFrom) || isDate(rawTo)) {
    let from = isDate(rawFrom) ? rawFrom : rawTo;
    let to = isDate(rawTo) ? rawTo : from;
    if (from > to) [from, to] = [to, from];
    return { from, to, month: from.slice(0, 7), custom: true };
  }
  const month = isMonth(one(params.month)) ? one(params.month) : today.slice(0, 7);
  const bounds = monthBounds(month)!;
  return { from: bounds.from, to: bounds.to, month, custom: false };
}
