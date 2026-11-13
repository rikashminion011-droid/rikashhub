"use server";

import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import type { NavLayout } from "./model";
import { resetNavLayout, saveNavLayout } from "./server/service";

const GENERIC_ERROR = "Something went wrong. Nothing was changed. Please try again.";
const limiter = new RateLimiter(60, 60_000);

export type NavResult = { ok: true; layout: NavLayout } | { ok: false; error: string };

async function context() {
  const user = await requireUser();
  if (!limiter.check(user.id).allowed) throw new ExpenseError("You are doing that too quickly. Wait a moment and try again.");
  const db = getPrisma();
  await ensureUserSetup(db, user);
  return { user, db };
}

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof ExpenseError) return { ok: false, error: error.message };
  // Let sign-in redirects from requireUser() through.
  if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[navigation] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

/** Saves the side navigator layout and returns the tidied layout that was stored. */
export async function saveNavLayoutAction(raw: unknown): Promise<NavResult> {
  try {
    const { user, db } = await context();
    return { ok: true, layout: await saveNavLayout(db, user.id, raw) };
  } catch (error) {
    return failure(error, "save");
  }
}

export async function resetNavLayoutAction(): Promise<NavResult> {
  try {
    const { user, db } = await context();
    return { ok: true, layout: await resetNavLayout(db, user.id) };
  } catch (error) {
    return failure(error, "reset");
  }
}

export interface NavActions {
  save: typeof saveNavLayoutAction;
  reset: typeof resetNavLayoutAction;
}
