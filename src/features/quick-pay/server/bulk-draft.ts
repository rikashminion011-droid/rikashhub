import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { countFilledRows } from "../bulk-rows";
import { MAX_BULK_ROWS } from "../validation";

/**
 * The Add Bulk sheet kept as a draft on the server, one per user, so it is the same on every device and browser. It is
 * kept until the sheet is saved or cancelled. Every read and write is scoped to `userId`.
 */

const MAX_BYTES = 2_000_000;

export interface BulkDraft {
  /** The rows as the sheet had them (the browser checks them again when it loads them). */
  rows: unknown[];
  /** When it was last saved, as a timestamp (milliseconds). */
  savedAt: number;
  /** Rows with something typed in them. */
  count: number;
}

export async function getBulkDraft(db: PrismaClient, userId: string): Promise<BulkDraft | null> {
  const row = await db.bulkDraft.findUnique({ where: { userId } });
  if (!row || !Array.isArray(row.data)) return null;
  return { rows: row.data as unknown[], savedAt: row.updatedAt.getTime(), count: row.rowCount };
}

/** Just how many rows are waiting, for the Draft button. */
export async function getBulkDraftCount(db: PrismaClient, userId: string): Promise<number> {
  return (await db.bulkDraft.findUnique({ where: { userId }, select: { rowCount: true } }))?.rowCount ?? 0;
}

/** Keeps the sheet as the draft. A sheet with nothing typed in it is not a draft, so it clears the saved one. */
export async function saveBulkDraft(db: PrismaClient, userId: string, rows: readonly unknown[]): Promise<{ count: number; savedAt: number }> {
  if (rows.length > MAX_BULK_ROWS + 200) throw new ExpenseError("That sheet is too long to keep as a draft.");
  const count = countFilledRows(rows);
  if (count === 0) {
    await db.bulkDraft.deleteMany({ where: { userId } });
    return { count: 0, savedAt: Date.now() };
  }
  const data = rows as unknown as Prisma.InputJsonValue;
  if (JSON.stringify(rows).length > MAX_BYTES) throw new ExpenseError("That sheet is too large to keep as a draft.");
  const saved = await db.bulkDraft.upsert({ where: { userId }, create: { userId, data, rowCount: count }, update: { data, rowCount: count } });
  return { count, savedAt: saved.updatedAt.getTime() };
}

export async function clearBulkDraft(db: PrismaClient, userId: string): Promise<void> {
  await db.bulkDraft.deleteMany({ where: { userId } });
}
