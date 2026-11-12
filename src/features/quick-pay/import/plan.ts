import { istDateOf } from "../datetime";
import { MAX_AMOUNT_PAISE, MAX_REASON_LENGTH } from "../validation";
import type { GpayKind } from "./gpay-statement";

/**
 * Turns parsed statement rows into the entries to save. Pure: the same plan is used by the preview in the
 * browser and, again, by the server when you press Import, so what you saw is what is saved.
 */

export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_KEY_PREFIX = "gpay-import:";

export interface ImportRow {
  id: string;
  kind: GpayKind;
  occurredAt: string;
  amountPaise: number;
  reason: string;
  bank: string;
  toBank: string | null;
}

export interface PlannedEntry {
  /** The unique key saved with the entry. The same payment always gives the same key, so it can never be added twice. */
  key: string;
  type: "DEBIT" | "CREDIT";
  amountPaise: number;
  occurredAt: Date;
  /** What the statement said ("Paid to Indian Railways"). Saved as Transaction details; the Reason is left empty to write. */
  details: string;
  accountId: string;
}

export type RowStatus =
  | { state: "new" }
  | { state: "duplicate" }
  | { state: "skipped"; why: string }
  | { state: "invalid"; why: string };

export interface ImportOptions {
  /** Statement bank name to your bank's id; null (or missing) means "do not import rows for this bank". */
  bankMap: Readonly<Record<string, string | null>>;
  /** Self transfers move money between your own banks. Off by default: the statement itself leaves them out of its totals. */
  includeSelfTransfers: boolean;
}

/** The statement bank names that need a bank chosen for this import. */
export function banksNeeded(rows: readonly ImportRow[], includeSelfTransfers: boolean): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.kind === "SELF_TRANSFER") {
      if (!includeSelfTransfers) continue;
      names.add(row.bank);
      if (row.toBank) names.add(row.toBank);
    } else names.add(row.bank);
  }
  return [...names].sort();
}

const clip = (text: string) => (text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1)}…` : text);

/** The keys a row would save under (one for a payment, two for a self transfer). */
export function keysOf(row: Pick<ImportRow, "id" | "kind">): string[] {
  return row.kind === "SELF_TRANSFER" ? [`${IMPORT_KEY_PREFIX}${row.id}:out`, `${IMPORT_KEY_PREFIX}${row.id}:in`] : [`${IMPORT_KEY_PREFIX}${row.id}`];
}

/** Checks the shape of a row, so a bad file or a tampered request cannot save rubbish. Null when fine. */
export function problemWith(row: ImportRow): string | null {
  if (!/^\d{4,40}$/.test(row.id)) return "The UPI Transaction ID is not valid.";
  if (!Number.isSafeInteger(row.amountPaise) || row.amountPaise <= 0 || row.amountPaise > MAX_AMOUNT_PAISE) return "The amount is not valid.";
  const when = new Date(row.occurredAt);
  if (Number.isNaN(when.getTime())) return "The date and time are not valid.";
  if (when.getTime() > Date.now() + 36 * 3_600_000) return "The date is in the future.";
  if (when.getUTCFullYear() < 2015) return "The date is too old to be right.";
  if (row.kind === "SELF_TRANSFER" && !row.toBank) return "The bank the money went to is missing.";
  return null;
}

export function planImport(
  rows: readonly ImportRow[],
  options: ImportOptions,
  existingKeys: ReadonlySet<string>,
): { entries: PlannedEntry[]; statuses: RowStatus[]; counts: { new: number; duplicate: number; skipped: number; invalid: number } } {
  const entries: PlannedEntry[] = [];
  const statuses: RowStatus[] = [];
  const counts = { new: 0, duplicate: 0, skipped: 0, invalid: 0 };
  const seen = new Set<string>(); // the same id twice in one file counts once

  for (const row of rows) {
    const status = ((): RowStatus => {
      const problem = problemWith(row);
      if (problem) return { state: "invalid", why: problem };

      const keys = keysOf(row);
      if (keys.some((k) => seen.has(k))) return { state: "duplicate" };

      const when = new Date(row.occurredAt);
      if (row.kind === "SELF_TRANSFER") {
        if (!options.includeSelfTransfers) return { state: "skipped", why: "Self transfer (not imported)" };
        const from = options.bankMap[row.bank];
        const to = options.bankMap[row.toBank!];
        if (!from || !to) return { state: "skipped", why: "No bank chosen" };
        if (from === to) return { state: "skipped", why: "Both banks are the same" };
        const [outKey, inKey] = keys as [string, string];
        const missing: PlannedEntry[] = [];
        if (!existingKeys.has(outKey)) missing.push({ key: outKey, type: "DEBIT", amountPaise: row.amountPaise, occurredAt: when, details: clip(row.reason), accountId: from });
        if (!existingKeys.has(inKey)) missing.push({ key: inKey, type: "CREDIT", amountPaise: row.amountPaise, occurredAt: when, details: clip(`Self transfer from ${row.bank}`), accountId: to });
        if (missing.length === 0) return { state: "duplicate" };
        for (const k of keys) seen.add(k);
        entries.push(...missing);
        return { state: "new" };
      }

      const account = options.bankMap[row.bank];
      if (!account) return { state: "skipped", why: "No bank chosen" };
      const [key] = keys as [string];
      if (existingKeys.has(key)) return { state: "duplicate" };
      seen.add(key);
      entries.push({ key, type: row.kind === "DEBIT" ? "DEBIT" : "CREDIT", amountPaise: row.amountPaise, occurredAt: when, details: clip(row.reason), accountId: account });
      return { state: "new" };
    })();

    statuses.push(status);
    counts[status.state]++;
  }
  return { entries, statuses, counts };
}

/** The date a row falls on, for showing in the preview (India time). */
export const dateOf = (iso: string) => istDateOf(new Date(iso));
