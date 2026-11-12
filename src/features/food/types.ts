import type { Meal } from "./pricing";

export interface FoodItemRow {
  id: string;
  name: string;
  pricePaise: number;
}

/** What the Food Entry form and the settings page need: each meal's default price and its priced items. */
export interface FoodPricing {
  meals: Record<Meal, { defaultPaise: number; items: FoodItemRow[] }>;
}

export interface FoodEntryRow {
  id: string;
  meal: Meal;
  notes: string;
  amountPaise: number;
  /** ISO instant. */
  occurredAt: string;
}

export interface FoodEntriesData {
  rows: FoodEntryRow[];
  totalPaise: number;
  count: number;
  /** The months covered, "2026-06" form, oldest first. */
  months: string[];
}

export type FoodResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
