import { shiftDate } from "./date-format";
import { matchCategory, type KeywordEntry } from "./keywords";
import type { BulkRowInput } from "./validation";

/**
 * Row operations for the Add Bulk sheet, and the arrow-key movement between cells. Pure functions, so they can be tested
 * without a browser. Rows are identified by their `key`.
 */

export interface RowChange {
  rows: BulkRowInput[];
  /** Keys of the rows that were added, in sheet order (for moving the cursor to the first one). */
  added: string[];
}

/**
 * Copies rows. Each copy sits directly under the row it was copied from, with a new key and the same date, time, amounts,
 * reason, bank, category and person. Rows are copied in sheet order whatever order `keys` lists them in.
 */
export function cloneRows(rows: readonly BulkRowInput[], keys: ReadonlySet<string> | readonly string[], newKey: () => string, limit: number): RowChange | { error: string } {
  const wanted = keys instanceof Set ? keys : new Set(keys);
  const count = rows.filter((r) => wanted.has(r.key)).length;
  if (count === 0) return { rows: [...rows], added: [] };
  if (rows.length + count > limit) return { error: `A sheet can hold at most ${limit} rows.` };

  const out: BulkRowInput[] = [];
  const added: string[] = [];
  for (const row of rows) {
    out.push(row);
    if (wanted.has(row.key)) {
      const copy = { ...row, key: newKey() };
      out.push(copy);
      added.push(copy.key);
    }
  }
  return { rows: out, added };
}

/**
 * Adds an empty row above or below another one. The new row starts with that row's date and time, which is what you want
 * when entering a day's transactions in order.
 */
export function insertRow(rows: readonly BulkRowInput[], key: string, where: "above" | "below", blank: (date: string, time: string) => BulkRowInput, limit: number): RowChange | { error: string } {
  const at = rows.findIndex((r) => r.key === key);
  if (at < 0) return { rows: [...rows], added: [] };
  if (rows.length + 1 > limit) return { error: `A sheet can hold at most ${limit} rows.` };
  const fresh = blank(rows[at]!.date, rows[at]!.time);
  const out = [...rows];
  out.splice(where === "above" ? at : at + 1, 0, fresh);
  return { rows: out, added: [fresh.key] };
}

/** Removes rows. If that would leave the sheet empty, one empty row is kept so there is always somewhere to type. */
export function deleteRows(rows: readonly BulkRowInput[], keys: ReadonlySet<string> | readonly string[], blank: () => BulkRowInput): BulkRowInput[] {
  const gone = keys instanceof Set ? keys : new Set(keys);
  const left = rows.filter((r) => !gone.has(r.key));
  return left.length > 0 ? left : [blank()];
}

export type Direction = "up" | "down" | "left" | "right";

/**
 * The cell an arrow key moves to. Up and down stay in the column and left and right stay in the row, skipping cells that
 * cannot be used (for example a Debit box that is switched off because Credit has an amount). Returns null at the edge.
 */
export function nextCell(
  size: { rows: number; cols: number },
  from: { row: number; col: number },
  direction: Direction,
  usable: (row: number, col: number) => boolean,
): { row: number; col: number } | null {
  const dRow = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const dCol = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  let row = from.row + dRow;
  let col = from.col + dCol;
  while (row >= 0 && row < size.rows && col >= 0 && col < size.cols) {
    if (usable(row, col)) return { row, col };
    row += dRow;
    col += dCol;
  }
  return null;
}

/**
 * Adds one empty row at the end for the day after the last row: if the last row is 2nd October, the new row is 3rd October.
 * It keeps the last row's time. A day after `today` is refused, because a transaction cannot be in the future.
 */
export function addNextDay(rows: readonly BulkRowInput[], blank: (date: string, time: string) => BulkRowInput, today: string, limit: number): RowChange | { error: string } {
  if (rows.length + 1 > limit) return { error: `A sheet can hold at most ${limit} rows.` };
  const last = rows.at(-1);
  if (!last) return { error: "There is no row to continue from." };
  const date = shiftDate(last.date, 1);
  if (date > today) return { error: "The next day is in the future. A transaction cannot be dated after today." };
  const fresh = blank(date, last.time);
  return { rows: [...rows, fresh], added: [fresh.key] };
}

/** How many rows "Add rows" adds, from what was typed: 5 when empty or invalid, at most what still fits. */
export function rowsToAdd(text: string, room: number): number {
  const n = Number.parseInt(text.trim(), 10);
  const wanted = Number.isFinite(n) && n > 0 ? n : 5;
  return Math.max(0, Math.min(wanted, room));
}

/** A sheet row as it is on screen: the row itself plus whether its category was picked by a keyword or by you. */
export type BulkRow = BulkRowInput & { categoryManual?: boolean; categoryAuto?: boolean };

/** True when the row is a credit (money in): only a Credit amount is typed. */
export const isCreditRow = (row: Pick<BulkRowInput, "debit" | "credit">) => row.credit.trim() !== "" && row.debit.trim() === "";

/**
 * The row after its Reason changes, with the same rules as Quick Entry: a keyword in the Reason picks the category unless you
 * chose it yourself; if a keyword picked it and no longer matches it is cleared. `keywords` are the ones for this row's kind
 * (a Debit and a Credit have different categories).
 */
export function rowWithReason<T extends BulkRow>(row: T, reason: string, keywords: readonly KeywordEntry[]): T {
  const next = { ...row, reason };
  if (row.categoryManual) return next;
  const matched = matchCategory(reason, keywords);
  if (matched) return { ...next, categoryId: matched, categoryAuto: true };
  if (row.categoryAuto) return { ...next, categoryId: null, categoryAuto: false };
  return next;
}

/** The row after an amount is typed. When it turns from a debit into a credit (or back) its category is dropped, because the two kinds have different categories. */
export function rowWithAmounts<T extends BulkRow>(row: T, changes: Partial<Pick<BulkRowInput, "debit" | "credit">>): T {
  const next = { ...row, ...changes };
  return isCreditRow(next) !== isCreditRow(row) ? { ...next, categoryId: null, categoryAuto: false, categoryManual: false } : next;
}
