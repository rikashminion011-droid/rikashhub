import type { BulkRow } from "./bulk-rows";
import { MAX_BULK_ROWS, isBlankBulkRow } from "./validation";

/**
 * The Add Bulk sheet as a draft. Whatever is typed is kept in this browser as it is typed, so leaving the page (or refreshing)
 * does not lose it; opening Add Bulk again, or pressing Draft on GPay Transactions, brings it back where it was left.
 * It is cleared when the sheet is saved or cancelled.
 */

export const DRAFT_KEY = "rikash:add-bulk:draft:v2";

const blank = (r: Pick<BulkRow, "key" | "date" | "time">): BulkRow => ({ key: r.key, date: r.date, time: r.time, debit: "", credit: "", reason: "", accountId: null, categoryId: null, shares: [] });

/** The saved draft, or null when there is none (or it cannot be read). */
export function readDraft(): BulkRow[] | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");
    if (!Array.isArray(parsed)) return null;
    const rows = parsed
      .filter((r): r is BulkRow => !!r && typeof r === "object" && typeof (r as BulkRow).key === "string" && typeof (r as BulkRow).date === "string" && typeof (r as BulkRow).time === "string")
      .map((r) => ({ ...blank(r), ...r, shares: Array.isArray(r.shares) ? r.shares : [] }))
      .slice(0, MAX_BULK_ROWS);
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

/** Keeps the sheet as the draft; a sheet with nothing typed in it is not a draft. */
export function writeDraft(rows: readonly BulkRow[]) {
  try {
    if (rows.every(isBlankBulkRow)) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(rows));
  } catch {
    // Storage can be blocked (private window); the sheet still works, it just is not kept.
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // nothing to clear
  }
}

/** How many rows of the saved draft have something typed in them. */
export function draftRowCount(): number {
  return (readDraft() ?? []).filter((r) => !isBlankBulkRow(r)).length;
}
