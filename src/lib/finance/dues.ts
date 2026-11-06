export type DueState = "UPCOMING" | "DUE_TODAY" | "OVERDUE" | "PAID" | "PARTIALLY_PAID";

export interface DueStatusResult {
  status: DueState;
  remainingPaise: number;
  /** True when part is unpaid and the due date has passed (also for PARTIALLY_PAID). */
  isOverdue: boolean;
}

/**
 * Status of a monthly due. Partial payments reduce the remaining amount; a partially paid
 * due keeps the PARTIALLY_PAID status but `isOverdue` still tells you the date has passed.
 */
export function dueStatus(input: {
  amountPaise: number;
  paidPaise: number;
  dueDate: Date;
  today: Date;
}): DueStatusResult {
  const remainingPaise = Math.max(0, input.amountPaise - input.paidPaise);
  if (remainingPaise === 0) return { status: "PAID", remainingPaise, isOverdue: false };

  const isOverdue = input.dueDate < input.today;
  if (input.paidPaise > 0) return { status: "PARTIALLY_PAID", remainingPaise, isOverdue };
  if (isOverdue) return { status: "OVERDUE", remainingPaise, isOverdue };
  if (input.dueDate.getTime() === input.today.getTime()) {
    return { status: "DUE_TODAY", remainingPaise, isOverdue };
  }
  return { status: "UPCOMING", remainingPaise, isOverdue };
}
