import { describe, expect, it } from "vitest";
import {
  formatINR,
  formatINRCompact,
  paiseToDecimalString,
  sumPaise,
  toPaise,
} from "@/lib/finance";

describe("toPaise", () => {
  it("converts numbers without float error", () => {
    expect(toPaise(1234.56)).toBe(123456);
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(0)).toBe(0);
  });

  it("converts decimal strings exactly", () => {
    expect(toPaise("1234.56")).toBe(123456);
    expect(toPaise("0.1") + toPaise("0.2")).toBe(30);
    expect(toPaise("500")).toBe(50000);
    expect(toPaise("-5.50")).toBe(-550);
  });

  it("rounds a third decimal half up", () => {
    expect(toPaise("12.345")).toBe(1235);
    expect(toPaise("12.344")).toBe(1234);
  });

  it("accepts Decimal-like objects through toString()", () => {
    expect(toPaise({ toString: () => "250.75" })).toBe(25075);
  });

  it("rejects garbage", () => {
    expect(() => toPaise("abc")).toThrow(RangeError);
    expect(() => toPaise("")).toThrow(RangeError);
    expect(() => toPaise(Number.NaN)).toThrow(RangeError);
    expect(() => toPaise(Infinity)).toThrow(RangeError);
  });
});

describe("paiseToDecimalString", () => {
  it("formats for a Decimal column", () => {
    expect(paiseToDecimalString(123456)).toBe("1234.56");
    expect(paiseToDecimalString(5)).toBe("0.05");
    expect(paiseToDecimalString(-250)).toBe("-2.50");
    expect(paiseToDecimalString(0)).toBe("0.00");
  });

  it("refuses non-integer paise", () => {
    expect(() => paiseToDecimalString(10.5)).toThrow(RangeError);
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
    expect(formatINR(1_000_000_000)).toBe("₹1,00,00,000.00");
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(99900)).toBe("₹999.00");
  });

  it("shows negatives with a leading minus", () => {
    expect(formatINR(-150000)).toBe("-₹1,500.00");
  });
});

describe("formatINRCompact", () => {
  it("uses lakh and crore", () => {
    expect(formatINRCompact(34_000_000)).toBe("₹3.4 L");
    expect(formatINRCompact(1_000_000_000)).toBe("₹1 Cr");
    expect(formatINRCompact(12_500_000_000)).toBe("₹12.5 Cr");
    expect(formatINRCompact(-34_000_000)).toBe("-₹3.4 L");
  });

  it("falls back to the full format under one lakh", () => {
    expect(formatINRCompact(5_000_000)).toBe("₹50,000.00");
  });
});

describe("sumPaise", () => {
  it("adds exactly", () => {
    expect(sumPaise([10, 20, 30])).toBe(60);
    expect(sumPaise([])).toBe(0);
  });
});
