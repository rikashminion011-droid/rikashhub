import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";

/**
 * Shopping Cart: things planned to be bought. Each item has a permanent number (Cart 01, Cart 02...) that is never given out
 * twice, the month it is planned for, a category (its own list, new ones made on the spot) and an optional product link.
 * Items are removed softly, so a number stays used. Reads and writes are scoped to `userId`.
 */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export interface CartCategory {
  id: string;
  name: string;
}

export interface CartItem {
  id: string;
  cartNo: number;
  /** "Cart 01" */
  cartLabel: string;
  name: string;
  /** "2026-11" */
  plannedMonth: string;
  categoryId: string | null;
  category: string;
  productLink: string;
}

export const cartLabel = (no: number) => `Cart ${String(no).padStart(2, "0")}`;

/** A product link must be an http or https address: anything else (javascript:, data:) is refused. */
export function cleanLink(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ExpenseError("Enter the product link as a web address, like https://example.com/item.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ExpenseError("The product link must start with http:// or https://.");
  if (url.href.length > 2000) throw new ExpenseError("That product link is too long.");
  return url.href;
}

export async function listCartCategories(db: PrismaClient, userId: string): Promise<CartCategory[]> {
  const rows = await db.shoppingCartCategory.findMany({ where: { userId, deletedAt: null }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Makes a category, or returns the one with that name (even a removed one is brought back). */
export async function createCartCategory(db: PrismaClient | Prisma.TransactionClient, userId: string, name: string): Promise<CartCategory> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new ExpenseError("Enter a category name.");
  if (clean.length > 40) throw new ExpenseError("Use at most 40 characters in a category name.");
  const nameKey = keyOf(clean);
  const row = await db.shoppingCartCategory.upsert({ where: { userId_nameKey: { userId, nameKey } }, create: { userId, name: clean, nameKey }, update: { deletedAt: null } });
  return { id: row.id, name: row.name };
}

const toItem = (r: Prisma.ShoppingCartItemGetPayload<{ include: { category: { select: { name: true } } } }>): CartItem => ({
  id: r.id,
  cartNo: r.cartNo,
  cartLabel: cartLabel(r.cartNo),
  name: r.name,
  plannedMonth: r.plannedMonth,
  categoryId: r.categoryId,
  category: r.category?.name ?? "",
  productLink: r.productLink ?? "",
});

/** The items for a month (null means every month) and a category (null means all), oldest cart number first. */
export async function listCartItems(db: PrismaClient, userId: string, filter: { month: string | null; categoryId: string | null }): Promise<CartItem[]> {
  const rows = await db.shoppingCartItem.findMany({
    where: { userId, deletedAt: null, ...(filter.month ? { plannedMonth: filter.month } : {}), ...(filter.categoryId ? { categoryId: filter.categoryId } : {}) },
    include: { category: { select: { name: true } } },
    orderBy: [{ cartNo: "asc" }],
  });
  return rows.map(toItem);
}

interface ItemInput {
  name: string;
  plannedMonth: string;
  categoryId: string | null;
  /** A new category to make and use (wins over categoryId). */
  newCategory?: string;
  productLink: string;
}

async function resolveCategory(tx: Prisma.TransactionClient, userId: string, input: ItemInput): Promise<string | null> {
  if (input.newCategory && input.newCategory.trim()) return (await createCartCategory(tx, userId, input.newCategory)).id;
  if (!input.categoryId) return null;
  const found = await tx.shoppingCartCategory.findFirst({ where: { id: input.categoryId, userId, deletedAt: null }, select: { id: true } });
  if (!found) throw new ExpenseError("That category no longer exists.", "NOT_FOUND");
  return found.id;
}

function validate(input: ItemInput): { name: string; link: string | null } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new ExpenseError("Enter the item name.");
  if (name.length > 120) throw new ExpenseError("Use at most 120 characters in the item name.");
  if (!MONTH.test(input.plannedMonth)) throw new ExpenseError("Choose the month and year it is planned for.");
  return { name, link: cleanLink(input.productLink) };
}

/** Adds an item with the next cart number. The number is taken inside the transaction (removed items count, so it is never reused). */
export async function createCartItem(db: PrismaClient, userId: string, input: ItemInput): Promise<CartItem> {
  const { name, link } = validate(input);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const categoryId = await resolveCategory(tx, userId, input);
        const last = await tx.shoppingCartItem.aggregate({ where: { userId }, _max: { cartNo: true } });
        const row = await tx.shoppingCartItem.create({ data: { userId, cartNo: (last._max.cartNo ?? 0) + 1, name, plannedMonth: input.plannedMonth, categoryId, productLink: link }, include: { category: { select: { name: true } } } });
        return toItem(row);
      });
    } catch (error) {
      // Two items added at the same instant can pick the same number: the unique index refuses one, which tries again.
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002" && attempt < 4) continue;
      throw error;
    }
  }
  throw new ExpenseError("Could not add the item. Please try again.");
}

export async function updateCartItem(db: PrismaClient, userId: string, id: string, input: ItemInput): Promise<CartItem> {
  const { name, link } = validate(input);
  return db.$transaction(async (tx) => {
    const exists = await tx.shoppingCartItem.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
    if (!exists) throw new ExpenseError("That item no longer exists.", "NOT_FOUND");
    const categoryId = await resolveCategory(tx, userId, input);
    const row = await tx.shoppingCartItem.update({ where: { id }, data: { name, plannedMonth: input.plannedMonth, categoryId, productLink: link }, include: { category: { select: { name: true } } } });
    return toItem(row);
  });
}

export async function deleteCartItem(db: PrismaClient, userId: string, id: string): Promise<void> {
  const updated = await db.shoppingCartItem.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (updated.count !== 1) throw new ExpenseError("That item no longer exists.", "NOT_FOUND");
}
