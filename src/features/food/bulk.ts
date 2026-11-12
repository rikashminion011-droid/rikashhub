import { isValidTime, istInstant } from "@/features/quick-pay/datetime";
import { MAX_NOTES_LENGTH, isMeal, type Meal } from "./pricing";

/** Add Bulk for food: one row per meal, each with its own date and time. Pure validation, no database. */

export const MAX_FOOD_BULK_ROWS = 500;

export interface FoodBulkRowInput {
  key: string;
  /** YYYY-MM-DD, in IST. */
  date: string;
  /** HH:mm, in IST. */
  time: string;
  meal: string;
  notes: string;
}

export interface FoodBulkRowErrors {
  date?: string;
  time?: string;
  meal?: string;
  notes?: string;
}

export interface ValidFoodBulkRow {
  key: string;
  meal: Meal;
  notes: string;
  occurredAt: Date;
}

/** A row with no notes is an unused row and is skipped (the date, time and meal are always pre-filled). */
export const isBlankFoodBulkRow = (row: FoodBulkRowInput) => row.notes.trim() === "";

export function validateFoodBulkRow(row: FoodBulkRowInput, now: Date): { ok: true; value: ValidFoodBulkRow } | { ok: false; errors: FoodBulkRowErrors } {
  const errors: FoodBulkRowErrors = {};

  if (!isMeal(row.meal)) errors.meal = "Choose a meal.";

  const notes = row.notes.trim().replace(/[ \t]+/g, " ");
  if (notes.length === 0) errors.notes = "Enter what you had.";
  else if (notes.length > MAX_NOTES_LENGTH) errors.notes = `At most ${MAX_NOTES_LENGTH} characters.`;

  let occurredAt: Date | null = null;
  if (!isValidTime(row.time)) errors.time = "Choose a time.";
  try {
    occurredAt = istInstant(row.date, isValidTime(row.time) ? row.time : "00:00");
  } catch {
    errors.date = "Choose a valid date.";
  }
  if (!errors.date && !errors.time && occurredAt && occurredAt.getTime() > now.getTime() + 5 * 60_000) {
    errors.date = "The date and time cannot be in the future.";
  }

  if (Object.keys(errors).length > 0 || !occurredAt) return { ok: false, errors };
  return { ok: true, value: { key: row.key, meal: row.meal as Meal, notes, occurredAt } };
}

/** Validates the whole sheet. Blank rows are skipped; every other row must be valid or nothing is saved. */
export function validateFoodBulk(
  rows: readonly FoodBulkRowInput[],
  now: Date,
): { ok: true; rows: ValidFoodBulkRow[] } | { ok: false; errors: Record<string, FoodBulkRowErrors>; message: string } {
  const filled = rows.filter((r) => !isBlankFoodBulkRow(r));
  if (filled.length === 0) return { ok: false, errors: {}, message: "Add at least one row with notes." };
  if (filled.length > MAX_FOOD_BULK_ROWS) return { ok: false, errors: {}, message: `Save at most ${MAX_FOOD_BULK_ROWS} rows at a time.` };

  const errors: Record<string, FoodBulkRowErrors> = {};
  const valid: ValidFoodBulkRow[] = [];
  for (const row of filled) {
    const result = validateFoodBulkRow(row, now);
    if (result.ok) valid.push(result.value);
    else errors[row.key] = result.errors;
  }
  const bad = Object.keys(errors).length;
  if (bad > 0) return { ok: false, errors, message: `${bad} row${bad === 1 ? " needs" : "s need"} fixing before anything is saved.` };
  return { ok: true, rows: valid };
}
