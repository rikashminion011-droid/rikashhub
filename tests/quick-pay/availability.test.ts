import { describe, expect, it } from "vitest";
import { availablePersons, visibleBanks } from "@/features/quick-pay/availability";
import { DEFAULT_SETTINGS } from "@/features/quick-pay/settings-model";

const options = {
  banks: [
    { id: "b1", label: "GPay → Canara", mainName: "GPay", name: "Canara" },
    { id: "b2", label: "GPay → IDFC", mainName: "GPay", name: "IDFC" },
  ],
  persons: [{ id: "p1", name: "Mukesh" }, { id: "p2", name: "Balan" }],
  settings: { ...DEFAULT_SETTINGS, banks: { hiddenIds: ["b2"] }, split: { ...DEFAULT_SETTINGS.split, hiddenPersonIds: ["p2"] }, debt: { ...DEFAULT_SETTINGS.debt, hiddenPersonIds: ["p1"] } },
};

describe("what Quick Entry offers", () => {
  it("leaves hidden banks out, but keeps the one already chosen", () => {
    expect(visibleBanks(options).map((b) => b.id)).toEqual(["b1"]);
    expect(visibleBanks(options, ["b2"]).map((b) => b.id)).toEqual(["b1", "b2"]);
  });
  it("leaves hidden people out of Split and Debt separately, and keeps people already chosen", () => {
    expect(availablePersons(options, "SPLIT").map((p) => p.id)).toEqual(["p1"]);
    expect(availablePersons(options, "DEBT").map((p) => p.id)).toEqual(["p2"]);
    expect(availablePersons(options, "SPLIT", ["p2"]).map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("Debit and Credit categories", () => {
  const withCats = {
    categories: [{ id: "c-food", label: "Food", mainName: "Food", name: "Food", isSub: false }],
    creditCategories: [{ id: "c-salary", label: "Salary", mainName: "Salary", name: "Salary", isSub: false }],
    keywords: [{ keyword: "tiffin", categoryId: "c-food" }, { keyword: "pay", categoryId: "c-salary" }],
  };
  it("a Debit and a Credit share the same categories and the same reason keywords", async () => {
    const { categoriesFor, keywordsFor } = await import("@/features/quick-pay/availability");
    expect(categoriesFor(withCats, "DEBIT").map((c) => c.id)).toEqual(["c-food", "c-salary"]);
    expect(categoriesFor(withCats, "CREDIT").map((c) => c.id)).toEqual(["c-food", "c-salary"]);
    expect(keywordsFor(withCats, "DEBIT").map((k) => k.keyword)).toEqual(["tiffin", "pay"]);
    expect(keywordsFor(withCats, "CREDIT").map((k) => k.keyword)).toEqual(["tiffin", "pay"]);
  });

  it("lists a category once even when both lists already hold it", async () => {
    const { sharedCategories } = await import("@/features/quick-pay/availability");
    const food = withCats.categories[0]!;
    expect(sharedCategories([food], [food, ...withCats.creditCategories]).map((c) => c.id)).toEqual(["c-food", "c-salary"]);
  });
});

describe("categories shared by a Debit and a Credit", () => {
  it("lists a Credit category that has the same name as a Debit one only once", async () => {
    const { sharedCategories } = await import("@/features/quick-pay/availability");
    const c = (id: string, label: string) => ({ id, label, mainName: label, name: label, isSub: false });
    const out = sharedCategories([c("d1", "OFFICE"), c("d2", "FOOD")], [c("c1", "Office"), c("c2", "Diwali 2026"), c("d1", "OFFICE")]);
    expect(out.map((x) => x.id)).toEqual(["d1", "d2", "c2"]);
  });
});
