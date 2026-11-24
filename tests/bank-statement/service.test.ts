import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteBankEntry, getBankBalances, importBankRows, listBankStatement, listNotEntered, patchBankEntry, countAlreadySaved } from "@/features/bank-statement/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { parseTxFilters } from "@/features/quick-pay/filters";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const U = { id: "77777777-7777-4777-8777-777777777771", email: "bank-statement@example.com", name: "Stmt" };
let database: TestDatabase;
let db: TestDatabase["prisma"];
let canara = "";
let idfc = "";

const row = (date: string, details: string, debit: number, credit: number, balance: number | null = null, time = "00:00") => ({ date, time, details, debitPaise: debit, creditPaise: credit, balancePaise: balance });
const filters = (params: Record<string, string> = {}) => parseTxFilters({ all: "1", ...params });

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, U);
  const accounts = await db.account.findMany({ where: { userId: U.id, deletedAt: null } });
  canara = accounts[0]!.id;
  idfc = accounts[1]!.id;
}, 180_000);
afterAll(async () => database?.close());

describe("bank statement", () => {
  it("keeps the rows of every bank in one list, in date order", async () => {
    await importBankRows(db, U.id, canara, [row("2026-11-01", "A canara", 100, 0), row("2026-11-05", "C canara", 300, 0)]);
    await importBankRows(db, U.id, idfc, [row("2026-11-03", "B idfc", 0, 200), row("2026-11-07", "D idfc", 50, 0)]);
    const asc = await listBankStatement(db, U.id, filters({ order: "asc" }));
    expect(asc.rows.map((r) => r.details)).toEqual(["A canara", "B idfc", "C canara", "D idfc"]);
    const desc = await listBankStatement(db, U.id, filters());
    expect(desc.rows.map((r) => r.details)).toEqual(["D idfc", "C canara", "B idfc", "A canara"]);
    expect(desc.totals).toEqual({ count: 4, debitPaise: 450, creditPaise: 200 });
    expect(desc.typeCounts).toEqual({ debit: 3, credit: 1 });
  });

  it("importing the same statement again adds nothing", async () => {
    const rows = [row("2026-12-01", "Same", 100, 0, 900), row("2026-12-01", "Same", 100, 0, 900)];
    expect(await importBankRows(db, U.id, canara, rows)).toEqual({ imported: 2, duplicates: 0 });
    expect(await countAlreadySaved(db, U.id, canara, rows)).toBe(2);
    expect(await importBankRows(db, U.id, canara, rows)).toEqual({ imported: 0, duplicates: 2 });
    expect((await listBankStatement(db, U.id, filters({ q: "Same" }))).totals.count).toBe(2);
  });

  it("filters by bank, kind, search and dates, and pages", async () => {
    expect((await listBankStatement(db, U.id, filters({ banks: idfc }))).totals.count).toBe(2);
    expect((await listBankStatement(db, U.id, filters({ types: "CREDIT" }))).rows.map((r) => r.details)).toEqual(["B idfc"]);
    expect((await listBankStatement(db, U.id, filters({ q: "canara" }))).totals.count).toBe(4); // the search also looks at the bank name
    expect((await listBankStatement(db, U.id, parseTxFilters({ from: "2026-11-02", to: "2026-11-06" }))).rows.map((r) => r.details).sort()).toEqual(["B idfc", "C canara"]);
    const paged = await listBankStatement(db, U.id, filters({ size: "10", page: "9" }));
    expect(paged.page).toBe(paged.pageCount);
  });

  it("edits the reason and category, and removes a row", async () => {
    const [first] = (await listBankStatement(db, U.id, filters({ q: "A canara" }))).rows;
    const cat = await db.transactionCategory.findFirstOrThrow({ where: { userId: U.id, deletedAt: null } });
    const patched = await patchBankEntry(db, U.id, first!.id, { reason: "  Lunch  out ", categoryId: cat.id });
    expect(patched.reason).toBe("Lunch out");
    expect(patched.category).toBe(cat.name);
    expect((await listBankStatement(db, U.id, filters({ q: "lunch out" }))).totals.count).toBe(1);
    await deleteBankEntry(db, U.id, first!.id);
    expect((await listBankStatement(db, U.id, filters({ q: "A canara" }))).totals.count).toBe(0);
    await expect(deleteBankEntry(db, U.id, first!.id)).rejects.toThrow(/no longer/);
  });

  it("refuses a bank that is not yours and bad rows", async () => {
    await expect(importBankRows(db, U.id, "00000000-0000-4000-8000-000000000000", [row("2026-11-01", "x", 1, 0)])).rejects.toThrow(/bank/);
    await expect(importBankRows(db, U.id, canara, [row("nope", "x", 1, 0)])).rejects.toThrow(/date/);
    await expect(importBankRows(db, U.id, canara, [row("2026-11-01", "x", 0, 0)])).rejects.toThrow(/amount/);
  });
});

describe("balances and what is not entered", () => {
  it("takes each bank's balance from the last row of its statement", async () => {
    const bank = (await db.account.findMany({ where: { userId: U.id, deletedAt: null } }))[2]!.id;
    await importBankRows(db, U.id, bank, [row("2026-10-01", "first", 100, 0, 900), row("2026-10-09", "later", 0, 50, 950, "09:00"), row("2026-10-09", "same day, listed after", 25, 0, 925, "09:00")]);
    const balances = await getBankBalances(db, U.id);
    const mine = balances.find((b) => b.accountId === bank)!;
    expect(mine.balancePaise).toBe(925);
    expect(mine.asOf).toBe("2026-10-09");
  });

  it("lists statement rows with no matching entry, one entry covering one row", async () => {
    const acc = (await db.account.findMany({ where: { userId: U.id, deletedAt: null } }))[3]!.id;
    await importBankRows(db, U.id, acc, [row("2026-09-05", "paid shop", 20000, 0), row("2026-09-05", "paid shop again", 20000, 0), row("2026-09-06", "salary", 0, 500000), row("2026-09-07", "never entered", 1234, 0)]);
    const mk = (type: "EXPENSE" | "INCOME", date: string, paise: number, key: string) =>
      db.transaction.create({ data: { userId: U.id, type, ...(type === "EXPENSE" ? { accountId: acc } : { toAccountId: acc }), amount: (paise / 100).toFixed(2), date: new Date(date), occurredAt: istInstant(date, "13:00"), quickPay: true, dedupeKey: key } });
    await mk("EXPENSE", "2026-09-05", 20000, "ne-1"); // covers only one of the two identical payments
    await mk("INCOME", "2026-09-06", 500000, "ne-2");
    const out = await listNotEntered(db, U.id, { from: "2026-09-01", to: "2026-09-30" });
    expect(out.rows.map((r) => r.details).sort()).toEqual(["never entered", "paid shop again"]);
    expect(out.rows).toHaveLength(2);
    expect(out.totals).toEqual({ debitPaise: 21234, creditPaise: 0 });
    await mk("EXPENSE", "2026-09-05", 20000, "ne-3");
    expect((await listNotEntered(db, U.id, { from: "2026-09-01", to: "2026-09-30" })).rows.map((r) => r.details)).toEqual(["never entered"]);
  });
});
