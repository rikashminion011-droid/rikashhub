/**
 * The ledger rules: the single place that decides what each transaction type does to
 * balances and how it counts in reports. Pure and dependency-free so it can be unit tested.
 * The database layer only applies the deltas returned here, inside one DB transaction.
 *
 * Stored balance meaning per instrument:
 *   ACCOUNT      money held (asset)            spending -, receiving +
 *   SAVINGS      money held in a savings acct  withdrawal -, deposit +
 *   CREDIT_CARD  amount owed on the card       charge +, payment -
 *   CREDIT_LINE  amount owed (e.g. Slice)      charge +, repayment -
 *   DEBT         principal still owed          repayment -
 */

import { assertInteger } from "./money";

export type TransactionType =
  | "INCOME"
  | "EXPENSE"
  | "CREDIT_CARD_PAYMENT"
  | "DEBT_PAYMENT"
  | "SAVINGS_DEPOSIT"
  | "SAVINGS_WITHDRAWAL"
  | "EMI_PAYMENT"
  | "SUBSCRIPTION_PAYMENT"
  | "TRANSFER";

export type InstrumentKind = "ACCOUNT" | "CREDIT_LINE" | "CREDIT_CARD" | "SAVINGS" | "DEBT";

export interface InstrumentRef {
  kind: InstrumentKind;
  id: string;
}

export type DebtDirection = "OWE" | "OWED_TO_ME";

export interface LedgerTransaction {
  type: TransactionType;
  /** Positive integer paise. */
  amountPaise: number;
  /** Where the money comes from / what is charged. */
  source?: InstrumentRef;
  /** Where the money goes. */
  target?: InstrumentRef;
  /** Only meaningful for DEBT_PAYMENT. Defaults to OWE. */
  debtDirection?: DebtDirection;
}

/** Change to an instrument's stored balance, in paise (can be negative). */
export interface BalanceEffect {
  instrument: InstrumentRef;
  delta: number;
}

/** How a transaction counts in reports. Only INCOME and EXPENSE move the income/expense totals. */
export type ReportingClass = "INCOME" | "EXPENSE" | "NEUTRAL";

export interface LedgerResult {
  effects: BalanceEffect[];
  reporting: ReportingClass;
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

const SPENDABLE: readonly InstrumentKind[] = ["ACCOUNT", "CREDIT_CARD", "CREDIT_LINE"];

export function instrumentKey(ref: InstrumentRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** Money leaves the instrument (or it is charged). */
function outflow(ref: InstrumentRef, amount: number): BalanceEffect {
  switch (ref.kind) {
    case "ACCOUNT":
    case "SAVINGS":
      return { instrument: ref, delta: -amount };
    case "CREDIT_CARD":
    case "CREDIT_LINE":
      return { instrument: ref, delta: amount };
    case "DEBT":
      throw new LedgerError("A debt cannot be charged");
  }
}

/** Money arrives at the instrument (or what is owed on it is reduced). */
function inflow(ref: InstrumentRef, amount: number): BalanceEffect {
  switch (ref.kind) {
    case "ACCOUNT":
    case "SAVINGS":
      return { instrument: ref, delta: amount };
    case "CREDIT_CARD":
    case "CREDIT_LINE":
    case "DEBT":
      return { instrument: ref, delta: -amount };
  }
}

function need(
  ref: InstrumentRef | undefined,
  kinds: readonly InstrumentKind[],
  label: string,
): InstrumentRef {
  if (!ref) throw new LedgerError(`${label} is required`);
  if (!kinds.includes(ref.kind)) {
    throw new LedgerError(`${label} must be one of: ${kinds.join(", ")} (got ${ref.kind})`);
  }
  return ref;
}

function forbid(ref: InstrumentRef | undefined, label: string, type: TransactionType): void {
  if (ref) throw new LedgerError(`${label} is not allowed for ${type}`);
}

export function computeEffects(tx: LedgerTransaction): LedgerResult {
  assertInteger(tx.amountPaise);
  if (tx.amountPaise <= 0) throw new LedgerError("Amount must be greater than zero");
  const amount = tx.amountPaise;

  switch (tx.type) {
    case "INCOME": {
      forbid(tx.source, "Source", tx.type);
      const target = need(tx.target, ["ACCOUNT"], "Deposit account");
      return { effects: [inflow(target, amount)], reporting: "INCOME" };
    }

    case "EXPENSE":
    case "SUBSCRIPTION_PAYMENT": {
      forbid(tx.target, "Target", tx.type);
      const source = need(tx.source, SPENDABLE, "Payment instrument");
      // Counted as an expense at the moment of purchase, even when charged to a credit card.
      return { effects: [outflow(source, amount)], reporting: "EXPENSE" };
    }

    case "CREDIT_CARD_PAYMENT": {
      const source = need(tx.source, ["ACCOUNT"], "Paying account");
      const target = need(tx.target, ["CREDIT_CARD", "CREDIT_LINE"], "Card or credit line");
      // NEUTRAL: the purchases were already counted as expenses when they were charged.
      return { effects: [outflow(source, amount), inflow(target, amount)], reporting: "NEUTRAL" };
    }

    case "DEBT_PAYMENT":
    case "EMI_PAYMENT": {
      const direction = tx.debtDirection ?? "OWE";
      if (direction === "OWED_TO_ME") {
        if (tx.type === "EMI_PAYMENT") throw new LedgerError("An EMI payment is always money you owe");
        // Someone repays money lent to them: the receivable shrinks, cash arrives.
        const debt = need(tx.source, ["DEBT"], "Debt");
        const account = need(tx.target, ["ACCOUNT"], "Receiving account");
        return { effects: [inflow(debt, amount), inflow(account, amount)], reporting: "NEUTRAL" };
      }
      const source = need(tx.source, SPENDABLE, "Payment instrument");
      const debt = need(tx.target, ["DEBT"], "Debt");
      // NEUTRAL: settling a liability is not spending. Interest is reported by the debt module.
      return { effects: [outflow(source, amount), inflow(debt, amount)], reporting: "NEUTRAL" };
    }

    case "SAVINGS_DEPOSIT": {
      const source = need(tx.source, ["ACCOUNT"], "Source account");
      const target = need(tx.target, ["SAVINGS"], "Savings account");
      return { effects: [outflow(source, amount), inflow(target, amount)], reporting: "NEUTRAL" };
    }

    case "SAVINGS_WITHDRAWAL": {
      const source = need(tx.source, ["SAVINGS"], "Savings account");
      const target = need(tx.target, ["ACCOUNT"], "Receiving account");
      return { effects: [outflow(source, amount), inflow(target, amount)], reporting: "NEUTRAL" };
    }

    case "TRANSFER": {
      const source = need(tx.source, ["ACCOUNT"], "From account");
      const target = need(tx.target, ["ACCOUNT"], "To account");
      if (source.id === target.id) throw new LedgerError("Cannot transfer to the same account");
      // NEUTRAL: moving money between own accounts is neither income nor expense.
      return { effects: [outflow(source, amount), inflow(target, amount)], reporting: "NEUTRAL" };
    }
  }
}

/** Sum deltas per instrument and drop instruments whose net change is zero. */
export function mergeEffects(effects: readonly BalanceEffect[]): BalanceEffect[] {
  const merged = new Map<string, BalanceEffect>();
  for (const effect of effects) {
    const key = instrumentKey(effect.instrument);
    const existing = merged.get(key);
    if (existing) existing.delta += effect.delta;
    else merged.set(key, { instrument: effect.instrument, delta: effect.delta });
  }
  return [...merged.values()].filter((e) => e.delta !== 0);
}

export function reverseEffects(effects: readonly BalanceEffect[]): BalanceEffect[] {
  return effects.map((e) => ({ instrument: e.instrument, delta: -e.delta }));
}

/**
 * Net balance changes for a create (old = null), an edit, or a delete (next = null):
 * reverse the old effects and apply the new ones in one merged set.
 * Apply the result in a single DB transaction.
 */
export function netEffects(
  previous: LedgerTransaction | null,
  next: LedgerTransaction | null,
): BalanceEffect[] {
  const reversed = previous ? reverseEffects(computeEffects(previous).effects) : [];
  const applied = next ? computeEffects(next).effects : [];
  return mergeEffects([...reversed, ...applied]);
}

/**
 * Recompute balances from scratch: opening balance per instrument plus every transaction.
 * Used by the reconcile job to prove (or repair) the stored balances.
 */
export function reconcileBalances(
  openingByKey: Readonly<Record<string, number>>,
  transactions: readonly LedgerTransaction[],
): Record<string, number> {
  const balances: Record<string, number> = { ...openingByKey };
  for (const tx of transactions) {
    for (const effect of computeEffects(tx).effects) {
      const key = instrumentKey(effect.instrument);
      balances[key] = (balances[key] ?? 0) + effect.delta;
    }
  }
  return balances;
}

/** Totals for reports. Only INCOME/EXPENSE transactions contribute to income/expense. */
export function summarizeReporting(
  transactions: readonly LedgerTransaction[],
): { incomePaise: number; expensePaise: number } {
  let incomePaise = 0;
  let expensePaise = 0;
  for (const tx of transactions) {
    const { reporting } = computeEffects(tx);
    if (reporting === "INCOME") incomePaise += tx.amountPaise;
    else if (reporting === "EXPENSE") expensePaise += tx.amountPaise;
  }
  return { incomePaise, expensePaise };
}
