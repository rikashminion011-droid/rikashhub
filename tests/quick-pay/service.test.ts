import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addParty, archiveOption, createExpense, ensureUserSetup, getExpenseFormData } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { parseTxFilters } from "@/features/quick-pay/filters";
import {
  createBulk,
  createEntry,
  deleteEntry,
  getBalances,
  getEntry,
  listEntryIds,
  listForExport,
  listRecentCredits,
  listTransactions,
  setOpeningBalance,
  updateEntry,
} from "@/features/quick-pay/server/entries";
import {
  addMainCategory,
  addSubBank,
  addBank,
  addSubCategory,
  getBankTree,
  getCategoryTree,
  getQuickPayOptions,
  removeBank,
  removeCategory,
  renameBank,
  renameCategory,
} from "@/features/quick-pay/server/settings";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import type { ValidBulkRow, ValidQuickPay } from "@/features/quick-pay/validation";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com", name: "Me" };
const OTHER = { id: "22222222-2222-4222-8222-222222222222", email: "other@example.com", name: "Other" };

let database: TestDatabase;
let db: TestDatabase["prisma"];
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const bank = (o: QuickPayOptions, label: string) => {
  const found = o.banks.find((b) => b.label === label);
  if (!found) throw new Error(`no bank "${label}" in [${o.banks.map((b) => b.label).join(" | ")}]`);
  return found.id;
};
const cat = (o: QuickPayOptions, label: string) => {
  const found = o.categories.find((c) => c.label === label);
  if (!found) throw new Error(`no category "${label}"`);
  return found.id;
};
const person = (o: QuickPayOptions, name: string) => o.persons.find((p) => p.name === name)!.id;
const options = (userId = ME.id) => getQuickPayOptions(db, userId);
const noFilters = parseTxFilters({});

const entry = (over: Partial<ValidQuickPay> & Pick<ValidQuickPay, "accountId">): ValidQuickPay => ({
  type: "DEBIT", amountPaise: 10000, reason: "", categoryId: null, partyId: null, ...over,
});

const currentOf = async (accountId: string) => Number((await db.account.findUniqueOrThrow({ where: { id: accountId } })).currentBalance.toString());

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  await ensureUserSetup(db, OTHER);
}, 90_000);
afterAll(async () => {
  await database?.close();
});

describe("banks and categories", () => {
  it("offers the starter banks as choices, accounts shown as Main → Account", async () => {
    const o = await options();
    expect(o.banks.map((b) => b.label)).toEqual(["GPay → Canara", "GPay → IDFC", "GPay → DBS", "HDFC", "Slice"]);
    expect(o.categories.map((c) => c.label)).toEqual(["Food", "Shopping"]);
  });

  it("adds a main file and accounts under it, and they appear straight away (unlimited)", async () => {
    const sbi = await addBank(db, ME.id, { name: "SBI", kind: "BANK" });
    for (const name of ["Salary", "Savings", "Joint"]) await addSubBank(db, ME.id, { mainId: sbi, name });
    const o = await options();
    expect(o.banks.map((b) => b.label)).toEqual(expect.arrayContaining(["SBI → Salary", "SBI → Savings", "SBI → Joint"]));
    expect(o.banks.map((b) => b.label)).not.toContain("SBI");
    expect((await getBankTree(db, ME.id)).find((m) => m.name === "SBI")!.accounts).toHaveLength(3);
  });

  it("renames and removes banks; removing a main file removes its accounts too", async () => {
    const tree = await getBankTree(db, ME.id);
    const sbi = tree.find((m) => m.name === "SBI")!;
    await renameBank(db, ME.id, { id: sbi.accounts[0]!.id, name: "Salary Account" });
    await renameBank(db, ME.id, { id: sbi.id, name: "SBI Bank" });
    expect((await options()).banks.map((b) => b.label)).toContain("SBI Bank → Salary Account");
    await expect(renameBank(db, ME.id, { id: sbi.accounts[1]!.id, name: "joint" })).rejects.toMatchObject({ code: "CONFLICT" });

    await removeBank(db, ME.id, { id: sbi.accounts[2]!.id });
    expect((await options()).banks.map((b) => b.label)).not.toContain("SBI Bank → Joint");
    await removeBank(db, ME.id, { id: sbi.id });
    expect((await options()).banks.map((b) => b.label).filter((l) => l.startsWith("SBI"))).toEqual([]);
  });

  it("cannot rename or remove somebody else's bank", async () => {
    const theirs = (await getBankTree(db, OTHER.id))[0]!;
    await expect(renameBank(db, ME.id, { id: theirs.id, name: "Hacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeBank(db, ME.id, { id: theirs.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("builds categories and sub-categories with mapping, e.g. Food → Dosa, Idli, Tiffin", async () => {
    const o = await options();
    const food = o.categories.find((c) => c.label === "Food")!.id;
    for (const name of ["Dosa", "Idli", "Tiffin"]) await addSubCategory(db, ME.id, { mainId: food, name });
    const travel = await addMainCategory(db, ME.id, { name: "Travel" });
    for (const name of ["Petrol", "Rapido", "Porter", "Tiffin"]) await addSubCategory(db, ME.id, { mainId: travel, name });

    const labels = (await options()).categories.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["Food", "Food → Dosa", "Food → Idli", "Food → Tiffin", "Travel", "Travel → Petrol", "Travel → Rapido", "Travel → Porter", "Travel → Tiffin"]));
    const tree = await getCategoryTree(db, ME.id);
    expect(tree.find((m) => m.name === "Food")!.subs.map((s) => s.name)).toEqual(["Dosa", "Idli", "Tiffin"]);
  });

  it("refuses a duplicate sub-category under the same main, ignoring case, but allows it under another", async () => {
    const tree = await getCategoryTree(db, ME.id);
    const food = tree.find((m) => m.name === "Food")!;
    await expect(addSubCategory(db, ME.id, { mainId: food.id, name: "dosa" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(addSubCategory(db, ME.id, { mainId: "99999999-9999-4999-8999-999999999999", name: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("renames a category, refuses a clash, and removes a main with its sub-categories", async () => {
    const tree = await getCategoryTree(db, ME.id);
    const food = tree.find((m) => m.name === "Food")!;
    await renameCategory(db, ME.id, { id: food.subs[0]!.id, name: "Masala Dosa" });
    await expect(renameCategory(db, ME.id, { id: food.subs[1]!.id, name: "masala dosa" })).rejects.toMatchObject({ code: "CONFLICT" });
    const travel = tree.find((m) => m.name === "Travel")!;
    await removeCategory(db, ME.id, { id: travel.id });
    expect((await options()).categories.map((c) => c.label).filter((l) => l.startsWith("Travel"))).toEqual([]);
  });

  it("brings a removed sub-category back when added again", async () => {
    const food = (await getCategoryTree(db, ME.id)).find((m) => m.name === "Food")!;
    const idli = food.subs.find((s) => s.name === "Idli")!;
    await removeCategory(db, ME.id, { id: idli.id });
    expect(await addSubCategory(db, ME.id, { mainId: food.id, name: "Idli" })).toBe(idli.id);
  });
});

describe("saving entries", () => {
  it("saves a debit with the exact time, bank, category and person", async () => {
    const o = await options();
    const canara = bank(o, "GPay → Canara");
    const when = istInstant("2026-06-25", "09:21");
    const saved = await createEntry(db, ME.id, rid(), entry({ accountId: canara, amountPaise: 25050, reason: "Dosa", categoryId: cat(o, "Food → Masala Dosa"), partyId: person(o, "Mukesh") }), when);
    const row = await db.transaction.findUniqueOrThrow({ where: { id: saved.id }, include: { splits: true } });
    expect(row).toMatchObject({ type: "EXPENSE", accountId: canara, toAccountId: null, quickPay: true, isSplit: true, description: "Dosa" });
    expect(row.amount.toString()).toBe("250.5");
    expect(row.occurredAt!.toISOString()).toBe("2026-06-25T03:51:00.000Z");
    expect(row.date.toISOString().slice(0, 10)).toBe("2026-06-25");
    expect(row.splits.map((s) => [s.partyId, s.amount.toString()])).toEqual([[person(o, "Mukesh"), "250.5"]]);
  });

  it("saves a credit as income into the bank, and credits and debits never share a column", async () => {
    const o = await options();
    const hdfc = bank(o, "HDFC");
    const saved = await createEntry(db, ME.id, rid(), entry({ accountId: hdfc, type: "CREDIT", amountPaise: 400000, reason: "Salary" }));
    const row = await db.transaction.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row).toMatchObject({ type: "INCOME", toAccountId: hdfc, accountId: null });
    const listed = (await listTransactions(db, ME.id, noFilters)).rows.find((r) => r.id === saved.id)!;
    expect(listed).toMatchObject({ type: "CREDIT", amountPaise: 400000, bank: "HDFC", reason: "Salary" });
  });

  it("is idempotent: the same form sent twice, even at the same instant, saves one entry", async () => {
    const o = await options();
    const id = rid();
    const [a, b] = await Promise.all([
      createEntry(db, ME.id, id, entry({ accountId: bank(o, "GPay → IDFC"), amountPaise: 777 })),
      createEntry(db, ME.id, id, entry({ accountId: bank(o, "GPay → IDFC"), amountPaise: 777 })),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.transaction.count({ where: { userId: ME.id, dedupeKey: `quick-pay:${id}` } })).toBe(1);
  });

  it("needs an account, not a main file that has accounts under it", async () => {
    const o = await options();
    const gpay = (await getBankTree(db, ME.id)).find((m) => m.name === "GPay")!;
    await expect(createEntry(db, ME.id, rid(), entry({ accountId: gpay.id }))).rejects.toThrow("Choose one of the accounts under GPay");
    expect(o.banks.map((b) => b.id)).not.toContain(gpay.id);
  });

  it("refuses another user's bank, category or person, saving nothing", async () => {
    const theirs = await options(OTHER.id);
    const mine = await options();
    const before = await db.transaction.count({ where: { userId: ME.id } });
    await expect(createEntry(db, ME.id, rid(), entry({ accountId: bank(theirs, "HDFC") }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createEntry(db, ME.id, rid(), entry({ accountId: bank(mine, "HDFC"), categoryId: cat(theirs, "Food") }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createEntry(db, ME.id, rid(), entry({ accountId: bank(mine, "HDFC"), partyId: person(theirs, "Office") }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.transaction.count({ where: { userId: ME.id } })).toBe(before);
  });
});

describe("balances", () => {
  it("follows the worked example: opening 2000, debit 500, debit 200, credit 200 gives 1500", async () => {
    const slice = await addBank(db, ME.id, { name: "Wallet X", kind: "BANK" });
    await setOpeningBalance(db, ME.id, { accountId: slice, openingPaise: 200000 });
    await createEntry(db, ME.id, rid(), entry({ accountId: slice, amountPaise: 50000 }));
    expect(await currentOf(slice)).toBe(1500);
    await createEntry(db, ME.id, rid(), entry({ accountId: slice, amountPaise: 20000 }));
    expect(await currentOf(slice)).toBe(1300);
    await createEntry(db, ME.id, rid(), entry({ accountId: slice, type: "CREDIT", amountPaise: 20000 }));
    expect(await currentOf(slice)).toBe(1500);

    const groups = (await getBalances(db, ME.id)).groups;
    const line = groups.find((g) => g.name === "Wallet X")!.direct!;
    expect(line).toMatchObject({ openingPaise: 200000, creditsPaise: 20000, debitsPaise: 70000, currentPaise: 150000 });
  });

  it("keeps a separate balance for every account and totals the main file (GPay → HDFC, SBI)", async () => {
    const o = await options();
    const g = await addBank(db, ME.id, { name: "GPA", kind: "WALLET" });
    const h = await addSubBank(db, ME.id, { mainId: g, name: "HDFC2" });
    const s = await addSubBank(db, ME.id, { mainId: g, name: "SBI2" });
    await setOpeningBalance(db, ME.id, { accountId: h, openingPaise: 200000 });
    await setOpeningBalance(db, ME.id, { accountId: s, openingPaise: 100000 });
    await createEntry(db, ME.id, rid(), entry({ accountId: h, amountPaise: 50000 }));
    const group = (await getBalances(db, ME.id)).groups.find((x) => x.name === "GPA")!;
    expect(group.accounts.map((a) => [a.name, a.currentPaise])).toEqual([["HDFC2", 150000], ["SBI2", 100000]]);
    expect(group.total.currentPaise).toBe(250000);
    expect(o).toBeTruthy();
  });

  it("recalculates when an opening balance is edited, including to a negative amount", async () => {
    const acc = (await getBalances(db, ME.id)).groups.find((x) => x.name === "GPA")!.accounts[0]!;
    await setOpeningBalance(db, ME.id, { accountId: acc.id, openingPaise: -10000 });
    expect(await currentOf(acc.id)).toBe(-600);
    await expect(setOpeningBalance(db, ME.id, { accountId: "99999999-9999-4999-8999-999999999999", openingPaise: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("counts spending entered through the older Expense Entry page too", async () => {
    const data = await getExpenseFormData(db, ME.id);
    const gpay = data.methods.find((m) => m.name === "GPay")!;
    const idfc = gpay.accounts.find((a) => a.name === "IDFC")!;
    const before = (await getBalances(db, ME.id)).groups.find((g) => g.name === "GPay")!.accounts.find((a) => a.name === "IDFC")!.currentPaise;
    await createExpense(db, ME.id, rid(), {
      amountPaise: 30000, notes: "old page", date: "2026-11-06", methodId: gpay.id, accountId: idfc.id, categoryId: data.categories[0]!.id,
      isSplit: false, allocations: [{ partyId: data.parties[0]!.id, amountPaise: 30000 }],
    });
    const after = (await getBalances(db, ME.id)).groups.find((g) => g.name === "GPay")!.accounts.find((a) => a.name === "IDFC")!.currentPaise;
    expect(after).toBe(before - 30000);
    expect((await listTransactions(db, ME.id, parseTxFilters({ q: "old page" }))).rows).toHaveLength(0); // not a Quick Pay entry
  });
});

describe("editing and deleting", () => {
  it("edits an entry: new amount, type, bank and person, keeping its time; both banks recalculate", async () => {
    const o = await options();
    const a = bank(o, "GPay → DBS");
    const b = bank(o, "HDFC");
    const when = istInstant("2026-07-01", "10:05");
    const saved = await createEntry(db, ME.id, rid(), entry({ accountId: a, amountPaise: 10000, partyId: person(o, "Office") }), when);
    const aBefore = await currentOf(a);
    expect(aBefore).toBeLessThan(0);

    await updateEntry(db, ME.id, saved.id, entry({ accountId: b, type: "CREDIT", amountPaise: 5000, reason: "Refund", categoryId: cat(o, "Food"), partyId: person(o, "Balan") }));
    const got = (await getEntry(db, ME.id, saved.id))!;
    expect(got).toMatchObject({ type: "CREDIT", amountPaise: 5000, reason: "Refund", accountId: b, partyId: person(o, "Balan"), occurredAt: when.toISOString() });
    expect(await currentOf(a)).toBe(aBefore + 100);
    const hdfcRow = (await getBalances(db, ME.id)).groups.find((g) => g.name === "HDFC")!;
    expect(hdfcRow.total.creditsPaise).toBeGreaterThanOrEqual(5000);
    expect(await db.transactionSplit.count({ where: { transactionId: saved.id } })).toBe(1);
  });

  it("removes the person when an edit turns Split off", async () => {
    const o = await options();
    const saved = await createEntry(db, ME.id, rid(), entry({ accountId: bank(o, "HDFC"), partyId: person(o, "Save") }));
    await updateEntry(db, ME.id, saved.id, entry({ accountId: bank(o, "HDFC"), partyId: null }));
    expect((await getEntry(db, ME.id, saved.id))!.partyId).toBeNull();
    expect((await db.transaction.findUniqueOrThrow({ where: { id: saved.id } })).isSplit).toBe(false);
  });

  it("deletes an entry: it disappears and its bank balance is restored", async () => {
    const o = await options();
    const idfc = bank(o, "GPay → IDFC");
    const before = await currentOf(idfc);
    const saved = await createEntry(db, ME.id, rid(), entry({ accountId: idfc, amountPaise: 12300 }));
    expect(await currentOf(idfc)).toBe(before - 123);
    await deleteEntry(db, ME.id, saved.id);
    expect(await currentOf(idfc)).toBe(before);
    expect(await getEntry(db, ME.id, saved.id)).toBeNull();
    expect((await listTransactions(db, ME.id, noFilters)).rows.map((r) => r.id)).not.toContain(saved.id);
    await expect(deleteEntry(db, ME.id, saved.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cannot edit or delete another user's entry", async () => {
    const theirs = await options(OTHER.id);
    const saved = await createEntry(db, OTHER.id, rid(), entry({ accountId: bank(theirs, "HDFC") }));
    const mine = await options();
    await expect(updateEntry(db, ME.id, saved.id, entry({ accountId: bank(mine, "HDFC") }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteEntry(db, ME.id, saved.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await getEntry(db, ME.id, saved.id)).toBeNull();
  });
});

describe("bulk entry", () => {
  const row = (key: string, over: Partial<ValidBulkRow> & Pick<ValidBulkRow, "accountId">): ValidBulkRow => ({
    key, type: "DEBIT", amountPaise: 1000, occurredAt: istInstant("2026-08-01", "12:00"), reason: "", categoryId: null, partyId: null, ...over,
  });

  it("saves every row as its own entry under its own date and time, and updates balances", async () => {
    const o = await options();
    const hdfc = bank(o, "HDFC");
    const before = await currentOf(hdfc);
    const result = await createBulk(db, ME.id, rid(), [
      row("a", { accountId: hdfc, amountPaise: 5000, occurredAt: istInstant("2026-08-01", "08:00"), reason: "bulk-one" }),
      row("b", { accountId: hdfc, amountPaise: 20000, type: "CREDIT", occurredAt: istInstant("2026-08-02", "17:45"), reason: "bulk-two", partyId: person(o, "Mukesh") }),
      row("c", { accountId: hdfc, amountPaise: 700, occurredAt: istInstant("2026-08-03", "23:59"), reason: "bulk-three", categoryId: cat(o, "Food") }),
    ]);
    expect(result).toEqual({ count: 3, duplicate: false });
    expect(await currentOf(hdfc)).toBe(before - 50 + 200 - 7);
    const rows = (await listTransactions(db, ME.id, parseTxFilters({ q: "bulk-" }))).rows;
    expect(rows.map((r) => r.reason)).toEqual(["bulk-three", "bulk-two", "bulk-one"]); // newest first
    expect(rows.find((r) => r.reason === "bulk-two")).toMatchObject({ type: "CREDIT", person: "Mukesh" });
  });

  it("saves nothing at all if one row points at something that does not exist", async () => {
    const o = await options();
    const before = await db.transaction.count({ where: { userId: ME.id } });
    await expect(
      createBulk(db, ME.id, rid(), [row("ok", { accountId: bank(o, "HDFC") }), row("bad", { accountId: "99999999-9999-4999-8999-999999999999" })]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.transaction.count({ where: { userId: ME.id } })).toBe(before);
  });

  it("prevents duplicate submissions: sending the same sheet again saves nothing new", async () => {
    const o = await options();
    const id = rid();
    const rows = [row("x", { accountId: bank(o, "HDFC"), reason: "dup-check" }), row("y", { accountId: bank(o, "HDFC"), reason: "dup-check" })];
    const first = await createBulk(db, ME.id, id, rows);
    const second = await createBulk(db, ME.id, id, rows);
    expect(first).toEqual({ count: 2, duplicate: false });
    expect(second).toEqual({ count: 2, duplicate: true });
    expect((await listTransactions(db, ME.id, parseTxFilters({ q: "dup-check" }))).rows).toHaveLength(2);
    const [p, q] = await Promise.all([createBulk(db, ME.id, id, rows), createBulk(db, ME.id, id, rows)]);
    expect(p.duplicate && q.duplicate).toBe(true);
  });
});

describe("GPay Transactions: filters, search, totals, paging", () => {
  let user: typeof ME;
  let o: QuickPayOptions;
  const bankId = () => bank(o, "HDFC");

  beforeAll(async () => {
    user = { id: "33333333-3333-4333-8333-333333333333", email: "filters@example.com", name: "F" };
    await ensureUserSetup(db, user);
    o = await getQuickPayOptions(db, user.id);
    const food = o.categories.find((c) => c.label === "Food")!.id;
    await createEntry(db, user.id, rid(), entry({ accountId: bankId(), amountPaise: 10000, reason: "May lunch" }), istInstant("2026-05-31", "23:30"));
    await createEntry(db, user.id, rid(), entry({ accountId: bankId(), amountPaise: 20000, reason: "June petrol", categoryId: food, partyId: person(o, "Balan") }), istInstant("2026-06-01", "00:05"));
    await createEntry(db, user.id, rid(), entry({ accountId: bankId(), amountPaise: 30000, type: "CREDIT", reason: "June salary" }), istInstant("2026-06-30", "23:59"));
    await createEntry(db, user.id, rid(), entry({ accountId: bank(o, "GPay → DBS"), amountPaise: 5000, reason: "July tea" }), istInstant("2026-07-01", "00:00"));
  }, 60_000);

  const list = (params: Record<string, string>) => listTransactions(db, user.id, parseTxFilters(params));

  it("shows everything newest first when nothing is filtered, with totals", async () => {
    const result = await list({});
    expect(result.rows.map((r) => r.reason)).toEqual(["July tea", "June salary", "June petrol", "May lunch"]);
    expect(result.totals).toEqual({ debitPaise: 35000, creditPaise: 30000, count: 4 });
  });

  it("filters by month, including entries just after midnight and just before it (IST)", async () => {
    const june = await list({ month: "2026-06" });
    expect(june.rows.map((r) => r.reason)).toEqual(["June salary", "June petrol"]);
    expect(june.totals).toEqual({ debitPaise: 20000, creditPaise: 30000, count: 2 });
  });

  it("filters by a custom range across several months, inclusive of both end days", async () => {
    const range = await list({ from: "2026-05-31", to: "2026-07-01" });
    expect(range.totals.count).toBe(4);
    expect((await list({ from: "2026-06-01", to: "2026-06-30" })).totals.count).toBe(2);
    expect((await list({ from: "2026-07-01" })).rows.map((r) => r.reason)).toEqual(["July tea"]);
    expect((await list({ to: "2026-05-31" })).rows.map((r) => r.reason)).toEqual(["May lunch"]);
  });

  it("searches reason, bank, category and person", async () => {
    expect((await list({ q: "PETROL" })).rows.map((r) => r.reason)).toEqual(["June petrol"]);
    expect((await list({ q: "dbs" })).rows.map((r) => r.reason)).toEqual(["July tea"]);
    expect((await list({ q: "gpay" })).rows.map((r) => r.reason)).toEqual(["July tea"]);
    expect((await list({ q: "food" })).rows.map((r) => r.reason)).toEqual(["June petrol"]);
    expect((await list({ q: "balan" })).rows.map((r) => r.reason)).toEqual(["June petrol"]);
    expect((await list({ q: "nothing-matches" })).rows).toEqual([]);
  });

  it("combines search with a month, and totals follow the filtered set", async () => {
    const r = await list({ month: "2026-06", q: "salary" });
    expect(r.rows.map((x) => x.reason)).toEqual(["June salary"]);
    expect(r.totals).toEqual({ debitPaise: 0, creditPaise: 30000, count: 1 });
  });

  it("describes each row: bank, category and person as shown in the table", async () => {
    const petrol = (await list({ q: "petrol" })).rows[0]!;
    expect(petrol).toMatchObject({ bank: "HDFC", category: "Food", person: "Balan", type: "DEBIT", amountPaise: 20000 });
    const tea = (await list({ q: "tea" })).rows[0]!;
    expect(tea).toMatchObject({ bank: "GPay → DBS", category: "", person: null });
  });

  it("pages through long lists and keeps totals for the whole set", async () => {
    const bulkUser = { id: "44444444-4444-4444-8444-444444444444", email: "paging@example.com", name: "P" };
    await ensureUserSetup(db, bulkUser);
    const opts = await getQuickPayOptions(db, bulkUser.id);
    const rows = Array.from({ length: 30 }, (_, i) => row2(opts, i));
    await createBulk(db, bulkUser.id, rid(), rows);
    const p1 = await listTransactions(db, bulkUser.id, parseTxFilters({}));
    const p2 = await listTransactions(db, bulkUser.id, parseTxFilters({ page: "2" }));
    expect([p1.rows.length, p2.rows.length, p1.pageCount]).toEqual([25, 5, 2]);
    expect(p1.totals).toMatchObject({ count: 30, debitPaise: 30 * 100 });
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(30);
    expect((await listTransactions(db, bulkUser.id, parseTxFilters({ page: "99" }))).page).toBe(2);
  });

  it("returns everything for export, with the same filters and totals", async () => {
    const all = await listForExport(db, user.id, parseTxFilters({ month: "2026-06" }));
    expect(all.rows).toHaveLength(2);
    expect(all.totals).toEqual({ debitPaise: 20000, creditPaise: 30000, count: 2 });
    expect(all.truncated).toBe(false);
    expect((await listForExport(db, user.id, parseTxFilters({}), 2)).truncated).toBe(true);
  });

  it("only ever shows the signed-in user's own entries", async () => {
    expect((await listTransactions(db, ME.id, parseTxFilters({ q: "June petrol" }))).rows).toHaveLength(0);
  });

  it("lists recent credits newest first, credits only, and the entry ids newest first", async () => {
    const credits = await listRecentCredits(db, user.id);
    expect(credits.map((c) => [c.amountPaise, c.reason])).toEqual([[30000, "June salary"]]);
    const mine = await listRecentCredits(db, ME.id, 10);
    const dates = mine.map((c) => c.occurredAt);
    expect(dates).toEqual([...dates].sort().reverse());
    const ids = await listEntryIds(db, user.id);
    expect(ids).toHaveLength(4);
    expect((await getEntry(db, user.id, ids[0]!))!.reason).toBe("July tea");
  });
});

function row2(opts: QuickPayOptions, i: number): ValidBulkRow {
  return {
    key: `r${i}`, type: "DEBIT", amountPaise: 100, occurredAt: new Date(Date.UTC(2026, 7, 1, 0, i)), reason: `row ${i}`,
    accountId: opts.banks.find((b) => b.label === "HDFC")!.id, categoryId: null, partyId: null,
  };
}

describe("people used for Split", () => {
  it("are the same people managed on the User page", async () => {
    const id = await addParty(db, ME.id, { name: "Quick Pay Person" });
    expect((await options()).persons.map((p) => p.id)).toContain(id);
    await archiveOption(db, ME.id, { kind: "party", id });
    expect((await options()).persons.map((p) => p.id)).not.toContain(id);
  });
});
