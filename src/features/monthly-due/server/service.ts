import type { PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { getDebtHistory, getDebtSummary } from "@/features/debt/server/service";
import type { DebtItem } from "@/features/debt/types";
import { buildGrid } from "@/features/food/grid";
import { listFoodEntriesRange } from "@/features/food/server/service";
import { getBalances } from "@/features/quick-pay/server/entries";
import { paiseToDecimalString, toPaise } from "@/lib/finance";
import { DEFAULT_EXPENSE_NAME, MAX_EXPENSE_ROWS, computeBalances, monthsOfRange } from "../model";

/**
 * Monthly Due: the month's typed expenses (Room Rent and others), My Due (everything that is yours), the Debt Amount, My
 * Balance, Old Balance and New Balance. Every figure is worked out from the records of the other pages, so it moves when
 * they do. Reads are scoped to `userId`.
 */

const paiseOf = (d: { toString(): string }) => toPaise(d.toString());
const MAX_PAISE = 99_999_999_99;

export interface ExpenseRow {
  /** Null for the default Room Rent row before it has been saved. */
  id: string | null;
  name: string;
  amountPaise: number;
}

// ───────────────────────── Who is "me" ─────────────────────────

export async function getPersonalPartyId(db: PrismaClient, userId: string): Promise<string | null> {
  const row = await db.monthlyDueSetting.findUnique({ where: { userId } });
  if (!row?.personalPartyId) return null;
  const party = await db.expenseParty.findFirst({ where: { id: row.personalPartyId, userId, deletedAt: null }, select: { id: true } });
  return party?.id ?? null;
}

export async function setPersonalParty(db: PrismaClient, userId: string, partyId: string | null): Promise<void> {
  if (partyId) {
    const party = await db.expenseParty.findFirst({ where: { id: partyId, userId, deletedAt: null }, select: { id: true } });
    if (!party) throw new ExpenseError("That person no longer exists.", "NOT_FOUND");
  }
  await db.monthlyDueSetting.upsert({ where: { userId }, create: { userId, personalPartyId: partyId }, update: { personalPartyId: partyId } });
}

// ───────────────────────── Monthly expenses ─────────────────────────

/** The expenses of a month. A month with none saved starts with Room Rent, for you to fill in. */
export async function getMonthlyExpenses(db: PrismaClient, userId: string, month: string): Promise<ExpenseRow[]> {
  const rows = await db.monthlyExpense.findMany({ where: { userId, month, deletedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  if (rows.length === 0) return [{ id: null, name: DEFAULT_EXPENSE_NAME, amountPaise: 0 }];
  return rows.map((r) => ({ id: r.id, name: r.name, amountPaise: paiseOf(r.amount) }));
}

/** Replaces the month's expenses with these. Blank rows are ignored. */
export async function saveMonthlyExpenses(db: PrismaClient, userId: string, month: string, rows: readonly { name: string; amountPaise: number }[]): Promise<ExpenseRow[]> {
  const clean = rows
    .map((r) => ({ name: r.name.trim().replace(/\s+/g, " "), amountPaise: r.amountPaise }))
    .filter((r) => r.name !== "" || r.amountPaise !== 0);
  if (clean.length > MAX_EXPENSE_ROWS) throw new ExpenseError(`At most ${MAX_EXPENSE_ROWS} expenses a month.`);
  for (const r of clean) {
    if (!r.name) throw new ExpenseError("Give every expense a name.");
    if (r.name.length > 60) throw new ExpenseError("Use at most 60 characters in a name.");
    if (!Number.isSafeInteger(r.amountPaise) || r.amountPaise < 0 || r.amountPaise > MAX_PAISE) throw new ExpenseError(`Enter an amount of zero or more for ${r.name}.`);
  }
  await db.$transaction(async (tx) => {
    await tx.monthlyExpense.updateMany({ where: { userId, month, deletedAt: null }, data: { deletedAt: new Date() } });
    if (clean.length > 0) await tx.monthlyExpense.createMany({ data: clean.map((r, position) => ({ userId, month, name: r.name, amount: paiseToDecimalString(r.amountPaise), position })) });
  });
  return getMonthlyExpenses(db, userId, month);
}

// ───────────────────────── The overview ─────────────────────────

export interface DueOverview {
  personalPartyId: string | null;
  personalName: string;
  /** Food Rent for the period, with each day. */
  food: { totalPaise: number; days: { date: string; totalPaise: number }[] };
  /** Splits and debts that name the personal recipient. */
  splits: { totalPaise: number; items: DebtItem[] };
  shopping: { totalPaise: number; items: DebtItem[] };
  portal: { totalPaise: number; items: DebtItem[] };
  /** The typed expenses of every month the period touches. */
  expenses: { totalPaise: number; months: { month: string; rows: ExpenseRow[] }[] };
  myDuePaise: number;
  debt: { totalPaise: number; paidPaise: number; remainingPaise: number; people: { partyId: string; name: string; totalDebtPaise: number; paidPaise: number; remainingPaise: number }[] };
  debtAmountPaise: number;
  myBalancePaise: number;
  oldBalancePaise: number;
  newBalancePaise: number;
}

export async function getDueOverview(db: PrismaClient, userId: string, range: { from: string; to: string }): Promise<DueOverview> {
  const personalPartyId = await getPersonalPartyId(db, userId);
  const months = monthsOfRange(range.from, range.to);

  const [foodData, debtSummary, balances, monthRows, personal, personName] = await Promise.all([
    listFoodEntriesRange(db, userId, range.from, range.to),
    getDebtSummary(db, userId, { from: range.from, to: range.to, excludePartyIds: personalPartyId ? [personalPartyId] : [] }),
    getBalances(db, userId),
    Promise.all(months.map(async (month) => ({ month, rows: await getMonthlyExpenses(db, userId, month) }))),
    personalPartyId ? getDebtHistory(db, userId, personalPartyId, { from: range.from, to: range.to }).catch(() => null) : Promise.resolve(null),
    personalPartyId ? db.expenseParty.findFirst({ where: { id: personalPartyId, userId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const days = buildGrid(foodData.rows, "asc").map((d) => ({ date: d.date, totalPaise: d.totalPaise }));
  const items = personal?.items ?? [];
  const pick = (...sources: DebtItem["source"][]) => items.filter((i) => sources.includes(i.source));
  const sum = (list: DebtItem[]) => list.reduce((s, i) => s + i.amountPaise, 0);
  const splitItems = pick("SPLIT", "DEBT");
  const shoppingItems = pick("SHOPPING");
  const portalItems = pick("CREDIT_PORTAL");
  const expenseTotal = monthRows.reduce((s, m) => s + m.rows.reduce((t, r) => t + r.amountPaise, 0), 0);

  const myDuePaise = foodData.totalPaise + sum(splitItems) + sum(shoppingItems) + sum(portalItems) + expenseTotal;
  const debtAmountPaise = debtSummary.totalDebtPaise;
  const { myBalancePaise, newBalancePaise } = computeBalances({ debtPaise: debtAmountPaise, myDuePaise, oldPaise: balances.totalCurrentPaise });

  return {
    personalPartyId,
    personalName: personName?.name ?? "",
    food: { totalPaise: foodData.totalPaise, days },
    splits: { totalPaise: sum(splitItems), items: splitItems },
    shopping: { totalPaise: sum(shoppingItems), items: shoppingItems },
    portal: { totalPaise: sum(portalItems), items: portalItems },
    expenses: { totalPaise: expenseTotal, months: monthRows },
    myDuePaise,
    debt: {
      totalPaise: debtSummary.totalDebtPaise,
      paidPaise: debtSummary.totalPaidPaise,
      remainingPaise: debtSummary.totalRemainingPaise,
      people: debtSummary.rows.filter((r) => r.totalDebtPaise !== 0 || r.paidPaise !== 0).map((r) => ({ partyId: r.partyId, name: r.name, totalDebtPaise: r.totalDebtPaise, paidPaise: r.paidPaise, remainingPaise: r.remainingPaise })),
    },
    debtAmountPaise,
    myBalancePaise,
    oldBalancePaise: balances.totalCurrentPaise,
    newBalancePaise,
  };
}
