import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { istDateOf, rangeToInstants } from "@/features/quick-pay/datetime";
import { toPaise } from "@/lib/finance";

/**
 * Keeps Bank Statement rows and Transaction History entries together. A statement row is linked to the entry that matches it:
 * the same bank account, the same calendar day (India time, whatever the time), the same kind (debit or credit) and exactly the
 * same amount. The row then shows that entry's Reason and Category, and follows it when they change.
 *
 *   - One entry for one row: linked.
 *   - Several rows and entries that look alike: a reference number (a UPI id in the statement's text) that also appears in the
 *     entry pairs them; if the entries would give the same Reason and Category it does not matter which is which; otherwise the
 *     rows are marked "needs review" and nothing is filled in, instead of guessing.
 *   - A Reason or Category typed on the statement row by hand is never overwritten.
 *   - Rows and entries of different banks never match.
 *
 * It is safe to run again and again: it only changes what is out of step.
 */

const paiseOf = (d: { toString(): string } | null | undefined) => (d ? toPaise(d.toString()) : 0);

/** Long digit runs in a narration (UPI, NEFT and IMPS reference numbers). */
export const referencesOf = (text: string | null | undefined): string[] => [...new Set((text ?? "").match(/\d{9,}/g) ?? [])];

interface Txn {
  id: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  accountId: string | null;
  toAccountId: string | null;
  paise: number;
  date: string;
  reason: string | null;
  categoryId: string | null;
  text: string;
}

const keyOf = (accountId: string, date: string, kind: "D" | "C", paise: number) => `${accountId}|${date}|${kind}|${paise}`;

export async function reconcileBankStatement(db: PrismaClient, userId: string, options: { transactionIds?: readonly string[] } = {}): Promise<{ linked: number; review: number; refreshed: number }> {
  let linked = 0;
  let review = 0;
  let refreshed = 0;

  // 1. Rows that are linked already: follow their entry (or let go of it when it is gone).
  const followed = await db.bankStatementEntry.findMany({
    where: { userId, deletedAt: null, transactionId: options.transactionIds ? { in: [...options.transactionIds] } : { not: null } },
    include: { transaction: { select: { id: true, deletedAt: true, description: true, categoryId: true } } },
  });
  for (const row of followed) {
    const t = row.transaction;
    if (!t || t.deletedAt) {
      await db.bankStatementEntry.update({ where: { id: row.id }, data: { transactionId: null } });
      continue;
    }
    const data: Prisma.BankStatementEntryUncheckedUpdateInput = {};
    if (!row.manualReason && (row.reason ?? null) !== (t.description ?? null)) data.reason = t.description ?? null;
    if (!row.manualCategory && (row.categoryId ?? null) !== (t.categoryId ?? null)) data.categoryId = t.categoryId ?? null;
    if (row.needsReview) data.needsReview = false;
    if (Object.keys(data).length > 0) {
      await db.bankStatementEntry.update({ where: { id: row.id }, data });
      refreshed++;
    }
  }

  // 2. Rows with no entry yet: look for one.
  const open = await db.bankStatementEntry.findMany({ where: { userId, deletedAt: null, transactionId: null }, orderBy: [{ txDate: "asc" }, { txTime: "asc" }, { seq: "asc" }] });
  if (open.length === 0) return { linked, review, refreshed };
  const dates = open.map((r) => r.txDate.toISOString().slice(0, 10)).sort();
  const bounds = rangeToInstants(dates[0]!, dates.at(-1)!);
  const widen = (d: Date | undefined, by: number) => (d ? new Date(d.getTime() + by * 86_400_000) : undefined);
  const [txns, takenRows] = await Promise.all([
    db.transaction.findMany({
      where: { userId, quickPay: true, deletedAt: null, occurredAt: { gte: widen(bounds.gte, -1), lt: widen(bounds.lt, 1) } },
      select: { id: true, type: true, amount: true, occurredAt: true, accountId: true, toAccountId: true, description: true, details: true, categoryId: true },
    }),
    db.bankStatementEntry.findMany({ where: { userId, deletedAt: null, transactionId: { not: null } }, select: { transactionId: true } }),
  ]);
  const taken = new Set(takenRows.map((r) => r.transactionId));

  const byKey = new Map<string, Txn[]>();
  const add = (key: string, t: Txn) => byKey.set(key, [...(byKey.get(key) ?? []), t]);
  for (const t of txns) {
    if (!t.occurredAt || taken.has(t.id)) continue;
    const base: Txn = { id: t.id, type: t.type as Txn["type"], accountId: t.accountId, toAccountId: t.toAccountId, paise: paiseOf(t.amount), date: istDateOf(t.occurredAt), reason: t.description, categoryId: t.categoryId, text: `${t.description ?? ""} ${t.details ?? ""}` };
    if (t.type === "EXPENSE" && t.accountId) add(keyOf(t.accountId, base.date, "D", base.paise), base);
    else if (t.type === "INCOME" && t.toAccountId) add(keyOf(t.toAccountId, base.date, "C", base.paise), base);
    else if (t.type === "TRANSFER") {
      if (t.accountId) add(keyOf(t.accountId, base.date, "D", base.paise), base);
      if (t.toAccountId) add(keyOf(t.toAccountId, base.date, "C", base.paise), base);
    }
  }

  const groups = new Map<string, typeof open>();
  for (const r of open) {
    const debit = paiseOf(r.debit);
    const key = debit > 0 ? keyOf(r.accountId, r.txDate.toISOString().slice(0, 10), "D", debit) : keyOf(r.accountId, r.txDate.toISOString().slice(0, 10), "C", paiseOf(r.credit));
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const used = new Set<string>();
  const link = async (row: (typeof open)[number], t: Txn) => {
    if (used.has(t.id)) return false;
    used.add(t.id);
    try {
      await db.bankStatementEntry.update({
        where: { id: row.id },
        data: { transactionId: t.id, needsReview: false, ...(row.manualReason ? {} : { reason: t.reason ?? null }), ...(row.manualCategory ? {} : { categoryId: t.categoryId ?? null }) },
      });
      linked++;
      return true;
    } catch (error) {
      // The entry was linked to another row at the same moment: leave this one for the next run.
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") return false;
      throw error;
    }
  };

  for (const [key, rows] of groups) {
    const candidates = (byKey.get(key) ?? []).filter((t) => !used.has(t.id));
    if (candidates.length === 0) {
      const stale = rows.filter((r) => r.needsReview);
      for (const r of stale) await db.bankStatementEntry.update({ where: { id: r.id }, data: { needsReview: false } });
      continue;
    }
    if (rows.length === 1 && candidates.length === 1) {
      await link(rows[0]!, candidates[0]!);
      continue;
    }
    // Several alike: pair by reference number first.
    const left = [...rows];
    for (const row of [...left]) {
      const refs = referencesOf(row.details);
      if (refs.length === 0) continue;
      const hits = candidates.filter((t) => !used.has(t.id) && refs.some((ref) => t.text.includes(ref)));
      if (hits.length === 1 && (await link(row, hits[0]!))) left.splice(left.indexOf(row), 1);
    }
    const remaining = candidates.filter((t) => !used.has(t.id));
    if (left.length === 0 || remaining.length === 0) continue;
    // Entries that would give the same Reason and Category: any pairing gives the same result, so the rows take them in order and
    // a row left over (more rows than entries) simply has no entry yet.
    const same = remaining.every((t) => t.reason === remaining[0]!.reason && t.categoryId === remaining[0]!.categoryId);
    if (same) {
      for (const row of left) {
        const t = remaining.find((x) => !used.has(x.id));
        if (!t) break;
        await link(row, t);
      }
      continue;
    }
    for (const row of left) {
      if (!row.needsReview) {
        await db.bankStatementEntry.update({ where: { id: row.id }, data: { needsReview: true } });
      }
      review++;
    }
  }
  return { linked, review, refreshed };
}
