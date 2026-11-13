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
  /** Several choices at once: transactions through any of these banks, in any of these categories, of any of these kinds, or shared with any of these people. */
  banks?: string[];
  categories?: string[];
  people?: string[];
  types?: TxKind[];
  /** True when "All time" was chosen, so the current month is not applied by default. */
  all?: boolean;
}

export const TX_KINDS = ["DEBIT", "CREDIT", "TRANSFER"] as const;
export type TxKind = (typeof TX_KINDS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHOICES = 100;

/** "id1,id2" as a list of valid ids, no repeats. */
const idList = (value: string | string[] | undefined) => [...new Set(first(value).split(",").map((v) => v.trim()).filter((v) => UUID.test(v)))].slice(0, MAX_CHOICES);

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
export function parseTxFilters(params: SearchParams, options: { defaultMonth?: string } = {}): TxFilters {
  let from = validDate(first(params.from));
  let to = validDate(first(params.to));
  if (from && to && from > to) [from, to] = [to, from];

  const monthRaw = first(params.month);
  const all = first(params.all) === "1";
  let month = isValidMonth(monthRaw) ? monthRaw : null;
  // Opening the page with no period chosen shows the current month ("All time" turns that off).
  if (!month && !from && !to && !all && options.defaultMonth && isValidMonth(options.defaultMonth)) month = options.defaultMonth;

  const page = Number.parseInt(first(params.page), 10);
  return {
    month: from || to ? null : month,
    from,
    to,
    q: first(params.q).trim().slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    banks: idList(params.banks),
    categories: idList(params.cats),
    people: idList(params.people),
    types: [...new Set(first(params.types).split(",").filter((t): t is TxKind => (TX_KINDS as readonly string[]).includes(t)))],
    all,
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
  return Boolean(filters.month || filters.from || filters.to || filters.q || filters.banks?.length || filters.categories?.length || filters.people?.length || filters.types?.length);
}

/** Query string for the filters (used for links, paging and export). Page is only included when asked. */
export function filtersToQuery(filters: TxFilters, options: { page?: boolean } = {}): string {
  const query = new URLSearchParams();
  if (filters.month) query.set("month", filters.month);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.q) query.set("q", filters.q);
  if (filters.banks?.length) query.set("banks", filters.banks.join(","));
  if (filters.categories?.length) query.set("cats", filters.categories.join(","));
  if (filters.people?.length) query.set("people", filters.people.join(","));
  if (filters.types?.length) query.set("types", filters.types.join(","));
  if (filters.all) query.set("all", "1");
  if (options.page && filters.page > 1) query.set("page", String(filters.page));
  return query.toString();
}
