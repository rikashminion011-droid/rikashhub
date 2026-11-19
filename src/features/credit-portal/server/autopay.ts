import type { PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { paiseToDecimalString, toPaise } from "@/lib/finance";

/**
 * Auto Pay of a credit portal: dated amounts kept in two separate lists, My Autopay and Office Autopay, each with its Total.
 */

export type AutopayOwner = "MY" | "OFFICE";

export interface AutopayRow {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  amountPaise: number;
}

export interface AutopayData {
  my: { rows: AutopayRow[]; totalPaise: number };
  office: { rows: AutopayRow[]; totalPaise: number };
}

const MAX_PAISE = 99_999_999_99;

export async function listAutopay(db: PrismaClient, userId: string, portalId: string): Promise<AutopayData> {
  const rows = await db.autopayEntry.findMany({ where: { userId, portalId, deletedAt: null }, orderBy: [{ payDate: "asc" }, { createdAt: "asc" }] });
  const pick = (owner: AutopayOwner) => {
    const list = rows.filter((r) => r.owner === owner).map((r) => ({ id: r.id, date: r.payDate.toISOString().slice(0, 10), amountPaise: toPaise(r.amount.toString()) }));
    return { rows: list, totalPaise: list.reduce((s, r) => s + r.amountPaise, 0) };
  };
  return { my: pick("MY"), office: pick("OFFICE") };
}

export async function addAutopay(db: PrismaClient, userId: string, input: { portalId: string; owner: AutopayOwner; date: string; amountPaise: number }): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(new Date(`${input.date}T00:00:00.000Z`).getTime())) throw new ExpenseError("Choose the autopay date.");
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new ExpenseError("Enter the autopay amount, above zero.");
  if (input.amountPaise > MAX_PAISE) throw new ExpenseError("That amount is too large.");
  const portal = await db.creditPortal.findFirst({ where: { id: input.portalId, userId, deletedAt: null }, select: { id: true } });
  if (!portal) throw new ExpenseError("That credit portal no longer exists.", "NOT_FOUND");
  const created = await db.autopayEntry.create({ data: { userId, portalId: portal.id, owner: input.owner, payDate: new Date(`${input.date}T00:00:00.000Z`), amount: paiseToDecimalString(input.amountPaise) } });
  return created.id;
}

export async function deleteAutopay(db: PrismaClient, userId: string, id: string): Promise<void> {
  const updated = await db.autopayEntry.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (updated.count !== 1) throw new ExpenseError("That autopay no longer exists.", "NOT_FOUND");
}
