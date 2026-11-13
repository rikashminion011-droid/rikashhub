import { describe, expect, it } from "vitest";
import { canStep, periodFor, periodLabel, periodRange, stepPeriod, type Period } from "@/features/quick-pay/period";

const TODAY = "2026-11-13"; // a Friday

describe("day", () => {
  it("steps back through Today, Yesterday, Day before yesterday, then the date, and forward again", () => {
    let p: Period = periodFor("day", TODAY);
    const seen: string[] = [periodLabel(p, TODAY)];
    for (let i = 0; i < 3; i++) seen.push(periodLabel((p = stepPeriod(p, -1)), TODAY));
    expect(seen).toEqual(["Today", "Yesterday", "Day before yesterday", "10 November 2026"]);
    expect(periodLabel(stepPeriod(p, 1), TODAY)).toBe("Day before yesterday");
  });
  it("cannot go past today", () => {
    expect(canStep(periodFor("day", TODAY), 1, TODAY)).toBe(false);
    expect(canStep(periodFor("day", TODAY), -1, TODAY)).toBe(true);
    expect(canStep({ kind: "day", date: "2026-11-12" }, 1, TODAY)).toBe(true);
  });
  it("crosses month and year ends", () => {
    expect(stepPeriod({ kind: "day", date: "2026-01-01" }, -1)).toEqual({ kind: "day", date: "2025-12-31" });
  });
});

describe("week, month and year", () => {
  it("this week runs Monday to Sunday", () => {
    expect(periodRange(periodFor("week", TODAY))).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(periodLabel(periodFor("week", TODAY), TODAY)).toBe("This week");
    expect(periodLabel(stepPeriod(periodFor("week", TODAY), -1), TODAY)).toBe("Last week");
    expect(periodLabel(stepPeriod(stepPeriod(periodFor("week", TODAY), -1), -1), TODAY)).toBe("26 Oct – 1 November 2026");
  });
  it("months and years step and are named", () => {
    expect(periodRange(periodFor("month", TODAY))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    const lastMonth = stepPeriod(periodFor("month", TODAY), -1);
    expect(periodLabel(lastMonth, TODAY)).toBe("Last month");
    expect(periodRange(lastMonth)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodLabel(stepPeriod(lastMonth, -1), TODAY)).toBe("September 2026");
    expect(periodRange(periodFor("year", TODAY))).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(periodLabel(stepPeriod(stepPeriod(periodFor("year", TODAY), -1), -1), TODAY)).toBe("2024");
    expect(stepPeriod({ kind: "month", anchor: "2026-01-15" }, -1)).toEqual({ kind: "month", anchor: "2025-12-01" });
  });
  it("the current week, month and year cannot step forward", () => {
    for (const kind of ["week", "month", "year"] as const) {
      expect(canStep(periodFor(kind, TODAY), 1, TODAY)).toBe(false);
      expect(canStep(stepPeriod(periodFor(kind, TODAY), -1), 1, TODAY)).toBe(true);
    }
  });
});

describe("custom", () => {
  it("is one date or a range, in order, and does not step", () => {
    expect(periodLabel({ kind: "custom", from: "2026-10-13", to: "2026-10-13" }, TODAY)).toBe("13 October 2026");
    expect(periodLabel({ kind: "custom", from: "2026-10-01", to: "2026-10-13" }, TODAY)).toBe("1 Oct – 13 October 2026");
    expect(periodRange({ kind: "custom", from: "2026-10-20", to: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-20" });
    expect(canStep({ kind: "custom", from: "2026-10-01", to: "2026-10-02" }, -1, TODAY)).toBe(false);
  });
});
