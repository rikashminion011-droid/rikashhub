"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { parseAmountInput } from "@/lib/finance";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import { addSplitPayment, deleteSplitPayment, getDebtHistory, getDebtSummary } from "./server/service";
import type { DebtHistory, DebtResult, DebtSummary } from "./types";

const GENERIC_ERROR = "Something went wrong. Nothing was changed. Please try again.";
const writeLimiter = new RateLimiter(60, 60_000);

async function context() {
  const user = await requireUser();
  if (!writeLimiter.check(user.id).allowed) throw new ExpenseError("You are doing that too quickly. Wait a moment and try again.");
  const db = getPrisma();
  await ensureUserSetup(db, user);
  return { user, db };
}

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof ExpenseError) return { ok: false, error: error.message };
  // Let sign-in redirects from requireUser() through.
  if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[debt] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const id = z.uuid();

export async function getDebtHistoryAction(raw: unknown): Promise<DebtResult<{ history: DebtHistory }>> {
  try {
    const parsed = z.object({ partyId: id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That person could not be found." };
    const user = await requireUser();
    return { ok: true, history: await getDebtHistory(getPrisma(), user.id, parsed.data.partyId) };
  } catch (error) {
    return failure(error, "history");
  }
}

export async function getDebtSummaryAction(): Promise<DebtResult<{ summary: DebtSummary }>> {
  try {
    const user = await requireUser();
    return { ok: true, summary: await getDebtSummary(getPrisma(), user.id) };
  } catch (error) {
    return failure(error, "summary");
  }
}

const paymentSchema = z.object({ partyId: id, amount: z.string().max(20), date: z.string().max(10), time: z.string().max(5), note: z.string().max(400) });

/** Records a payment from a person and returns their refreshed history. */
export async function addPaymentAction(raw: unknown): Promise<DebtResult<{ history: DebtHistory }>> {
  try {
    const parsed = paymentSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That payment could not be read." };
    const amountPaise = parseAmountInput(parsed.data.amount);
    if (amountPaise === null || amountPaise <= 0) return { ok: false, error: "Enter the amount paid, like 500 or 250.50.", fieldErrors: { amount: "Invalid amount" } };
    let paidAt: Date;
    try {
      paidAt = istInstant(parsed.data.date, parsed.data.time || "00:00");
    } catch {
      return { ok: false, error: "Choose a valid date and time.", fieldErrors: { date: "Invalid date" } };
    }
    const { user, db } = await context();
    await addSplitPayment(db, user.id, { partyId: parsed.data.partyId, amountPaise, paidAt, note: parsed.data.note });
    revalidatePath("/debt");
    return { ok: true, history: await getDebtHistory(db, user.id, parsed.data.partyId) };
  } catch (error) {
    return failure(error, "add payment");
  }
}

export async function deletePaymentAction(raw: unknown): Promise<DebtResult<{ history: DebtHistory }>> {
  try {
    const parsed = z.object({ id, partyId: id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That payment could not be found." };
    const { user, db } = await context();
    await deleteSplitPayment(db, user.id, parsed.data.id);
    revalidatePath("/debt");
    return { ok: true, history: await getDebtHistory(db, user.id, parsed.data.partyId) };
  } catch (error) {
    return failure(error, "delete payment");
  }
}

export interface DebtActions {
  getHistory: typeof getDebtHistoryAction;
  addPayment: typeof addPaymentAction;
  deletePayment: typeof deletePaymentAction;
}
