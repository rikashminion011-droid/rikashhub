import { parseISODate } from "@/lib/finance";
import { isValidMonth, monthBounds } from "./datetime";

export const PAGE_SIZE = 25;

export interface TxFilters {
  /** "YYYY-MM" month filter. Ignored when a custom range is set. */
  month: string | null;
  /** Custom range start / end (YYYY-MM-DD, inclusive). */
  from: string | null;
  to: string | null;
  /** Free-text search over reason, bank, category and person. */
  q: string;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

function validDate(value: string): string | null {
  if (!value) return null;
  try {
    parseISODate(value);
    return value;
  } catch {
    return null;
  }
}

/** Reads and cleans the filters from the page URL. Bad values are dropped instead of failing. */
export function parseTxFilters(params: SearchParams): TxFilters {
  let from = validDate(first(params.from));
  let to = validDate(first(params.to));
  if (from && to && from > to) [from, to] = [to, from];

  const monthRaw = first(params.month);
  const month = isValidMonth(monthRaw) ? monthRaw : null;

  const page = Number.parseInt(first(params.page), 10);
  return {
    month: from || to ? null : month,
    from,
    to,
    q: first(params.q).trim().slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** The inclusive date range the filters select, or nulls for "all time". */
export function effectiveRange(filters: Pick<TxFilters, "month" | "from" | "to">): { from: string | null; to: string | null } {
  if (filters.from || filters.to) return { from: filters.from, to: filters.to };
  if (filters.month) {
    const bounds = monthBounds(filters.month);
    if (bounds) return bounds;
  }
  return { from: null, to: null };
}

export function hasActiveFilters(filters: TxFilters): boolean {
  return Boolean(filters.month || filters.from || filters.to || filters.q);
}

/** Query string for the filters (used for links, paging and export). Page is only included when asked. */
export function filtersToQuery(filters: TxFilters, options: { page?: boolean } = {}): string {
  const query = new URLSearchParams();
  if (filters.month) query.set("month", filters.month);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.q) query.set("q", filters.q);
  if (options.page && filters.page > 1) query.set("page", String(filters.page));
  return query.toString();
}
