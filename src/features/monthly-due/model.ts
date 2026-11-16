/** Monthly Due maths. Pure functions on paise, so the page, the server and the tests agree. */

export const DEFAULT_EXPENSE_NAME = "Room Rent";
export const MAX_EXPENSE_ROWS = 40;

export interface Balances {
  /** What the debts add up to for the period. */
  debtPaise: number;
  /** Everything that is yours for the period: food, your shopping, your credit portal share, and the monthly expenses. */
  myDuePaise: number;
  /** The money in all your banks now (View Balances). */
  oldPaise: number;
}

/**
 * My Balance = Debt Amount - My Due.
 * New Balance = Old Balance + My Balance.
 */
export function computeBalances({ debtPaise, myDuePaise, oldPaise }: Balances): { myBalancePaise: number; newBalancePaise: number } {
  const myBalancePaise = debtPaise - myDuePaise;
  return { myBalancePaise, newBalancePaise: oldPaise + myBalancePaise };
}

/** Month keys ("2026-11") from one day to another, oldest first. */
export function monthsOfRange(from: string, to: string): string[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out: string[] = [];
  let y = Number(a.slice(0, 4));
  let m = Number(a.slice(5, 7));
  const endY = Number(b.slice(0, 4));
  const endM = Number(b.slice(5, 7));
  while ((y < endY || (y === endY && m <= endM)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
