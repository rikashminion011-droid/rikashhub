import type { PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { hdfcCycle } from "@/features/credit-portal/model";
import { hdfcStatementShares } from "@/features/credit-portal/server/service";
import { getDebtSummary } from "@/features/debt/server/service";

import { buildGrid } from "@/features/food/grid";
import { shoppingShares } from "@/features/shopping/server/service";
import { listFoodEntriesRange } from "@/features/food/server/service";
import { getBalances } from "@/features/quick-pay/server/entries";
import { paiseToDecimalString, toPaise } from "@/lib/finance";
import { MAX_EXPENSE_ROWS, computeBalances, monthsOfRange } from "../model";

/**
 * Monthly Due: the month's typed expenses (Room Rent and others), My Due (everything that is yours), the Debt Amount, My
 * Balance, Old Balance and New Balance. Every figure is worked out from the records of the other pages, so it moves when
 * they do. Reads are scoped to `userId`.
 */

const paiseOf = (d: { toString(): string }) => toPaise(d.toString());
const MAX_PAISE = 99_999_999_99;

/** "My other expenses" (OTHER) and "My monthly bills" (BILL): two lists with the same features. */
export type ExpenseKind = "OTHER" | "BILL";

export interface ExpenseRow {
  id: string;
  name: string;
  amountPaise: number;
  /** The month it belongs to ("2026-11"). It shows only when the date filter covers that month. */
  month: string;
}

// ───────────────────────── Who is "me" ─────────────────────────

export async function getPersonalPartyId(db: PrismaClient, userId: string): Promise<string | null> {
  const row = await db.monthlyDueSetting.findUnique({ where: { userId } });
  if (row?.personalPartyId) {
    const party = await db.expenseParty.findFirst({ where: { id: row.personalPartyId, userId, deletedAt: null }, select: { id: true } });
    if (party) return party.id;
  }
  // Nobody chosen yet: the recipient named Rikash is "me".
  const rikash = await db.expenseParty.findFirst({ where: { userId, deletedAt: null, nameKey: "rikash" }, select: { id: true } });
  return rikash?.id ?? null;
}

export async function setPersonalParty(db: PrismaClient, userId: string, partyId: string | null): Promise<void> {
  if (partyId) {
    const party = await db.expenseParty.findFirst({ where: { id: partyId, userId, deletedAt: null }, select: { id: true } });
    if (!party) throw new ExpenseError("That person no longer exists.", "NOT_FOUND");
  }
  await db.monthlyDueSetting.upsert({ where: { userId }, create: { userId, personalPartyId: partyId }, update: { personalPartyId: partyId } });
}

// ───────────────────────── Recipients chosen in Debt Management

/** The recipients chosen in Debt Management (its default view, and the ones counted in Monthly Due). Empty means everyone. */
export async function getDebtRecipients(db: PrismaClient, userId: string): Promise<string[]> {
  const row = await db.monthlyDueSetting.findUnique({ where: { userId } });
  if (!row || row.debtPartyIds.length === 0) return [];
  // A person removed since is dropped from the choice.
  const alive = await db.expenseParty.findMany({ where: { userId, id: { in: row.debtPartyIds }, deletedAt: null }, select: { id: true } });
  const keep = new Set(alive.map((p) => p.id));
  return row.debtPartyIds.filter((id) => keep.has(id));
}

export async function setDebtRecipients(db: PrismaClient, userId: string, partyIds: readonly string[]): Promise<void> {
  const ids = [...new Set(partyIds)];
  if (ids.length > 0) {
    const found = await db.expenseParty.count({ where: { userId, id: { in: ids }, deletedAt: null } });
    if (found !== ids.length) throw new ExpenseError("A chosen person no longer exists. Pick again.", "NOT_FOUND");
  }
  await db.monthlyDueSetting.upsert({ where: { userId }, create: { userId, debtPartyIds: ids }, update: { debtPartyIds: ids } });
}

// ───────────────────────── My other expenses and My monthly bills ─────────────────────────

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The rows of one list that belong to these months, oldest month first. A row with another month is not part of the period. */
export async function listMonthlyItems(db: PrismaClient, userId: string, kind: ExpenseKind, months: readonly string[]): Promise<ExpenseRow[]> {
  if (months.length === 0) return [];
  const rows = await db.monthlyExpense.findMany({ where: { userId, kind, month: { in: [...months] }, deletedAt: null }, orderBy: [{ month: "asc" }, { position: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, amountPaise: paiseOf(r.amount), month: r.month }));
}

/**
 * Replaces the rows of one list that sit in these months (the period on screen) with the rows given. Each row names its own month.
 * Blank rows are ignored. Rows of other months are left alone.
 */
export async function saveMonthlyItems(
  db: PrismaClient,
  userId: string,
  kind: ExpenseKind,
  scopeMonths: readonly string[],
  rows: readonly { name: string; amountPaise: number; month: string }[],
): Promise<ExpenseRow[]> {
  const clean = rows
    .map((r) => ({ name: r.name.trim().replace(/\s+/g, " "), amountPaise: r.amountPaise, month: r.month }))
    .filter((r) => r.name !== "" || r.amountPaise !== 0);
  if (clean.length > MAX_EXPENSE_ROWS) throw new ExpenseError(`At most ${MAX_EXPENSE_ROWS} rows.`);
  for (const r of clean) {
    if (!r.name) throw new ExpenseError("Give every row a name.");
    if (r.name.length > 60) throw new ExpenseError("Use at most 60 characters in a name.");
    if (!Number.isSafeInteger(r.amountPaise) || r.amountPaise < 0 || r.amountPaise > MAX_PAISE) throw new ExpenseError(`Enter an amount of zero or more for ${r.name}.`);
    if (!MONTH.test(r.month)) throw new ExpenseError(`Choose the month for ${r.name}.`);
  }
  const scope = scopeMonths.filter((m) => MONTH.test(m));
  await db.$transaction(async (tx) => {
    if (scope.length > 0) await tx.monthlyExpense.updateMany({ where: { userId, kind, month: { in: scope }, deletedAt: null }, data: { deletedAt: new Date() } });
    if (clean.length > 0) await tx.monthlyExpense.createMany({ data: clean.map((r, position) => ({ userId, kind, month: r.month, name: r.name, amount: paiseToDecimalString(r.amountPaise), position })) });
  });
  return listMonthlyItems(db, userId, kind, scope);
}

// ───────────────────────── Update Balance

export interface BalanceRow {
  id: string;
  name: string;
  /** The main file it sits under (GPay, Cash). */
  main: string;
  amountPaise: number;
}

/** The six lines of Update Balance, in this order. */
export const UPDATE_BALANCE_LINES = ["Canara", "IDFC", "HDFC", "TMB", "DBS", "Cash"] as const;

/** The money you hold now: Canara, IDFC, HDFC, TMB, DBS and Cash, one line each (credit lines such as Slice are not money you hold). */
export async function getUpdateBalances(db: PrismaClient, userId: string): Promise<{ rows: BalanceRow[]; totalPaise: number }> {
  const [data, accounts] = await Promise.all([getBalances(db, userId), db.account.findMany({ where: { userId, deletedAt: null, kind: "ASSET" }, select: { id: true } })]);
  const held = new Set(accounts.map((a) => a.id));
  const rows: BalanceRow[] = [];
  for (const g of data.groups) {
    for (const l of [...g.accounts, ...(g.direct ? [g.direct] : [])]) {
      if (held.has(l.id)) rows.push({ id: l.id, name: l.name, main: g.name, amountPaise: l.currentPaise });
    }
  }
  const six: BalanceRow[] = [];
  for (const key of UPDATE_BALANCE_LINES) {
    const k = key.toLowerCase();
    const hit = rows.find((r) => r.name.toLowerCase() === k) ?? rows.find((r) => r.name.toLowerCase().includes(k) || r.main.toLowerCase() === k);
    if (hit && !six.includes(hit)) six.push({ ...hit, name: key });
  }
  return { rows: six, totalPaise: six.reduce((s, r) => s + r.amountPaise, 0) };
}

// ───────────────────────── The overview

export interface DueItem {
  id: string;
  occurredAt: string;
  reason: string;
  category: string;
  related: string;
  amountPaise: number;
  href: string | null;
}

export interface DueOverview {
  personalPartyId: string | null;
  personalName: string;
  /** Food for the period, with each day. */
  food: { totalPaise: number; days: { date: string; totalPaise: number }[] };
  /** The personal recipient's lines on the HDFC statement (HDFC's 15th to 15th cycle), shared evenly when a line has several people. */
  hdfc: { totalPaise: number; range: { from: string; to: string }; items: DueItem[] };
  /** The personal recipient's part of every shopping purchase. */
  shopping: { totalPaise: number; items: DueItem[] };
  /** My other expenses: the rows whose month the period covers. */
  expenses: { totalPaise: number; rows: ExpenseRow[] };
  /** My monthly bills: the rows whose month the period covers. */
  bills: { totalPaise: number; rows: ExpenseRow[] };
  /** Food + HDFC statement + Shopping Records + My other expenses. */
  myDuePaise: number;
  /** The recipients chosen in Debt Management (everyone when none were chosen): the total value, what was paid and what remains. */
  debt: { totalPaise: number; paidPaise: number; remainingPaise: number; people: { partyId: string; name: string; totalDebtPaise: number; paidPaise: number; remainingPaise: number }[]; chosen: string[] };
  /** What the chosen recipients still owe (their remaining amount). */
  debtAmountPaise: number;
  /** What the banks and Cash hold, as typed in Update Balance. */
  updateBalance: { rows: BalanceRow[]; totalPaise: number };
  /** Debt Amount - My monthly bills - My Due. */
  myBalancePaise: number;
  /** The total of Update Balance + My Balance. */
  newBalancePaise: number;
}

/** `hdfcRange` is the Credit Portal > HDFC > Statement date; it is used only for the HDFC statement lines, and the general `range` for everything else. */
export async function getDueOverview(db: PrismaClient, userId: string, range: { from: string; to: string }, hdfcPeriod?: { from: string; to: string }): Promise<DueOverview> {
  const personalPartyId = await getPersonalPartyId(db, userId);
  const months = monthsOfRange(range.from, range.to);
  const hdfcRange = hdfcPeriod ?? hdfcCycle(range.to);
  const chosen = await getDebtRecipients(db, userId);

  const [foodData, debtSummary, updateBalance, otherRows, billRows, personName, hdfcShares, shopShares] = await Promise.all([
    listFoodEntriesRange(db, userId, range.from, range.to),
    getDebtSummary(db, userId, { from: range.from, to: range.to, hdfc: hdfcRange, excludePartyIds: personalPartyId ? [personalPartyId] : [] }),
    getUpdateBalances(db, userId),
    listMonthlyItems(db, userId, "OTHER", months),
    listMonthlyItems(db, userId, "BILL", months),
    personalPartyId ? db.expenseParty.findFirst({ where: { id: personalPartyId, userId }, select: { name: true } }) : Promise.resolve(null),
    personalPartyId ? hdfcStatementShares(db, userId, personalPartyId, hdfcRange) : Promise.resolve([]),
    personalPartyId ? shoppingShares(db, userId, { from: range.from, to: range.to }) : Promise.resolve([]),
  ]);

  const days = buildGrid(foodData.rows, "asc").map((d) => ({ date: d.date, totalPaise: d.totalPaise }));
  const hdfcItems: DueItem[] = hdfcShares.map((s) => ({ id: `hdfc:${s.id}`, occurredAt: s.occurredAt, reason: s.reason, category: s.category, related: `${s.portal} · Statement`, amountPaise: s.amountPaise, href: `/credit-cards?portal=${s.portalId}&tab=statement` }));
  const shopItems: DueItem[] = shopShares
    .filter((s) => s.partyId === personalPartyId)
    .map((s, i) => ({ id: `shop:${s.purchaseId}:${i}`, occurredAt: s.occurredAt, reason: s.reason, category: "", related: s.platform, amountPaise: s.amountPaise, href: `/shopping/${s.purchaseId}` }));
  const sum = (list: DueItem[]) => list.reduce((t, i) => t + i.amountPaise, 0);
  const expenseTotal = otherRows.reduce((t, r) => t + r.amountPaise, 0);
  const billsTotal = billRows.reduce((t, r) => t + r.amountPaise, 0);
  const myDuePaise = foodData.totalPaise + sum(hdfcItems) + sum(shopItems) + expenseTotal;

  // Only the recipients chosen in Debt Management count (everyone when none were chosen).
  const rows = chosen.length > 0 ? debtSummary.rows.filter((r) => chosen.includes(r.partyId)) : debtSummary.rows;
  const debtTotal = rows.reduce((t, r) => t + r.totalDebtPaise, 0);
  const debtRemaining = rows.reduce((t, r) => t + r.remainingPaise, 0);
  const { myBalancePaise, newBalancePaise } = computeBalances({ debtPaise: debtRemaining, billsPaise: billsTotal, myDuePaise, oldPaise: updateBalance.totalPaise });

  return {
    personalPartyId,
    personalName: personName?.name ?? "",
    food: { totalPaise: foodData.totalPaise, days },
    hdfc: { totalPaise: sum(hdfcItems), range: hdfcRange, items: hdfcItems },
    shopping: { totalPaise: sum(shopItems), items: shopItems },
    expenses: { totalPaise: expenseTotal, rows: otherRows },
    bills: { totalPaise: billsTotal, rows: billRows },
    myDuePaise,
    debt: {
      totalPaise: debtTotal,
      paidPaise: rows.reduce((t, r) => t + r.paidPaise, 0),
      remainingPaise: rows.reduce((t, r) => t + r.remainingPaise, 0),
      people: rows.filter((r) => r.totalDebtPaise !== 0 || r.paidPaise !== 0).map((r) => ({ partyId: r.partyId, name: r.name, totalDebtPaise: r.totalDebtPaise, paidPaise: r.paidPaise, remainingPaise: r.remainingPaise })),
      chosen,
    },
    debtAmountPaise: debtRemaining,
    updateBalance,
    myBalancePaise,
    newBalancePaise,
  };
}
