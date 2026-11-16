"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { parseAmountInput } from "@/lib/finance";
import { RateLimiter } from "@/lib/security/rate-limit";
import { saveMonthlyExpenses, setPersonalParty, type ExpenseRow } from "./server/service";

/** Server actions for Monthly Due. Each one confirms who is signed in and checks its input again on the server. */

export type DueResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

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
  console.error(`[monthly-due] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => {
  revalidatePath("/monthly-due", "layout");
  revalidatePath("/dashboard", "layout");
};

/** Saves the month's typed expenses (Room Rent and the others). Amounts are typed like 12000 or 450.50. */
export async function saveMonthlyExpensesAction(raw: unknown): Promise<DueResult<{ rows: ExpenseRow[] }>> {
  try {
    const p = z
      .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), rows: z.array(z.object({ name: z.string().max(100), amount: z.string().max(20) })).max(60) })
      .safeParse(raw);
    if (!p.success) return { ok: false, error: "The expenses could not be read. Reload the page and try again." };
    const rows = p.data.rows.map((r) => {
      const amountPaise = parseAmountInput(r.amount.trim() === "" ? "0" : r.amount);
      if (amountPaise === null) throw new ExpenseError(`Enter the amount for ${r.name.trim() || "each expense"} like 12000 or 450.50.`);
      return { name: r.name, amountPaise };
    });
    const { user, db } = await context();
    const saved = await saveMonthlyExpenses(db, user.id, p.data.month, rows);
    refresh();
    return { ok: true, rows: saved };
  } catch (error) {
    return failure(error, "save expenses");
  }
}

/** Chooses who is "me": everything recorded for that person is My Due. */
export async function setPersonalPartyAction(raw: unknown): Promise<DueResult> {
  try {
    const p = z.object({ partyId: z.uuid().nullable() }).safeParse(raw);
    if (!p.success) return { ok: false, error: "Choose a person from the list." };
    const { user, db } = await context();
    await setPersonalParty(db, user.id, p.data.partyId);
    refresh();
    revalidatePath("/debt", "layout");
    return { ok: true };
  } catch (error) {
    return failure(error, "set personal recipient");
  }
}

export interface DueActions {
  saveExpenses: typeof saveMonthlyExpensesAction;
  setPersonal: typeof setPersonalPartyAction;
}
