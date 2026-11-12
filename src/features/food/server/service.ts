import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { rangeToInstants, monthBounds } from "@/features/quick-pay/datetime";
import { paiseToDecimalString, toPaise } from "@/lib/finance";
import {
  DEFAULT_MEAL_PRICE_PAISE,
  MAX_ITEM_NAME_LENGTH,
  MAX_PRICE_PAISE,
  MEALS,
  foodKey,
  monthsBetween,
  priceNotes,
  type Meal,
} from "../pricing";
import type { FoodEntriesData, FoodEntryRow, FoodItemRow, FoodPricing } from "../types";

/** The food service layer. Every query is scoped to `userId`. */

const paiseOf = (value: Prisma.Decimal | string | number) => toPaise(value.toString());

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ───────────────────────── Pricing and settings ─────────────────────────

/** Meal prices and priced items. Missing meal prices are created with the defaults (₹40 / ₹50 / ₹40) the first time. */
export async function getFoodPricing(db: PrismaClient, userId: string): Promise<FoodPricing> {
  let prices = await db.foodMealPrice.findMany({ where: { userId } });
  if (prices.length < MEALS.length) {
    const have = new Set(prices.map((p) => p.meal));
    await db.foodMealPrice.createMany({
      data: MEALS.filter((m) => !have.has(m)).map((meal) => ({ userId, meal, price: paiseToDecimalString(DEFAULT_MEAL_PRICE_PAISE[meal]) })),
      skipDuplicates: true,
    });
    prices = await db.foodMealPrice.findMany({ where: { userId } });
  }
  const items = await db.foodItem.findMany({ where: { userId, deletedAt: null }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] });

  const out = {} as FoodPricing["meals"];
  for (const meal of MEALS) {
    const found = prices.find((p) => p.meal === meal);
    out[meal] = {
      defaultPaise: found ? paiseOf(found.price) : DEFAULT_MEAL_PRICE_PAISE[meal],
      items: items.filter((i) => i.meal === meal).map((i): FoodItemRow => ({ id: i.id, name: i.name, pricePaise: paiseOf(i.price) })),
    };
  }
  return { meals: out };
}

function checkName(raw: string): { name: string; key: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) throw new ExpenseError("Enter a food item name.");
  if (name.length > MAX_ITEM_NAME_LENGTH) throw new ExpenseError(`Use at most ${MAX_ITEM_NAME_LENGTH} characters.`);
  return { name, key: foodKey(name) };
}

function checkPrice(paise: number): void {
  if (!Number.isInteger(paise) || paise < 0 || paise > MAX_PRICE_PAISE) throw new ExpenseError("Enter a price between ₹0 and ₹1,00,000.");
}

/** Friendly duplicate check. The database's unique index is the safety net for two saves at once. */
async function assertNameFree(db: PrismaClient, userId: string, meal: Meal, key: string, name: string, exceptId?: string): Promise<void> {
  const clash = await db.foodItem.findFirst({ where: { userId, meal, nameKey: key, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (clash) throw new ExpenseError(`"${name}" is already in this list.`, "CONFLICT");
}

export async function addFoodItem(db: PrismaClient, userId: string, input: { meal: Meal; name: string; pricePaise: number }): Promise<string> {
  const { name, key } = checkName(input.name);
  checkPrice(input.pricePaise);
  await assertNameFree(db, userId, input.meal, key, name);
  try {
    const created = await db.foodItem.create({
      data: { userId, meal: input.meal, name, nameKey: key, price: paiseToDecimalString(input.pricePaise) },
    });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ExpenseError(`"${name}" is already in this list.`, "CONFLICT");
    throw error;
  }
}

export async function updateFoodItem(db: PrismaClient, userId: string, input: { id: string; name: string; pricePaise: number }): Promise<void> {
  const { name, key } = checkName(input.name);
  checkPrice(input.pricePaise);
  const current = await db.foodItem.findFirst({ where: { id: input.id, userId, deletedAt: null } });
  if (!current) throw new ExpenseError("That item no longer exists.", "NOT_FOUND");
  await assertNameFree(db, userId, current.meal, key, name, input.id);
  try {
    const updated = await db.foodItem.updateMany({
      where: { id: input.id, userId, deletedAt: null },
      data: { name, nameKey: key, price: paiseToDecimalString(input.pricePaise) },
    });
    if (updated.count !== 1) throw new ExpenseError("That item no longer exists.", "NOT_FOUND");
  } catch (error) {
    if (isUniqueViolation(error)) throw new ExpenseError(`"${name}" is already in this list.`, "CONFLICT");
    throw error;
  }
}

/** Deleting an item never changes saved entries: their amount was fixed when they were saved. */
export async function deleteFoodItem(db: PrismaClient, userId: string, id: string): Promise<void> {
  const updated = await db.foodItem.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (updated.count !== 1) throw new ExpenseError("That item no longer exists.", "NOT_FOUND");
}

export async function setMealPrice(db: PrismaClient, userId: string, input: { meal: Meal; pricePaise: number }): Promise<void> {
  checkPrice(input.pricePaise);
  const price = paiseToDecimalString(input.pricePaise);
  await db.foodMealPrice.upsert({
    where: { userId_meal: { userId, meal: input.meal } },
    create: { userId, meal: input.meal, price },
    update: { price },
  });
}

// ───────────────────────── Entries ─────────────────────────

const toRow = (e: { id: string; meal: Meal; notes: string; amount: Prisma.Decimal; occurredAt: Date }): FoodEntryRow => ({
  id: e.id,
  meal: e.meal,
  notes: e.notes,
  amountPaise: paiseOf(e.amount),
  occurredAt: e.occurredAt.toISOString(),
});

/**
 * Saves a food entry. The amount is worked out here, from the saved prices, never taken from the browser:
 * the price set for the item under the chosen meal, else the meal's default price.
 * `requestId` makes a retried or double-clicked save create one entry only.
 */
export async function createFoodEntry(
  db: PrismaClient,
  userId: string,
  requestId: string,
  input: { meal: Meal; notes: string },
  at: Date = new Date(),
): Promise<{ entry: FoodEntryRow; duplicate: boolean }> {
  const dedupeKey = `food-entry:${requestId}`;
  const existing = await db.foodEntry.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } } });
  if (existing) return { entry: toRow(existing), duplicate: true };

  const pricing = await getFoodPricing(db, userId);
  const meal = pricing.meals[input.meal];
  const custom = new Map(meal.items.map((i) => [foodKey(i.name), i.pricePaise]));
  const { totalPaise } = priceNotes(input.notes, custom, meal.defaultPaise);

  try {
    const created = await db.foodEntry.create({
      data: { userId, meal: input.meal, notes: input.notes, amount: paiseToDecimalString(totalPaise), occurredAt: at, dedupeKey },
    });
    return { entry: toRow(created), duplicate: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await db.foodEntry.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } } });
      if (again) return { entry: toRow(again), duplicate: true };
    }
    throw error;
  }
}

export async function deleteFoodEntry(db: PrismaClient, userId: string, id: string): Promise<void> {
  const updated = await db.foodEntry.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (updated.count !== 1) throw new ExpenseError("That entry no longer exists.", "NOT_FOUND");
}

/** Entries from the first day of `fromMonth` to the last day of `toMonth` (inclusive, IST), oldest first. */
export async function listFoodEntries(db: PrismaClient, userId: string, fromMonth: string, toMonth: string): Promise<FoodEntriesData> {
  const months = monthsBetween(fromMonth, toMonth);
  if (months.length === 0) return { rows: [], totalPaise: 0, count: 0, months: [] };
  const first = monthBounds(months[0]!)!;
  const last = monthBounds(months.at(-1)!)!;
  const bounds = rangeToInstants(first.from, last.to);

  const rows = await db.foodEntry.findMany({
    where: { userId, deletedAt: null, occurredAt: bounds },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });
  const mapped = rows.map(toRow);
  return { rows: mapped, totalPaise: mapped.reduce((s, r) => s + r.amountPaise, 0), count: mapped.length, months };
}
