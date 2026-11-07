"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import { todayIn } from "@/lib/finance";
import {
  addAccountSchema,
  addMethodSchema,
  addNamedSchema,
  archiveSchema,
  createExpenseSchema,
} from "./schemas";
import {
  ExpenseError,
  addAccount,
  addCategory,
  addParty,
  addPaymentMethod,
  archiveOption,
  createExpense,
  ensureUserSetup,
  getExpenseFormData,
} from "./server/service";
import type { ExpenseActionResult, MethodKind, OptionsResult } from "./types";
import { validateExpenseInput } from "./validation";

/**
 * Server actions for the expense entry page. Each one: confirms who is signed in, validates the
 * input again on the server, does the work through the service layer, and returns the refreshed
 * choices so the form always shows what is really saved.
 */

const writeLimiter = new RateLimiter(60, 60_000);
const PATH = "/quick-entry";

const GENERIC_ERROR = "Something went wrong and nothing was saved. Please try again.";

async function context() {
  const user = await requireUser();
  const limit = writeLimiter.check(user.id);
  if (!limit.allowed) throw new ExpenseError("You are doing that too quickly. Wait a moment and try again.");
  const db = getPrisma();
  await ensureUserSetup(db, user);
  return { user, db };
}

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof ExpenseError) return { ok: false, error: error.message };
  // Authentication redirects (requireUser) must keep working.
  if (error instanceof Error && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[expenses] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

async function optionsResult(db: ReturnType<typeof getPrisma>, userId: string, createdId?: string): Promise<{ ok: true } & OptionsResult> {
  revalidatePath(PATH);
  return { ok: true, data: await getExpenseFormData(db, userId), createdId };
}

export async function createExpenseAction(raw: unknown): Promise<ExpenseActionResult<{ id: string; amountPaise: number; duplicate: boolean }>> {
  try {
    const parsed = createExpenseSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That form could not be read. Reload the page and try again." };
    const { requestId, ...input } = parsed.data;

    const { user, db } = await context();

    // Whether the chosen method has accounts under it is a fact in the database, not something to trust from the browser.
    const data = await getExpenseFormData(db, user.id);
    const method = data.methods.find((m) => m.id === input.methodId);
    const checked = validateExpenseInput(input, {
      methodHasAccounts: (method?.accounts.length ?? 0) > 0,
      today: todayIn().toISOString().slice(0, 10),
    });
    if (!checked.ok) {
      const [first] = Object.values(checked.errors);
      return { ok: false, error: first ?? "Check the form and try again.", fieldErrors: checked.errors as Record<string, string> };
    }

    const saved = await createExpense(db, user.id, requestId, checked.value);
    revalidatePath(PATH);
    return { ok: true, id: saved.id, amountPaise: checked.value.amountPaise, duplicate: saved.duplicate };
  } catch (error) {
    return failure(error, "create expense");
  }
}

export async function addPaymentMethodAction(raw: unknown): Promise<ExpenseActionResult<OptionsResult>> {
  try {
    const parsed = addMethodSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await context();
    const id = await addPaymentMethod(db, user.id, { name: parsed.data.name, kind: parsed.data.kind as MethodKind });
    return await optionsResult(db, user.id, id);
  } catch (error) {
    return failure(error, "add payment method");
  }
}

export async function addAccountAction(raw: unknown): Promise<ExpenseActionResult<OptionsResult>> {
  try {
    const parsed = addAccountSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await context();
    const id = await addAccount(db, user.id, parsed.data);
    return await optionsResult(db, user.id, id);
  } catch (error) {
    return failure(error, "add account");
  }
}

export async function addPartyAction(raw: unknown): Promise<ExpenseActionResult<OptionsResult>> {
  try {
    const parsed = addNamedSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await context();
    const id = await addParty(db, user.id, parsed.data);
    return await optionsResult(db, user.id, id);
  } catch (error) {
    return failure(error, "add user");
  }
}

export async function addCategoryAction(raw: unknown): Promise<ExpenseActionResult<OptionsResult>> {
  try {
    const parsed = addNamedSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await context();
    const id = await addCategory(db, user.id, parsed.data);
    return await optionsResult(db, user.id, id);
  } catch (error) {
    return failure(error, "add category");
  }
}

export async function archiveOptionAction(raw: unknown): Promise<ExpenseActionResult<OptionsResult>> {
  try {
    const parsed = archiveSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That option could not be found." };
    const { user, db } = await context();
    await archiveOption(db, user.id, parsed.data);
    return await optionsResult(db, user.id);
  } catch (error) {
    return failure(error, "remove option");
  }
}

/** The action set the form uses. Passed in as props so the form can also run against stand-ins. */
export interface ExpenseActions {
  createExpense: typeof createExpenseAction;
  addPaymentMethod: typeof addPaymentMethodAction;
  addAccount: typeof addAccountAction;
  addParty: typeof addPartyAction;
  addCategory: typeof addCategoryAction;
  archiveOption: typeof archiveOptionAction;
}
