"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import { reconcileBankStatement } from "./server/sync";
import { MAX_STATEMENT_ROWS, deleteBankEntry, importBankRows, patchBankEntry } from "./server/service";
import type { BsRow } from "./types";

export type BsResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const writeLimiter = new RateLimiter(120, 60_000);
const GENERIC_ERROR = "Something went wrong and nothing was saved. Please try again.";

async function context() {
  const user = await requireUser();
  if (!writeLimiter.check(user.id).allowed) throw new ExpenseError("You are doing that too quickly. Wait a moment and try again.");
  const db = getPrisma();
  await ensureUserSetup(db, user);
  return { user, db };
}

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof ExpenseError) return { ok: false, error: error.message };
  if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[bank-statement] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => revalidatePath("/bank-statement", "layout");
const id = z.uuid();

const importSchema = z.object({
  accountId: id,
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^\d{2}:\d{2}$/),
        details: z.string().max(1000),
        debitPaise: z.number().int().min(0).max(99_999_999_99),
        creditPaise: z.number().int().min(0).max(99_999_999_99),
        balancePaise: z.number().int().min(-99_999_999_99).max(99_999_999_99).nullable(),
      }),
    )
    .max(MAX_STATEMENT_ROWS),
});

/** Saves the rows of a previewed statement for one bank. Rows already saved are skipped, so an import can be repeated safely. */
export async function importBankStatementAction(raw: unknown): Promise<BsResult<{ imported: number; duplicates: number }>> {
  try {
    const parsed = importSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That import could not be read. Upload the file again." };
    const { user, db } = await context();
    const result = await importBankRows(db, user.id, parsed.data.accountId, parsed.data.rows);
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    return failure(error, "import");
  }
}

export async function patchBankEntryAction(raw: unknown): Promise<BsResult<{ row: BsRow }>> {
  try {
    const parsed = z.object({ id, reason: z.string().max(1000).optional(), categoryId: id.nullable().optional() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That change could not be read." };
    const { user, db } = await context();
    const row = await patchBankEntry(db, user.id, parsed.data.id, { reason: parsed.data.reason, categoryId: parsed.data.categoryId });
    refresh();
    return { ok: true, row };
  } catch (error) {
    return failure(error, "patch");
  }
}

export async function deleteBankEntryAction(raw: unknown): Promise<BsResult> {
  try {
    const parsed = z.object({ id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That row could not be found." };
    const { user, db } = await context();
    await deleteBankEntry(db, user.id, parsed.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete");
  }
}

/**
 * Links a statement row to the Quick Entry transaction made for it. The transaction must be the user's, of the same bank, kind and
 * amount as the row (so the link is true), and a transaction can be linked to one row only. The row then follows its Reason and Category.
 */
export async function linkBankRowAction(raw: unknown): Promise<BsResult> {
  try {
    const parsed = z.object({ rowId: id, transactionId: id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That link could not be read." };
    const { user, db } = await context();
    const [row, txn] = await Promise.all([
      db.bankStatementEntry.findFirst({ where: { id: parsed.data.rowId, userId: user.id, deletedAt: null } }),
      db.transaction.findFirst({ where: { id: parsed.data.transactionId, userId: user.id, deletedAt: null, quickPay: true } }),
    ]);
    if (!row) return { ok: false, error: "That statement row no longer exists." };
    if (!txn) return { ok: false, error: "That transaction no longer exists." };
    if (row.transactionId === txn.id) return { ok: true };
    if (row.transactionId) return { ok: false, error: "That row is already linked." };
    const debit = Number(row.debit.toString());
    const credit = Number(row.credit.toString());
    const sameBank = debit > 0 ? txn.accountId === row.accountId : txn.toAccountId === row.accountId;
    const sameAmount = Number(txn.amount.toString()) === (debit > 0 ? debit : credit);
    if (!sameBank || !sameAmount || (debit > 0 ? txn.type !== "EXPENSE" : txn.type !== "INCOME")) return { ok: false, error: "That transaction does not match the row's bank, kind and amount." };
    try {
      await db.bankStatementEntry.update({ where: { id: row.id }, data: { transactionId: txn.id, needsReview: false } });
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") return { ok: false, error: "That transaction is already linked to another row." };
      throw error;
    }
    await reconcileBankStatement(db, user.id, { transactionIds: [txn.id] });
    refresh();
    revalidatePath("/quick-pay", "layout");
    return { ok: true };
  } catch (error) {
    return failure(error, "link");
  }
}

export interface BankStatementActions {
  importRows: typeof importBankStatementAction;
  patch: typeof patchBankEntryAction;
  remove: typeof deleteBankEntryAction;
}
