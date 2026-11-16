import { describe, expect, it } from "vitest";
import { buildGrid, datesBetween, formatRupeesPlain, mealRecords } from "@/features/food/grid";
import { isNilNotes, partialMatches, priceNotes } from "@/features/food/pricing";
import type { FoodEntryRow } from "@/features/food/types";
import { istInstant } from "@/features/quick-pay/datetime";

const row = (id: string, date: string, time: string, meal: FoodEntryRow["meal"], notes: string, amountPaise: number): FoodEntryRow => ({ id, meal, notes, amountPaise, occurredAt: istInstant(date, time).toISOString() });

describe("food grid", () => {
  it("puts each meal under its column and totals the day, leaving Nil out", () => {
    const days = buildGrid([row("a", "2026-11-02", "09:00", "TIFFIN", "Idli", 4000), row("b", "2026-11-02", "13:00", "LUNCH", "Fish Gravy", 6000), row("c", "2026-11-02", "19:00", "DINNER", "Nil", 0), row("d", "2026-11-01", "09:00", "TIFFIN", "Dosa", 4000)]);
    expect(days.map((d) => d.date)).toEqual(["2026-11-01", "2026-11-02"]);
    const second = days[1]!;
    expect(second.cells.TIFFIN.map((e) => e.notes)).toEqual(["Idli"]);
    expect(second.cells.DINNER[0]!.nil).toBe(true);
    expect(second.totalPaise).toBe(10000);
  });
  it("orders newest first on request", () => {
    expect(buildGrid([row("a", "2026-11-01", "09:00", "TIFFIN", "A", 100), row("b", "2026-11-03", "09:00", "TIFFIN", "B", 100)], "desc").map((d) => d.date)).toEqual(["2026-11-03", "2026-11-01"]);
  });
  it("shows rupees without .00", () => {
    expect(formatRupeesPlain(4000)).toBe("₹40");
    expect(formatRupeesPlain(4050)).toBe("₹40.50");
    expect(formatRupeesPlain(12500000)).toBe("₹1,25,000");
  });
});

describe("meal records", () => {
  it("expects three meals on each day except Sundays", () => {
    // 1 to 7 November 2026 runs Sunday to Saturday: six days that are not Sundays.
    expect(datesBetween("2026-11-01", "2026-11-07")).toHaveLength(7);
    expect(mealRecords("2026-11-01", "2026-11-07", []).expected).toBe(18);
    // November 2026 has 30 days and five Sundays (1, 8, 15, 22 and 29).
    expect(mealRecords("2026-11-01", "2026-11-30", []).expected).toBe((30 - 5) * 3);
  });
  it("counts food as recorded, Nil separately, and ignores Sundays and repeat entries", () => {
    const rows = [
      row("a", "2026-11-02", "09:00", "TIFFIN", "Idli", 4000),
      row("b", "2026-11-02", "09:30", "TIFFIN", "Dosa", 4000), // the same meal again: still one record
      row("c", "2026-11-02", "13:00", "LUNCH", "Nil", 0),
      row("d", "2026-11-01", "13:00", "LUNCH", "Rice", 5000), // a Sunday: not counted
    ];
    expect(mealRecords("2026-11-01", "2026-11-07", rows)).toEqual({ expected: 18, recorded: 1, nil: 1, missing: 16 });
  });
});

describe("food names", () => {
  const prices = new Map([["fish gravy", 6000], ["chicken gravy", 9000], ["idli", 3000]]);
  it("finds an item from a part of its name", () => {
    expect(priceNotes("Fish", prices, 5000)).toMatchObject({ totalPaise: 6000, items: [{ name: "Fish", custom: true, matched: "fish gravy" }] });
    expect(priceNotes("gravy", prices, 5000).items[0]!.choices).toEqual(["fish gravy", "chicken gravy"]);
    expect(priceNotes("gravy", prices, 5000).totalPaise).toBe(5000);
  });
  it("prefers an exact name and ignores a single letter", () => {
    expect(priceNotes("Idli", prices, 5000).totalPaise).toBe(3000);
    expect(partialMatches("f", prices)).toEqual([]);
  });
  it("makes Nil free", () => {
    expect(isNilNotes(" nil ")).toBe(true);
    expect(priceNotes("Nil", prices, 5000).totalPaise).toBe(0);
  });
});
