import { formatINR } from "./money";

/**
 * Split `totalPaise` between `count` people as evenly as possible, in whole paise.
 * The shares always add up to the total exactly: any leftover paise go one each to the first
 * people, so ₹100.00 between three is 33.34 + 33.33 + 33.33.
 */
export function equalSplit(totalPaise: number, count: number): number[] {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) throw new RangeError("Total must be a whole number of paise");
  if (!Number.isInteger(count) || count < 1) throw new RangeError("Need at least one person to split between");
  const base = Math.floor(totalPaise / count);
  const extra = totalPaise - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

export interface SplitSummary {
  totalPaise: number;
  allocatedPaise: number;
  /** Positive: still to allocate. Negative: allocated too much. Zero: balanced. */
  remainingPaise: number;
  isBalanced: boolean;
}

export function summarizeSplit(totalPaise: number, amountsPaise: readonly number[]): SplitSummary {
  const allocatedPaise = amountsPaise.reduce((sum, a) => sum + a, 0);
  const remainingPaise = totalPaise - allocatedPaise;
  return { totalPaise, allocatedPaise, remainingPaise, isBalanced: remainingPaise === 0 };
}

export type SplitValidation = { ok: true } | { ok: false; error: string };

/**
 * Checks a split before it is saved: enough people, no duplicates, every share positive, and the
 * shares add up to the expense exactly (to the paisa).
 */
export function validateSplit(
  totalPaise: number,
  entries: readonly { id: string; amountPaise: number }[],
  options: { minPeople?: number } = {},
): SplitValidation {
  const minPeople = options.minPeople ?? 2;
  if (entries.length < minPeople) {
    return { ok: false, error: `Choose at least ${minPeople} people to split between.` };
  }
  if (new Set(entries.map((e) => e.id)).size !== entries.length) {
    return { ok: false, error: "A person can only appear once in a split." };
  }
  for (const entry of entries) {
    if (!Number.isInteger(entry.amountPaise) || entry.amountPaise <= 0) {
      return { ok: false, error: "Every person in the split needs an amount greater than zero." };
    }
  }
  const { remainingPaise } = summarizeSplit(totalPaise, entries.map((e) => e.amountPaise));
  if (remainingPaise > 0) return { ok: false, error: `${formatINR(remainingPaise)} is still left to allocate.` };
  if (remainingPaise < 0) return { ok: false, error: `The split is over by ${formatINR(-remainingPaise)}.` };
  return { ok: true };
}
