"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import { deleteSleep, getSleepNow, startSleep, wakeUp, type SleepNow } from "./server/service";

export type SleepResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const limiter = new RateLimiter(60, 60_000);
const GENERIC_ERROR = "Something went wrong. Please try again.";

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
  console.error(`[sleep] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => {
  revalidatePath("/sleep", "layout");
  revalidatePath("/quick-pay", "layout");
};

/** Good Night: the sleep starts at this exact moment (the server's clock, not the phone's). */
export async function startSleepAction(): Promise<SleepResult<{ now: SleepNow }>> {
  try {
    const { user, db } = await context();
    await startSleep(db, user.id);
    refresh();
    return { ok: true, now: await getSleepNow(db, user.id) };
  } catch (error) {
    return failure(error, "start");
  }
}

/** I Woke Up: the sleep ends at this exact moment and its duration is saved. */
export async function wakeUpAction(): Promise<SleepResult<{ now: SleepNow }>> {
  try {
    const { user, db } = await context();
    await wakeUp(db, user.id);
    refresh();
    return { ok: true, now: await getSleepNow(db, user.id) };
  } catch (error) {
    return failure(error, "wake up");
  }
}

export async function getSleepNowAction(): Promise<SleepResult<{ now: SleepNow }>> {
  try {
    const user = await requireUser();
    return { ok: true, now: await getSleepNow(getPrisma(), user.id) };
  } catch (error) {
    return failure(error, "status");
  }
}

export async function deleteSleepAction(raw: unknown): Promise<SleepResult> {
  try {
    const parsed = z.object({ id: z.uuid() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That record could not be found." };
    const { user, db } = await context();
    await deleteSleep(db, user.id, parsed.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete");
  }
}

export interface SleepActions {
  start: typeof startSleepAction;
  wake: typeof wakeUpAction;
}
