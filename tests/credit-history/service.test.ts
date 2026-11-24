import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allocationTarget, autoAllocateDebit, getCreditDebits, getCreditPreferences, linkDebitToCredit, listCreditSources, setAllocationMode, setDefaultCredit } from "@/features/credit-history/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const U = { id: "11111111-1111-4111-8111-111111111181", email: "credit-hist@example.com", name: "C" };
const V = { id: "11111111-1111-4111-8111-111111111182", email: "credit-hist2@example.com", name: "D" };
let database: TestDatabase;
let db: TestDatabase["prisma"];
let account = "";
let n = 0;

const credit = (rupees: number, day: string, reason: string) =>
  db.transaction.create({ data: { userId: U.id, type: "INCOME", toAccountId: account, amount: rupees.toFixed(2), date: new Date(day), occurredAt: istInstant(day, "10:00"), description: reason, quickPay: true, dedupeKey: `ch-${++n}` } });
const debit = (rupees: number, day: string, reason: string) =>
  db.transaction.create({ data: { userId: U.id, type: "EXPENSE", accountId: account, amount: rupees.toFixed(2), date: new Date(day), occurredAt: istInstant(day, "12:00"), description: reason, quickPay: true, dedupeKey: `ch-${++n}` } });

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, U);
  await ensureUserSetup(db, V);
  account = (await db.account.findFirstOrThrow({ where: { userId: U.id, deletedAt: null } })).id;
}, 180_000);
afterAll(async () => database?.close());

describe("credit history balances", () => {
  it("works each credit out on its own, with zero and negative balances, and totals them all", async () => {
    const c20 = await credit(20, "2026-11-01", "Twenty");
    const c30 = await credit(30, "2026-11-02", "Thirty");
    const c40 = await credit(40, "2026-11-03", "Forty");
    const c90 = await credit(90, "2026-11-04", "Ninety");
    await linkDebitToCredit(db, U.id, (await debit(20, "2026-11-05", "a")).id, c20.id);
    await linkDebitToCredit(db, U.id, (await debit(15, "2026-11-05", "b")).id, c30.id);
    await linkDebitToCredit(db, U.id, (await debit(42, "2026-11-05", "c")).id, c40.id);
    await linkDebitToCredit(db, U.id, (await debit(50, "2026-11-05", "d1")).id, c90.id);
    await linkDebitToCredit(db, U.id, (await debit(27, "2026-11-06", "d2")).id, c90.id);
    const { sources, summary } = await listCreditSources(db, U.id);
    const bal = Object.fromEntries(sources.map((s) => [s.reason, s.balancePaise]));
    expect(bal).toEqual({ Twenty: 0, Thirty: 1500, Forty: -200, Ninety: 1300 });
    expect(sources.find((s) => s.reason === "Ninety")).toMatchObject({ usedPaise: 7700, debitCount: 2 });
    // Negative balances are in the totals and nothing moves between sources.
    expect(summary).toEqual({ creditedPaise: 18000, debitedPaise: 15400, remainingPaise: 2600 });
    expect(sources[0]!.isLatest).toBe(true);
  });

  it("moves a debit's amount from the old credit to the new one, counts a deleted debit no more, and follows an edited credit", async () => {
    const { sources } = await listCreditSources(db, U.id);
    const c30 = sources.find((s) => s.reason === "Thirty")!;
    const c90 = sources.find((s) => s.reason === "Ninety")!;
    const [first] = await getCreditDebits(db, U.id, c30.id);
    await linkDebitToCredit(db, U.id, first!.id, c90.id);
    let now = (await listCreditSources(db, U.id)).sources;
    expect(now.find((s) => s.reason === "Thirty")).toMatchObject({ usedPaise: 0, balancePaise: 3000 });
    expect(now.find((s) => s.reason === "Ninety")!.usedPaise).toBe(7700 + 1500);
    // Linked twice to the same credit does not count twice.
    await linkDebitToCredit(db, U.id, first!.id, c90.id);
    expect((await listCreditSources(db, U.id)).sources.find((s) => s.reason === "Ninety")!.usedPaise).toBe(9200);
    await db.transaction.update({ where: { id: first!.id }, data: { deletedAt: new Date() } });
    now = (await listCreditSources(db, U.id)).sources;
    expect(now.find((s) => s.reason === "Ninety")!.usedPaise).toBe(7700);
    await db.transaction.update({ where: { id: c90.id }, data: { amount: "100.00" } });
    expect((await listCreditSources(db, U.id)).sources.find((s) => s.reason === "Ninety")!.balancePaise).toBe(10000 - 7700);
  });

  it("shares a debit linked to two credits so it is counted once", async () => {
    const a = await credit(100, "2026-12-01", "Share A");
    const b = await credit(100, "2026-12-01", "Share B");
    const d = await debit(51, "2026-12-02", "shared");
    await db.transactionCreditLink.createMany({ data: [a, b].map((c) => ({ userId: U.id, debitId: d.id, creditId: c.id })) });
    const { sources } = await listCreditSources(db, U.id);
    const used = ["Share A", "Share B"].map((r) => sources.find((s) => s.reason === r)!.usedPaise).sort();
    expect(used.reduce((s, x) => s + x, 0)).toBe(5100);
  });
});

describe("default credit source and allocation", () => {
  it("allows one default at a time, clears it, and ignores a deleted default", async () => {
    const { sources } = await listCreditSources(db, U.id);
    const [x, y] = sources;
    await setDefaultCredit(db, U.id, x!.id);
    await setDefaultCredit(db, U.id, y!.id);
    expect((await listCreditSources(db, U.id)).sources.filter((s) => s.isDefault).map((s) => s.id)).toEqual([y!.id]);
    await setDefaultCredit(db, U.id, null);
    expect((await listCreditSources(db, U.id)).sources.some((s) => s.isDefault)).toBe(false);
    await setDefaultCredit(db, U.id, x!.id);
    await db.transaction.update({ where: { id: x!.id }, data: { deletedAt: new Date() } });
    expect((await getCreditPreferences(db, U.id)).defaultCreditId).toBeNull();
    await expect(setDefaultCredit(db, V.id, y!.id)).rejects.toThrow(/no longer exists/);
  });

  it("allocates a new debit to the default source or to the latest credit by mode, and keeps allocating below zero", async () => {
    const { sources } = await listCreditSources(db, U.id);
    const target = sources[sources.length - 1]!;
    await setDefaultCredit(db, U.id, target.id);
    await setAllocationMode(db, U.id, "DEFAULT");
    expect(await allocationTarget(db, U.id)).toBe(target.id);
    const d1 = await debit(5000, "2026-12-03", "big one");
    expect(await autoAllocateDebit(db, U.id, d1.id)).toBe(target.id);
    expect((await listCreditSources(db, U.id)).sources.find((s) => s.id === target.id)!.balancePaise).toBeLessThan(0);
    // A debit that already has a credit is left alone.
    expect(await autoAllocateDebit(db, U.id, d1.id)).toBeNull();
    await setAllocationMode(db, U.id, "RECENT");
    const latest = (await listCreditSources(db, U.id)).sources[0]!;
    expect(await allocationTarget(db, U.id)).toBe(latest.id);
    const d2 = await debit(10, "2026-12-04", "small");
    expect(await autoAllocateDebit(db, U.id, d2.id)).toBe(latest.id);
    // No default and Default mode: nothing is allocated.
    await setAllocationMode(db, U.id, "DEFAULT");
    await setDefaultCredit(db, U.id, null);
    expect(await allocationTarget(db, U.id)).toBeNull();
  });
});
