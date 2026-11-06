import { describe, expect, it } from "vitest";
import {
  amortizationSchedule,
  debtSnapshot,
  emiAmount,
  parseISODate as d,
  repaymentProgressPercent,
  type DebtTerms,
} from "@/lib/finance";

describe("INTEREST_FREE", () => {
  const terms: DebtTerms = {
    principalPaise: 100_000,
    annualRatePercent: 0,
    startDate: d("2026-01-01"),
    model: "INTEREST_FREE",
  };

  it("partial payments reduce what is left", () => {
    const snap = debtSnapshot(
      terms,
      [
        { date: d("2026-02-01"), amountPaise: 30_000 },
        { date: d("2026-03-01"), amountPaise: 20_000 },
      ],
      d("2026-04-01"),
    );
    expect(snap.outstandingPrincipalPaise).toBe(50_000);
    expect(snap.principalPaidPaise).toBe(50_000);
    expect(snap.totalOutstandingPaise).toBe(50_000);
    expect(snap.overpaidPaise).toBe(0);
  });

  it("reports an overpayment instead of going negative", () => {
    const snap = debtSnapshot(terms, [{ date: d("2026-02-01"), amountPaise: 130_000 }], d("2026-04-01"));
    expect(snap.outstandingPrincipalPaise).toBe(0);
    expect(snap.overpaidPaise).toBe(30_000);
  });

  it("ignores payments dated after the as-of date", () => {
    const snap = debtSnapshot(terms, [{ date: d("2026-06-01"), amountPaise: 50_000 }], d("2026-04-01"));
    expect(snap.outstandingPrincipalPaise).toBe(100_000);
  });
});

describe("REDUCING_BALANCE", () => {
  const terms: DebtTerms = {
    principalPaise: 10_000_000, // ₹1,00,000
    annualRatePercent: 12,
    startDate: d("2026-01-01"),
    model: "REDUCING_BALANCE",
  };

  it("accrues daily interest: 30 days at 12% on ₹1,00,000 is ₹986.30", () => {
    const snap = debtSnapshot(terms, [], d("2026-01-31"));
    expect(snap.interestAccruedPaise).toBe(98_630);
    expect(snap.outstandingInterestPaise).toBe(98_630);
    expect(snap.outstandingPrincipalPaise).toBe(10_000_000);
    expect(snap.totalOutstandingPaise).toBe(10_098_630);
  });

  it("pays accrued interest first, then principal", () => {
    const snap = debtSnapshot(terms, [{ date: d("2026-01-31"), amountPaise: 500_000 }], d("2026-01-31"));
    expect(snap.interestPaidPaise).toBe(98_630);
    expect(snap.principalPaidPaise).toBe(401_370);
    expect(snap.outstandingPrincipalPaise).toBe(9_598_630);
    expect(snap.outstandingInterestPaise).toBe(0);
  });

  it("a payment smaller than the accrued interest leaves interest outstanding and principal untouched", () => {
    const snap = debtSnapshot(terms, [{ date: d("2026-01-31"), amountPaise: 50_000 }], d("2026-01-31"));
    expect(snap.interestPaidPaise).toBe(50_000);
    expect(snap.principalPaidPaise).toBe(0);
    expect(snap.outstandingInterestPaise).toBe(48_630);
  });

  it("keeps the books balanced across several payments", () => {
    const snap = debtSnapshot(
      terms,
      [
        { date: d("2026-02-10"), amountPaise: 1_200_000 },
        { date: d("2026-03-10"), amountPaise: 1_200_000 },
        { date: d("2026-04-10"), amountPaise: 1_200_000 },
      ],
      d("2026-05-15"),
    );
    expect(snap.interestAccruedPaise).toBe(snap.interestPaidPaise + snap.outstandingInterestPaise);
    expect(snap.principalPaidPaise + snap.outstandingPrincipalPaise).toBe(terms.principalPaise);
    expect(snap.totalOutstandingPaise).toBe(snap.outstandingPrincipalPaise + snap.outstandingInterestPaise);
    // interest is charged only on the shrinking principal, so it is less than on the full amount
    expect(snap.interestAccruedPaise).toBeLessThan(Math.round((10_000_000 * 12 * 134) / 36_500));
  });

  it("is order independent for the input list", () => {
    const payments = [
      { date: d("2026-03-10"), amountPaise: 700_000 },
      { date: d("2026-02-10"), amountPaise: 900_000 },
    ];
    const a = debtSnapshot(terms, payments, d("2026-04-01"));
    const b = debtSnapshot(terms, [...payments].reverse(), d("2026-04-01"));
    expect(a).toEqual(b);
  });

  it("accrues nothing at 0% and nothing once repaid", () => {
    const zero = debtSnapshot({ ...terms, annualRatePercent: 0 }, [], d("2027-01-01"));
    expect(zero.interestAccruedPaise).toBe(0);

    const repaid = debtSnapshot(
      terms,
      [{ date: d("2026-01-31"), amountPaise: 10_098_630 }],
      d("2027-01-31"),
    );
    expect(repaid.totalOutstandingPaise).toBe(0);
  });
});

describe("FLAT", () => {
  const terms: DebtTerms = {
    principalPaise: 1_200_000, // ₹12,000
    annualRatePercent: 10,
    startDate: d("2026-01-01"),
    model: "FLAT",
    termMonths: 12,
  };

  it("charges principal x rate x term up front", () => {
    const snap = debtSnapshot(terms, [], d("2026-01-01"));
    expect(snap.interestAccruedPaise).toBe(120_000);
    expect(snap.totalOutstandingPaise).toBe(1_320_000);
  });

  it("splits each payment between principal and interest", () => {
    const snap = debtSnapshot(terms, [{ date: d("2026-02-01"), amountPaise: 110_000 }], d("2026-02-01"));
    expect(snap.interestPaidPaise).toBe(10_000);
    expect(snap.principalPaidPaise).toBe(100_000);
    expect(snap.totalOutstandingPaise).toBe(1_210_000);
  });

  it("is cleared exactly by the full number of instalments", () => {
    const payments = Array.from({ length: 12 }, (_, i) => ({
      date: d(`2026-${String(i + 2).padStart(2, "0")}-01`.replace("2026-13", "2027-01")),
      amountPaise: 110_000,
    }));
    const snap = debtSnapshot(terms, payments, d("2027-06-01"));
    expect(snap.totalOutstandingPaise).toBe(0);
    expect(snap.principalPaidPaise).toBe(1_200_000);
    expect(snap.interestPaidPaise).toBe(120_000);
    expect(snap.overpaidPaise).toBe(0);
  });

  it("needs a term", () => {
    expect(() => debtSnapshot({ ...terms, termMonths: undefined }, [], d("2026-02-01"))).toThrow(RangeError);
  });
});

describe("validation", () => {
  it("rejects zero or fractional payments", () => {
    const terms: DebtTerms = {
      principalPaise: 100_000,
      annualRatePercent: 0,
      startDate: d("2026-01-01"),
      model: "INTEREST_FREE",
    };
    expect(() => debtSnapshot(terms, [{ date: d("2026-02-01"), amountPaise: 0 }], d("2026-03-01"))).toThrow(RangeError);
    expect(() => debtSnapshot(terms, [{ date: d("2026-02-01"), amountPaise: 1.5 }], d("2026-03-01"))).toThrow(RangeError);
  });
});

describe("emiAmount", () => {
  it("matches the standard formula: ₹10,00,000 at 10% for 12 months is about ₹87,915.90", () => {
    const emi = emiAmount(100_000_000, 10, 12);
    expect(Math.abs(emi - 8_791_590)).toBeLessThanOrEqual(5);
  });

  it("divides evenly at 0%", () => {
    expect(emiAmount(120_000, 0, 12)).toBe(10_000);
  });

  it("rejects bad input", () => {
    expect(() => emiAmount(100_000, 10, 0)).toThrow(RangeError);
    expect(() => emiAmount(0, 10, 12)).toThrow(RangeError);
  });
});

describe("amortizationSchedule", () => {
  it("repays the principal exactly and ends at zero", () => {
    const rows = amortizationSchedule(100_000_000, 10, 12);
    expect(rows).toHaveLength(12);
    expect(rows.reduce((sum, r) => sum + r.principalPaise, 0)).toBe(100_000_000);
    expect(rows.at(-1)!.balancePaise).toBe(0);
    for (const row of rows) expect(row.paymentPaise).toBe(row.principalPaise + row.interestPaise);
  });

  it("charges interest on the opening balance each month", () => {
    const rows = amortizationSchedule(100_000_000, 12, 6);
    expect(rows[0]!.interestPaise).toBe(1_000_000); // 1% of ₹10,00,000
    expect(rows[1]!.interestPaise).toBe(Math.round(rows[0]!.balancePaise * 0.01));
  });

  it("works at 0%", () => {
    const rows = amortizationSchedule(100_000, 0, 3);
    expect(rows.map((r) => r.principalPaise).reduce((a, b) => a + b, 0)).toBe(100_000);
    expect(rows.every((r) => r.interestPaise === 0)).toBe(true);
  });
});

describe("repaymentProgressPercent", () => {
  it("is principal repaid / principal", () => {
    expect(repaymentProgressPercent(50_000, 100_000)).toBe(50);
    expect(repaymentProgressPercent(33_333, 100_000)).toBe(33.33);
  });

  it("caps at 100 and handles a zero principal", () => {
    expect(repaymentProgressPercent(150_000, 100_000)).toBe(100);
    expect(repaymentProgressPercent(0, 0)).toBe(0);
  });
});
