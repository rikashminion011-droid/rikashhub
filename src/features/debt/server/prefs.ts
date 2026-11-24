import type { PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { DEFAULT_COLUMNS, normalizeColumns, type ColumnPrefs } from "../recipient-view";

/** Which columns a recipient's page shows, and in what order, kept for each user and recipient. */

export async function getRecipientColumns(db: PrismaClient, userId: string, partyId: string): Promise<ColumnPrefs> {
  const row = await db.recipientViewPref.findUnique({ where: { userId_partyId: { userId, partyId } } });
  return row ? normalizeColumns(row.columns) : structuredClone(DEFAULT_COLUMNS);
}

export async function saveRecipientColumns(db: PrismaClient, userId: string, partyId: string, raw: unknown): Promise<ColumnPrefs> {
  const party = await db.expenseParty.findFirst({ where: { id: partyId, userId }, select: { id: true } });
  if (!party) throw new ExpenseError("That person no longer exists.", "NOT_FOUND");
  const columns = normalizeColumns(raw);
  const json = { order: columns.order, hidden: columns.hidden };
  await db.recipientViewPref.upsert({ where: { userId_partyId: { userId, partyId } }, create: { userId, partyId, columns: json }, update: { columns: json } });
  return columns;
}

export async function resetRecipientColumns(db: PrismaClient, userId: string, partyId: string): Promise<ColumnPrefs> {
  await db.recipientViewPref.deleteMany({ where: { userId, partyId } });
  return structuredClone(DEFAULT_COLUMNS);
}
