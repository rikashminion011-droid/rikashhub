import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countAlreadySaved, importBankRows, listBankStatement, patchBankEntry } from "@/features/bank-statement/server/service";
import { reconcileBankStatement, referencesOf } from "@/features/bank-statement/server/sync";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { parseTxFilters } from "@/features/quick-pay/filters";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const U = { id: "22222222-2222-4222-8222-222222222221", email: "bsync@example.com", name: "Sync" };
let database: TestDatabase;
let db: TestDatabase["prisma"];
let bankA = "";
let bankB = "";
let cat1 = "";
let cat2 = "";
let n = 0;

const row = (date: string, details: string, debit: number, credit: number, balance: number | null = null) => ({ date, time: "00:00", details, debitPaise: debit, creditPaise: credit, balancePaise: balance });
const all = () => listBankStatement(db, U.id, parseTxFilters({ all: "1", order: "asc" })).then((p) => p.rows);
const entry = (type: "EXPENSE" | "INCOME", account: string, date: string, paise: number, reason: string | null, categoryId: string | null, details = "") =>
  db.transaction.create({ data: { userId: U.id, type, ...(type === "EXPENSE" ? { accountId: account } : { toAccountId: account }), amount: (paise / 100).toFixed(2), date: new Date(date), occurredAt: istInstant(date, "11:30"), description: reason, details, categoryId, quickPay: true, dedupeKey: `sync-${++n}` } });

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, U);
  const accounts = await db.account.findMany({ where: { userId: U.id, deletedAt: null } });
  bankA = accounts[0]!.id;
  bankB = accounts[1]!.id;
  const cats = await db.transactionCategory.findMany({ where: { userId: U.id, deletedAt: null } });
  cat1 = cats[0]!.id;
  cat2 = cats[1]!.id;
}, 180_000);
afterAll(async () => database?.close());

describe("statement and Transaction History stay together", () => {
  it("finds reference numbers in a narration", () => {
    expect(referencesOf("UPI/DR/630842822136/SIVA 667937548763 x 12345")).toEqual(["630842822136", "667937548763"]);
    expect(referencesOf(null)).toEqual([]);
  });

  it("fills Reason and Category from the one entry of the same bank, day, kind and amount, whatever the time", async () => {
    await importBankRows(db, U.id, bankA, [row("2026-11-03", "UPI/DR/111111111111/SWIGGY", 25000, 0), row("2026-11-03", "UPI/CR/222222222222/REFUND", 0, 10000)]);
    await entry("EXPENSE", bankA, "2026-11-03", 25000, "Lunch", cat1);
    const out = await reconcileBankStatement(db, U.id);
    expect(out.linked).toBe(1);
    const [debit, credit] = await all();
    expect([debit!.reason, debit!.categoryId, debit!.linked]).toEqual(["Lunch", cat1, true]);
    expect([credit!.reason, credit!.linked]).toEqual(["", false]);
    // Running again changes nothing.
    expect(await reconcileBankStatement(db, U.id)).toEqual({ linked: 0, review: 0, refreshed: 0 });
  });

  it("follows later changes to the entry's Reason and Category, and lets go when the entry is deleted", async () => {
    const t = await db.transaction.findFirstOrThrow({ where: { userId: U.id, description: "Lunch" } });
    await db.transaction.update({ where: { id: t.id }, data: { description: "Lunch at office", categoryId: cat2 } });
    expect((await reconcileBankStatement(db, U.id, { transactionIds: [t.id] })).refreshed).toBe(1);
    expect((await all())[0]).toMatchObject({ reason: "Lunch at office", categoryId: cat2 });
    await db.transaction.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
    await reconcileBankStatement(db, U.id);
    expect((await all())[0]).toMatchObject({ linked: false, reason: "Lunch at office" });
  });

  it("never matches across banks, and never overwrites what was typed on the statement row", async () => {
    await entry("EXPENSE", bankB, "2026-11-03", 25000, "Other bank", cat1);
    await reconcileBankStatement(db, U.id);
    expect((await all())[0]!.linked).toBe(false);
    // A hand-typed Reason is kept when the right entry appears.
    const first = (await all())[0]!;
    await patchBankEntry(db, U.id, first.id, { reason: "My own words" });
    await entry("EXPENSE", bankA, "2026-11-03", 25000, "Entry reason", cat1);
    await reconcileBankStatement(db, U.id);
    expect((await all())[0]).toMatchObject({ linked: true, reason: "My own words", categoryId: cat1 });
  });

  it("uses a reference number to pair alike rows, and flags what it cannot tell apart", async () => {
    await importBankRows(db, U.id, bankA, [row("2026-11-10", "UPI/DR/333333333333/A", 5000, 0), row("2026-11-10", "UPI/DR/444444444444/B", 5000, 0)]);
    await entry("EXPENSE", bankA, "2026-11-10", 5000, "Tea", cat1, "ref 444444444444");
    await entry("EXPENSE", bankA, "2026-11-10", 5000, "Snack", cat2);
    const out = await reconcileBankStatement(db, U.id);
    const rows = (await all()).filter((r) => r.date === "2026-11-10");
    expect(rows.find((r) => r.details.includes("444444444444"))).toMatchObject({ reason: "Tea", linked: true });
    // The other row has one entry left that is the only candidate: it takes it.
    expect(rows.find((r) => r.details.includes("333333333333"))).toMatchObject({ reason: "Snack", linked: true });
    expect(out.review).toBe(0);

    // Two alike rows, two entries with different Reasons and no reference: nothing is guessed.
    await importBankRows(db, U.id, bankA, [row("2026-11-12", "UPI/DR/x/ONE", 7000, 0), row("2026-11-12", "UPI/DR/x/TWO", 7000, 0)]);
    await entry("EXPENSE", bankA, "2026-11-12", 7000, "Bus", cat1);
    await entry("EXPENSE", bankA, "2026-11-12", 7000, "Train", cat2);
    const second = await reconcileBankStatement(db, U.id);
    expect(second.review).toBe(2);
    const flagged = (await all()).filter((r) => r.date === "2026-11-12");
    expect(flagged.every((r) => r.needsReview && !r.linked && r.reason === "")).toBe(true);
  });

  it("recognises the same statement from another file by its running balance, and lists what is not entered", async () => {
    const original = [row("2026-11-20", "ATM WDL 4521", 10000, 0, 90000)];
    await importBankRows(db, U.id, bankB, original);
    // The same row from a PDF with different wording is not added again.
    const again = [row("2026-11-20", "ATM CASH WITHDRAWAL", 10000, 0, 90000)];
    expect(await countAlreadySaved(db, U.id, bankB, again)).toBe(1);
    expect(await importBankRows(db, U.id, bankB, again)).toEqual({ imported: 0, duplicates: 1 });
  });
});
