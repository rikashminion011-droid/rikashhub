"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { monthBounds } from "@/features/quick-pay/datetime";
import { parseOpeningBalance } from "@/features/quick-pay/validation";
import { RateLimiter } from "@/lib/security/rate-limit";
import { MAX_FOOD_BULK_ROWS, validateFoodBulk, type FoodBulkRowErrors, type FoodBulkRowInput } from "./bulk";
import { MEALS, isMeal, validateFoodEntry, type Meal } from "./pricing";
import {
  addFoodItem,
  createFoodBulk,
  createFoodEntry,
  deleteFoodEntry,
  deleteFoodItem,
  getFoodPricing,
  getFoodTotal,
  listFoodEntries,
  listFoodEntriesRange,
  listRecentFood,
  setMealPrice,
  updateFoodEntry,
  updateFoodItem,
} from "./server/service";
import type { FoodEntriesData, FoodEntryRow, FoodPricing, FoodResult } from "./types";

const GENERIC_ERROR = "Something went wrong. Nothing was saved. Please try again.";
const writeLimiter = new RateLimiter(120, 60_000);

async function context() {
  const user = await requireUser();
  if (!writeLimiter.check(user.id).allowed) throw new ExpenseError("You are doing that too quickly. Wait a moment and try again.");
  const db = getPrisma();
  await ensureUserSetup(db, user);
  return { user, db };
}

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof ExpenseError) return { ok: false, error: error.message };
  // Let sign-in redirects from requireUser() through.
  if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[food] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => {
  revalidatePath("/food", "layout");
};

const id = z.uuid();
const meal = z.enum(MEALS as unknown as [Meal, ...Meal[]]);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** A price typed by hand ("60", "₹60.50") as paise. Prices cannot be negative. */
function priceToPaise(text: string): number | null {
  const paise = parseOpeningBalance(text);
  return paise === null || paise < 0 ? null : paise;
}

export async function getFoodPricingAction(): Promise<FoodResult<{ pricing: FoodPricing }>> {
  try {
    const { user, db } = await context();
    return { ok: true, pricing: await getFoodPricing(db, user.id) };
  } catch (error) {
    return failure(error, "load pricing");
  }
}

export async function saveFoodEntryAction(raw: unknown): Promise<FoodResult<{ entry: FoodEntryRow; duplicate: boolean }>> {
  try {
    const parsed = z.object({ requestId: id, meal: z.string(), notes: z.string().max(2000), amount: z.string().max(20).optional() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That entry could not be read." };
    const checked = validateFoodEntry(parsed.data);
    if (!checked.ok) return { ok: false, error: Object.values(checked.errors)[0] ?? "Check the entry.", fieldErrors: checked.errors as Record<string, string> };

    let amountPaise: number | undefined;
    if (parsed.data.amount !== undefined && parsed.data.amount.trim() !== "") {
      const typed = priceToPaise(parsed.data.amount);
      if (typed === null) return { ok: false, error: "Enter the amount like 60 or 60.50.", fieldErrors: { amount: "Invalid amount" } };
      amountPaise = typed;
    }

    const { user, db } = await context();
    const saved = await createFoodEntry(db, user.id, parsed.data.requestId, { meal: checked.meal, notes: checked.notes, amountPaise });
    refresh();
    return { ok: true, ...saved };
  } catch (error) {
    return failure(error, "save entry");
  }
}

const bulkSchema = z.object({
  requestId: id,
  rows: z
    .array(z.object({ key: z.string().max(64), date: z.string().max(10), time: z.string().max(5), meal: z.string().max(10), notes: z.string().max(2000) }))
    .max(MAX_FOOD_BULK_ROWS * 2),
  /** Saved meals whose text was changed in the sheet. */
  updates: z.array(z.object({ id, meal: z.string().max(10), notes: z.string().max(2000) })).max(MAX_FOOD_BULK_ROWS * 2).default([]),
  /** Saved meals whose box was cleared. */
  deletes: z.array(id).max(MAX_FOOD_BULK_ROWS * 2).default([]),
});

export async function saveFoodBulkAction(
  raw: unknown,
): Promise<FoodResult<{ count: number; duplicate: boolean; totalPaise: number }> | { ok: false; error: string; rowErrors: Record<string, FoodBulkRowErrors> }> {
  try {
    const parsed = bulkSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That sheet could not be read. Reload the page and try again." };
    const { updates, deletes } = parsed.data;
    const creates = parsed.data.rows.length > 0 ? validateFoodBulk(parsed.data.rows as FoodBulkRowInput[], new Date()) : ({ ok: true, rows: [] } as const);
    if (!creates.ok) return { ok: false, error: creates.message, rowErrors: creates.errors };
    for (const u of updates) {
      const checked = validateFoodEntry({ meal: u.meal, notes: u.notes });
      if (!checked.ok) return { ok: false, error: Object.values(checked.errors)[0] ?? "Check the entry.", rowErrors: {} };
    }
    if (creates.rows.length + updates.length + deletes.length === 0) return { ok: false, error: "Nothing was changed.", rowErrors: {} };

    const { user, db } = await context();
    const saved = creates.rows.length > 0 ? await createFoodBulk(db, user.id, parsed.data.requestId, creates.rows) : { count: 0, duplicate: false, totalPaise: 0 };
    // Changes to meals that were already saved: the text is changed, or the meal is removed when its box was cleared.
    for (const u of updates) await updateFoodEntry(db, user.id, { id: u.id, meal: u.meal as Meal, notes: u.notes.trim() });
    for (const d of deletes) await deleteFoodEntry(db, user.id, d);
    refresh();
    return { ok: true, ...saved, count: saved.count + updates.length + deletes.length };
  } catch (error) {
    return failure(error, "save bulk");
  }
}

/** The saved meals of one month, for Add Bulk to show what is already there. */
export async function getFoodMonthAction(raw: unknown): Promise<FoodResult<{ entries: FoodEntryRow[] }>> {
  try {
    const parsed = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Choose a month." };
    const user = await requireUser();
    const bounds = monthBounds(parsed.data.month);
    if (!bounds) return { ok: false, error: "Choose a month." };
    const data = await listFoodEntriesRange(getPrisma(), user.id, bounds.from, bounds.to);
    return { ok: true, entries: data.rows };
  } catch (error) {
    return failure(error, "month entries");
  }
}

/** Changes the meal, notes or amount of a saved entry. Its date and time stay as they were. */
export async function updateFoodEntryAction(raw: unknown): Promise<FoodResult<{ entry: FoodEntryRow }>> {
  try {
    const parsed = z.object({ id, meal: z.string(), notes: z.string().max(2000), amount: z.string().max(20).optional() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That change could not be read." };
    const checked = validateFoodEntry(parsed.data);
    if (!checked.ok) return { ok: false, error: Object.values(checked.errors)[0] ?? "Check the entry.", fieldErrors: checked.errors as Record<string, string> };
    let amountPaise: number | undefined;
    if (parsed.data.amount !== undefined && parsed.data.amount.trim() !== "") {
      const typed = priceToPaise(parsed.data.amount);
      if (typed === null) return { ok: false, error: "Enter the amount like 60 or 60.50.", fieldErrors: { amount: "Invalid amount" } };
      amountPaise = typed;
    }
    const { user, db } = await context();
    const entry = await updateFoodEntry(db, user.id, { id: parsed.data.id, meal: checked.meal, notes: checked.notes, amountPaise });
    refresh();
    return { ok: true, entry };
  } catch (error) {
    return failure(error, "update entry");
  }
}

/** The latest entries of one meal, for the Recent list in Food Entry. */
export async function getRecentFoodAction(raw: unknown): Promise<FoodResult<{ entries: FoodEntryRow[] }>> {
  try {
    const parsed = z.object({ meal: z.string() }).safeParse(raw);
    if (!parsed.success || !isMeal(parsed.data.meal)) return { ok: false, error: "Choose Tiffin, Lunch or Dinner." };
    const user = await requireUser();
    return { ok: true, entries: await listRecentFood(getPrisma(), user.id, parsed.data.meal, 6) };
  } catch (error) {
    return failure(error, "recent entries");
  }
}

export async function deleteFoodEntryAction(raw: unknown): Promise<FoodResult> {
  try {
    const parsed = z.object({ id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That entry could not be read." };
    const { user, db } = await context();
    await deleteFoodEntry(db, user.id, parsed.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete entry");
  }
}

export async function listFoodEntriesAction(raw: unknown): Promise<FoodResult<{ data: FoodEntriesData }>> {
  try {
    const parsed = z.object({ from: month, to: month }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Choose a valid month." };
    const user = await requireUser();
    return { ok: true, data: await listFoodEntries(getPrisma(), user.id, parsed.data.from, parsed.data.to) };
  } catch (error) {
    return failure(error, "list entries");
  }
}

/** Total food expenses between two days, for the Food Rent tab. */
export async function getFoodTotalAction(raw: unknown): Promise<FoodResult<{ totalPaise: number; count: number }>> {
  try {
    const parsed = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Choose a valid period." };
    const user = await requireUser();
    return { ok: true, ...(await getFoodTotal(getPrisma(), user.id, parsed.data.from, parsed.data.to)) };
  } catch (error) {
    return failure(error, "food total");
  }
}

type PricingResult = FoodResult<{ pricing: FoodPricing }>;

export async function addFoodItemAction(raw: unknown): Promise<PricingResult> {
  try {
    const parsed = z.object({ meal, name: z.string().max(200), price: z.string().max(20) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That item could not be read." };
    const pricePaise = priceToPaise(parsed.data.price);
    if (pricePaise === null) return { ok: false, error: "Enter a price like 60 or 60.50.", fieldErrors: { price: "Invalid price" } };
    const { user, db } = await context();
    await addFoodItem(db, user.id, { meal: parsed.data.meal, name: parsed.data.name, pricePaise });
    refresh();
    return { ok: true, pricing: await getFoodPricing(db, user.id) };
  } catch (error) {
    return failure(error, "add item");
  }
}

export async function updateFoodItemAction(raw: unknown): Promise<PricingResult> {
  try {
    const parsed = z.object({ id, name: z.string().max(200), price: z.string().max(20) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That item could not be read." };
    const pricePaise = priceToPaise(parsed.data.price);
    if (pricePaise === null) return { ok: false, error: "Enter a price like 60 or 60.50.", fieldErrors: { price: "Invalid price" } };
    const { user, db } = await context();
    await updateFoodItem(db, user.id, { id: parsed.data.id, name: parsed.data.name, pricePaise });
    refresh();
    return { ok: true, pricing: await getFoodPricing(db, user.id) };
  } catch (error) {
    return failure(error, "update item");
  }
}

export async function deleteFoodItemAction(raw: unknown): Promise<PricingResult> {
  try {
    const parsed = z.object({ id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That item could not be read." };
    const { user, db } = await context();
    await deleteFoodItem(db, user.id, parsed.data.id);
    refresh();
    return { ok: true, pricing: await getFoodPricing(db, user.id) };
  } catch (error) {
    return failure(error, "delete item");
  }
}

export async function setMealPriceAction(raw: unknown): Promise<PricingResult> {
  try {
    const parsed = z.object({ meal, price: z.string().max(20) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That price could not be read." };
    const pricePaise = priceToPaise(parsed.data.price);
    if (pricePaise === null) return { ok: false, error: "Enter a price like 50 or 50.50.", fieldErrors: { price: "Invalid price" } };
    const { user, db } = await context();
    await setMealPrice(db, user.id, { meal: parsed.data.meal, pricePaise });
    refresh();
    return { ok: true, pricing: await getFoodPricing(db, user.id) };
  } catch (error) {
    return failure(error, "set meal price");
  }
}

export interface FoodGridActions {
  updateEntry: typeof updateFoodEntryAction;
  deleteEntry: typeof deleteFoodEntryAction;
}

export interface FoodActions {
  getPricing: typeof getFoodPricingAction;
  saveEntry: typeof saveFoodEntryAction;
  getTotal: typeof getFoodTotalAction;
  getRecent: typeof getRecentFoodAction;
}
