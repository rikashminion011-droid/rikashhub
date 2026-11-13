import { describe, expect, it } from "vitest";
import { cycleId, defaultCreditSelection, emptyState, fromEntry, toQuickPayInput, withCategory, withKind, withPeople, withReason, withShareValue } from "@/features/quick-pay/entry-state";
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
    expect(emptyState(DEFAULT_SETTINGS)).toMatchObject({ amount: "", type: "DEBIT", accountId: null, categoryId: null, splitKind: null, shares: [], creditsAdded: false, creditIds: [] });
  });
  it("uses the defaults chosen in Customized Settings", () => {
    const s = settings({
      fields: { ...DEFAULT_SETTINGS.fields, defaults: { type: "CREDIT", bankId: "b1", categoryId: "c1" } },
      split: { ...DEFAULT_SETTINGS.split, enabledByDefault: true, defaultPercent: 25, defaultPartyId: "p1" },
    });
    expect(emptyState(s, options)).toMatchObject({ type: "CREDIT", accountId: "b1", categoryId: "c1", splitKind: "SPLIT", shares: [{ partyId: "p1", method: "PERCENT", value: "25" }] });
  });
  it("ignores a default whose bank, category or person has since been removed", () => {
    const s = settings({
      fields: { ...DEFAULT_SETTINGS.fields, defaults: { type: "DEBIT", bankId: "gone", categoryId: "gone" } },
      split: { ...DEFAULT_SETTINGS.split, enabledByDefault: true, defaultPartyId: "gone" },
    });
    expect(emptyState(s, options)).toMatchObject({ accountId: null, categoryId: null, splitKind: "SPLIT", shares: [] });
  });
  it("starts the fixed-amount method with the default share, or empty", () => {
    const fixed = (defaultFixedPaise: number) => settings({ split: { ...DEFAULT_SETTINGS.split, enabledByDefault: true, defaultPartyId: "p1", method: "FIXED", defaultFixedPaise } });
    expect(emptyState(fixed(15050), options).shares[0]).toMatchObject({ method: "FIXED", value: "150.50" });
    expect(emptyState(fixed(20000), options).shares[0]?.value).toBe("200");
    expect(emptyState(fixed(0), options).shares[0]?.value).toBe("");
  });
});

describe("choosing people for a Split or a Debt", () => {
  const split = DEFAULT_SETTINGS;
  const start = emptyState(DEFAULT_SETTINGS);

  it("one person starts at 50% for a Split and 100% for a Debt", () => {
    const withOne = (kind: "SPLIT" | "DEBT") => withPeople({ ...start, splitKind: kind }, ["a"], split).shares.map((s) => s.value);
    expect(withOne("SPLIT")).toEqual(["50"]);
    expect(withOne("DEBT")).toEqual(["100"]);
  });
  it("several people divide the amount equally: two people are 50% each, three are 33.33%, 33.33% and 33.34%", () => {
    const form = { ...start, splitKind: "SPLIT" as const };
    expect(withPeople(form, ["a", "b"], split).shares.map((s) => s.value)).toEqual(["50", "50"]);
    expect(withPeople(form, ["a", "b", "c"], split).shares.map((s) => s.value)).toEqual(["33.33", "33.33", "33.34"]);
  });
  it("keeps a share you typed when someone is added", () => {
    let form = withPeople({ ...start, splitKind: "SPLIT" }, ["a"], split);
    form = withShareValue(form, "a", "PERCENT", "30");
    form = withPeople(form, ["a", "b"], split);
    expect(form.shares.map((s) => [s.partyId, s.value])).toEqual([["a", "30"], ["b", "50"]]);
  });
  it("Split and Debt switch the shares and keep the chosen people; off clears them", () => {
    let form = withPeople({ ...start, splitKind: "SPLIT" }, ["a"], split);
    form = withKind(form, "DEBT", split, null);
    expect(form).toMatchObject({ splitKind: "DEBT", shares: [{ partyId: "a", value: "100" }] });
    expect(withKind(form, null, split, null)).toMatchObject({ splitKind: null, shares: [] });
  });
  it("a Credit never gets a category from the reason", () => {
    expect(withReason({ ...start, type: "CREDIT" }, "dosa", keywords).categoryId).toBeNull();
  });
  it("what is sent to be saved leaves out the category and the Debt of a Credit", () => {
    const form = { ...start, type: "CREDIT" as const, categoryId: "c1", splitKind: "DEBT" as const, shares: [{ partyId: "a", method: "PERCENT" as const, value: "100", edited: false }] };
    expect(toQuickPayInput(form)).toMatchObject({ categoryId: null, split: { enabled: false } });
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
  const entry: EntryDetails = { id: "e", type: "DEBIT", amountPaise: 15050, reason: "Dosa", accountId: "b1", categoryId: "c1", splitKind: "SPLIT", shares: [{ partyId: "p1", name: "Mukesh", percent: 33.3333, sharePaise: 5000 }], creditIds: ["x"], occurredAt: "2026-06-01T05:00:00.000Z" };
  it("fills the form from a saved entry and treats its category as yours", () => {
    expect(fromEntry(entry, DEFAULT_SETTINGS)).toMatchObject({ amount: "150.50", reason: "Dosa", accountId: "b1", categoryId: "c1", categoryManual: true, splitKind: "SPLIT", shares: [{ partyId: "p1", method: "PERCENT", value: "33.33", edited: true }], creditsAdded: true, creditIds: ["x"] });
  });
  it("shows no split for an entry without one", () => {
    expect(fromEntry({ ...entry, splitKind: null, shares: [], creditIds: [] }, DEFAULT_SETTINGS)).toMatchObject({ splitKind: null, shares: [], creditsAdded: false });
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
  it("selects nothing or the latest credit, never a debit and never more than one", () => {
    expect(defaultCreditSelection(choices, credits("none"))).toEqual([]);
    expect(defaultCreditSelection(choices, credits("latest"))).toEqual(["c1"]);
    // Credit History allows one credit at a time, so a "newest few" setting still selects only the newest.
    expect(defaultCreditSelection(choices, credits("custom", 2))).toEqual(["c1"]);
    expect(defaultCreditSelection(choices, credits("custom", 9))).toEqual(["c1"]);
    expect(defaultCreditSelection([], credits("latest"))).toEqual([]);
  });
});


describe("cycleId (the switch icon)", () => {
  it("moves to the next item, wraps after the last, and starts at the first when nothing is chosen", () => {
    const banks = ["canara", "idfc", "dbs"];
    expect(cycleId(banks, null)).toBe("canara");
    expect(cycleId(banks, "canara")).toBe("idfc");
    expect(cycleId(banks, "idfc")).toBe("dbs");
    expect(cycleId(banks, "dbs")).toBe("canara");
    expect(cycleId(banks, "gone")).toBe("canara");
    expect(cycleId([], "x")).toBeNull();
  });
});
