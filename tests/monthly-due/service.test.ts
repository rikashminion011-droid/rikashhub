import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncCreditedBy } from "@/features/debt/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { DEFAULT_EXPENSE_NAME, computeBalances, monthsOfRange } from "@/features/monthly-due/model";
import { getDueOverview, getMonthlyExpenses, saveMonthlyExpenses, setPersonalParty } from "@/features/monthly-due/server/service";
import { createFromQuickEntry, createPurchase, listPlatforms, saveItems } from "@/features/shopping/server/service";
import { addPortal, importStatement, saveUnbilledBulk, syncQuickEntryUnbilled } from "@/features/credit-portal/server/service";
import { createFoodEntry } from "@/features/food/server/service";
import { getDebtSummary } from "@/features/debt/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "99999999-9999-4999-8999-999999999999", email: "due-me@example.com", name: "Me" };

let database: TestDatabase;
let db: TestDatabase["prisma"];
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n + 5000).padStart(12, "0")}`;
let me = "";
let mukesh = "";
let dhanush = "";

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  const parties = await db.expenseParty.findMany({ where: { userId: ME.id, nameKey: { not: "personal" } }, orderBy: { createdAt: "asc" } });
  const byName = (name: string) => parties.find((x) => x.name === name)!.id;
  me = byName("Office");
  mukesh = byName("Mukesh");
  dhanush = (await db.expenseParty.create({ data: { userId: ME.id, name: "Dhanush", nameKey: "dhanush" } })).id;
}, 60_000);
afterAll(async () => database?.close());

describe("monthly due maths", () => {
  it("works My Balance and New Balance out", () => {
    expect(computeBalances({ debtPaise: 100000, myDuePaise: 30000, oldPaise: 500000 })).toEqual({ myBalancePaise: 70000, newBalancePaise: 570000 });
    expect(computeBalances({ debtPaise: 10000, myDuePaise: 30000, oldPaise: 0 })).toEqual({ myBalancePaise: -20000, newBalancePaise: -20000 });
  });
  it("lists the months a period touches", () => {
    expect(monthsOfRange("2026-10-20", "2026-12-02")).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});

describe("monthly expenses", () => {
  it("starts with Room Rent, saves what was typed, and keeps each month on its own", async () => {
    expect(await getMonthlyExpenses(db, ME.id, "2026-11")).toEqual([{ id: null, name: DEFAULT_EXPENSE_NAME, amountPaise: 0 }]);
    const saved = await saveMonthlyExpenses(db, ME.id, "2026-11", [{ name: "Room Rent", amountPaise: 600000 }, { name: "  Internet ", amountPaise: 49900 }, { name: "", amountPaise: 0 }]);
    expect(saved.map((r) => [r.name, r.amountPaise])).toEqual([["Room Rent", 600000], ["Internet", 49900]]);
    expect((await getMonthlyExpenses(db, ME.id, "2026-10"))[0]!.id).toBeNull();
    await saveMonthlyExpenses(db, ME.id, "2026-11", [{ name: "Room Rent", amountPaise: 650000 }]);
    expect((await getMonthlyExpenses(db, ME.id, "2026-11")).map((r) => r.amountPaise)).toEqual([650000]);
  });
  it("refuses a nameless or negative expense", async () => {
    await expect(saveMonthlyExpenses(db, ME.id, "2026-11", [{ name: "", amountPaise: 100 }])).rejects.toThrow(/name/);
    await expect(saveMonthlyExpenses(db, ME.id, "2026-11", [{ name: "X", amountPaise: -1 }])).rejects.toThrow(/zero or more/);
  });
});

describe("the overview", () => {
  const range = { from: "2026-11-01", to: "2026-11-30" };

  it("adds food, shopping, credit portal and expenses to My Due, and the others to the Debt Amount", async () => {
    await setPersonalParty(db, ME.id, me);
    // Food: ₹100 in November (Tiffin 40 + Lunch 60), and ₹40 in October that must not count.
    await createFoodEntry(db, ME.id, rid(), { meal: "TIFFIN", notes: "Idli", amountPaise: 4000 });
    const tiffin = await db.foodEntry.findFirstOrThrow({ where: { userId: ME.id } });
    await db.foodEntry.update({ where: { id: tiffin.id }, data: { occurredAt: istInstant("2026-11-03", "09:00") } });
    await db.foodEntry.create({ data: { userId: ME.id, meal: "LUNCH", notes: "Rice", amount: "60.00", occurredAt: istInstant("2026-11-03", "13:00"), dedupeKey: `t:${rid()}` } });
    await db.foodEntry.create({ data: { userId: ME.id, meal: "LUNCH", notes: "Old", amount: "40.00", occurredAt: istInstant("2026-10-03", "13:00"), dedupeKey: `t:${rid()}` } });

    // Shopping: ₹300 shared between me and Mukesh, so ₹150 each.
    const platforms = await listPlatforms(db, ME.id);
    const buy = await createPurchase(db, ME.id, rid(), { platformId: platforms[0]!.id, occurredAt: istInstant("2026-11-05", "10:00"), reason: "Groceries", amountPaise: 30000, recipientIds: [me, mukesh] });
    await saveItems(db, ME.id, buy.id, [{ name: "Rice", quantity: 1, ratePaise: 30000, recipientIds: [me, mukesh] }]);

    // Credit portal: a ₹200 statement line for Dhanush only.
    const portal = await addPortal(db, ME.id, "HDFC");
    await importStatement(db, ME.id, portal, [{ key: "k1", occurredAt: istInstant("2026-11-06", "12:00"), details: "NETFLIX", debitPaise: 20000, creditPaise: 0, reason: "Netflix", recipientIds: [dhanush], categoryId: null }]);

    // A Split of ₹1000 with Mukesh at 25% (Quick Entry style row written straight to the tables).
    const account = await db.account.findFirstOrThrow({ where: { userId: ME.id, deletedAt: null } });
    const tx = await db.transaction.create({ data: { userId: ME.id, type: "EXPENSE", accountId: account.id, amount: "1000.00", date: new Date("2026-11-07"), occurredAt: istInstant("2026-11-07", "10:00"), description: "Dinner", quickPay: true, isSplit: true, splitKind: "SPLIT", dedupeKey: `t:${rid()}` } });
    const own = await db.expenseParty.findFirstOrThrow({ where: { userId: ME.id, nameKey: "personal" } });
    await db.transactionSplit.createMany({ data: [{ userId: ME.id, transactionId: tx.id, partyId: mukesh, amount: "250.00", percentage: "25" }, { userId: ME.id, transactionId: tx.id, partyId: own.id, amount: "750.00", percentage: "75" }] });

    await saveMonthlyExpenses(db, ME.id, "2026-11", [{ name: "Room Rent", amountPaise: 650000 }, { name: "Internet", amountPaise: 50000 }]);

    const o = await getDueOverview(db, ME.id, range);
    expect(o.food.totalPaise).toBe(10000);
    expect(o.shopping.totalPaise).toBe(15000);
    expect(o.portal.totalPaise).toBe(0); // the Netflix line is Dhanush's, not mine
    expect(o.expenses.totalPaise).toBe(700000);
    expect(o.myDuePaise).toBe(10000 + 15000 + 700000);
    // Debt Amount: Mukesh 250 + 150, Dhanush 200 = 600, and I am not counted as owing myself.
    expect(o.debtAmountPaise).toBe(25000 + 15000 + 20000);
    expect(o.debt.people.map((p) => p.name).sort()).toEqual(["Dhanush", "Mukesh"].sort());
    expect(o.myBalancePaise).toBe(o.debtAmountPaise - o.myDuePaise);
    expect(o.newBalancePaise).toBe(o.oldBalancePaise + o.myBalancePaise);
  });

  it("counts a Credited By credit as a payment, and takes it back when removed", async () => {
    const before = (await getDebtSummary(db, ME.id, { from: range.from, to: range.to })).rows.find((r) => r.partyId === mukesh)!;
    const tx = rid();
    await syncCreditedBy(db, ME.id, tx, mukesh, { occurredAt: istInstant("2026-11-09", "10:00"), amountPaise: 10000, reason: "Paid back" });
    const after = (await getDebtSummary(db, ME.id, { from: range.from, to: range.to })).rows.find((r) => r.partyId === mukesh)!;
    expect(after.paidPaise).toBe(before.paidPaise + 10000);
    expect(after.remainingPaise).toBe(before.remainingPaise - 10000);
    await syncCreditedBy(db, ME.id, tx, null, { occurredAt: istInstant("2026-11-09", "10:00"), amountPaise: 10000, reason: "" });
    expect((await getDebtSummary(db, ME.id, { from: range.from, to: range.to })).rows.find((r) => r.partyId === mukesh)!.paidPaise).toBe(before.paidPaise);
  });

  it("does not count an unbilled transaction twice once a statement line settles it", async () => {
    const before = (await getDebtSummary(db, ME.id, range)).rows.find((r) => r.partyId === mukesh)!.portalPaise;
    const portals = await db.creditPortal.findFirstOrThrow({ where: { userId: ME.id, nameKey: "hdfc" } });
    await saveUnbilledBulk(db, ME.id, portals.id, rid(), [{ key: "u1", occurredAt: istInstant("2026-11-12", "14:00"), reason: "Lunch", kind: "DEBIT", amountPaise: 50000, recipientIds: [mukesh] }]);
    expect((await getDebtSummary(db, ME.id, range)).rows.find((r) => r.partyId === mukesh)!.portalPaise).toBe(before + 50000);
    await importStatement(db, ME.id, portals.id, [{ key: "k2", occurredAt: istInstant("2026-11-12", "14:05"), details: "RESTAURANT", debitPaise: 50000, creditPaise: 0, reason: "Lunch", recipientIds: [mukesh], categoryId: null }]);
    // The statement line now carries it; the unbilled row is settled, so the total is the same, not doubled.
    expect((await getDebtSummary(db, ME.id, range)).rows.find((r) => r.partyId === mukesh)!.portalPaise).toBe(before + 50000);
  });
});

describe("Quick Entry on a credit-portal bank", () => {
  it("adds an Unbilled row, follows edits and goes away when the bank is not a portal", async () => {
    const portal = await db.creditPortal.findFirstOrThrow({ where: { userId: ME.id, nameKey: "hdfc" } });
    const hdfcBank = await db.account.create({ data: { userId: ME.id, name: "HDFC", type: "OTHER", kind: "CREDIT_LINE" } });
    const other = await db.account.findFirstOrThrow({ where: { userId: ME.id, deletedAt: null, NOT: { id: hdfcBank.id } } });
    const tx = rid();
    const at = istInstant("2026-11-15", "11:00");
    await syncQuickEntryUnbilled(db, ME.id, tx, { accountId: hdfcBank.id, kind: "DEBIT", occurredAt: at, reason: "Phone", amountPaise: 99900 });
    let row = await db.creditPortalEntry.findFirstOrThrow({ where: { userId: ME.id, transactionId: tx } });
    expect([row.portalId, row.deletedAt, row.recipientIds.length]).toEqual([portal.id, null, 0]);
    await syncQuickEntryUnbilled(db, ME.id, tx, { accountId: hdfcBank.id, kind: "DEBIT", occurredAt: at, reason: "Phone case", amountPaise: 12000 });
    row = await db.creditPortalEntry.findFirstOrThrow({ where: { userId: ME.id, transactionId: tx } });
    expect([row.reason, Number(row.amount.toString())]).toEqual(["Phone case", 120]);
    await syncQuickEntryUnbilled(db, ME.id, tx, { accountId: other.id, kind: "DEBIT", occurredAt: at, reason: "Phone case", amountPaise: 12000 });
    expect((await db.creditPortalEntry.findFirstOrThrow({ where: { userId: ME.id, transactionId: tx } })).deletedAt).not.toBeNull();
  });

  it("makes a Pending shopping record from a Quick Entry only once", async () => {
    const platforms = await listPlatforms(db, ME.id);
    const tx = rid();
    const a = await createFromQuickEntry(db, ME.id, tx, { platformId: platforms[0]!.id, occurredAt: istInstant("2026-11-16", "10:00"), reason: "Veg", amountPaise: 5000 });
    const b = await createFromQuickEntry(db, ME.id, tx, { platformId: platforms[0]!.id, occurredAt: istInstant("2026-11-16", "10:00"), reason: "Veg", amountPaise: 5000 });
    expect(b).toEqual({ id: a.id, duplicate: true });
  });
});
