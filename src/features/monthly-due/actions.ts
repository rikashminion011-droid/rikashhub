"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { parseAmountInput } from "@/lib/finance";
import { RateLimiter } from "@/lib/security/rate-limit";
import { saveMonthlyItems, setDebtRecipients, setPersonalParty, type ExpenseRow } from "./server/service";

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

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Saves "My other expenses" or "My monthly bills" for the months on screen. Every row names its own month; amounts are typed like 12000 or 450.50. */
export async function saveMonthlyItemsAction(raw: unknown): Promise<DueResult<{ rows: ExpenseRow[] }>> {
  try {
    const p = z
      .object({ kind: z.enum(["OTHER", "BILL"]), scope: z.array(month).max(120), rows: z.array(z.object({ name: z.string().max(100), amount: z.string().max(20), month })).max(60) })
      .safeParse(raw);
    if (!p.success) return { ok: false, error: "The rows could not be read. Check that each one has a month, then try again." };
    const rows = p.data.rows.map((r) => {
      const amountPaise = parseAmountInput(r.amount.trim() === "" ? "0" : r.amount);
      if (amountPaise === null) throw new ExpenseError(`Enter the amount for ${r.name.trim() || "each row"} like 12000 or 450.50.`);
      return { name: r.name, amountPaise, month: r.month };
    });
    const { user, db } = await context();
    const saved = await saveMonthlyItems(db, user.id, p.data.kind, p.data.scope, rows);
    refresh();
    return { ok: true, rows: saved };
  } catch (error) {
    return failure(error, "save monthly items");
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

/**
 * Saves the recipients chosen in Debt Management. They stay chosen (the next visit opens on them) and they are the ones counted
 * in Monthly Due. An empty list means everyone.
 */
export async function setDebtRecipientsAction(raw: unknown): Promise<DueResult> {
  try {
    const p = z.object({ partyIds: z.array(z.uuid()).max(500) }).safeParse(raw);
    if (!p.success) return { ok: false, error: "Choose recipients from the list." };
    const { user, db } = await context();
    await setDebtRecipients(db, user.id, p.data.partyIds);
    revalidatePath("/debt", "layout");
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "set debt recipients");
  }
}

export interface DueActions {
  saveItems: typeof saveMonthlyItemsAction;
  setPersonal: typeof setPersonalPartyAction;
}
