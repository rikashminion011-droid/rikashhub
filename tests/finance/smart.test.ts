import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  findPossibleDuplicates,
  parseISODate as d,
  suggestCategory,
  type DuplicateCandidate,
} from "@/lib/finance";

describe("findPossibleDuplicates", () => {
  const candidate: DuplicateCandidate = {
    type: "EXPENSE",
    amountPaise: 50_000,
    date: d("2026-11-06"),
    accountId: "A",
    description: "Swiggy order",
  };
  const make = (over: Partial<DuplicateCandidate> & { id: string }) => ({ ...candidate, ...over });

  it("flags the same type, amount, instrument and day", () => {
    const hits = findPossibleDuplicates(candidate, [make({ id: "1" })]);
    expect(hits.map((h) => h.transaction.id)).toEqual(["1"]);
  });

  it("ignores different amounts, types, accounts and far-apart dates", () => {
    const existing = [
      make({ id: "amount", amountPaise: 50_001 }),
      make({ id: "type", type: "INCOME" }),
      make({ id: "account", accountId: "B" }),
      make({ id: "far", date: d("2026-11-03") }),
    ];
    expect(findPossibleDuplicates(candidate, existing)).toEqual([]);
  });

  it("allows a day either side and scores same-day matches higher", () => {
    const hits = findPossibleDuplicates(candidate, [
      make({ id: "next-day", date: d("2026-11-07"), description: "something else" }),
      make({ id: "same-day", description: "something else" }),
    ]);
    expect(hits.map((h) => h.transaction.id)).toEqual(["same-day", "next-day"]);
  });

  it("scores a matching description above a different one", () => {
    const hits = findPossibleDuplicates(candidate, [
      make({ id: "other", description: "Groceries" }),
      make({ id: "same", description: "SWIGGY order!" }),
    ]);
    expect(hits[0]!.transaction.id).toBe("same");
  });

  it("respects a custom window", () => {
    const existing = [make({ id: "3d", date: d("2026-11-03") })];
    expect(findPossibleDuplicates(candidate, existing, 3)).toHaveLength(1);
  });
});

describe("suggestCategory", () => {
  const categories = DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({ id: String(i), ...c }));
  const name = (text: string) => suggestCategory(text, categories)?.name ?? null;

  it("recognises common merchants", () => {
    expect(name("Swiggy order #4821")).toBe("Food & Dining");
    expect(name("BigBasket weekly")).toBe("Groceries");
    expect(name("Netflix subscription")).toBe("Entertainment");
    expect(name("Airtel recharge")).toBe("Mobile & Internet");
    expect(name("House rent November")).toBe("Rent");
  });

  it("matches whole words only", () => {
    expect(name("Paid via OLA cab")).toBe("Transport");
    expect(name("Coca cola")).toBeNull();
    expect(name("current account fee")).toBeNull();
  });

  it("returns null for empty or unknown descriptions", () => {
    expect(name("")).toBeNull();
    expect(suggestCategory(undefined, categories)).toBeNull();
    expect(name("zzzz unknown merchant")).toBeNull();
  });

  it("prefers the longest matching keyword", () => {
    const rules = [
      { id: "a", name: "A", keywords: ["prime"] },
      { id: "b", name: "B", keywords: ["prime video"] },
    ];
    expect(suggestCategory("Prime Video renewal", rules)?.name).toBe("B");
  });

  it("does not choke on regex characters in keywords", () => {
    const rules = [{ id: "x", name: "X", keywords: ["c++ (course)"] }];
    expect(suggestCategory("c++ (course) fee", rules)?.name).toBe("X");
  });

  it("works for income categories", () => {
    const income = DEFAULT_INCOME_CATEGORIES.map((c, i) => ({ id: String(i), ...c }));
    expect(suggestCategory("Salary credited", income)?.name).toBe("Salary");
  });
});

describe("default category keywords", () => {
  it("are lower case and not shared between expense categories", () => {
    const seen = new Map<string, string>();
    for (const category of DEFAULT_EXPENSE_CATEGORIES) {
      for (const keyword of category.keywords) {
        expect(keyword).toBe(keyword.toLowerCase());
        expect(seen.get(keyword), `"${keyword}" is in ${seen.get(keyword)} and ${category.name}`).toBeUndefined();
        seen.set(keyword, category.name);
      }
    }
  });
});
