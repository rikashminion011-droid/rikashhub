"use server";

import { revalidatePath } from "next/cache";
import { ExpenseError, addParty, archiveOption, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { addPersonSchema, changePasswordSchema, removePersonSchema, renamePersonSchema } from "./schemas";
import { listPeople, renameParty } from "./server/service";
import type { PersonRow, UserActionResult } from "./types";

/**
 * Server actions for the User page. Each one confirms who is signed in, validates the input again
 * on the server, and returns the refreshed list so the page always shows what is really saved.
 */

const writeLimiter = new RateLimiter(60, 60_000);
const passwordLimiter = new RateLimiter(5, 15 * 60_000);
const GENERIC_ERROR = "Something went wrong and nothing was changed. Please try again.";

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof ExpenseError) return { ok: false, error: error.message };
  // Let sign-in redirects from requireUser() through.
  if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[user] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

async function peopleContext() {
  const user = await requireUser();
  if (!writeLimiter.check(user.id).allowed) throw new ExpenseError("You are doing that too quickly. Wait a moment and try again.");
  const db = getPrisma();
  await ensureUserSetup(db, user);
  return { user, db };
}

async function refreshed(userId: string, createdId?: string): Promise<{ ok: true; people: PersonRow[]; createdId?: string }> {
  revalidatePath("/user");
  revalidatePath("/quick-pay", "layout");
  return { ok: true, people: await listPeople(getPrisma(), userId), createdId };
}

export async function addPersonAction(raw: unknown): Promise<UserActionResult<{ people: PersonRow[]; createdId?: string }>> {
  try {
    const parsed = addPersonSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await peopleContext();
    const id = await addParty(db, user.id, { name: parsed.data.name });
    return await refreshed(user.id, id);
  } catch (error) {
    return failure(error, "add person");
  }
}

export async function renamePersonAction(raw: unknown): Promise<UserActionResult<{ people: PersonRow[] }>> {
  try {
    const parsed = renamePersonSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await peopleContext();
    await renameParty(db, user.id, parsed.data);
    return await refreshed(user.id);
  } catch (error) {
    return failure(error, "rename person");
  }
}

export async function removePersonAction(raw: unknown): Promise<UserActionResult<{ people: PersonRow[] }>> {
  try {
    const parsed = removePersonSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That person could not be found." };
    const { user, db } = await peopleContext();
    await archiveOption(db, user.id, { kind: "party", id: parsed.data.id });
    return await refreshed(user.id);
  } catch (error) {
    return failure(error, "remove person");
  }
}

/**
 * Changes the signed-in user's password. The current password is checked first (a stolen session
 * alone cannot change it), the new one must meet the sign-up rules, and every other device is
 * signed out afterwards.
 */
export async function changePasswordAction(raw: unknown): Promise<UserActionResult> {
  try {
    const parsed = changePasswordSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: issue?.message ?? "Check the form and try again.", fieldErrors: issue?.path[0] ? { [String(issue.path[0])]: issue.message } : undefined };
    }
    const user = await requireUser();

    const limit = passwordLimiter.check(user.id);
    if (!limit.allowed) {
      const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
      return { ok: false, error: `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
    }

    const supabase = await createClient();
    const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.currentPassword });
    if (checkError) {
      return { ok: false, error: "Your current password is incorrect.", fieldErrors: { currentPassword: "Incorrect password" } };
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
    if (error) {
      if (error.code === "same_password") {
        return { ok: false, error: "Choose a password you have not used before.", fieldErrors: { newPassword: "Choose a different password" } };
      }
      if (error.code === "weak_password") {
        return { ok: false, error: "That password is too easy to guess. Try a longer or less common one.", fieldErrors: { newPassword: "Too easy to guess" } };
      }
      console.error("[user] password update failed", error.code);
      return { ok: false, error: "We could not update your password. Please try again." };
    }

    // Sign out every other device; this one stays signed in.
    await supabase.auth.signOut({ scope: "others" });

    // Record that it happened (never the password itself). A logging problem must not undo the change.
    try {
      await getPrisma().auditLog.create({ data: { userId: user.id, action: "password.change", entity: "user", entityId: user.id } });
    } catch (logError) {
      console.error("[user] could not write the audit record", logError);
    }
    return { ok: true };
  } catch (error) {
    return failure(error, "change password");
  }
}

/** The action set the page's components use. Passed in as props so they can also run against stand-ins. */
export interface UserActions {
  addPerson: typeof addPersonAction;
  renamePerson: typeof renamePersonAction;
  removePerson: typeof removePersonAction;
  changePassword: typeof changePasswordAction;
}
