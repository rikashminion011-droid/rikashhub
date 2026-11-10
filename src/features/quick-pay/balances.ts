/**
 * Bank balances.
 *   Current balance = Opening balance + total credits - total debits.
 * For a credit line such as Slice the figure is the amount owed, so a debit raises it and a credit lowers it.
 */

export type BalanceKind = "ASSET" | "CREDIT_LINE";

export function currentBalance(input: { openingPaise: number; creditsPaise: number; debitsPaise: number; kind?: BalanceKind }): number {
  const net = input.creditsPaise - input.debitsPaise;
  return input.openingPaise + (input.kind === "CREDIT_LINE" ? -net : net);
}

export interface AccountBalanceInput {
  id: string;
  name: string;
  kind: BalanceKind;
  parentId: string | null;
  openingPaise: number;
  /** ISO instant the opening balance is as of; null = all entries count. */
  openingAt?: string | null;
  creditsPaise: number;
  debitsPaise: number;
}

export interface BalanceLine {
  id: string;
  name: string;
  openingPaise: number;
  openingAt: string | null;
  creditsPaise: number;
  debitsPaise: number;
  currentPaise: number;
}

export interface BalanceGroup {
  id: string;
  name: string;
  /** Accounts under this main file (HDFC, SBI under GPay). */
  accounts: BalanceLine[];
  /** The main file's own balance, when money has been recorded directly against it (or it has no accounts). */
  direct: BalanceLine | null;
  /** Everything in the group added up. */
  total: BalanceLine;
}

const line = (a: AccountBalanceInput): BalanceLine => ({
  id: a.id,
  name: a.name,
  openingPaise: a.openingPaise,
  openingAt: a.openingAt ?? null,
  creditsPaise: a.creditsPaise,
  debitsPaise: a.debitsPaise,
  currentPaise: currentBalance(a),
});

const hasActivity = (a: AccountBalanceInput) => a.openingPaise !== 0 || a.creditsPaise !== 0 || a.debitsPaise !== 0;

/** Groups accounts under their main file and adds up each group. Order of the input is kept. */
export function buildBalanceGroups(accounts: readonly AccountBalanceInput[]): BalanceGroup[] {
  const mains = accounts.filter((a) => a.parentId === null);
  return mains.map((main) => {
    const children = accounts.filter((a) => a.parentId === main.id);
    const lines = children.map(line);
    const direct = children.length === 0 || hasActivity(main) ? line(main) : null;
    const parts = [...lines, ...(direct ? [direct] : [])];
    const sum = (pick: (l: BalanceLine) => number) => parts.reduce((s, l) => s + pick(l), 0);
    return {
      id: main.id,
      name: main.name,
      accounts: lines,
      direct,
      total: {
        id: main.id,
        name: main.name,
        openingPaise: sum((l) => l.openingPaise),
        openingAt: null,
        creditsPaise: sum((l) => l.creditsPaise),
        debitsPaise: sum((l) => l.debitsPaise),
        currentPaise: sum((l) => l.currentPaise),
      },
    };
  });
}
