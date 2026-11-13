import { countFilledRows, type BulkRow } from "./bulk-rows";
import { MAX_BULK_ROWS } from "./validation";

/**
 * The Add Bulk sheet as a draft. The sheet is kept on the server as it is typed (so it is the same on every device), and a copy
 * is kept in this browser as well, so nothing is lost if the connection drops. Opening Add Bulk, or pressing Draft on GPay
 * Transactions, brings it back where it was left. It is cleared when the sheet is saved or cancelled.
 */

export const DRAFT_KEY = "rikash:add-bulk:draft:v3";

const blank = (r: Pick<BulkRow, "key" | "date" | "time">): BulkRow => ({ key: r.key, date: r.date, time: r.time, debit: "", credit: "", reason: "", accountId: null, categoryId: null, shares: [] });

/** Checks and tidies rows that came from storage or the server: anything unreadable is dropped, missing fields are filled in. */
export function cleanDraftRows(input: unknown): BulkRow[] | null {
  if (!Array.isArray(input)) return null;
  const rows = input
    .filter((r): r is BulkRow => !!r && typeof r === "object" && typeof (r as BulkRow).key === "string" && typeof (r as BulkRow).date === "string" && typeof (r as BulkRow).time === "string")
    .map((r) => ({ ...blank(r), ...r, shares: Array.isArray(r.shares) ? r.shares : [] }))
    .slice(0, MAX_BULK_ROWS);
  return rows.length > 0 ? rows : null;
}

/** This browser's copy of the draft, with when it was saved, or null. */
export function readLocalDraft(): { rows: BulkRow[]; savedAt: number } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as { rows?: unknown; savedAt?: unknown } | null;
    const rows = cleanDraftRows(parsed?.rows);
    return rows ? { rows, savedAt: typeof parsed?.savedAt === "number" ? parsed.savedAt : 0 } : null;
  } catch {
    return null;
  }
}

/** Keeps this browser's copy; a sheet with nothing typed in it is not a draft. */
export function writeLocalDraft(rows: readonly BulkRow[]) {
  try {
    if (countFilledRows(rows) === 0) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows, savedAt: Date.now() }));
  } catch {
    // Storage can be blocked (private window); the draft is still kept on the server.
  }
}

export function clearLocalDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // nothing to clear
  }
}

/** How many rows of this browser's copy have something typed in them. */
export function localDraftCount(): number {
  return countFilledRows(readLocalDraft()?.rows ?? []);
}
