import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import {
  addFoodItem,
  createFoodEntry,
  deleteFoodEntry,
  deleteFoodItem,
  getFoodPricing,
  getFoodTotal,
  listFoodEntries,
  setMealPrice,
  updateFoodItem,
} from "@/features/food/server/service";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "33333333-3333-4333-8333-333333333333", email: "food-me@example.com", name: "Me" };
const OTHER = { id: "44444444-4444-4444-8444-444444444444", email: "food-other@example.com", name: "Other" };

let database: TestDatabase;
let db: TestDatabase["prisma"];
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  await ensureUserSetup(db, OTHER);
});
afterAll(async () => {
  await database.close();
});

describe("pricing", () => {
  it("starts with the default meal prices: Tiffin 40, Lunch 50, Dinner 40", async () => {
    const p = await getFoodPricing(db, ME.id);
    expect([p.meals.TIFFIN.defaultPaise, p.meals.LUNCH.defaultPaise, p.meals.DINNER.defaultPaise]).toEqual([4000, 5000, 4000]);
    expect(p.meals.LUNCH.items).toEqual([]);
  });

  it("adds, edits and deletes items per meal, and keeps each user's list private", async () => {
    const fish = await addFoodItem(db, ME.id, { meal: "LUNCH", name: "Fish Gravy", pricePaise: 6000 });
    await addFoodItem(db, ME.id, { meal: "LUNCH", name: "Chicken Gravy", pricePaise: 8000 });
    await addFoodItem(db, ME.id, { meal: "TIFFIN", name: "Idli", pricePaise: 4000 });
    // The same name may exist under another meal, but not twice in one meal (any case or spacing).
    await addFoodItem(db, ME.id, { meal: "DINNER", name: "Fish Gravy", pricePaise: 7000 });
    await expect(addFoodItem(db, ME.id, { meal: "LUNCH", name: "  fish   gravy ", pricePaise: 100 })).rejects.toMatchObject({ code: "CONFLICT" });

    await updateFoodItem(db, ME.id, { id: fish, name: "Fish Gravy", pricePaise: 6500 });
    let p = await getFoodPricing(db, ME.id);
    expect(p.meals.LUNCH.items.map((i) => [i.name, i.pricePaise])).toEqual([["Fish Gravy", 6500], ["Chicken Gravy", 8000]]);

    await deleteFoodItem(db, ME.id, fish);
    p = await getFoodPricing(db, ME.id);
    expect(p.meals.LUNCH.items.map((i) => i.name)).toEqual(["Chicken Gravy"]);
    // A deleted name can be added again.
    await addFoodItem(db, ME.id, { meal: "LUNCH", name: "Fish Gravy", pricePaise: 6000 });

    expect((await getFoodPricing(db, OTHER.id)).meals.LUNCH.items).toEqual([]);
    await expect(deleteFoodItem(db, OTHER.id, fish)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects bad names and prices", async () => {
    await expect(addFoodItem(db, ME.id, { meal: "LUNCH", name: "   ", pricePaise: 100 })).rejects.toThrow();
    await expect(addFoodItem(db, ME.id, { meal: "LUNCH", name: "x".repeat(61), pricePaise: 100 })).rejects.toThrow();
    await expect(addFoodItem(db, ME.id, { meal: "LUNCH", name: "Bad", pricePaise: -1 })).rejects.toThrow();
    await expect(setMealPrice(db, ME.id, { meal: "LUNCH", pricePaise: 1.5 })).rejects.toThrow();
  });
});

describe("food entries", () => {
  it("prices Lunch + Fish Gravy at the customised 60, not the default 50", async () => {
    const { entry } = await createFoodEntry(db, ME.id, rid(), { meal: "LUNCH", notes: "Fish Gravy" }, istInstant("2026-06-10", "13:05"));
    expect(entry).toMatchObject({ meal: "LUNCH", notes: "Fish Gravy", amountPaise: 6000, occurredAt: "2026-06-10T07:35:00.000Z" });
  });

  it("uses the meal's default price when the item has no price of its own", async () => {
    const lunch = await createFoodEntry(db, ME.id, rid(), { meal: "LUNCH", notes: "Curd rice" }, istInstant("2026-06-11", "13:00"));
    const dinner = await createFoodEntry(db, ME.id, rid(), { meal: "DINNER", notes: "Chapati" }, istInstant("2026-06-11", "20:00"));
    const tiffin = await createFoodEntry(db, ME.id, rid(), { meal: "TIFFIN", notes: "Idli" }, istInstant("2026-06-12", "08:00"));
    expect([lunch.entry.amountPaise, dinner.entry.amountPaise, tiffin.entry.amountPaise]).toEqual([5000, 4000, 4000]);
  });

  it("looks an item up under the chosen meal only (Fish Gravy is 70 at dinner, 60 at lunch)", async () => {
    const { entry } = await createFoodEntry(db, ME.id, rid(), { meal: "DINNER", notes: "fish gravy" }, istInstant("2026-06-12", "21:00"));
    expect(entry.amountPaise).toBe(7000);
  });

  it("a later price change does not rewrite saved entries", async () => {
    const { entry } = await createFoodEntry(db, ME.id, rid(), { meal: "TIFFIN", notes: "Idli" }, istInstant("2026-06-13", "08:00"));
    const idli = (await getFoodPricing(db, ME.id)).meals.TIFFIN.items.find((i) => i.name === "Idli")!;
    await updateFoodItem(db, ME.id, { id: idli.id, name: "Idli", pricePaise: 9900 });
    const data = await listFoodEntries(db, ME.id, "2026-06", "2026-06");
    expect(data.rows.find((r) => r.id === entry.id)!.amountPaise).toBe(4000);
    await setMealPrice(db, ME.id, { meal: "DINNER", pricePaise: 4500 });
    expect((await createFoodEntry(db, ME.id, rid(), { meal: "DINNER", notes: "Poori" }, istInstant("2026-06-14", "20:00"))).entry.amountPaise).toBe(4500);
  });

  it("the same request id never saves twice", async () => {
    const key = rid();
    const first = await createFoodEntry(db, ME.id, key, { meal: "LUNCH", notes: "Normal Lunch" }, istInstant("2026-07-01", "13:00"));
    const again = await createFoodEntry(db, ME.id, key, { meal: "LUNCH", notes: "Normal Lunch" }, istInstant("2026-07-01", "13:00"));
    expect(again.duplicate).toBe(true);
    expect(again.entry.id).toBe(first.entry.id);
    expect((await listFoodEntries(db, ME.id, "2026-07", "2026-07")).count).toBe(1);
  });
});

describe("listing", () => {
  it("filters by month range, includes month edges in IST, orders oldest first and totals", async () => {
    await createFoodEntry(db, ME.id, rid(), { meal: "TIFFIN", notes: "Edge A" }, istInstant("2026-08-01", "00:00"));
    await createFoodEntry(db, ME.id, rid(), { meal: "DINNER", notes: "Edge B" }, istInstant("2026-08-31", "23:59"));
    await createFoodEntry(db, ME.id, rid(), { meal: "TIFFIN", notes: "Next month" }, istInstant("2026-09-01", "00:00"));

    const august = await listFoodEntries(db, ME.id, "2026-08", "2026-08");
    expect(august.rows.map((r) => r.notes)).toEqual(["Edge A", "Edge B"]);
    expect(august.totalPaise).toBe(4000 + 4500);

    const span = await listFoodEntries(db, ME.id, "2026-09", "2026-06"); // swapped bounds
    expect(span.months).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(span.rows.map((r) => r.occurredAt)).toEqual([...span.rows.map((r) => r.occurredAt)].sort());
    expect(span.totalPaise).toBe(span.rows.reduce((s, r) => s + r.amountPaise, 0));
  });

  it("hides deleted entries and other users' entries", async () => {
    const { entry } = await createFoodEntry(db, ME.id, rid(), { meal: "LUNCH", notes: "To delete" }, istInstant("2026-10-05", "13:00"));
    await createFoodEntry(db, OTHER.id, rid(), { meal: "LUNCH", notes: "Theirs" }, istInstant("2026-10-05", "13:00"));
    await expect(deleteFoodEntry(db, OTHER.id, entry.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await deleteFoodEntry(db, ME.id, entry.id);
    expect((await listFoodEntries(db, ME.id, "2026-10", "2026-10")).rows).toEqual([]);
    expect((await listFoodEntries(db, OTHER.id, "2026-10", "2026-10")).rows.map((r) => r.notes)).toEqual(["Theirs"]);
  });
});

describe("an amount typed by hand, and the total for a period", () => {
  it("saves the amount you typed instead of the calculated price", async () => {
    const { entry } = await createFoodEntry(db, ME.id, rid(), { meal: "LUNCH", notes: "Fish Gravy", amountPaise: 7500 }, istInstant("2026-08-02", "13:00"));
    expect(entry.amountPaise).toBe(7500);
    await expect(createFoodEntry(db, ME.id, rid(), { meal: "LUNCH", notes: "Fish Gravy", amountPaise: -5 })).rejects.toThrow();
    await expect(createFoodEntry(db, ME.id, rid(), { meal: "LUNCH", notes: "Fish Gravy", amountPaise: 99_999_999_99 })).rejects.toThrow();
  });

  it("adds up what was spent between two days, in India time, for this user only", async () => {
    await createFoodEntry(db, ME.id, rid(), { meal: "TIFFIN", notes: "Idli", amountPaise: 3000 }, istInstant("2026-09-10", "00:30"));
    await createFoodEntry(db, ME.id, rid(), { meal: "DINNER", notes: "Chapati", amountPaise: 4000 }, istInstant("2026-09-10", "23:50"));
    await createFoodEntry(db, ME.id, rid(), { meal: "DINNER", notes: "Chapati", amountPaise: 4000 }, istInstant("2026-09-11", "00:10"));
    await createFoodEntry(db, OTHER.id, rid(), { meal: "DINNER", notes: "Chapati", amountPaise: 9999 }, istInstant("2026-09-10", "12:00"));
    expect(await getFoodTotal(db, ME.id, "2026-09-10", "2026-09-10")).toEqual({ totalPaise: 7000, count: 2 });
    expect(await getFoodTotal(db, ME.id, "2026-09-10", "2026-09-11")).toEqual({ totalPaise: 11000, count: 3 });
    expect(await getFoodTotal(db, ME.id, "2026-09-11", "2026-09-10")).toEqual({ totalPaise: 11000, count: 3 });
    expect(await getFoodTotal(db, ME.id, "2025-01-01", "2025-01-02")).toEqual({ totalPaise: 0, count: 0 });
  });
});
