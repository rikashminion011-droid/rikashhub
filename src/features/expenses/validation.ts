import { equalSplit, parseAmountInput, parseISODate, validateSplit } from "@/lib/finance";

/**
 * Business rules for an expense, in one place so the browser and the server apply exactly the same
 * checks. (The server still re-checks everything against the database: who owns what, what exists.)
 */

export type SplitMode = "EQUAL" | "MANUAL";

export interface ExpenseFormInput {
  amount: string;
  notes: string;
  /** YYYY-MM-DD */
  date: string;
  methodId: string | null;
  accountId: string | null;
  categoryId: string | null;
  /** The "To" person when the expense is not split. */
  partyId: string | null;
  split: {
    enabled: boolean;
    mode: SplitMode;
    /** People ticked for the split, in the order they were chosen, with the amount typed (manual mode). */
    selected: { partyId: string; amount: string }[];
  };
}

export interface ExpenseFieldErrors {
  amount?: string;
  notes?: string;
  date?: string;
  method?: string;
  account?: string;
  category?: string;
  party?: string;
  split?: string;
}

export interface ValidExpense {
  amountPaise: number;
  notes: string;
  date: string;
  methodId: string;
  accountId: string | null;
  categoryId: string;
  isSplit: boolean;
  /** Who it is for and how much each. One row for a normal expense. Always adds up to amountPaise. */
  allocations: { partyId: string; amountPaise: number }[];
}

export const MAX_NOTES_LENGTH = 200;
/** ₹9,99,99,999.99: well inside the database column. */
export const MAX_AMOUNT_PAISE = 99_999_999_99;

export function validateExpenseInput(
  input: ExpenseFormInput,
  context: { methodHasAccounts: boolean; today: string },
): { ok: true; value: ValidExpense } | { ok: false; errors: ExpenseFieldErrors } {
  const errors: ExpenseFieldErrors = {};

  const amountPaise = parseAmountInput(input.amount);
  if (input.amount.trim() === "") errors.amount = "Enter the amount.";
  else if (amountPaise === null) errors.amount = "Enter a valid amount, with at most 2 decimals.";
  else if (amountPaise <= 0) errors.amount = "The amount must be greater than zero.";
  else if (amountPaise > MAX_AMOUNT_PAISE) errors.amount = "That amount is too large.";

  const notes = input.notes.trim();
  if (notes.length > MAX_NOTES_LENGTH) errors.notes = `Notes can be at most ${MAX_NOTES_LENGTH} characters.`;

  if (!isRealDate(input.date)) errors.date = "Choose a valid date.";
  else if (input.date > context.today) errors.date = "The date cannot be in the future.";

  if (!input.methodId) errors.method = "Choose how you paid.";
  if (input.methodId && context.methodHasAccounts && !input.accountId) errors.account = "Choose the account you paid from.";
  if (!input.categoryId) errors.category = "Choose a category.";

  let allocations: { partyId: string; amountPaise: number }[] = [];
  const total = amountPaise !== null && amountPaise > 0 ? amountPaise : null;

  if (!input.split.enabled) {
    if (!input.partyId) errors.party = "Choose who this expense is for.";
    else if (total !== null) allocations = [{ partyId: input.partyId, amountPaise: total }];
  } else if (input.split.selected.length === 0) {
    errors.split = "Choose the people to split between.";
  } else if (total !== null) {
    const people = input.split.selected;
    let shares: number[];
    if (input.split.mode === "EQUAL") {
      shares = equalSplit(total, people.length);
    } else {
      const parsed = people.map((p) => parseAmountInput(p.amount));
      if (parsed.some((p) => p === null)) {
        errors.split = "Enter a valid amount for every selected person.";
        shares = [];
      } else {
        shares = parsed as number[];
      }
    }
    if (!errors.split) {
      const entries = people.map((p, i) => ({ id: p.partyId, amountPaise: shares[i]! }));
      const check = validateSplit(total, entries);
      if (!check.ok) errors.split = check.error;
      else allocations = entries.map((e) => ({ partyId: e.id, amountPaise: e.amountPaise }));
    }
  }

  if (Object.keys(errors).length > 0 || total === null) return { ok: false, errors };

  return {
    ok: true,
    value: {
      amountPaise: total,
      notes,
      date: input.date,
      methodId: input.methodId!,
      accountId: input.accountId,
      categoryId: input.categoryId!,
      isSplit: input.split.enabled,
      allocations,
    },
  };
}

function isRealDate(value: string): boolean {
  try {
    parseISODate(value);
    return true;
  } catch {
    return false;
  }
}
