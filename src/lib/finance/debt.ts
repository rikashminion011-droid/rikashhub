import { diffDays } from "./dates";
import { round2 } from "./money";

export type InterestModel = "REDUCING_BALANCE" | "FLAT" | "INTEREST_FREE";

export interface DebtTerms {
  principalPaise: number;
  /** Annual percentage rate, e.g. 12 for 12% p.a. */
  annualRatePercent: number;
  startDate: Date;
  model: InterestModel;
  /** Required for the FLAT model. */
  termMonths?: number;
}

export interface DebtPaymentInput {
  date: Date;
  amountPaise: number;
}

export interface DebtSnapshot {
  principalPaidPaise: number;
  interestPaidPaise: number;
  /** Interest that has accrued up to `asOf` (FLAT: the full term interest). */
  interestAccruedPaise: number;
  outstandingPrincipalPaise: number;
  outstandingInterestPaise: number;
  totalOutstandingPaise: number;
  /** Money paid beyond what was owed. */
  overpaidPaise: number;
}

/**
 * Remaining debt according to the repayment model:
 *
 * - REDUCING_BALANCE: interest accrues daily (rate/365) on the outstanding principal only
 *   (no compounding). Each payment clears accrued interest first, then principal.
 * - FLAT: total interest = principal x rate x term. Payments reduce the total payable and
 *   are split between principal and interest in proportion.
 * - INTEREST_FREE: every payment reduces principal.
 *
 * Remaining debt = principal + applicable interest - recorded repayments.
 */
export function debtSnapshot(
  terms: DebtTerms,
  payments: readonly DebtPaymentInput[],
  asOf: Date,
): DebtSnapshot {
  const counted = payments
    .filter((p) => p.date <= asOf)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const p of counted) {
    if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) {
      throw new RangeError("Payment amounts must be positive whole paise");
    }
  }

  switch (terms.model) {
    case "INTEREST_FREE":
      return interestFree(terms, counted);
    case "FLAT":
      return flat(terms, counted);
    case "REDUCING_BALANCE":
      return reducing(terms, counted, asOf);
  }
}

function reducing(terms: DebtTerms, payments: readonly DebtPaymentInput[], asOf: Date): DebtSnapshot {
  let cursor = terms.startDate;
  let principal = terms.principalPaise;
  let interestDue = 0;
  let accrued = 0;
  let principalPaid = 0;
  let interestPaid = 0;
  let overpaid = 0;

  const accrueTo = (to: Date) => {
    const days = Math.max(0, diffDays(cursor, to));
    const amount = Math.round((principal * terms.annualRatePercent * days) / (100 * 365));
    interestDue += amount;
    accrued += amount;
    if (to > cursor) cursor = to;
  };

  for (const payment of payments) {
    accrueTo(payment.date);
    const toInterest = Math.min(payment.amountPaise, interestDue);
    interestDue -= toInterest;
    interestPaid += toInterest;
    const rest = payment.amountPaise - toInterest;
    const toPrincipal = Math.min(rest, principal);
    principal -= toPrincipal;
    principalPaid += toPrincipal;
    overpaid += rest - toPrincipal;
  }
  accrueTo(asOf);

  return {
    principalPaidPaise: principalPaid,
    interestPaidPaise: interestPaid,
    interestAccruedPaise: accrued,
    outstandingPrincipalPaise: principal,
    outstandingInterestPaise: interestDue,
    totalOutstandingPaise: principal + interestDue,
    overpaidPaise: overpaid,
  };
}

function flat(terms: DebtTerms, payments: readonly DebtPaymentInput[]): DebtSnapshot {
  if (!terms.termMonths || terms.termMonths <= 0) {
    throw new RangeError("The FLAT interest model needs a term in months");
  }
  const totalInterest = Math.round(
    (terms.principalPaise * terms.annualRatePercent * terms.termMonths) / (100 * 12),
  );
  const payable = terms.principalPaise + totalInterest;
  let principalPaid = 0;
  let interestPaid = 0;
  let overpaid = 0;

  for (const payment of payments) {
    const remainingPayable = payable - principalPaid - interestPaid;
    const applied = Math.min(payment.amountPaise, remainingPayable);
    overpaid += payment.amountPaise - applied;
    if (applied === 0) continue;

    let interestShare = Math.min(
      Math.round((applied * totalInterest) / payable),
      totalInterest - interestPaid,
    );
    let principalShare = applied - interestShare;
    const principalRoom = terms.principalPaise - principalPaid;
    if (principalShare > principalRoom) {
      interestShare += principalShare - principalRoom;
      principalShare = principalRoom;
    }
    principalPaid += principalShare;
    interestPaid += interestShare;
  }

  return {
    principalPaidPaise: principalPaid,
    interestPaidPaise: interestPaid,
    interestAccruedPaise: totalInterest,
    outstandingPrincipalPaise: terms.principalPaise - principalPaid,
    outstandingInterestPaise: totalInterest - interestPaid,
    totalOutstandingPaise: payable - principalPaid - interestPaid,
    overpaidPaise: overpaid,
  };
}

function interestFree(terms: DebtTerms, payments: readonly DebtPaymentInput[]): DebtSnapshot {
  let principal = terms.principalPaise;
  let overpaid = 0;
  for (const payment of payments) {
    const applied = Math.min(payment.amountPaise, principal);
    principal -= applied;
    overpaid += payment.amountPaise - applied;
  }
  return {
    principalPaidPaise: terms.principalPaise - principal,
    interestPaidPaise: 0,
    interestAccruedPaise: 0,
    outstandingPrincipalPaise: principal,
    outstandingInterestPaise: 0,
    totalOutstandingPaise: principal,
    overpaidPaise: overpaid,
  };
}

/** Equated monthly instalment for a reducing-balance loan, in paise. */
export function emiAmount(principalPaise: number, annualRatePercent: number, months: number): number {
  if (!Number.isInteger(months) || months <= 0) throw new RangeError("Months must be a positive integer");
  if (principalPaise <= 0) throw new RangeError("Principal must be positive");
  if (annualRatePercent === 0) return Math.round(principalPaise / months);
  const r = annualRatePercent / 1200;
  const growth = Math.pow(1 + r, months);
  return Math.round((principalPaise * r * growth) / (growth - 1));
}

export interface AmortizationRow {
  installment: number;
  paymentPaise: number;
  interestPaise: number;
  principalPaise: number;
  balancePaise: number;
}

/** Full EMI schedule. The last instalment is adjusted so the balance ends at exactly zero. */
export function amortizationSchedule(
  principalPaise: number,
  annualRatePercent: number,
  months: number,
): AmortizationRow[] {
  const emi = emiAmount(principalPaise, annualRatePercent, months);
  const r = annualRatePercent / 1200;
  const rows: AmortizationRow[] = [];
  let balance = principalPaise;
  for (let n = 1; n <= months; n++) {
    const interest = Math.round(balance * r);
    let principalPart = emi - interest;
    if (n === months || principalPart > balance) principalPart = balance;
    balance -= principalPart;
    rows.push({
      installment: n,
      paymentPaise: principalPart + interest,
      interestPaise: interest,
      principalPaise: principalPart,
      balancePaise: balance,
    });
  }
  return rows;
}

/** Repayment progress 0-100 (capped), based on principal repaid. */
export function repaymentProgressPercent(principalPaidPaise: number, principalPaise: number): number {
  if (principalPaise <= 0) return 0;
  return Math.min(100, round2((principalPaidPaise / principalPaise) * 100));
}
