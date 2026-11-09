import type { PrismaClient } from "@/generated/prisma/client";
import { toPaise } from "@/lib/finance";
import { ExpenseError } from "@/features/expenses/server/service";
import type { PersonRow } from "../types";

/** People (the "users" you assign expenses to) with how much each one has been assigned. */
export async function listPeople(db: PrismaClient, userId: string): Promise<PersonRow[]> {
  const [people, totals] = await Promise.all([
    db.expenseParty.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
    db.transactionSplit.groupBy({
      by: ["partyId"],
      where: { userId, transaction: { deletedAt: null } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const byParty = new Map(totals.map((t) => [t.partyId, t]));

  return people.map((p) => {
    const t = byParty.get(p.id);
    return {
      id: p.id,
      name: p.name,
      expenseCount: t?._count._all ?? 0,
      totalPaise: t?._sum.amount ? toPaise(t._sum.amount.toString()) : 0,
    };
  });
}

/**
 * Renames a person. Past expenses follow automatically because they point at the person, not at
 * the name. A name already used by another person (including a removed one) is refused.
 */
export async function renameParty(db: PrismaClient, userId: string, input: { id: string; name: string }): Promise<void> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new ExpenseError("Enter a name.");
  if (name.length > 60) throw new ExpenseError("Use at most 60 characters.");
  const key = name.toLowerCase();

  const person = await db.expenseParty.findFirst({ where: { id: input.id, userId, deletedAt: null } });
  if (!person) throw new ExpenseError("That person no longer exists.", "NOT_FOUND");

  const clash = await db.expenseParty.findUnique({ where: { userId_nameKey: { userId, nameKey: key } } });
  if (clash && clash.id !== person.id) {
    throw new ExpenseError(
      clash.deletedAt
        ? `"${clash.name}" was removed earlier. Add it again from Quick Entry to bring it back.`
        : `"${clash.name}" already exists.`,
      "CONFLICT",
    );
  }

  const updated = await db.expenseParty.updateMany({ where: { id: person.id, userId, deletedAt: null }, data: { name, nameKey: key } });
  if (updated.count !== 1) throw new ExpenseError("That person no longer exists.", "NOT_FOUND");
}
