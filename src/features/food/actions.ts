"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { parseOpeningBalance } from "@/features/quick-pay/validation";
import { RateLimiter } from "@/lib/security/rate-limit";
import { MEALS, validateFoodEntry, type Meal } from "./pricing";
import {
  addFoodItem,
  createFoodEntry,
  deleteFoodEntry,
  deleteFoodItem,
  getFoodPricing,
  listFoodEntries,
  setMealPrice,
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

const refresh = () => revalidatePath("/food", "layout");

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
    const parsed = z.object({ requestId: id, meal: z.string(), notes: z.string().max(2000) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That entry could not be read." };
    const checked = validateFoodEntry(parsed.data);
    if (!checked.ok) return { ok: false, error: Object.values(checked.errors)[0] ?? "Check the entry.", fieldErrors: checked.errors as Record<string, string> };

    const { user, db } = await context();
    const saved = await createFoodEntry(db, user.id, parsed.data.requestId, { meal: checked.meal, notes: checked.notes });
    refresh();
    return { ok: true, ...saved };
  } catch (error) {
    return failure(error, "save entry");
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

export interface FoodActions {
  getPricing: typeof getFoodPricingAction;
  saveEntry: typeof saveFoodEntryAction;
}
