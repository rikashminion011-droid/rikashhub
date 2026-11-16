import { istDateOf } from "@/features/quick-pay/datetime";
import { MEALS, isNilNotes, type Meal } from "./pricing";
import type { FoodEntryRow } from "./types";

/**
 * The Monthly Food Tracking / Food Rent table: one row per day with a column for each meal (Date | Tiffin | Lunch | Dinner |
 * Total), and the Meal Records count. Pure functions on plain data.
 */

export interface GridEntry {
  id: string;
  meal: Meal;
  notes: string;
  amountPaise: number;
  /** A meal that was not eaten. It shows as Nil and adds nothing to the total. */
  nil: boolean;
  /** ISO instant. */
  occurredAt: string;
}

export interface GridDay {
  /** YYYY-MM-DD in India time. */
  date: string;
  cells: Record<Meal, GridEntry[]>;
  /** The day's total. Nil entries are zero, so they add nothing. */
  totalPaise: number;
}

export function buildGrid(rows: readonly FoodEntryRow[], order: "asc" | "desc" = "asc"): GridDay[] {
  const days = new Map<string, GridDay>();
  for (const row of rows) {
    const date = istDateOf(new Date(row.occurredAt));
    const day = days.get(date) ?? { date, cells: { TIFFIN: [], LUNCH: [], DINNER: [] }, totalPaise: 0 };
    const nil = isNilNotes(row.notes);
    day.cells[row.meal].push({ id: row.id, meal: row.meal, notes: row.notes, amountPaise: nil ? 0 : row.amountPaise, nil, occurredAt: row.occurredAt });
    day.totalPaise += nil ? 0 : row.amountPaise;
    days.set(date, day);
  }
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of list) for (const meal of MEALS) day.cells[meal].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return order === "desc" ? list.reverse() : list;
}

const isSunday = (date: string) => new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;

/** Every date from `from` to `to` (inclusive, YYYY-MM-DD), oldest first. Reversed bounds are put in order. */
export function datesBetween(from: string, to: string): string[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out: string[] = [];
  for (let t = Date.parse(`${a}T00:00:00.000Z`); t <= Date.parse(`${b}T00:00:00.000Z`) && out.length < 800; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export interface MealRecords {
  /** Meals expected: three on each day of the period that is not a Sunday. */
  expected: number;
  /** Meals recorded with food (a meal counted once however many entries it has). Nil is not counted here. */
  recorded: number;
  /** Meals recorded as Nil. */
  nil: number;
  /** Expected meals with no record at all. */
  missing: number;
}

/**
 * The Meal Records summary. Three meals a day are expected on every day of the period except Sundays. A meal slot (a day and a
 * meal) that has food counts as recorded; one that is only Nil counts as Nil and is not a completed record.
 */
export function mealRecords(from: string, to: string, rows: readonly FoodEntryRow[]): MealRecords {
  const days = datesBetween(from, to).filter((d) => !isSunday(d));
  const expected = days.length * MEALS.length;
  const wanted = new Set(days);
  const slots = new Map<string, { food: boolean; nil: boolean }>();
  for (const row of rows) {
    const date = istDateOf(new Date(row.occurredAt));
    if (!wanted.has(date)) continue;
    const key = `${date}|${row.meal}`;
    const slot = slots.get(key) ?? { food: false, nil: false };
    if (isNilNotes(row.notes)) slot.nil = true;
    else slot.food = true;
    slots.set(key, slot);
  }
  let recorded = 0;
  let nil = 0;
  for (const slot of slots.values()) {
    if (slot.food) recorded++;
    else if (slot.nil) nil++;
  }
  return { expected, recorded, nil, missing: Math.max(0, expected - recorded - nil) };
}

/** Rupees without ".00": 40 gives "₹40", 40.5 gives "₹40.50". Large amounts use Indian grouping (₹1,25,000). */
export function formatRupeesPlain(paise: number): string {
  const whole = paise % 100 === 0;
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
