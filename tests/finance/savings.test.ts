import { describe, expect, it } from "vitest";
import {
  goalProgress,
  monthlyContributionNeeded,
  parseISODate as d,
  projectBalance,
  savingsBalance,
  savingsGrowthSeries,
} from "@/lib/finance";

describe("savingsBalance", () => {
  it("is opening + deposits - withdrawals + interest", () => {
    expect(
      savingsBalance({ openingPaise: 100_000, depositsPaise: 500_000, withdrawalsPaise: 200_000, interestPaise: 10_000 }),
    ).toBe(410_000);
  });

  it("defaults the opening balance to zero", () => {
    expect(savingsBalance({ depositsPaise: 100, withdrawalsPaise: 0, interestPaise: 0 })).toBe(100);
  });
});

describe("goalProgress", () => {
  it("is current / target x 100", () => {
    expect(goalProgress(250_000, 1_000_000)).toEqual({ percent: 25, remainingPaise: 750_000, reached: false });
  });

  it("is not capped, and reports reached", () => {
    expect(goalProgress(1_200_000, 1_000_000)).toEqual({ percent: 120, remainingPaise: 0, reached: true });
  });

  it("rejects a zero target", () => {
    expect(() => goalProgress(100, 0)).toThrow(RangeError);
  });
});

describe("monthlyContributionNeeded", () => {
  const today = d("2026-11-06");

  it("spreads the remaining amount over the months left, rounding up", () => {
    expect(monthlyContributionNeeded({ remainingPaise: 1_200_000, today, targetDate: d("2027-11-06") })).toBe(100_000);
    expect(monthlyContributionNeeded({ remainingPaise: 1_000, today, targetDate: d("2027-11-06") })).toBe(84); // 1000/12 = 83.3
  });

  it("needs everything now when the date has passed or is under a month away", () => {
    expect(monthlyContributionNeeded({ remainingPaise: 500_000, today, targetDate: d("2026-11-06") })).toBe(500_000);
    expect(monthlyContributionNeeded({ remainingPaise: 500_000, today, targetDate: d("2026-01-01") })).toBe(500_000);
    expect(monthlyContributionNeeded({ remainingPaise: 500_000, today, targetDate: d("2026-11-16") })).toBe(500_000);
  });

  it("is zero when nothing is left", () => {
    expect(monthlyContributionNeeded({ remainingPaise: 0, today, targetDate: d("2027-01-01") })).toBe(0);
  });
});

describe("projectBalance", () => {
  it("compounds monthly", () => {
    expect(projectBalance({ balancePaise: 100_000, annualRatePercent: 12, months: 1 })).toBe(101_000);
    expect(projectBalance({ balancePaise: 100_000, annualRatePercent: 12, months: 2 })).toBe(102_010);
  });

  it("adds monthly deposits", () => {
    expect(projectBalance({ balancePaise: 100_000, annualRatePercent: 0, months: 3, monthlyDepositPaise: 10_000 })).toBe(130_000);
  });
});

describe("savingsGrowthSeries", () => {
  it("returns an empty series for no entries", () => {
    expect(savingsGrowthSeries([])).toEqual([]);
  });

  it("carries the balance across quiet months", () => {
    expect(
      savingsGrowthSeries([
        { date: d("2026-01-10"), deltaPaise: 1_000 },
        { date: d("2026-03-05"), deltaPaise: 500 },
        { date: d("2026-03-20"), deltaPaise: -200 },
      ]),
    ).toEqual([
      { month: "2026-01", balancePaise: 1_000 },
      { month: "2026-02", balancePaise: 1_000 },
      { month: "2026-03", balancePaise: 1_300 },
    ]);
  });

  it("starts from the opening balance and spans a year end", () => {
    expect(
      savingsGrowthSeries(
        [
          { date: d("2026-12-15"), deltaPaise: 100 },
          { date: d("2027-01-15"), deltaPaise: 100 },
        ],
        5_000,
      ),
    ).toEqual([
      { month: "2026-12", balancePaise: 5_100 },
      { month: "2027-01", balancePaise: 5_200 },
    ]);
  });
});
