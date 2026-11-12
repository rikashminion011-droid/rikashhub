/**
 * Split maths, in integer paise. A split gives one person a share of a transaction, either as a percentage of the
 * amount or as a fixed amount. The rest of the amount stays with you.
 *
 *   ₹400 at 50%  -> ₹200
 *   ₹400 at 18%  -> ₹72
 */

export const DEFAULT_PERCENT_OPTIONS: readonly number[] = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100];

export type SplitMethod = "PERCENT" | "FIXED";

/** The share for a percentage: 18% of 40000 paise is 7200. Rounded to the nearest paisa. */
export function shareOf(amountPaise: number, percent: number): number {
  return Math.round((amountPaise * percent) / 100);
}

/** The percentage a share is of the amount, to 4 decimals (200 of 400 is 50). */
export function percentOfShare(amountPaise: number, sharePaise: number): number {
  if (amountPaise <= 0) return 0;
  return Math.round((sharePaise / amountPaise) * 100 * 10_000) / 10_000;
}

/** A percentage typed by hand: "50", "18.5", "12.50%". Above 0 up to 100, at most 2 decimals. Null when not valid. */
export function parsePercent(text: string): number | null {
  const m = /^\s*(\d{1,3}(?:\.\d{1,2})?)\s*%?\s*$/.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  return value > 0 && value <= 100 ? value : null;
}

/** "50", "18.5" for display. */
export const formatPercent = (percent: number) => `${Number(percent.toFixed(2))}%`;

export interface SplitSpec {
  method: SplitMethod;
  /** For PERCENT a percentage ("50"); for FIXED an amount in rupees ("200"). */
  value: string;
}

export type ResolvedSplit = { ok: true; sharePaise: number; percent: number } | { ok: false; error: string };

/**
 * Works out a person's share from what was typed. The share is never more than the transaction amount and never zero.
 * Used by the browser (to show the calculation as you type) and again by the server (which decides what is saved).
 */
export function resolveSplit(amountPaise: number, spec: SplitSpec, parseAmount: (text: string) => number | null): ResolvedSplit {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return { ok: false, error: "Enter the amount first." };
  if (spec.method === "PERCENT") {
    const percent = parsePercent(spec.value);
    if (percent === null) return { ok: false, error: "Enter a percentage above 0, up to 100." };
    const sharePaise = shareOf(amountPaise, percent);
    if (sharePaise <= 0) return { ok: false, error: "That share is too small to be worth a paisa." };
    return { ok: true, sharePaise, percent: percentOfShare(amountPaise, sharePaise) === percent ? percent : percentOfShare(amountPaise, sharePaise) };
  }
  const fixed = parseAmount(spec.value);
  if (fixed === null || fixed <= 0) return { ok: false, error: "Enter the person's share, like 200." };
  if (fixed > amountPaise) return { ok: false, error: "The share cannot be more than the amount." };
  return { ok: true, sharePaise: fixed, percent: percentOfShare(amountPaise, fixed) };
}
