import { describe, expect, it } from "vitest";
import { DEFAULT_MEAL_PRICE_PAISE, foodKey, monthsBetween, priceNotes, splitItems, validateFoodEntry } from "@/features/food/pricing";

const lunch = new Map([
  [foodKey("Normal Lunch"), 5000],
  [foodKey("Fish Gravy"), 6000],
  [foodKey("Chicken Gravy"), 8000],
]);

describe("default prices", () => {
  it("are Tiffin 40, Lunch 50, Dinner 40", () => {
    expect(DEFAULT_MEAL_PRICE_PAISE).toEqual({ TIFFIN: 4000, LUNCH: 5000, DINNER: 4000 });
  });
});

describe("priceNotes", () => {
  it("uses the customised price: Lunch + Fish Gravy is 60, not the default 50", () => {
    expect(priceNotes("Fish Gravy", lunch, 5000).totalPaise).toBe(6000);
  });
  it("ignores case and extra spaces", () => {
    expect(priceNotes("  fish   GRAVY ", lunch, 5000)).toMatchObject({ totalPaise: 6000, items: [{ custom: true }] });
  });
  it("falls back to the default price of the meal for an unknown item", () => {
    expect(priceNotes("Curd rice", lunch, 5000)).toMatchObject({ totalPaise: 5000, items: [{ custom: false }] });
  });
  it("prices several items separately and adds them up", () => {
    expect(priceNotes("Normal Lunch, Fish Gravy", lunch, 5000).totalPaise).toBe(11000);
    expect(priceNotes("Fish Gravy + Curd", lunch, 5000).totalPaise).toBe(11000);
  });
  it("uses only the prices passed for the chosen meal", () => {
    expect(priceNotes("Fish Gravy", new Map(), 4000).totalPaise).toBe(4000);
  });
  it("prices nothing for empty notes", () => {
    expect(priceNotes("  ,  ", lunch, 5000)).toEqual({ items: [], totalPaise: 0 });
  });
  it("lets an item whose name contains a separator match as a whole", () => {
    const m = new Map([[foodKey("Rice/Curd"), 4500]]);
    expect(priceNotes("Rice/Curd", m, 5000).totalPaise).toBe(4500);
  });
});

describe("splitItems", () => {
  it("splits on commas, plus signs, slashes and new lines", () => {
    expect(splitItems("Idli, Dosa+Vada\nPongal")).toEqual(["Idli", "Dosa", "Vada", "Pongal"]);
  });
});

describe("validateFoodEntry", () => {
  it("accepts a meal and notes", () => {
    expect(validateFoodEntry({ meal: "LUNCH", notes: " Fish  Gravy " })).toEqual({ ok: true, meal: "LUNCH", notes: "Fish Gravy" });
  });
  it("rejects an unknown meal and blank or oversized notes", () => {
    expect(validateFoodEntry({ meal: "SNACK", notes: "x" })).toMatchObject({ ok: false, errors: { meal: expect.any(String) } });
    expect(validateFoodEntry({ meal: "LUNCH", notes: "   " })).toMatchObject({ ok: false, errors: { notes: expect.any(String) } });
    expect(validateFoodEntry({ meal: "LUNCH", notes: "x".repeat(201) })).toMatchObject({ ok: false, errors: { notes: expect.any(String) } });
  });
});

describe("monthsBetween", () => {
  it("lists every month, across a year end, oldest first", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
  it("orders swapped bounds and rejects bad input", () => {
    expect(monthsBetween("2026-03", "2026-01")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(monthsBetween("2026-13", "2026-01")).toEqual([]);
  });
});
