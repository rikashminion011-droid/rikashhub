import { round2 } from "./money";

/** Available credit = credit limit - outstanding balance (may be negative if over the limit). */
export function availableCredit(limitPaise: number, outstandingPaise: number): number {
  return limitPaise - outstandingPaise;
}

/** Utilisation = outstanding / limit x 100. A zero limit gives 0. Can exceed 100 when over limit. */
export function utilizationPercent(limitPaise: number, outstandingPaise: number): number {
  if (limitPaise <= 0) return 0;
  return round2(Math.max(0, outstandingPaise) / limitPaise * 100);
}

export type UtilizationBand = "LOW" | "MODERATE" | "HIGH";

/** Under 30% is generally considered healthy for credit scores. */
export function utilizationBand(percent: number): UtilizationBand {
  if (percent < 30) return "LOW";
  if (percent < 50) return "MODERATE";
  return "HIGH";
}

export type StatementState = "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

/**
 * Statement state. A statement is only OVERDUE once the due date has passed without
 * at least the minimum amount due being paid; paying the minimum keeps it PARTIALLY_PAID.
 */
export function statementState(input: {
  totalDuePaise: number;
  minimumDuePaise: number;
  paidPaise: number;
  dueDate: Date;
  today: Date;
}): { state: StatementState; remainingPaise: number } {
  const remainingPaise = Math.max(0, input.totalDuePaise - input.paidPaise);
  if (input.totalDuePaise > 0 && remainingPaise === 0) return { state: "PAID", remainingPaise };
  if (input.totalDuePaise === 0) return { state: "PAID", remainingPaise: 0 };
  const pastDue = input.today > input.dueDate;
  if (pastDue && input.paidPaise < input.minimumDuePaise) return { state: "OVERDUE", remainingPaise };
  if (input.paidPaise > 0) return { state: "PARTIALLY_PAID", remainingPaise };
  return { state: "OPEN", remainingPaise };
}
