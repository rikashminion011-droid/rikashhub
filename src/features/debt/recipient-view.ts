import { istDateOf } from "@/features/quick-pay/datetime";
import { formatINR } from "@/lib/finance";
import type { DebtItem } from "./types";

/**
 * The view of one recipient's transactions: a search over every column, Credit and Debit filters, a date range, an order, and the
 * columns that are shown. Pure, so the page and the export file apply exactly the same rules and the same columns.
 */

export const SOURCE_LABEL = { SPLIT: "Split", DEBT: "Debt", SHOPPING: "Shopping", CREDIT_PORTAL: "Credit Portal", MANUAL: "Added debt", PAYMENT: "Payment" } as const;

export const COLUMNS = [
  { id: "date", label: "Date and time" },
  { id: "type", label: "Type" },
  { id: "reason", label: "Reason" },
  { id: "category", label: "Category" },
  { id: "related", label: "Portal / platform" },
  { id: "debt", label: "Debt" },
  { id: "paid", label: "Paid / Credited" },
] as const;
export type ColumnId = (typeof COLUMNS)[number]["id"];
export const COLUMN_IDS = COLUMNS.map((c) => c.id) as ColumnId[];

export interface ColumnPrefs {
  /** Every column, in the order shown. */
  order: ColumnId[];
  hidden: ColumnId[];
}

export const DEFAULT_COLUMNS: ColumnPrefs = { order: [...COLUMN_IDS], hidden: [] };

/** Saved preferences made safe: unknown columns dropped, missing ones added at the end, at least one column kept visible. */
export function normalizeColumns(raw: unknown): ColumnPrefs {
  const input = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; hidden?: unknown };
  const known = new Set<string>(COLUMN_IDS);
  const order = [...new Set(Array.isArray(input.order) ? input.order.filter((c): c is ColumnId => typeof c === "string" && known.has(c)) : [])];
  for (const id of COLUMN_IDS) if (!order.includes(id)) order.push(id);
  let hidden = [...new Set(Array.isArray(input.hidden) ? input.hidden.filter((c): c is ColumnId => typeof c === "string" && known.has(c)) : [])];
  if (hidden.length >= order.length) hidden = hidden.slice(1);
  return { order, hidden };
}

export const visibleColumns = (prefs: ColumnPrefs): ColumnId[] => prefs.order.filter((c) => !prefs.hidden.includes(c));

export type KindFilter = "ALL" | "DEBIT" | "CREDIT";

export interface RecipientFilters {
  q: string;
  /** Debit: what the person owes. Credit: what they paid or credited. */
  kind: KindFilter;
  /** YYYY-MM-DD, inclusive; empty for no limit. */
  from: string;
  to: string;
  order: "asc" | "desc";
}

export const DEFAULT_FILTERS: RecipientFilters = { q: "", kind: "ALL", from: "", to: "", order: "desc" };

const whenText = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
export const whenOf = (iso: string) => whenText.format(new Date(iso));

export function filterItems(items: readonly DebtItem[], f: RecipientFilters): DebtItem[] {
  const needle = f.q.trim().toLowerCase();
  const out = items.filter((i) => {
    const payment = i.source === "PAYMENT";
    if (f.kind === "DEBIT" && payment) return false;
    if (f.kind === "CREDIT" && !payment) return false;
    const day = istDateOf(new Date(i.occurredAt));
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return !needle || [whenOf(i.occurredAt), SOURCE_LABEL[i.source], i.reason, i.category, i.related, formatINR(i.amountPaise)].join(" ").toLowerCase().includes(needle);
  });
  return out.sort((a, b) => (f.order === "asc" ? a.occurredAt.localeCompare(b.occurredAt) : b.occurredAt.localeCompare(a.occurredAt)));
}

/** What is shown adds up to: the debt (what is owed), what was paid or credited, and what remains. */
export function totalsOf(items: readonly DebtItem[]): { debitPaise: number; creditPaise: number; remainingPaise: number; count: number } {
  const debitPaise = items.filter((i) => i.source !== "PAYMENT").reduce((s, i) => s + i.amountPaise, 0);
  const creditPaise = items.filter((i) => i.source === "PAYMENT").reduce((s, i) => s + i.amountPaise, 0);
  return { debitPaise, creditPaise, remainingPaise: debitPaise - creditPaise, count: items.length };
}

/** The filters from an address's search parameters (bad values are dropped), for the page and the export. */
export function filtersFromParams(params: Record<string, string | string[] | undefined>): RecipientFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const kind = first(params.rk);
  return { q: first(params.rq).trim().slice(0, 100), kind: kind === "DEBIT" || kind === "CREDIT" ? kind : "ALL", from: date(first(params.rf)), to: date(first(params.rt)), order: first(params.ro) === "asc" ? "asc" : "desc" };
}

export function filtersToQuery(f: RecipientFilters): string {
  const q = new URLSearchParams();
  if (f.q) q.set("rq", f.q);
  if (f.kind !== "ALL") q.set("rk", f.kind);
  if (f.from) q.set("rf", f.from);
  if (f.to) q.set("rt", f.to);
  if (f.order === "asc") q.set("ro", "asc");
  return q.toString();
}
