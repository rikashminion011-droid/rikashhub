import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRecentExpenses } from "@/features/expenses/server/queries";
import {
  ExpenseError,
  addAccount,
  addCategory,
  addParty,
  addPaymentMethod,
  archiveOption,
  createExpense,
  ensureUserSetup,
  getExpenseFormData,
} from "@/features/expenses/server/service";
import type { ExpenseFormData } from "@/features/expenses/types";
import { validateExpenseInput, type ExpenseFormInput, type ValidExpense } from "@/features/expenses/validation";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com", name: "Me" };
const OTHER = { id: "22222222-2222-4222-8222-222222222222", email: "other@example.com", name: "Other" };

let database: TestDatabase;
let db: TestDatabase["prisma"];
let mine: ExpenseFormData;
let theirs: ExpenseFormData;

const byName = <T extends { name: string }>(list: T[], name: string): T => {
  const found = list.find((x) => x.name === name);
  if (!found) throw new Error(`"${name}" not in [${list.map((l) => l.name).join(", ")}]`);
  return found;
};

let requests = 0;
const requestId = () => `00000000-0000-4000-8000-${String(++requests).padStart(12, "0")}`;

/** Build a valid expense the way the form does (through the shared validation). */
function expense(overrides: Partial<ExpenseFormInput> = {}, hasAccounts = true): ValidExpense {
  const gpay = byName(mine.methods, "GPay");
  const input: ExpenseFormInput = {
    amount: "250.50",
    notes: "Lunch",
    date: "2026-11-06",
    methodId: gpay.id,
    accountId: byName(gpay.accounts, "Canara").id,
    categoryId: byName(mine.categories, "Food").id,
    partyId: byName(mine.parties, "Personal").id,
    split: { enabled: false, mode: "EQUAL", selected: [] },
    ...overrides,
  };
  const result = validateExpenseInput(input, { methodHasAccounts: hasAccounts, today: "2026-11-07" });
  if (!result.ok) throw new Error(`test input invalid: ${JSON.stringify(result.errors)}`);
  return result.value;
}

const balanceOf = async (accountId: string) =>
  (await db.account.findUniqueOrThrow({ where: { id: accountId } })).currentBalance.toString();

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  await ensureUserSetup(db, OTHER);
  mine = await getExpenseFormData(db, ME.id);
  theirs = await getExpenseFormData(db, OTHER.id);
}, 90_000);

afterAll(async () => {
  await database?.close();
});

describe("starter options", () => {
  it("creates the default payment methods, accounts under GPay, people and categories, in order", () => {
    expect(mine.methods.map((m) => m.name)).toEqual(["GPay", "HDFC", "Slice"]);
    expect(byName(mine.methods, "GPay").accounts.map((a) => a.name)).toEqual(["Canara", "IDFC", "DBS"]);
    expect(byName(mine.methods, "HDFC").accounts).toEqual([]);
    expect(mine.parties.map((p) => p.name)).toEqual(["Personal", "Office", "Mukesh", "Save", "Balan"]);
    expect(mine.categories.map((c) => c.name)).toEqual(["Food", "Shopping"]);
  });

  it("types Slice as a credit line and GPay as a wallet", () => {
    expect(byName(mine.methods, "Slice").kind).toBe("CREDIT_LINE");
    expect(byName(mine.methods, "GPay").kind).toBe("WALLET");
    expect(byName(mine.methods, "HDFC").kind).toBe("BANK");
  });

  it("gives every user their own separate copy", () => {
    const mineIds = new Set([...mine.methods.map((m) => m.id), ...mine.parties.map((p) => p.id), ...mine.categories.map((c) => c.id)]);
    for (const option of [...theirs.methods, ...theirs.parties, ...theirs.categories]) expect(mineIds.has(option.id)).toBe(false);
  });

  it("does not create them twice when set up again or at the same moment", async () => {
    await Promise.all([ensureUserSetup(db, ME), ensureUserSetup(db, ME), ensureUserSetup(db, ME)]);
    const again = await getExpenseFormData(db, ME.id);
    expect(again.methods).toHaveLength(3);
    expect(again.parties).toHaveLength(5);
    expect(again.categories).toHaveLength(2);
  });
});

describe("adding options (saved for next time)", () => {
  it("adds a user, and it is there on the next load", async () => {
    const id = await addParty(db, ME.id, { name: "  Raju  " });
    const after = await getExpenseFormData(db, ME.id);
    expect(byName(after.parties, "Raju").id).toBe(id);
    expect(after.parties.at(-1)!.name).toBe("Raju");
  });

  it("refuses a duplicate user, ignoring case and spacing", async () => {
    await expect(addParty(db, ME.id, { name: "mukesh" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(addParty(db, ME.id, { name: " RAJU " })).rejects.toThrow(ExpenseError);
  });

  it("lets two different users have the same name", async () => {
    await addParty(db, OTHER.id, { name: "Raju" });
  });

  it("adds a category and refuses a duplicate", async () => {
    const id = await addCategory(db, ME.id, { name: "Travel" });
    expect(byName((await getExpenseFormData(db, ME.id)).categories, "Travel").id).toBe(id);
    await expect(addCategory(db, ME.id, { name: "food" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("adds a payment method of the chosen kind", async () => {
    await addPaymentMethod(db, ME.id, { name: "PhonePe", kind: "WALLET" });
    await addPaymentMethod(db, ME.id, { name: "Cash", kind: "CASH" });
    await addPaymentMethod(db, ME.id, { name: "Amazon Pay Later", kind: "CREDIT_LINE" });
    const after = await getExpenseFormData(db, ME.id);
    expect(byName(after.methods, "PhonePe").kind).toBe("WALLET");
    expect(byName(after.methods, "Cash").kind).toBe("CASH");
    expect(byName(after.methods, "Amazon Pay Later").kind).toBe("CREDIT_LINE");
    await expect(addPaymentMethod(db, ME.id, { name: "gpay", kind: "BANK" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("adds an account under a method, only under that method", async () => {
    const hdfc = byName((await getExpenseFormData(db, ME.id)).methods, "HDFC");
    await addAccount(db, ME.id, { methodId: hdfc.id, name: "Savings" });
    const after = await getExpenseFormData(db, ME.id);
    expect(byName(after.methods, "HDFC").accounts.map((a) => a.name)).toEqual(["Savings"]);
    expect(byName(after.methods, "GPay").accounts.map((a) => a.name)).toEqual(["Canara", "IDFC", "DBS"]);
    await expect(addAccount(db, ME.id, { methodId: hdfc.id, name: "savings" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses an account under a method that does not exist or belongs to someone else", async () => {
    const theirGpay = byName(theirs.methods, "GPay");
    await expect(addAccount(db, ME.id, { methodId: theirGpay.id, name: "Sneaky" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addAccount(db, ME.id, { methodId: "99999999-9999-4999-8999-999999999999", name: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects empty and over-long names", async () => {
    await expect(addParty(db, ME.id, { name: "   " })).rejects.toThrow("Enter a name");
    await expect(addCategory(db, ME.id, { name: "x".repeat(61) })).rejects.toThrow("at most 60");
  });
});

describe("removing options", () => {
  it("removes a user from the list but keeps past expenses intact", async () => {
    const balan = byName(mine.parties, "Balan");
    const saved = await createExpense(db, ME.id, requestId(), expense({ partyId: balan.id, amount: "10" }));
    await archiveOption(db, ME.id, { kind: "party", id: balan.id });
    const after = await getExpenseFormData(db, ME.id);
    expect(after.parties.map((p) => p.name)).not.toContain("Balan");
    const recent = await getRecentExpenses(db, ME.id, 50);
    expect(recent.find((r) => r.id === saved.id)!.people[0]!.name).toBe("Balan");
  });

  it("brings a removed option back when it is added again, instead of duplicating it", async () => {
    const before = mine.parties.find((p) => p.name === "Balan")!.id;
    expect(await addParty(db, ME.id, { name: "balan" })).toBe(before);
    expect((await getExpenseFormData(db, ME.id)).parties.map((p) => p.name)).toContain("balan");
  });

  it("removing a method removes its accounts too, and a removed method cannot be used", async () => {
    const id = await addPaymentMethod(db, ME.id, { name: "Temp Bank", kind: "BANK" });
    await addAccount(db, ME.id, { methodId: id, name: "Temp Sub" });
    await archiveOption(db, ME.id, { kind: "method", id });
    expect((await getExpenseFormData(db, ME.id)).methods.map((m) => m.name)).not.toContain("Temp Bank");
    await expect(createExpense(db, ME.id, requestId(), { ...expense(), methodId: id, accountId: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cannot remove somebody else's option", async () => {
    await expect(archiveOption(db, ME.id, { kind: "party", id: byName(theirs.parties, "Office").id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(archiveOption(db, ME.id, { kind: "category", id: byName(theirs.categories, "Food").id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getExpenseFormData(db, OTHER.id)).parties.map((p) => p.name)).toContain("Office");
  });

  it("does not bring the starter options back after one was deleted", async () => {
    await archiveOption(db, ME.id, { kind: "category", id: byName(mine.categories, "Shopping").id });
    await ensureUserSetup(db, ME);
    expect((await getExpenseFormData(db, ME.id)).categories.map((c) => c.name)).not.toContain("Shopping");
  });
});

describe("saving an expense", () => {
  it("saves it, lowers the account balance, and records who it is for", async () => {
    const gpay = byName(mine.methods, "GPay");
    const canara = byName(gpay.accounts, "Canara");
    const before = await balanceOf(canara.id);
    const saved = await createExpense(db, ME.id, requestId(), expense());
    expect(saved.duplicate).toBe(false);

    const row = await db.transaction.findUniqueOrThrow({ where: { id: saved.id }, include: { splits: true } });
    expect(row.type).toBe("EXPENSE");
    expect(row.amount.toString()).toBe("250.5");
    expect(row.description).toBe("Lunch");
    expect(row.accountId).toBe(canara.id);
    expect(row.isSplit).toBe(false);
    expect(row.date.toISOString().slice(0, 10)).toBe("2026-11-06");
    expect(row.splits).toHaveLength(1);
    expect(row.splits[0]!.amount.toString()).toBe("250.5");

    expect(Number(await balanceOf(canara.id))).toBeCloseTo(Number(before) - 250.5, 2);
  });

  it("writes an audit record", async () => {
    const saved = await createExpense(db, ME.id, requestId(), expense({ amount: "5" }));
    const logs = await db.auditLog.findMany({ where: { userId: ME.id, entityId: saved.id } });
    expect(logs.map((l) => l.action)).toEqual(["expense.create"]);
  });

  it("raises what is owed when paying with a credit line like Slice", async () => {
    const slice = byName(mine.methods, "Slice");
    const before = await balanceOf(slice.id);
    await createExpense(db, ME.id, requestId(), expense({ methodId: slice.id, accountId: null, amount: "100" }, false));
    expect(Number(await balanceOf(slice.id))).toBeCloseTo(Number(before) + 100, 2);
  });

  it("pays straight from a method that has no accounts under it", async () => {
    const methods = (await getExpenseFormData(db, ME.id)).methods;
    const cash = byName(methods, "Cash");
    const before = await balanceOf(cash.id);
    await createExpense(db, ME.id, requestId(), expense({ methodId: cash.id, accountId: null, amount: "40" }, false));
    expect(Number(await balanceOf(cash.id))).toBeCloseTo(Number(before) - 40, 2);
  });

  it("splits equally to the paisa and the rows add up exactly", async () => {
    const [a, b, c] = ["Personal", "Office", "Mukesh"].map((n) => byName(mine.parties, n).id);
    const valid = expense({
      amount: "100",
      split: { enabled: true, mode: "EQUAL", selected: [a!, b!, c!].map((partyId) => ({ partyId, amount: "" })) },
      partyId: null,
    });
    const saved = await createExpense(db, ME.id, requestId(), valid);
    const rows = await db.transactionSplit.findMany({ where: { transactionId: saved.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.amount.toString()).sort()).toEqual(["33.33", "33.33", "33.34"]);
    expect(rows.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0)).toBe(10000);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: saved.id } })).isSplit).toBe(true);
  });

  it("saves a manual split exactly as entered", async () => {
    const [a, b] = ["Personal", "Mukesh"].map((n) => byName(mine.parties, n).id);
    const valid = expense({
      amount: "90",
      partyId: null,
      split: {
        enabled: true,
        mode: "MANUAL",
        selected: [
          { partyId: a!, amount: "20.25" },
          { partyId: b!, amount: "69.75" },
        ],
      },
    });
    const saved = await createExpense(db, ME.id, requestId(), valid);
    const rows = await db.transactionSplit.findMany({ where: { transactionId: saved.id } });
    expect(Object.fromEntries(rows.map((r) => [r.partyId, r.amount.toString()]))).toEqual({ [a!]: "20.25", [b!]: "69.75" });
  });

  it("refuses a split that does not add up, and changes nothing", async () => {
    const canara = byName(byName(mine.methods, "GPay").accounts, "Canara");
    const balanceBefore = await balanceOf(canara.id);
    const countBefore = await db.transaction.count({ where: { userId: ME.id } });
    const valid = expense();
    const broken: ValidExpense = {
      ...valid,
      isSplit: true,
      allocations: [
        { partyId: byName(mine.parties, "Personal").id, amountPaise: 10000 },
        { partyId: byName(mine.parties, "Office").id, amountPaise: 5000 },
      ],
    };
    await expect(createExpense(db, ME.id, requestId(), broken)).rejects.toThrow("does not add up");
    expect(await db.transaction.count({ where: { userId: ME.id } })).toBe(countBefore);
    expect(await balanceOf(canara.id)).toBe(balanceBefore);
  });

  it("is idempotent: the same form sent twice saves one expense and changes the balance once", async () => {
    const canara = byName(byName(mine.methods, "GPay").accounts, "Canara");
    const id = requestId();
    const before = await balanceOf(canara.id);
    const first = await createExpense(db, ME.id, id, expense({ amount: "30" }));
    const second = await createExpense(db, ME.id, id, expense({ amount: "30" }));
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(Number(await balanceOf(canara.id))).toBeCloseTo(Number(before) - 30, 2);
    expect(await db.transaction.count({ where: { userId: ME.id, dedupeKey: `expense-entry:${id}` } })).toBe(1);
  });

  it("is idempotent even when both requests arrive at the same instant", async () => {
    const id = requestId();
    const results = await Promise.all([
      createExpense(db, ME.id, id, expense({ amount: "7" })),
      createExpense(db, ME.id, id, expense({ amount: "7" })),
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(await db.transaction.count({ where: { userId: ME.id, dedupeKey: `expense-entry:${id}` } })).toBe(1);
  });

  it("requires an account when the method has accounts, and refuses one when it has none", async () => {
    const gpay = byName(mine.methods, "GPay");
    await expect(createExpense(db, ME.id, requestId(), { ...expense(), methodId: gpay.id, accountId: null })).rejects.toThrow("Choose the account");
    const slice = byName(mine.methods, "Slice");
    await expect(
      createExpense(db, ME.id, requestId(), { ...expense(), methodId: slice.id, accountId: byName(gpay.accounts, "IDFC").id }),
    ).rejects.toThrow("not under");
  });

  it("refuses an account from a different method", async () => {
    const gpay = byName(mine.methods, "GPay");
    const methods = (await getExpenseFormData(db, ME.id)).methods;
    const hdfcSavings = byName(byName(methods, "HDFC").accounts, "Savings");
    await expect(createExpense(db, ME.id, requestId(), { ...expense(), methodId: gpay.id, accountId: hdfcSavings.id })).rejects.toThrow("not under GPay");
  });

  it("refuses another user's method, category or person, and saves nothing", async () => {
    const count = await db.transaction.count({ where: { userId: ME.id } });
    const theirGpay = byName(theirs.methods, "GPay");
    const attempts: ValidExpense[] = [
      { ...expense(), methodId: theirGpay.id, accountId: byName(theirGpay.accounts, "Canara").id },
      { ...expense(), categoryId: byName(theirs.categories, "Food").id },
      { ...expense(), allocations: [{ partyId: byName(theirs.parties, "Personal").id, amountPaise: 25050 }] },
    ];
    for (const attempt of attempts) {
      await expect(createExpense(db, ME.id, requestId(), attempt)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await db.transaction.count({ where: { userId: ME.id } })).toBe(count);
  });

  it("leaves no half-saved data when it fails part-way", async () => {
    const canara = byName(byName(mine.methods, "GPay").accounts, "Canara");
    const before = await balanceOf(canara.id);
    const splitsBefore = await db.transactionSplit.count({ where: { userId: ME.id } });
    const ghost = "99999999-9999-4999-8999-999999999999";
    await expect(
      createExpense(db, ME.id, requestId(), { ...expense(), allocations: [{ partyId: ghost, amountPaise: 25050 }] }),
    ).rejects.toThrow();
    expect(await balanceOf(canara.id)).toBe(before);
    expect(await db.transactionSplit.count({ where: { userId: ME.id } })).toBe(splitsBefore);
  });
});

describe("recent expenses", () => {
  it("lists newest first with the payment method, category and people", async () => {
    const a = byName(mine.parties, "Personal").id;
    const b = byName(mine.parties, "Office").id;
    await createExpense(db, ME.id, requestId(), expense({ date: "2026-11-07", amount: "60", notes: "Dinner", partyId: null, split: { enabled: true, mode: "EQUAL", selected: [{ partyId: a, amount: "" }, { partyId: b, amount: "" }] } }));
    const recent = await getRecentExpenses(db, ME.id, 3);
    expect(recent[0]).toMatchObject({
      date: "2026-11-07",
      amountPaise: 6000,
      notes: "Dinner",
      paidWith: "GPay · Canara",
      category: "Food",
      isSplit: true,
    });
    expect(recent[0]!.people).toEqual([
      { name: "Personal", amountPaise: 3000 },
      { name: "Office", amountPaise: 3000 },
    ]);
    expect(recent.map((r) => r.date)).toEqual([...recent.map((r) => r.date)].sort().reverse());
  });

  it("only shows the signed-in user's own expenses", async () => {
    const theirGpay = byName(theirs.methods, "GPay");
    await createExpense(db, OTHER.id, requestId(), {
      amountPaise: 99900,
      notes: "Private",
      date: "2026-11-07",
      methodId: theirGpay.id,
      accountId: byName(theirGpay.accounts, "DBS").id,
      categoryId: byName(theirs.categories, "Food").id,
      isSplit: false,
      allocations: [{ partyId: byName(theirs.parties, "Personal").id, amountPaise: 99900 }],
    });
    const mineRecent = await getRecentExpenses(db, ME.id, 100);
    expect(mineRecent.map((r) => r.notes)).not.toContain("Private");
    expect((await getRecentExpenses(db, OTHER.id, 100)).map((r) => r.notes)).toEqual(["Private"]);
  });
});
