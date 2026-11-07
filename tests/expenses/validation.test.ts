import { describe, expect, it } from "vitest";
import { validateExpenseInput, type ExpenseFormInput } from "@/features/expenses/validation";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ctx = { methodHasAccounts: true, today: "2026-11-07" };

const base = (over: Partial<ExpenseFormInput> = {}): ExpenseFormInput => ({
  amount: "250.50",
  notes: "Lunch",
  date: "2026-11-07",
  methodId: "m1",
  accountId: "a1",
  categoryId: "c1",
  partyId: "p1",
  split: { enabled: false, mode: "EQUAL", selected: [] },
  ...over,
});

const errorsOf = (input: ExpenseFormInput, context = ctx) => {
  const result = validateExpenseInput(input, context);
  return result.ok ? null : result.errors;
};

describe("validateExpenseInput: a normal expense", () => {
  it("accepts a complete expense and converts the amount to paise", () => {
    const result = validateExpenseInput(base(), ctx);
    expect(result).toEqual({
      ok: true,
      value: {
        amountPaise: 25050,
        notes: "Lunch",
        date: "2026-11-07",
        methodId: "m1",
        accountId: "a1",
        categoryId: "c1",
        isSplit: false,
        allocations: [{ partyId: "p1", amountPaise: 25050 }],
      },
    });
  });

  it("accepts a formatted amount and trims notes; notes are optional", () => {
    const result = validateExpenseInput(base({ amount: "₹ 1,250", notes: "   " }), ctx);
    expect(result.ok && result.value.amountPaise).toBe(125000);
    expect(result.ok && result.value.notes).toBe("");
  });

  it.each([
    ["", "Enter the amount."],
    ["abc", "Enter a valid amount, with at most 2 decimals."],
    ["1.234", "Enter a valid amount, with at most 2 decimals."],
    ["-5", "Enter a valid amount, with at most 2 decimals."],
    ["0", "The amount must be greater than zero."],
    ["0.00", "The amount must be greater than zero."],
  ])("rejects the amount %j", (amount, message) => {
    expect(errorsOf(base({ amount }))?.amount).toBe(message);
  });

  it("rejects an amount that is too large", () => {
    expect(errorsOf(base({ amount: "9999999999" }))?.amount).toBe("That amount is too large.");
  });

  it("reports every missing required field at once", () => {
    const errors = errorsOf(base({ amount: "", methodId: null, accountId: null, categoryId: null, partyId: null }));
    expect(Object.keys(errors!).sort()).toEqual(["amount", "category", "method", "party"]);
  });

  it("requires an account only when the method has accounts under it", () => {
    expect(errorsOf(base({ accountId: null }))?.account).toBe("Choose the account you paid from.");
    expect(errorsOf(base({ accountId: null }), { ...ctx, methodHasAccounts: false })).toBeNull();
  });

  it("limits notes to 200 characters", () => {
    expect(errorsOf(base({ notes: "x".repeat(201) }))?.notes).toMatch(/at most 200/);
    expect(errorsOf(base({ notes: "x".repeat(200) }))).toBeNull();
  });

  it("rejects an invalid or future date", () => {
    expect(errorsOf(base({ date: "2026-02-30" }))?.date).toBe("Choose a valid date.");
    expect(errorsOf(base({ date: "" }))?.date).toBe("Choose a valid date.");
    expect(errorsOf(base({ date: "2026-11-08" }))?.date).toBe("The date cannot be in the future.");
    expect(errorsOf(base({ date: "2026-11-07" }))).toBeNull();
  });
});

describe("validateExpenseInput: splitting", () => {
  const split = (mode: "EQUAL" | "MANUAL", selected: { partyId: string; amount: string }[]) =>
    base({ amount: "100", partyId: null, split: { enabled: true, mode, selected } });

  it("does not need the To person when splitting", () => {
    expect(errorsOf(split("EQUAL", [{ partyId: A, amount: "" }, { partyId: B, amount: "" }]))).toBeNull();
  });

  it("equal split gives leftover paise to the first people and adds up exactly", () => {
    const result = validateExpenseInput(split("EQUAL", [A, B, C].map((partyId) => ({ partyId, amount: "" }))), ctx);
    expect(result.ok && result.value.allocations.map((a) => a.amountPaise)).toEqual([3334, 3333, 3333]);
    expect(result.ok && result.value.isSplit).toBe(true);
  });

  it("equal split ignores any amounts typed earlier", () => {
    const result = validateExpenseInput(split("EQUAL", [{ partyId: A, amount: "99" }, { partyId: B, amount: "1" }]), ctx);
    expect(result.ok && result.value.allocations.map((a) => a.amountPaise)).toEqual([5000, 5000]);
  });

  it("manual split accepts amounts that add up exactly", () => {
    const result = validateExpenseInput(split("MANUAL", [{ partyId: A, amount: "60.25" }, { partyId: B, amount: "39.75" }]), ctx);
    expect(result.ok && result.value.allocations).toEqual([
      { partyId: A, amountPaise: 6025 },
      { partyId: B, amountPaise: 3975 },
    ]);
  });

  it("manual split says how much is left, or how far over it is", () => {
    expect(errorsOf(split("MANUAL", [{ partyId: A, amount: "60" }, { partyId: B, amount: "30" }]))?.split).toBe("₹10.00 is still left to allocate.");
    expect(errorsOf(split("MANUAL", [{ partyId: A, amount: "60" }, { partyId: B, amount: "40.01" }]))?.split).toBe("The split is over by ₹0.01.");
  });

  it("manual split needs a valid positive amount for everyone", () => {
    expect(errorsOf(split("MANUAL", [{ partyId: A, amount: "100" }, { partyId: B, amount: "" }]))?.split).toBe("Enter a valid amount for every selected person.");
    expect(errorsOf(split("MANUAL", [{ partyId: A, amount: "100" }, { partyId: B, amount: "0" }]))?.split).toMatch(/greater than zero/);
  });

  it("needs at least two people, and not the same person twice", () => {
    expect(errorsOf(split("EQUAL", []))?.split).toBe("Choose the people to split between.");
    expect(errorsOf(split("EQUAL", [{ partyId: A, amount: "" }]))?.split).toBe("Choose at least 2 people to split between.");
    expect(errorsOf(split("EQUAL", [{ partyId: A, amount: "" }, { partyId: A, amount: "" }]))?.split).toBe("A person can only appear once in a split.");
  });

  it("does not report split problems while the amount itself is still invalid", () => {
    const errors = errorsOf({ ...split("EQUAL", [{ partyId: A, amount: "" }, { partyId: B, amount: "" }]), amount: "" });
    expect(errors).toEqual({ amount: "Enter the amount." });
  });
});
