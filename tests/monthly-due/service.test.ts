import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDebtEntries, deleteDebtEntry, getDebtHistory, syncCreditedBy } from "@/features/debt/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { DEFAULT_EXPENSE_NAME, computeBalances, monthsOfRange } from "@/features/monthly-due/model";
import { getDueOverview, getMonthlyExpenses, getUpdateBalances, saveMonthlyExpenses, setPersonalParty } from "@/features/monthly-due/server/service";
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
  // A second test below needs the recipients that were chosen.

  it("adds food, my HDFC statement lines, my shopping and the monthly expenses to My Due, and the chosen recipients to the Debt Amount", async () => {
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
    await importStatement(db, ME.id, portal, [
      { key: "k1", occurredAt: istInstant("2026-11-06", "12:00"), details: "NETFLIX", debitPaise: 20000, creditPaise: 0, reason: "Netflix", recipientIds: [dhanush], categoryId: null },
      // For me and Mukesh: my half, ₹200, is mine; and on 20 October, inside HDFC's cycle but outside the month.
      { key: "k2", occurredAt: istInstant("2026-11-08", "12:00"), details: "DINNER", debitPaise: 40000, creditPaise: 0, reason: "Dinner", recipientIds: [me, mukesh], categoryId: null },
      { key: "k3", occurredAt: istInstant("2026-10-20", "12:00"), details: "OCTOBER", debitPaise: 10000, creditPaise: 0, reason: "", recipientIds: [me], categoryId: null },
      // Before the cycle starts: not counted.
      { key: "k4", occurredAt: istInstant("2026-10-10", "12:00"), details: "TOO EARLY", debitPaise: 90000, creditPaise: 0, reason: "", recipientIds: [me], categoryId: null },
    ]);

    // A Split of ₹1000 with Mukesh at 25% (Quick Entry style row written straight to the tables).
    const account = await db.account.findFirstOrThrow({ where: { userId: ME.id, deletedAt: null } });
    const tx = await db.transaction.create({ data: { userId: ME.id, type: "EXPENSE", accountId: account.id, amount: "1000.00", date: new Date("2026-11-07"), occurredAt: istInstant("2026-11-07", "10:00"), description: "Dinner", quickPay: true, isSplit: true, splitKind: "SPLIT", dedupeKey: `t:${rid()}` } });
    const own = await db.expenseParty.findFirstOrThrow({ where: { userId: ME.id, nameKey: "personal" } });
    await db.transactionSplit.createMany({ data: [{ userId: ME.id, transactionId: tx.id, partyId: mukesh, amount: "250.00", percentage: "25" }, { userId: ME.id, transactionId: tx.id, partyId: own.id, amount: "750.00", percentage: "75" }] });

    await saveMonthlyExpenses(db, ME.id, "2026-11", [{ name: "Room Rent", amountPaise: 650000 }, { name: "Internet", amountPaise: 50000 }]);

    const o = await getDueOverview(db, ME.id, range);
    expect(o.food.totalPaise).toBe(10000);
    expect(o.shopping.totalPaise).toBe(15000);
    // HDFC statement, 15 October to 15 November: my half of Dinner (200) and the October line (100); not Netflix (Dhanush's) or the early one.
    expect(o.hdfc.range).toEqual({ from: "2026-10-15", to: "2026-11-15" });
    expect(o.hdfc.totalPaise).toBe(20000 + 10000);
    expect(o.expenses.totalPaise).toBe(700000);
    // Splits and the other portals are not part of My Due.
    expect(o.myDuePaise).toBe(10000 + 30000 + 15000 + 700000);
    // Debt Amount (nobody chosen yet, so everyone but me): Mukesh 250 + 150 shopping + 200 dinner, Dhanush 200 Netflix.
    expect(o.debtAmountPaise).toBe(25000 + 15000 + 20000 + 20000);
    expect(o.debt.people.map((p) => p.name).sort()).toEqual(["Dhanush", "Mukesh"].sort());
    // My Balance is the total of Update Balance; New Balance adds the Debt Amount and takes away My Due.
    expect(o.myBalancePaise).toBe(o.debtAmountPaise - o.myDuePaise);
    expect(o.newBalancePaise).toBe(o.updateBalance.totalPaise + o.myBalancePaise);
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

describe("Add Bulk", () => {
  it("records a Credited By payment and lists rows on a credit-portal bank under that portal", async () => {
    const { createBulk } = await import("@/features/quick-pay/server/entries");
    const bank = (await db.account.findFirst({ where: { userId: ME.id, name: "HDFC", deletedAt: null } })) ?? (await db.account.create({ data: { userId: ME.id, name: "HDFC", type: "OTHER", kind: "CREDIT_LINE" } }));
    const portal = await db.creditPortal.findFirstOrThrow({ where: { userId: ME.id, nameKey: "hdfc" } });
    const at = istInstant("2026-11-10", "10:00");
    const before = await db.creditPortalEntry.count({ where: { userId: ME.id, portalId: portal.id, transactionId: { not: null } } });
    const result = await createBulk(db, ME.id, rid(), [
      { key: "c1", type: "CREDIT", amountPaise: 30000, occurredAt: at, reason: "Paid back", accountId: bank.id, categoryId: null, shares: [], transfer: null, creditedById: mukesh },
      { key: "d1", type: "DEBIT", amountPaise: 12000, occurredAt: at, reason: "Phone case", accountId: bank.id, categoryId: null, shares: [], transfer: null },
    ]);
    expect(result).toEqual({ count: 2, duplicate: false });
    const paid = await db.splitPayment.findFirst({ where: { userId: ME.id, partyId: mukesh, note: "Paid back", deletedAt: null } });
    expect(Number(paid!.amount.toString())).toBe(300);
    expect(await db.creditPortalEntry.count({ where: { userId: ME.id, portalId: portal.id, transactionId: { not: null } } })).toBe(before + 2);
  });
});

describe("HDFC in Debt Management", () => {
  it("reads HDFC from the 15th of last month to the 15th of this month and every other portal from the chosen period", async () => {
    const hdfc = await db.creditPortal.findFirstOrThrow({ where: { userId: ME.id, nameKey: "hdfc" } });
    const slice = await addPortal(db, ME.id, "Slice");
    const before = (await getDebtSummary(db, ME.id, { from: "2026-11-01", to: "2026-11-30" })).rows.find((r) => r.partyId === dhanush)?.portalPaise ?? 0;
    // 20 October: inside HDFC's cycle for November, outside the calendar month.
    await importStatement(db, ME.id, hdfc.id, [{ key: "oct-h", occurredAt: istInstant("2026-10-20", "11:00"), details: "HDFC OCT", debitPaise: 70000, creditPaise: 0, reason: "", recipientIds: [dhanush], categoryId: null }]);
    await importStatement(db, ME.id, slice, [{ key: "oct-s", occurredAt: istInstant("2026-10-20", "11:00"), details: "SLICE OCT", debitPaise: 90000, creditPaise: 0, reason: "", recipientIds: [dhanush], categoryId: null }]);
    const after = (await getDebtSummary(db, ME.id, { from: "2026-11-01", to: "2026-11-30" })).rows.find((r) => r.partyId === dhanush)!.portalPaise;
    expect(after - before).toBe(70000);
  });
});

describe("Add Bulk, Credit History", () => {
  it("links a Debit row to the credit chosen for it", async () => {
    const { createBulk } = await import("@/features/quick-pay/server/entries");
    const bank = await db.account.findFirstOrThrow({ where: { userId: ME.id, name: "HDFC", deletedAt: null } });
    const at = istInstant("2026-11-11", "10:00");
    await createBulk(db, ME.id, rid(), [{ key: "cr", type: "CREDIT", amountPaise: 50000, occurredAt: at, reason: "Salary part", accountId: bank.id, categoryId: null, shares: [], transfer: null, creditedById: null }]);
    const credit = await db.transaction.findFirstOrThrow({ where: { userId: ME.id, description: "Salary part", deletedAt: null } });
    await createBulk(db, ME.id, rid(), [{ key: "dr", type: "DEBIT", amountPaise: 20000, occurredAt: at, reason: "Paid from it", accountId: bank.id, categoryId: null, shares: [], transfer: null, creditIds: [credit.id] }]);
    const debit = await db.transaction.findFirstOrThrow({ where: { userId: ME.id, description: "Paid from it", deletedAt: null } });
    expect(await db.transactionCreditLink.count({ where: { userId: ME.id, debitId: debit.id, creditId: credit.id } })).toBe(1);
  });
});

describe("Transaction History filters", () => {
  it("filters by who credited a credit, shows who credited each row, and counts debits and credits for the quick filters", async () => {
    const { createBulk, listTransactions } = await import("@/features/quick-pay/server/entries");
    const { parseTxFilters } = await import("@/features/quick-pay/filters");
    const bank = (await db.account.findFirst({ where: { userId: ME.id, name: "HDFC", deletedAt: null } }))!;
    const at = istInstant("2026-11-12", "10:00");
    await createBulk(db, ME.id, rid(), [
      { key: "x1", type: "CREDIT", amountPaise: 11100, occurredAt: at, reason: "From Mukesh", accountId: bank.id, categoryId: null, shares: [], transfer: null, creditedById: mukesh },
      { key: "x2", type: "CREDIT", amountPaise: 22200, occurredAt: at, reason: "From Dhanush", accountId: bank.id, categoryId: null, shares: [], transfer: null, creditedById: dhanush },
    ]);
    const all = await listTransactions(db, ME.id, parseTxFilters({ all: "1" }));
    const byMukesh = await listTransactions(db, ME.id, parseTxFilters({ all: "1", by: mukesh }));
    expect(byMukesh.rows.length).toBeGreaterThan(0);
    expect(byMukesh.rows.every((r) => r.creditedById === mukesh && r.creditedBy === "Mukesh")).toBe(true);
    expect(byMukesh.rows.some((r) => r.reason === "From Dhanush")).toBe(false);
    // The counts for the Credits and Debits buttons ignore the kind filter and cover everything else.
    const credits = await listTransactions(db, ME.id, parseTxFilters({ all: "1", types: "CREDIT" }));
    expect(credits.rows.every((r) => r.type === "CREDIT")).toBe(true);
    expect(credits.typeCounts).toEqual(all.typeCounts);
    expect(all.typeCounts.credit).toBeGreaterThanOrEqual(2);
    // The page size can be chosen.
    const small = await listTransactions(db, ME.id, parseTxFilters({ all: "1", size: "10" }));
    expect(small.rows.length).toBeLessThanOrEqual(10);
    expect(parseTxFilters({ size: "7" }).size).toBe(50);
  });
});

describe("recipients chosen in Debt Management", () => {
  it("are remembered, count in the Debt Amount, and a removed person drops out", async () => {
    const { getDebtRecipients, setDebtRecipients } = await import("@/features/monthly-due/server/service");
    expect(await getDebtRecipients(db, ME.id)).toEqual([]);
    await setDebtRecipients(db, ME.id, [dhanush]);
    expect(await getDebtRecipients(db, ME.id)).toEqual([dhanush]);
    const o = await getDueOverview(db, ME.id, { from: "2026-11-01", to: "2026-11-30" });
    expect(o.debt.chosen).toEqual([dhanush]);
    expect(o.debt.people.map((p) => p.name)).toEqual(["Dhanush"]);
    // The Debt Amount is exactly Dhanush's total value in Debt Management for the same dates (HDFC by its own cycle).
    const theirs = (await getDebtSummary(db, ME.id, { from: "2026-11-01", to: "2026-11-30", excludePartyIds: [me] })).rows.find((r) => r.partyId === dhanush)!;
    expect(o.debtAmountPaise).toBe(theirs.totalDebtPaise);
    expect(o.debtAmountPaise).toBeGreaterThan(0);
    await expect(setDebtRecipients(db, ME.id, ["00000000-0000-4000-8000-0000000000ff"])).rejects.toThrow(/no longer exists/);
    await setDebtRecipients(db, ME.id, []);
    expect(await getDebtRecipients(db, ME.id)).toEqual([]);
  });

  it("Update Balance lists the banks and Cash that hold money, and leaves out credit lines", async () => {
    const { getUpdateBalances } = await import("@/features/monthly-due/server/service");
    const credit = await db.account.create({ data: { userId: ME.id, name: "SliceLine", type: "OTHER", kind: "CREDIT_LINE" } });
    const { rows, totalPaise } = await getUpdateBalances(db, ME.id);
    expect(rows.some((r) => r.id === credit.id)).toBe(false);
    expect(totalPaise).toBe(rows.reduce((t, r) => t + r.amountPaise, 0));
  });
});

describe("two date filters, Add Debt and Update Balance", () => {
  const range = { from: "2026-11-01", to: "2026-11-30" };

  it("follows the HDFC statement date only for HDFC lines, and the general date for the rest", async () => {
    const wide = await getDueOverview(db, ME.id, range, { from: "2026-10-15", to: "2026-11-15" });
    const narrow = await getDueOverview(db, ME.id, range, { from: "2026-11-07", to: "2026-11-09" });
    // Only the 8 November dinner (my half, 200) falls in the narrow HDFC period.
    expect(narrow.hdfc.totalPaise).toBe(20000);
    expect(narrow.hdfc.range).toEqual({ from: "2026-11-07", to: "2026-11-09" });
    expect(narrow.food.totalPaise).toBe(wide.food.totalPaise);
    expect(narrow.shopping.totalPaise).toBe(wide.shopping.totalPaise);
    // Changing the general date does not move the HDFC lines.
    const otherMonth = await getDueOverview(db, ME.id, { from: "2026-09-01", to: "2026-09-30" }, { from: "2026-11-07", to: "2026-11-09" });
    expect(otherMonth.hdfc.totalPaise).toBe(20000);
    expect(otherMonth.food.totalPaise).toBe(0);
  });

  it("adds a debt by hand to a person's total, lists it, and takes it away again", async () => {
    const before = (await getDebtSummary(db, ME.id, range)).rows.find((r) => r.partyId === dhanush)!;
    await addDebtEntries(db, ME.id, { partyId: dhanush, occurredAt: istInstant("2026-11-10", "12:00"), rows: [{ reason: "Phone repair", amountPaise: 150000 }, { reason: " Ticket ", amountPaise: 25050 }] });
    const after = (await getDebtSummary(db, ME.id, range)).rows.find((r) => r.partyId === dhanush)!;
    expect(after.manualPaise).toBe(175050);
    expect(after.totalDebtPaise).toBe(before.totalDebtPaise + 175050);
    expect(after.remainingPaise).toBe(before.remainingPaise + 175050);
    const history = await getDebtHistory(db, ME.id, dhanush, range);
    const added = history.items.filter((i) => i.source === "MANUAL");
    expect(added.map((i) => i.reason).sort()).toEqual(["Phone repair", "Ticket"]);
    // Outside the period it does not count.
    expect((await getDebtSummary(db, ME.id, { from: "2026-09-01", to: "2026-09-30" })).rows.find((r) => r.partyId === dhanush)?.manualPaise ?? 0).toBe(0);
    await deleteDebtEntry(db, ME.id, added[0]!.id.replace("manual:", ""));
    expect((await getDebtSummary(db, ME.id, range)).rows.find((r) => r.partyId === dhanush)!.manualPaise).toBeLessThan(175050);
  });

  it("refuses a debt with no reason or no amount", async () => {
    await expect(addDebtEntries(db, ME.id, { partyId: dhanush, occurredAt: new Date(), rows: [{ reason: "", amountPaise: 100 }] })).rejects.toThrow(/reason/);
    await expect(addDebtEntries(db, ME.id, { partyId: dhanush, occurredAt: new Date(), rows: [{ reason: "X", amountPaise: 0 }] })).rejects.toThrow(/Add at least|above zero/);
    await expect(addDebtEntries(db, ME.id, { partyId: dhanush, occurredAt: new Date(), rows: [] })).rejects.toThrow(/at least one/);
  });

  it("lists only Canara, IDFC, HDFC, TMB, DBS and Cash in Update Balance", async () => {
    const { rows } = await getUpdateBalances(db, ME.id);
    const order = ["Canara", "IDFC", "HDFC", "TMB", "DBS", "Cash"];
    expect(rows.map((r) => r.name).every((n) => order.includes(n))).toBe(true);
    expect(rows.map((r) => order.indexOf(r.name))).toEqual([...rows.map((r) => order.indexOf(r.name))].sort((a, b) => a - b));
  });
});
