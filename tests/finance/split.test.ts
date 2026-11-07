import { describe, expect, it } from "vitest";
import { equalSplit, parseAmountInput, summarizeSplit, validateSplit } from "@/lib/finance";

describe("equalSplit", () => {
  it("splits evenly when it divides exactly", () => {
    expect(equalSplit(30000, 3)).toEqual([10000, 10000, 10000]);
  });

  it("gives leftover paise to the first people, so ₹100 between three is 33.34 + 33.33 + 33.33", () => {
    expect(equalSplit(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("always adds up to the total exactly", () => {
    for (const total of [1, 2, 99, 10000, 123457, 99999999]) {
      for (const count of [1, 2, 3, 4, 5, 7, 11]) {
        const shares = equalSplit(total, count);
        expect(shares).toHaveLength(count);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("handles a single person and a total smaller than the head count", () => {
    expect(equalSplit(500, 1)).toEqual([500]);
    expect(equalSplit(2, 5)).toEqual([1, 1, 0, 0, 0]);
  });

  it("rejects bad input", () => {
    expect(() => equalSplit(100, 0)).toThrow(RangeError);
    expect(() => equalSplit(-1, 2)).toThrow(RangeError);
    expect(() => equalSplit(10.5, 2)).toThrow(RangeError);
  });
});

describe("summarizeSplit", () => {
  it("reports what is left to allocate", () => {
    expect(summarizeSplit(10000, [3000, 2000])).toEqual({
      totalPaise: 10000,
      allocatedPaise: 5000,
      remainingPaise: 5000,
      isBalanced: false,
    });
  });

  it("is balanced when the shares add up exactly", () => {
    expect(summarizeSplit(10000, [6000, 4000]).isBalanced).toBe(true);
  });

  it("reports a negative remainder when over-allocated", () => {
    expect(summarizeSplit(10000, [6000, 5000]).remainingPaise).toBe(-1000);
  });

  it("treats no entries as nothing allocated", () => {
    expect(summarizeSplit(10000, []).remainingPaise).toBe(10000);
  });
});

describe("validateSplit", () => {
  const entry = (id: string, amountPaise: number) => ({ id, amountPaise });

  it("accepts a split that adds up to the paisa", () => {
    expect(validateSplit(10000, [entry("a", 3334), entry("b", 3333), entry("c", 3333)])).toEqual({ ok: true });
  });

  it("needs at least two people by default", () => {
    expect(validateSplit(10000, [entry("a", 10000)])).toEqual({
      ok: false,
      error: "Choose at least 2 people to split between.",
    });
    expect(validateSplit(10000, [entry("a", 10000)], { minPeople: 1 })).toEqual({ ok: true });
  });

  it("rejects the same person twice", () => {
    const result = validateSplit(10000, [entry("a", 5000), entry("a", 5000)]);
    expect(result.ok).toBe(false);
  });

  it("rejects zero, negative and fractional shares", () => {
    expect(validateSplit(10000, [entry("a", 10000), entry("b", 0)]).ok).toBe(false);
    expect(validateSplit(10000, [entry("a", 10100), entry("b", -100)]).ok).toBe(false);
    expect(validateSplit(10000, [entry("a", 5000.5), entry("b", 4999.5)]).ok).toBe(false);
  });

  it("says how much is left when under-allocated", () => {
    expect(validateSplit(10000, [entry("a", 3000), entry("b", 2000)])).toEqual({
      ok: false,
      error: "₹50.00 is still left to allocate.",
    });
  });

  it("says how much it is over by when over-allocated", () => {
    expect(validateSplit(10000, [entry("a", 6000), entry("b", 4001)])).toEqual({
      ok: false,
      error: "The split is over by ₹0.01.",
    });
  });
});

describe("parseAmountInput", () => {
  it("reads plain and formatted amounts", () => {
    expect(parseAmountInput("250")).toBe(25000);
    expect(parseAmountInput("250.5")).toBe(25050);
    expect(parseAmountInput("₹ 1,250.50")).toBe(125050);
    expect(parseAmountInput("  40 ")).toBe(4000);
    expect(parseAmountInput("0")).toBe(0);
  });

  it("returns null for anything that is not a plain amount", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1..2", "1e5", "12.", ".5", "1 2 x", "99999999999"]) {
      expect(parseAmountInput(bad), bad).toBeNull();
    }
  });
});
