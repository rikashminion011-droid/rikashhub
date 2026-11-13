import { describe, expect, it } from "vitest";
import { visibleDebtRows } from "@/features/debt/view";
import type { DebtRow, DebtSummary } from "@/features/debt/types";

const row = (partyId: string, total: number, paid: number): DebtRow => ({ partyId, name: partyId, totalSplitPaise: total, splitPercent: 50, paidPaise: paid, remainingPaise: total - paid, splitCount: 1 });
const summary: DebtSummary = { rows: [row("a", 10000, 0), row("b", 5000, 5000), row("c", 2000, 500)], totalSplitPaise: 17000, totalPaidPaise: 5500, totalRemainingPaise: 11500 };

describe("Debt Management view", () => {
  it("leaves out hidden people and works the totals out again", () => {
    const out = visibleDebtRows(summary, { hiddenPersonIds: ["a"], hideSettled: false });
    expect(out.rows.map((r) => r.partyId)).toEqual(["b", "c"]);
    expect(out).toMatchObject({ totalSplitPaise: 7000, totalPaidPaise: 5500, totalRemainingPaise: 1500 });
  });
  it("can also leave out people who are settled", () => {
    expect(visibleDebtRows(summary, { hiddenPersonIds: [], hideSettled: true }).rows.map((r) => r.partyId)).toEqual(["a", "c"]);
  });
  it("shows everyone by default", () => {
    expect(visibleDebtRows(summary, { hiddenPersonIds: [], hideSettled: false })).toEqual(summary);
  });
});
