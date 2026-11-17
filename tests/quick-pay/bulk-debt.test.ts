import { describe, expect, it } from "vitest";
import { validateBulkRow, type BulkRowInput } from "@/features/quick-pay/validation";

const NOW = new Date("2026-12-31T12:00:00Z");
const row = (over: Partial<BulkRowInput> = {}): BulkRowInput => ({
  key: "r1",
  date: "2026-11-01",
  time: "10:30",
  debit: "100",
  credit: "",
  reason: "lunch",
  accountId: "11111111-1111-4111-8111-111111111111",
  categoryId: null,
  shares: [],
  ...over,
});
const person = [{ partyId: "22222222-2222-4222-8222-222222222222", method: "PERCENT" as const, value: "50" }];

describe("Debt to and Split on an Add Bulk row", () => {
  it("a row with people is a Split unless it says Debt", () => {
    const split = validateBulkRow(row({ shares: person }), NOW);
    expect(split.ok && split.value.splitKind).toBe("SPLIT");
    const explicit = validateBulkRow(row({ shares: person, splitKind: "SPLIT" }), NOW);
    expect(explicit.ok && explicit.value.splitKind).toBe("SPLIT");
  });

  it("a Debit row marked Debt keeps that, with the people's shares worked out", () => {
    const debt = validateBulkRow(row({ shares: person, splitKind: "DEBT" }), NOW);
    expect(debt.ok).toBe(true);
    if (!debt.ok) return;
    expect(debt.value.splitKind).toBe("DEBT");
    expect(debt.value.shares).toEqual([expect.objectContaining({ sharePaise: 5000, percent: 50 })]);
  });

  it("a row with nobody chosen is not shared at all, even when Debt or Split is ticked", () => {
    for (const splitKind of ["DEBT", "SPLIT", null] as const) {
      const plain = validateBulkRow(row({ splitKind }), NOW);
      expect(plain.ok && plain.value.splitKind).toBe(null);
    }
  });

  it("a Credit cannot be a Debt", () => {
    const credit = validateBulkRow(row({ debit: "", credit: "100", shares: person, splitKind: "DEBT" }), NOW);
    expect(credit.ok).toBe(false);
    if (!credit.ok) expect(credit.errors.split).toBe("A Debt can only be added to a Debit.");
  });

  it("a self transfer never carries people", () => {
    const transfer = validateBulkRow(
      row({ shares: person, splitKind: "DEBT", transfer: { fromId: "11111111-1111-4111-8111-111111111111", toId: "33333333-3333-4333-8333-333333333333" } }),
      NOW,
    );
    expect(transfer.ok && transfer.value.shares).toEqual([]);
  });
});
