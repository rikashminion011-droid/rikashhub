"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import { createCartItem, deleteCartItem, updateCartItem, type CartItem } from "./server/service";

export type CartResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

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
  console.error(`[shopping-cart] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => {
  revalidatePath("/shopping-cart", "layout");
  revalidatePath("/quick-pay", "layout");
};

const id = z.uuid();
const itemSchema = z.object({
  name: z.string().max(200),
  plannedMonth: z.string().max(7),
  categoryId: id.nullable(),
  newCategory: z.string().max(80).optional(),
  productLink: z.string().max(2100),
});

export async function addCartItemAction(raw: unknown): Promise<CartResult<{ item: CartItem }>> {
  try {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That item could not be read." };
    const { user, db } = await context();
    const item = await createCartItem(db, user.id, parsed.data);
    refresh();
    return { ok: true, item };
  } catch (error) {
    return failure(error, "add item");
  }
}

export async function updateCartItemAction(raw: unknown): Promise<CartResult<{ item: CartItem }>> {
  try {
    const parsed = itemSchema.extend({ id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That change could not be read." };
    const { id: itemId, ...input } = parsed.data;
    const { user, db } = await context();
    const item = await updateCartItem(db, user.id, itemId, input);
    refresh();
    return { ok: true, item };
  } catch (error) {
    return failure(error, "update item");
  }
}

export async function deleteCartItemAction(raw: unknown): Promise<CartResult> {
  try {
    const parsed = z.object({ id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That item could not be found." };
    const { user, db } = await context();
    await deleteCartItem(db, user.id, parsed.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete item");
  }
}

export interface CartActions {
  add: typeof addCartItemAction;
  update: typeof updateCartItemAction;
  remove: typeof deleteCartItemAction;
}
