"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import { getCreditDebits, getCreditPreferences, setAllocationMode, setDefaultCredit, type AllocationMode, type CreditDebit } from "./server/service";

export type CreditResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const limiter = new RateLimiter(120, 60_000);
const GENERIC_ERROR = "Something went wrong and nothing was changed. Please try again.";

async function context() {
  const user = await requireUser();
  if (!limiter.check(user.id).allowed) throw new ExpenseError("You are doing that too quickly. Wait a moment and try again.");
  const db = getPrisma();
  await ensureUserSetup(db, user);
  return { user, db };
}

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof ExpenseError) return { ok: false, error: error.message };
  if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[credit-history] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => {
  revalidatePath("/credit-history", "layout");
  revalidatePath("/quick-pay", "layout");
};

const id = z.uuid();

/** Set as Default (a credit id) or Remove as Default (null). Only one default exists, so setting one replaces the other. */
export async function setDefaultCreditAction(raw: unknown): Promise<CreditResult> {
  try {
    const p = z.object({ creditId: id.nullable() }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That credit could not be found." };
    const { user, db } = await context();
    await setDefaultCredit(db, user.id, p.data.creditId);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "set default");
  }
}

/** How new debits are allocated: to the default credit source, or to the latest credit. Kept for next time. */
export async function setAllocationModeAction(raw: unknown): Promise<CreditResult<{ mode: AllocationMode }>> {
  try {
    const p = z.object({ mode: z.enum(["DEFAULT", "RECENT"]) }).safeParse(raw);
    if (!p.success) return { ok: false, error: "Choose Default Credit Source or Recent Credit Transaction." };
    const { user, db } = await context();
    await setAllocationMode(db, user.id, p.data.mode);
    refresh();
    return { ok: true, mode: p.data.mode };
  } catch (error) {
    return failure(error, "set mode");
  }
}

export async function getCreditPreferencesAction(): Promise<CreditResult<{ mode: AllocationMode; defaultCreditId: string | null }>> {
  try {
    const user = await requireUser();
    return { ok: true, ...(await getCreditPreferences(getPrisma(), user.id)) };
  } catch (error) {
    return failure(error, "preferences");
  }
}

export async function getCreditDebitsAction(raw: unknown): Promise<CreditResult<{ debits: CreditDebit[] }>> {
  try {
    const p = z.object({ creditId: id }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That credit could not be found." };
    const user = await requireUser();
    return { ok: true, debits: await getCreditDebits(getPrisma(), user.id, p.data.creditId) };
  } catch (error) {
    return failure(error, "debits");
  }
}
