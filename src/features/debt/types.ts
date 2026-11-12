export interface DebtRow {
  partyId: string;
  name: string;
  /** Everything this person owes from splits, in paise. */
  totalSplitPaise: number;
  /** Their share as a percentage of the transactions they were split on (total share / total of those transactions). Null when there are none. */
  splitPercent: number | null;
  paidPaise: number;
  /** Owed minus paid. Negative means they have paid ahead. */
  remainingPaise: number;
  /** Number of transactions they are split on. */
  splitCount: number;
}

export interface DebtSummary {
  rows: DebtRow[];
  totalSplitPaise: number;
  totalPaidPaise: number;
  totalRemainingPaise: number;
}

export interface DebtSplitItem {
  transactionId: string;
  /** ISO instant */
  occurredAt: string;
  /** The Reason, or the statement's details when there is no Reason. */
  description: string;
  bank: string;
  txAmountPaise: number;
  percent: number;
  sharePaise: number;
}

export interface DebtPayment {
  id: string;
  amountPaise: number;
  /** ISO instant */
  paidAt: string;
  note: string;
}

export interface DebtHistory {
  row: DebtRow;
  splits: DebtSplitItem[];
  payments: DebtPayment[];
}

export type DebtResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
