import type { PrismaClient } from "@/generated/prisma/client";
import { toISODate, toPaise } from "@/lib/finance";
import type { RecentExpense } from "../types";

/** The latest expenses entered, newest first, with who they were for. */
export async function getRecentExpenses(db: PrismaClient, userId: string, limit = 6): Promise<RecentExpense[]> {
  const rows = await db.transaction.findMany({
    where: { userId, type: "EXPENSE", deletedAt: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      category: { select: { name: true } },
      account: { select: { name: true, parent: { select: { name: true } } } },
      splits: { include: { party: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    amountPaise: toPaise(row.amount.toString()),
    date: toISODate(row.date),
    notes: row.description ?? "",
    paidWith: row.account ? (row.account.parent ? `${row.account.parent.name} · ${row.account.name}` : row.account.name) : "",
    category: row.category?.name ?? "",
    isSplit: row.isSplit,
    people: row.splits.map((s) => ({ name: s.party.name, amountPaise: toPaise(s.amount.toString()) })),
  }));
}
