import { describe, expect, it } from "vitest";
import { defaultCreditSelection, emptyState, fromEntry, withCategory, withReason } from "@/features/quick-pay/entry-state";
import { DEFAULT_SETTINGS, type QuickPaySettingsData } from "@/features/quick-pay/settings-model";
import type { EntryDetails, RecentCredit } from "@/features/quick-pay/types";

const keywords = [
  { keyword: "dosa", categoryId: "food-dosa" },
  { keyword: "petrol", categoryId: "travel" },
];
const settings = (over: Partial<QuickPaySettingsData> = {}): QuickPaySettingsData => ({ ...DEFAULT_SETTINGS, ...over });
const options = {
  banks: [{ id: "b1", label: "GPay → Canara", mainName: "GPay", name: "Canara" }],
  categories: [{ id: "c1", label: "Food", mainName: "Food", name: "Food", isSub: false }],
  persons: [{ id: "p1", name: "Mukesh" }],
};

describe("emptyState", () => {
  it("starts empty with the built-in defaults: a Debit, nothing chosen, Split off", () => {
    expect(emptyState(DEFAULT_SETTINGS)).toMatchObject({ amount: "", type: "DEBIT", accountId: null, categoryId: null, splitEnabled: false, partyId: null, splitMethod: "PERCENT", splitValue: "50", creditsAdded: false, creditIds: [] });
  });
  it("uses the defaults chosen in Customized Settings", () => {
    const s = settings({
      fields: { ...DEFAULT_SETTINGS.fields, defaults: { type: "CREDIT", bankId: "b1", categoryId: "c1" } },
      split: { ...DEFAULT_SETTINGS.split, enabledByDefault: true, defaultPercent: 25, defaultPartyId: "p1" },
    });
    expect(emptyState(s, options)).toMatchObject({ type: "CREDIT", accountId: "b1", categoryId: "c1", splitEnabled: true, partyId: "p1", splitValue: "25" });
  });
  it("ignores a default whose bank, category or person has since been removed", () => {
    const s = settings({
      fields: { ...DEFAULT_SETTINGS.fields, defaults: { type: "DEBIT", bankId: "gone", categoryId: "gone" } },
      split: { ...DEFAULT_SETTINGS.split, enabledByDefault: true, defaultPartyId: "gone" },
    });
    expect(emptyState(s, options)).toMatchObject({ accountId: null, categoryId: null, partyId: null, splitEnabled: true });
  });
  it("starts the fixed-amount method with the default share, or empty", () => {
    expect(emptyState(settings({ split: { ...DEFAULT_SETTINGS.split, method: "FIXED", defaultFixedPaise: 15050 } })).splitValue).toBe("150.50");
    expect(emptyState(settings({ split: { ...DEFAULT_SETTINGS.split, method: "FIXED", defaultFixedPaise: 20000 } })).splitValue).toBe("200");
    expect(emptyState(settings({ split: { ...DEFAULT_SETTINGS.split, method: "FIXED", defaultFixedPaise: 0 } })).splitValue).toBe("");
  });
});

describe("keyword category", () => {
  const start = emptyState(DEFAULT_SETTINGS);

  it("picks the category from the reason, and follows it as you type", () => {
    let f = withReason(start, "Masala dosa", keywords);
    expect(f).toMatchObject({ categoryId: "food-dosa", categoryAuto: true, categoryManual: false });
    f = withReason(f, "petrol", keywords);
    expect(f.categoryId).toBe("travel");
    f = withReason(f, "groceries", keywords);
    expect(f).toMatchObject({ categoryId: null, categoryAuto: false });
  });
  it("never overrides a category you chose, even if the reason matches another", () => {
    let f = withCategory(start, "other");
    f = withReason(f, "petrol", keywords);
    expect(f).toMatchObject({ categoryId: "other", categoryManual: true });
    f = withReason(f, "dosa", keywords);
    expect(f.categoryId).toBe("other");
  });
  it("treats clearing the category yourself as your choice too", () => {
    let f = withReason(start, "dosa", keywords);
    f = withCategory(f, null);
    f = withReason(f, "petrol", keywords);
    expect(f).toMatchObject({ categoryId: null, categoryManual: true });
  });
  it("leaves the category alone when nothing matches and none was picked by a keyword (a default stays)", () => {
    const withDefault = { ...start, categoryId: "c1" };
    expect(withReason(withDefault, "random words", keywords).categoryId).toBe("c1");
    expect(withReason(withDefault, "dosa", keywords).categoryId).toBe("food-dosa");
  });
  it("matches whole words only", () => {
    expect(withReason(start, "dosas", keywords).categoryId).toBeNull();
  });
});

describe("fromEntry", () => {
  const entry: EntryDetails = { id: "e", type: "DEBIT", amountPaise: 15050, reason: "Dosa", accountId: "b1", categoryId: "c1", partyId: "p1", splitPercent: 33.3333, creditIds: ["x"], occurredAt: "2026-06-01T05:00:00.000Z" };
  it("fills the form from a saved entry and treats its category as yours", () => {
    expect(fromEntry(entry, DEFAULT_SETTINGS)).toMatchObject({ amount: "150.50", reason: "Dosa", accountId: "b1", categoryId: "c1", categoryManual: true, splitEnabled: true, partyId: "p1", splitMethod: "PERCENT", splitValue: "33.33", creditsAdded: true, creditIds: ["x"] });
  });
  it("shows no split for an entry without one", () => {
    expect(fromEntry({ ...entry, partyId: null, splitPercent: null, creditIds: [] }, DEFAULT_SETTINGS)).toMatchObject({ splitEnabled: false, partyId: null, creditsAdded: false });
  });
});

describe("defaultCreditSelection", () => {
  const choices: RecentCredit[] = [
    { id: "d1", type: "DEBIT", amountPaise: 100, reason: "", occurredAt: "2026-06-05T00:00:00Z" },
    { id: "c1", type: "CREDIT", amountPaise: 200, reason: "", occurredAt: "2026-06-04T00:00:00Z" },
    { id: "c2", type: "CREDIT", amountPaise: 300, reason: "", occurredAt: "2026-06-03T00:00:00Z" },
    { id: "c3", type: "CREDIT", amountPaise: 400, reason: "", occurredAt: "2026-06-02T00:00:00Z" },
  ];
  const credits = (defaultSelection: "none" | "latest" | "custom", customCount = 2) => ({ ...DEFAULT_SETTINGS.credits, defaultSelection, customCount });
  it("selects nothing, the latest credit, or the newest few credits (never a debit)", () => {
    expect(defaultCreditSelection(choices, credits("none"))).toEqual([]);
    expect(defaultCreditSelection(choices, credits("latest"))).toEqual(["c1"]);
    expect(defaultCreditSelection(choices, credits("custom", 2))).toEqual(["c1", "c2"]);
    expect(defaultCreditSelection(choices, credits("custom", 9))).toEqual(["c1", "c2", "c3"]);
    expect(defaultCreditSelection([], credits("latest"))).toEqual([]);
  });
});

