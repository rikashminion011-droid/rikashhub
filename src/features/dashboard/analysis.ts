import type { PrismaClient } from "@/generated/prisma/client";
import { MEAL_LABEL } from "@/features/food/pricing";
import { istDateOf, rangeToInstants } from "@/features/quick-pay/datetime";
import { toPaise } from "@/lib/finance";

/**
 * The Dashboard analysis: one view at a time (Transactions, Food, Shopping, Debt, Credit Portal), for the period chosen in the
 * filter. Each is a short list of labelled amounts that the page draws as bars.
 */

export const VIEWS = [
  { key: "transactions", label: "Transactions" },
  { key: "food", label: "Food" },
  { key: "shopping", label: "Shopping" },
  { key: "debt", label: "Debt" },
  { key: "portal", label: "Credit Portal" },
] as const;
export type ViewKey = (typeof VIEWS)[number]["key"];

export const isView = (v: string): v is ViewKey => VIEWS.some((x) => x.key === v);

export interface Bar {
  label: string;
  valuePaise: number;
  /** A second figure drawn inside the same bar (for example what has been paid). */
  insidePaise?: number;
  note?: string;
  href?: string;
}

export interface Analysis {
  title: string;
  /** A short sentence about what the bars show. */
  caption: string;
  groups: { heading: string; bars: Bar[]; /** Bars are dated (oldest first) rather than ranked. */ ordered?: boolean }[];
}

type Range = { from: string; to: string };

const paiseOf = (d: { toString(): string } | null | undefined) => (d ? toPaise(d.toString()) : 0);
const rank = (bars: Bar[]) => bars.filter((b) => b.valuePaise !== 0).sort((a, b) => b.valuePaise - a.valuePaise);

export async function transactionsAnalysis(db: PrismaClient, userId: string, range: Range): Promise<Analysis> {
  const bounds = rangeToInstants(range.from, range.to);
  const when = bounds.gte || bounds.lt ? { occurredAt: bounds } : {};
  const base = { userId, quickPay: true, deletedAt: null, ...when };
  const [byCategory, categories, rows] = await Promise.all([
    db.transaction.groupBy({ by: ["categoryId"], where: { ...base, type: "EXPENSE" }, _sum: { amount: true } }),
    db.transactionCategory.findMany({ where: { userId }, select: { id: true, name: true } }),
    db.transaction.findMany({ where: { ...base, type: "EXPENSE" }, select: { amount: true, occurredAt: true } }),
  ]);
  const name = new Map(categories.map((c) => [c.id, c.name]));
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.occurredAt) continue;
    const day = istDateOf(r.occurredAt);
    perDay.set(day, (perDay.get(day) ?? 0) + paiseOf(r.amount));
  }
  return {
    title: "Transactions",
    caption: "Money spent (debits) in this period, by category and by day.",
    groups: [
      { heading: "By category", bars: rank(byCategory.map((c) => ({ label: c.categoryId ? (name.get(c.categoryId) ?? "Category") : "No category", valuePaise: paiseOf(c._sum.amount), href: c.categoryId ? `/quick-pay/transactions?categories=${c.categoryId}&from=${range.from}&to=${range.to}` : undefined }))).slice(0, 12) },
      { heading: "By day", ordered: true, bars: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, valuePaise]) => ({ label: day.slice(8) + "/" + day.slice(5, 7), valuePaise })) },
    ],
  };
}

export async function foodAnalysis(db: PrismaClient, userId: string, range: Range): Promise<Analysis> {
  const bounds = rangeToInstants(range.from, range.to);
  const when = bounds.gte || bounds.lt ? { occurredAt: bounds } : {};
  const rows = await db.foodEntry.findMany({ where: { userId, deletedAt: null, ...when }, select: { meal: true, amount: true, occurredAt: true } });
  const perMeal = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const r of rows) {
    const paise = paiseOf(r.amount);
    perMeal.set(r.meal, (perMeal.get(r.meal) ?? 0) + paise);
    const day = istDateOf(r.occurredAt);
    perDay.set(day, (perDay.get(day) ?? 0) + paise);
  }
  return {
    title: "Food",
    caption: "What was spent on food in this period, by meal and by day.",
    groups: [
      { heading: "By meal", bars: rank([...perMeal.entries()].map(([meal, valuePaise]) => ({ label: MEAL_LABEL[meal as keyof typeof MEAL_LABEL] ?? meal, valuePaise }))) },
      { heading: "By day", ordered: true, bars: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, valuePaise]) => ({ label: day.slice(8) + "/" + day.slice(5, 7), valuePaise })) },
    ],
  };
}

export async function shoppingAnalysis(db: PrismaClient, userId: string, range: Range): Promise<Analysis> {
  const bounds = rangeToInstants(range.from, range.to);
  const when = bounds.gte || bounds.lt ? { occurredAt: bounds } : {};
  const rows = await db.shoppingPurchase.findMany({ where: { userId, deletedAt: null, platform: { deletedAt: null }, ...when }, select: { amount: true, platform: { select: { name: true } } } });
  const perPlatform = new Map<string, number>();
  for (const r of rows) perPlatform.set(r.platform.name, (perPlatform.get(r.platform.name) ?? 0) + paiseOf(r.amount));
  return {
    title: "Shopping",
    caption: "Shopping Records in this period, by platform.",
    groups: [{ heading: "By platform", bars: rank([...perPlatform.entries()].map(([label, valuePaise]) => ({ label, valuePaise, href: "/shopping" }))) }],
  };
}

export function debtAnalysis(people: { partyId: string; name: string; totalDebtPaise: number; paidPaise: number; remainingPaise: number }[], query: string): Analysis {
  return {
    title: "Debt",
    caption: "What each chosen recipient owes (the full bar) and what they have paid (the darker part).",
    groups: [
      {
        heading: "By recipient",
        bars: rank(people.map((p) => ({ label: p.name, valuePaise: p.totalDebtPaise, insidePaise: p.paidPaise, note: `Remaining ${(p.remainingPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, href: `/debt/${p.partyId}${query}` }))),
      },
    ],
  };
}

export function portalAnalysis(portals: { id: string; name: string; totalPaise: number; usedPaise: number; cardInfoSaved: boolean }[]): Analysis {
  return {
    title: "Credit Portal",
    caption: "How much of each credit limit is used (the darker part).",
    groups: [{ heading: "Utilization", bars: portals.filter((p) => p.cardInfoSaved && p.totalPaise > 0).map((p) => ({ label: p.name, valuePaise: p.totalPaise, insidePaise: p.usedPaise, note: `${Math.min(100, Math.round((p.usedPaise / p.totalPaise) * 100))}% used`, href: `/credit-cards?portal=${p.id}` })) }],
  };
}
