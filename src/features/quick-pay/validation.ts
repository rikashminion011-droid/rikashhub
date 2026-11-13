import { parseAmountInput } from "@/lib/finance";
import { istInstant, isValidTime } from "./datetime";
import { resolveShares, type ResolvedShare, type ShareInput, type SplitKind } from "./shares";

/** Rules for a Quick Pay entry and for the rows of a bulk entry. Used by the browser and re-checked by the server. */

export type EntryType = "DEBIT" | "CREDIT";

export const MAX_REASON_LENGTH = 200;
export const MAX_AMOUNT_PAISE = 99_999_999_99;
export const MAX_BULK_ROWS = 1000;

export interface QuickPayInput {
  amount: string;
  type: EntryType;
  reason: string;
  accountId: string | null;
  categoryId: string | null;
  split: {
    /** Off means the entry is not shared with anyone. */
    enabled: boolean;
    /** Split (you and them share it) or Debt (they owe it). Split when left out. */
    kind?: SplitKind;
    /** The people and each one's share. */
    shares?: readonly ShareInput[];
  };
  /** Credits added to this debit (ids of saved credit entries). */
  creditIds?: readonly string[];
}

export interface QuickPayErrors {
  amount?: string;
  reason?: string;
  bank?: string;
  split?: string;
  splitValue?: string;
}

export interface ValidQuickPay {
  type: EntryType;
  amountPaise: number;
  reason: string;
  accountId: string;
  categoryId: string | null;
  /** Split or Debt when the entry is shared with people, otherwise null. */
  splitKind: SplitKind | null;
  /** Each person's share in paise and as a percentage of the amount. Empty when not shared. What is left is yours. */
  shares: ResolvedShare[];
  /** Credits added to this debit. */
  creditIds: string[];
}

/** An opening balance typed by hand: "2,000", "₹2000.50" or "-500". Returns paise (may be negative), or null if invalid. */
export function parseOpeningBalance(text: string): number | null {
  const trimmed = text.trim();
  const negative = trimmed.startsWith("-");
  const paise = parseAmountInput(negative ? trimmed.slice(1) : trimmed);
  if (paise === null || paise > MAX_AMOUNT_PAISE) return null;
  return negative ? -paise : paise;
}

function checkAmount(text: string): { paise: number } | { error: string } {
  if (text.trim() === "") return { error: "Enter the amount." };
  const paise = parseAmountInput(text);
  if (paise === null) return { error: "Enter a valid amount, with at most 2 decimals." };
  if (paise <= 0) return { error: "The amount must be greater than zero." };
  if (paise > MAX_AMOUNT_PAISE) return { error: "That amount is too large." };
  return { paise };
}

export function validateQuickPayInput(input: QuickPayInput): { ok: true; value: ValidQuickPay } | { ok: false; errors: QuickPayErrors } {
  const errors: QuickPayErrors = {};
  const amount = checkAmount(input.amount);
  if ("error" in amount) errors.amount = amount.error;

  const reason = input.reason.trim();
  if (reason.length > MAX_REASON_LENGTH) errors.reason = `Reason can be at most ${MAX_REASON_LENGTH} characters.`;
  if (!input.accountId) errors.bank = "Choose the bank this went through.";
  let shares: ResolvedShare[] = [];
  if (input.split.enabled) {
    const lines = input.split.shares ?? [];
    if (lines.length === 0) errors.split = "Choose the people this is shared with.";
    else if (!("error" in amount)) {
      const resolved = resolveShares(amount.paise, lines);
      if (resolved.ok) shares = resolved.shares;
      else errors.splitValue = resolved.error;
    }
  }
  if (input.split.enabled && input.split.kind === "DEBT" && input.type === "CREDIT") errors.split = "A Debt can only be added to a Debit.";

  const creditIds = [...new Set(input.creditIds ?? [])];
  if (input.type === "CREDIT" && creditIds.length > 0) errors.split = "Credits can only be added to a Debit.";

  if (Object.keys(errors).length > 0 || "error" in amount) return { ok: false, errors };
  return {
    ok: true,
    value: {
      type: input.type,
      amountPaise: amount.paise,
      reason,
      accountId: input.accountId!,
      categoryId: input.categoryId,
      splitKind: input.split.enabled ? (input.split.kind ?? "SPLIT") : null,
      shares,
      creditIds,
    },
  };
}

// ───────────────────────── Self transfer ─────────────────────────

export interface TransferInput {
  fromId: string | null;
  toId: string | null;
  amount: string;
  reason: string;
}

export interface TransferErrors {
  from?: string;
  to?: string;
  amount?: string;
  reason?: string;
}

export function validateTransfer(input: TransferInput): { ok: true; value: { fromId: string; toId: string; amountPaise: number; reason: string } } | { ok: false; errors: TransferErrors } {
  const errors: TransferErrors = {};
  if (!input.fromId) errors.from = "Choose the bank the money comes from.";
  if (!input.toId) errors.to = "Choose the bank the money goes to.";
  else if (input.fromId && input.fromId === input.toId) errors.to = "Choose two different banks.";
  const amount = checkAmount(input.amount);
  if ("error" in amount) errors.amount = amount.error;
  const reason = input.reason.trim();
  if (reason.length > MAX_REASON_LENGTH) errors.reason = `Reason can be at most ${MAX_REASON_LENGTH} characters.`;
  if (Object.keys(errors).length > 0 || "error" in amount) return { ok: false, errors };
  return { ok: true, value: { fromId: input.fromId!, toId: input.toId!, amountPaise: amount.paise, reason } };
}

// ───────────────────────── Bulk entry ─────────────────────────

export interface BulkRowInput {
  /** Stable id of the row in the grid. */
  key: string;
  date: string;
  time: string;
  debit: string;
  credit: string;
  reason: string;
  accountId: string | null;
  categoryId: string | null;
  /** The people this row is split with and their shares (empty when it is not split). */
  shares: readonly ShareInput[];
  /** Set when the row is a self transfer: the bank the money leaves and the bank it goes to. Saved with all the other rows. */
  transfer?: { fromId: string; toId: string } | null;
}

export interface BulkRowErrors {
  date?: string;
  time?: string;
  amount?: string;
  bank?: string;
  reason?: string;
  split?: string;
}

export interface ValidBulkRow {
  key: string;
  type: EntryType;
  amountPaise: number;
  occurredAt: Date;
  reason: string;
  accountId: string;
  categoryId: string | null;
  /** Each person's share in paise and as a percentage (empty when not split). What is left is yours. */
  shares: ResolvedShare[];
  /** Set for a self transfer (`accountId` is then the bank the money leaves). */
  transfer?: { toId: string } | null;
}

/** A row nobody has typed anything into (the date and time are pre-filled, so they do not count). */
export function isBlankBulkRow(row: BulkRowInput): boolean {
  return !row.debit.trim() && !row.credit.trim() && !row.reason.trim() && !row.accountId && !row.categoryId && row.shares.length === 0 && !row.transfer;
}

export function validateBulkRow(row: BulkRowInput, now: Date): { ok: true; value: ValidBulkRow } | { ok: false; errors: BulkRowErrors } {
  const errors: BulkRowErrors = {};

  const hasDebit = row.debit.trim() !== "";
  const hasCredit = row.credit.trim() !== "";
  let type: EntryType = "DEBIT";
  let amountPaise = 0;
  if (hasDebit && hasCredit) {
    errors.amount = "Enter either a Debit or a Credit, not both.";
  } else if (!hasDebit && !hasCredit) {
    errors.amount = "Enter a Debit or a Credit amount.";
  } else {
    const checked = checkAmount(hasDebit ? row.debit : row.credit);
    if ("error" in checked) errors.amount = checked.error;
    else {
      amountPaise = checked.paise;
      type = hasDebit ? "DEBIT" : "CREDIT";
    }
  }

  let occurredAt: Date | null = null;
  if (!isValidTime(row.time)) errors.time = "Choose a time.";
  try {
    occurredAt = istInstant(row.date, isValidTime(row.time) ? row.time : "00:00");
  } catch {
    errors.date = "Choose a valid date.";
  }
  if (!errors.date && !errors.time && occurredAt && occurredAt.getTime() > now.getTime() + 5 * 60_000) {
    errors.date = "The date and time cannot be in the future.";
  }

  const reason = row.reason.trim();
  if (reason.length > MAX_REASON_LENGTH) errors.reason = `Reason can be at most ${MAX_REASON_LENGTH} characters.`;
  if (row.transfer) {
    if (!row.transfer.fromId || !row.transfer.toId) errors.bank = "Choose both banks for the transfer.";
    else if (row.transfer.fromId === row.transfer.toId) errors.bank = "Choose two different banks.";
  } else if (!row.accountId) errors.bank = "Choose a bank.";

  let shares: ResolvedShare[] = [];
  if (!row.transfer && row.shares.length > 0 && !errors.amount) {
    const resolved = resolveShares(amountPaise, row.shares);
    if (resolved.ok) shares = resolved.shares;
    else errors.split = resolved.error;
  }

  if (Object.keys(errors).length > 0 || !occurredAt) return { ok: false, errors };
  return {
    ok: true,
    value: row.transfer
      ? { key: row.key, type, amountPaise, occurredAt, reason, accountId: row.transfer.fromId, categoryId: null, shares: [], transfer: { toId: row.transfer.toId } }
      : { key: row.key, type, amountPaise, occurredAt, reason, accountId: row.accountId!, categoryId: row.categoryId, shares, transfer: null },
  };
}

/** Validates the whole sheet. Blank rows are skipped; every other row must be valid or nothing is saved. */
export function validateBulk(
  rows: readonly BulkRowInput[],
  now: Date,
): { ok: true; rows: ValidBulkRow[] } | { ok: false; errors: Record<string, BulkRowErrors>; message: string } {
  const filled = rows.filter((r) => !isBlankBulkRow(r));
  if (filled.length === 0) return { ok: false, errors: {}, message: "Add at least one row with an amount." };
  if (filled.length > MAX_BULK_ROWS) return { ok: false, errors: {}, message: `Save at most ${MAX_BULK_ROWS} rows at a time.` };

  const errors: Record<string, BulkRowErrors> = {};
  const valid: ValidBulkRow[] = [];
  for (const row of filled) {
    const result = validateBulkRow(row, now);
    if (result.ok) valid.push(result.value);
    else errors[row.key] = result.errors;
  }
  const bad = Object.keys(errors).length;
  if (bad > 0) return { ok: false, errors, message: `${bad} row${bad === 1 ? " needs" : "s need"} fixing before anything is saved.` };
  return { ok: true, rows: valid };
}
