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
  /** Of totalSplitPaise, what came from a Debt (the whole amount put on them) rather than a Split. */
  directPaise: number;
  /** What they owe from Shopping Records, in paise. */
  shoppingPaise: number;
  /** What they owe from Credit Portal statements and unbilled transactions, in paise (refunds count as less). */
  portalPaise: number;
  /** Everything they owe: splits and debts, shopping and credit portals. */
  totalDebtPaise: number;
}

export interface DebtSummary {
  rows: DebtRow[];
  totalSplitPaise: number;
  totalShoppingPaise: number;
  totalPortalPaise: number;
  totalDebtPaise: number;
  totalPaidPaise: number;
  totalRemainingPaise: number;
}

/** What a debt line came from. */
export type DebtSource = "SPLIT" | "DEBT" | "SHOPPING" | "CREDIT_PORTAL" | "PAYMENT";

/** One thing a person owes (or one payment they made), traceable to where it was entered. */
export interface DebtItem {
  id: string;
  source: DebtSource;
  /** ISO instant */
  occurredAt: string;
  reason: string;
  category: string;
  /** The platform, portal or bank it belongs to. */
  related: string;
  /** Owed in paise (negative for a refund); for a payment, the amount paid. */
  amountPaise: number;
  /** Where to open the original entry. */
  href: string | null;
}

/** The period a Debt Management view covers. Empty bounds mean no limit. */
export interface DebtQuery {
  from?: string | null;
  to?: string | null;
  /** People left out of the totals (for example you yourself). */
  excludePartyIds?: readonly string[];
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
  /** Everything owed from every source, newest first. */
  items: DebtItem[];
}

export type DebtResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
