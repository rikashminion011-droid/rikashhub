/**
 * Food pricing. Pure functions, all money in integer paise.
 *
 * Notes can hold one item ("Fish Gravy") or several separated by commas, plus signs, slashes or new lines
 * ("Idli, Dosa"). Each item is priced on its own: the price set for it under the chosen meal if there is
 * one, otherwise the meal's default price. The entry's amount is the sum.
 */

export const MEALS = ["TIFFIN", "LUNCH", "DINNER"] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABEL: Record<Meal, string> = { TIFFIN: "Tiffin", LUNCH: "Lunch", DINNER: "Dinner" };

/** Default price of each meal, in paise: Tiffin ₹40, Lunch ₹50, Dinner ₹40. */
export const DEFAULT_MEAL_PRICE_PAISE: Record<Meal, number> = { TIFFIN: 4000, LUNCH: 5000, DINNER: 4000 };

export const MAX_NOTES_LENGTH = 200;
export const MAX_ITEM_NAME_LENGTH = 60;
export const MAX_PRICE_PAISE = 10_000_000; // ₹1,00,000

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}

/** Lower-cased, trimmed, single-spaced: the key two spellings of the same item share. */
export function foodKey(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Splits notes into the separate items typed ("Idli, Dosa" gives ["Idli", "Dosa"]). Empty parts are dropped. */
export function splitItems(notes: string): string[] {
  return notes
    .split(/[,+/;\n]+/)
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter((part) => part.length > 0);
}

export interface PricedItem {
  name: string;
  pricePaise: number;
  /** True when the price came from the customised list, false when the meal's default price was used. */
  custom: boolean;
}

export interface PriceResult {
  items: PricedItem[];
  totalPaise: number;
}

/**
 * Prices the notes of an entry. `customPrices` maps foodKey(name) to paise for the selected meal only.
 * Notes with no readable item (blank) are priced at zero.
 */
export function priceNotes(notes: string, customPrices: ReadonlyMap<string, number>, defaultPaise: number): PriceResult {
  const names = splitItems(notes);
  if (names.length === 0) return { items: [], totalPaise: 0 };

  // The whole text as one item first: an item whose own name contains a comma or slash still matches.
  const whole = notes.trim().replace(/\s+/g, " ");
  const wholePrice = customPrices.get(foodKey(whole));
  if (wholePrice !== undefined) return { items: [{ name: whole, pricePaise: wholePrice, custom: true }], totalPaise: wholePrice };

  const items = names.map((name): PricedItem => {
    const price = customPrices.get(foodKey(name));
    return price === undefined ? { name, pricePaise: defaultPaise, custom: false } : { name, pricePaise: price, custom: true };
  });
  return { items, totalPaise: items.reduce((sum, item) => sum + item.pricePaise, 0) };
}

export interface FoodInputErrors {
  meal?: string;
  notes?: string;
}

export function validateFoodEntry(input: { meal: unknown; notes: unknown }): { ok: true; meal: Meal; notes: string } | { ok: false; errors: FoodInputErrors } {
  const errors: FoodInputErrors = {};
  if (!isMeal(input.meal)) errors.meal = "Choose Tiffin, Lunch or Dinner.";
  const notes = typeof input.notes === "string" ? input.notes.trim().replace(/[ \t]+/g, " ") : "";
  if (notes.length === 0) errors.notes = "Enter what you had.";
  else if (notes.length > MAX_NOTES_LENGTH) errors.notes = `Keep notes under ${MAX_NOTES_LENGTH} characters.`;
  if (errors.meal || errors.notes) return { ok: false, errors };
  return { ok: true, meal: input.meal as Meal, notes };
}

/** Month keys ("2026-06") from `from` to `to` inclusive, oldest first. Swapped bounds are put in order. */
export function monthsBetween(from: string, to: string): string[] {
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!valid.test(from) || !valid.test(to)) return [];
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out: string[] = [];
  let y = Number(a.slice(0, 4));
  let m = Number(a.slice(5));
  const endY = Number(b.slice(0, 4));
  const endM = Number(b.slice(5));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 120) break;
  }
  return out;
}
