"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { addPersonAction } from "@/features/users/actions";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { parseAmountInput } from "@/lib/finance";
import { RateLimiter } from "@/lib/security/rate-limit";
import { addPlatform, createPurchase, deletePurchase, removePlatform, renamePlatform, saveItems, updatePurchase } from "./server/service";

/** Server actions for Shopping Records. Each one confirms who is signed in and checks its input again on the server. */

export type ShopResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

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
  console.error(`[shopping] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => revalidatePath("/shopping", "layout");
const id = z.uuid();
const name = z.string().trim().min(1, "Enter a name.").max(60, "Use at most 60 characters.");

export async function addPlatformAction(raw: unknown): Promise<ShopResult<{ id: string }>> {
  try {
    const p = z.object({ name }).safeParse(raw);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await context();
    const created = await addPlatform(db, user.id, p.data.name);
    refresh();
    // Quick Entry lists platforms too.
    revalidatePath("/quick-pay", "layout");
    return { ok: true, id: created };
  } catch (error) {
    return failure(error, "add platform");
  }
}

export async function renamePlatformAction(raw: unknown): Promise<ShopResult> {
  try {
    const p = z.object({ id, name }).safeParse(raw);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await context();
    await renamePlatform(db, user.id, p.data.id, p.data.name);
    refresh();
    revalidatePath("/quick-pay", "layout");
    return { ok: true };
  } catch (error) {
    return failure(error, "rename platform");
  }
}

export async function removePlatformAction(raw: unknown): Promise<ShopResult> {
  try {
    const p = z.object({ id }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That platform could not be found." };
    const { user, db } = await context();
    await removePlatform(db, user.id, p.data.id);
    refresh();
    revalidatePath("/quick-pay", "layout");
    return { ok: true };
  } catch (error) {
    return failure(error, "remove platform");
  }
}

const purchase = z.object({
  platformId: id,
  date: z.string().max(10),
  time: z.string().max(5),
  reason: z.string().max(300),
  amount: z.string().max(20),
  recipientIds: z.array(id).max(60),
});

function toInput(p: z.infer<typeof purchase>) {
  const amountPaise = parseAmountInput(p.amount);
  if (amountPaise === null || amountPaise <= 0) throw new ExpenseError("Enter an amount above zero (at most 2 decimals).");
  let occurredAt: Date;
  try {
    occurredAt = istInstant(p.date, p.time);
  } catch {
    throw new ExpenseError("Choose a valid date and time.");
  }
  if (p.recipientIds.length === 0) throw new ExpenseError("Choose at least one recipient.");
  return { platformId: p.platformId, occurredAt, reason: p.reason, amountPaise, recipientIds: p.recipientIds };
}

export async function createPurchaseAction(raw: unknown): Promise<ShopResult<{ id: string }>> {
  try {
    const p = z.object({ key: id, purchase }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That purchase could not be read. Reload the page and try again." };
    const input = toInput(p.data.purchase);
    const { user, db } = await context();
    const created = await createPurchase(db, user.id, p.data.key, input);
    refresh();
    return { ok: true, id: created.id };
  } catch (error) {
    return failure(error, "create purchase");
  }
}

export async function updatePurchaseAction(raw: unknown): Promise<ShopResult> {
  try {
    const p = z.object({ id, purchase }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That change could not be read." };
    const input = toInput(p.data.purchase);
    const { user, db } = await context();
    await updatePurchase(db, user.id, p.data.id, input);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "update purchase");
  }
}

export async function deletePurchaseAction(raw: unknown): Promise<ShopResult> {
  try {
    const p = z.object({ id }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That purchase could not be found." };
    const { user, db } = await context();
    await deletePurchase(db, user.id, p.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete purchase");
  }
}

const itemRow = z.object({ name: z.string().max(200), quantity: z.string().max(14), rate: z.string().max(20), recipientIds: z.array(id).max(60) });

export async function saveItemsAction(raw: unknown): Promise<ShopResult<{ count: number; totalPaise: number }>> {
  try {
    const p = z.object({ id, items: z.array(itemRow).max(300) }).safeParse(raw);
    if (!p.success) return { ok: false, error: "The item table could not be read. Reload the page and try again." };
    const items = p.data.items.map((r) => {
      const blank = !r.name.trim() && !r.quantity.trim() && !r.rate.trim();
      if (blank) return { name: "", quantity: 0, ratePaise: 0, recipientIds: r.recipientIds };
      const quantity = Number(r.quantity.trim());
      const ratePaise = parseAmountInput(r.rate.trim() === "" ? "0" : r.rate);
      if (!Number.isFinite(quantity)) throw new ExpenseError(`Enter a quantity for "${r.name.trim() || "an item"}".`);
      if (ratePaise === null) throw new ExpenseError(`Enter a rate for "${r.name.trim() || "an item"}" (at most 2 decimals).`);
      return { name: r.name, quantity, ratePaise, recipientIds: r.recipientIds };
    });
    const { user, db } = await context();
    const saved = await saveItems(db, user.id, p.data.id, items);
    refresh();
    return { ok: true, ...saved };
  } catch (error) {
    return failure(error, "save items");
  }
}

/** Adds a person from a recipient list. */
export async function addShoppingRecipientAction(personName: string): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const r = await addPersonAction({ name: personName });
  if (!r.ok) return { ok: false, error: r.error };
  const created = r.createdId ? r.people.find((p) => p.id === r.createdId) : undefined;
  if (!created) return { ok: false, error: "The person was added but could not be found. Reload the page." };
  return { ok: true, id: created.id, name: created.name };
}

export interface ShoppingActions {
  addPlatform: typeof addPlatformAction;
  renamePlatform: typeof renamePlatformAction;
  removePlatform: typeof removePlatformAction;
  createPurchase: typeof createPurchaseAction;
  updatePurchase: typeof updatePurchaseAction;
  deletePurchase: typeof deletePurchaseAction;
  saveItems: typeof saveItemsAction;
}
