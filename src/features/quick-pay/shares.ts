import { parseAmountInput } from "@/lib/finance";
import { percentOfShare, resolveSplit, shareOf, type SplitMethod } from "./split";

/**
 * Sharing one transaction between several people, in integer paise.
 *
 * Split: you and the chosen people share the cost. One person defaults to 50% (the rest is yours); with two or more
 * people the amount is divided equally between them (₹50 and two people is ₹25 each).
 * Debt: the chosen people owe the amount. One person defaults to 100%; with more, it is divided equally.
 */

export type SplitKind = "SPLIT" | "DEBT";

/** One person's share as it is typed: a percentage ("50") or, for FIXED, an amount in rupees ("25"). */
export interface ShareInput {
  partyId: string;
  method: SplitMethod;
  value: string;
  /** Screen only: true once the share was typed by hand, so choosing more people never changes it. */
  edited?: boolean;
}

export interface ResolvedShare {
  partyId: string;
  sharePaise: number;
  percent: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The percentages given to each of `count` people when nothing has been typed. A single person gets `single` (50 for a
 * Split, 100 for a Debt); several people divide 100% equally, and the last one takes any rounding left over so the
 * total is exactly 100.
 */
export function evenPercents(count: number, single: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [single];
  const each = Math.floor((100 / count) * 100) / 100;
  const list = Array<number>(count).fill(each);
  list[count - 1] = round2(100 - each * (count - 1));
  return list;
}

/** The percentage a lone person starts with. */
export const singlePercent = (kind: SplitKind, splitDefault: number, debtDefault = 100) => (kind === "DEBT" ? debtDefault : splitDefault);

export type ResolvedShares = { ok: true; shares: ResolvedShare[]; sharedPaise: number; restPaise: number } | { ok: false; error: string; /** Index of the line with the problem. */ line?: number };

/**
 * Works out every person's share. Each person appears once, each share must be valid, and together they cannot be more
 * than the amount. What is left over stays with you. When the percentages add up to exactly 100, the last person takes
 * the odd paisa, so nothing is lost to rounding.
 */
export function resolveShares(amountPaise: number, lines: readonly ShareInput[], parseAmount: (text: string) => number | null = parseAmountInput): ResolvedShares {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return { ok: false, error: "Enter the amount first." };
  if (lines.length === 0) return { ok: false, error: "Choose at least one person." };
  if (new Set(lines.map((l) => l.partyId)).size !== lines.length) return { ok: false, error: "Each person can be chosen only once." };

  const shares: ResolvedShare[] = [];
  for (const [index, line] of lines.entries()) {
    const resolved = resolveSplit(amountPaise, { method: line.method, value: line.value }, parseAmount);
    if (!resolved.ok) return { ok: false, error: resolved.error, line: index };
    shares.push({ partyId: line.partyId, sharePaise: resolved.sharePaise, percent: resolved.percent });
  }

  // The percentages as typed (not as re-derived from rounded paise): exactly 100 means the people take the whole amount.
  const totalPercent = lines.every((l) => l.method === "PERCENT") ? lines.reduce((s, l) => s + Number(l.value), 0) : null;
  if (totalPercent !== null && Math.abs(totalPercent - 100) < 0.005 && shares.length > 1) {
    const others = shares.slice(0, -1).reduce((s, x) => s + x.sharePaise, 0);
    const last = shares[shares.length - 1]!;
    last.sharePaise = amountPaise - others;
    last.percent = percentOfShare(amountPaise, last.sharePaise);
  }

  const sharedPaise = shares.reduce((s, x) => s + x.sharePaise, 0);
  if (sharedPaise > amountPaise) return { ok: false, error: "The shares add up to more than the amount." };
  return { ok: true, shares, sharedPaise, restPaise: amountPaise - sharedPaise };
}

/** What a person's share would be for a percentage, for showing the amount beside it before anything is saved. */
export const shareFor = (amountPaise: number, percent: number) => shareOf(amountPaise, percent);
