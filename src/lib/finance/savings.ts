import { diffDays } from "./dates";
import { round2 } from "./money";

/** Savings balance = opening + deposits - withdrawals + interest. */
export function savingsBalance(input: {
  openingPaise?: number;
  depositsPaise: number;
  withdrawalsPaise: number;
  interestPaise: number;
}): number {
  return (input.openingPaise ?? 0) + input.depositsPaise - input.withdrawalsPaise + input.interestPaise;
}

export interface GoalProgress {
  /** Current / target x 100. Not capped, so exceeding the goal shows above 100. */
  percent: number;
  remainingPaise: number;
  reached: boolean;
}

/** Goal progress = current savings / target amount x 100. */
export function goalProgress(currentPaise: number, targetPaise: number): GoalProgress {
  if (targetPaise <= 0) throw new RangeError("Target amount must be greater than zero");
  return {
    percent: round2((currentPaise / targetPaise) * 100),
    remainingPaise: Math.max(0, targetPaise - currentPaise),
    reached: currentPaise >= targetPaise,
  };
}

const DAYS_PER_MONTH = 30.4375;

/**
 * Monthly contribution needed to reach the target by `targetDate` (rounded up to the paisa).
 * If the date is today or past, the whole remaining amount is due now.
 */
export function monthlyContributionNeeded(input: {
  remainingPaise: number;
  today: Date;
  targetDate: Date;
}): number {
  if (input.remainingPaise <= 0) return 0;
  const daysLeft = diffDays(input.today, input.targetDate);
  if (daysLeft <= 0) return input.remainingPaise;
  const months = Math.max(1, Math.ceil(daysLeft / DAYS_PER_MONTH));
  return Math.ceil(input.remainingPaise / months);
}

/**
 * Projected balance after `months`, compounding monthly at annualRatePercent/12,
 * with an optional deposit at the end of every month.
 */
export function projectBalance(input: {
  balancePaise: number;
  annualRatePercent: number;
  months: number;
  monthlyDepositPaise?: number;
}): number {
  let balance = input.balancePaise;
  const monthlyRate = input.annualRatePercent / 1200;
  for (let m = 0; m < input.months; m++) {
    balance = Math.round(balance * (1 + monthlyRate)) + (input.monthlyDepositPaise ?? 0);
  }
  return balance;
}

export interface GrowthPoint {
  /** YYYY-MM */
  month: string;
  balancePaise: number;
}

/**
 * Month-end running balance from signed entries (+deposit/interest, -withdrawal).
 * Months with no activity carry the previous balance forward between the first and last month.
 */
export function savingsGrowthSeries(
  entries: readonly { date: Date; deltaPaise: number }[],
  openingPaise = 0,
): GrowthPoint[] {
  if (entries.length === 0) return [];
  const byMonth = new Map<string, number>();
  for (const entry of entries) {
    const month = entry.date.toISOString().slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + entry.deltaPaise);
  }
  const months = [...byMonth.keys()].sort();
  const first = months[0]!;
  const last = months[months.length - 1]!;

  const series: GrowthPoint[] = [];
  let running = openingPaise;
  let [year, month] = first.split("-").map(Number) as [number, number];
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    running += byMonth.get(key) ?? 0;
    series.push({ month: key, balancePaise: running });
    if (key === last) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return series;
}
