/** Monthly Due maths. Pure functions on paise, so the page, the server and the tests agree. */

export const DEFAULT_EXPENSE_NAME = "Room Rent";
export const MAX_EXPENSE_ROWS = 40;

export interface Balances {
  /** What the chosen recipients still owe (their remaining amount) for the period. */
  debtPaise: number;
  /** My monthly bills for the months of the period. */
  billsPaise: number;
  /** Everything that is yours for the period: food, your shopping, your credit portal share, and my other expenses (those ticked). */
  myDuePaise: number;
  /** The money in all your banks now (Update Balance). */
  oldPaise: number;
}

/**
 * My Balance = Debt Amount - My monthly bills - My Due.
 * New Balance = Update Balance total + My Balance.
 */
export function computeBalances({ debtPaise, billsPaise, myDuePaise, oldPaise }: Balances): { myBalancePaise: number; newBalancePaise: number } {
  const myBalancePaise = debtPaise - billsPaise - myDuePaise;
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
