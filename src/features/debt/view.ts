import type { DebtSettings } from "@/features/quick-pay/settings-model";
import type { DebtRow, DebtSummary } from "./types";

/**
 * What the Debt Management page shows, following Customized Settings: people left out there are not listed, and (when asked)
 * so are people who are settled. The totals are worked out again from the people who are listed.
 */
export function visibleDebtRows(summary: DebtSummary, settings: Pick<DebtSettings, "hiddenPersonIds" | "hideSettled">): DebtSummary {
  const hidden = new Set(settings.hiddenPersonIds);
  const rows = summary.rows.filter((r: DebtRow) => !hidden.has(r.partyId) && !(settings.hideSettled && r.remainingPaise === 0));
  const sum = (pick: (r: DebtRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  return {
    rows,
    totalSplitPaise: sum((r) => r.totalSplitPaise),
    totalPaidPaise: sum((r) => r.paidPaise),
    totalRemainingPaise: sum((r) => r.remainingPaise),
  };
}
