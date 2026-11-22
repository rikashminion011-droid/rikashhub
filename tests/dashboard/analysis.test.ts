import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { debtAnalysis, filtersFromParams, foodAnalysis, NO_FILTERS, portalAnalysis, shoppingAnalysis } from "@/features/dashboard/analysis";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { listRecentFood } from "@/features/food/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { createPurchase, listPlatforms } from "@/features/shopping/server/service";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "66666666-6666-4666-8666-666666666661", email: "dash@example.com", name: "Dash" };
let database: TestDatabase;
let db: TestDatabase["prisma"];
const range = { from: "2026-11-01", to: "2026-11-30" };
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n + 9000).padStart(12, "0")}`;

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
}, 60_000);
afterAll(async () => database?.close());

describe("dashboard analysis filters", () => {
  it("reads filters from the address and drops bad values", () => {
    const f = filtersFromParams({ aq: " tea ", ameal: "LUNCH,BREAKFAST", abank: "nope,00000000-0000-4000-8000-000000000001", akind: "CREDIT" });
    expect(f.q).toBe("tea");
    expect(f.meals).toEqual(["LUNCH"]);
    expect(f.banks).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(f.kind).toBe("CREDIT");
  });

  it("food: the chosen meals and the search narrow the bars", async () => {
    await db.foodEntry.createMany({
      data: [
        { userId: ME.id, meal: "TIFFIN", notes: "Idli", amount: "40.00", occurredAt: istInstant("2026-11-03", "09:00"), dedupeKey: "d1" },
        { userId: ME.id, meal: "LUNCH", notes: "Rice and fish", amount: "60.00", occurredAt: istInstant("2026-11-03", "13:00"), dedupeKey: "d2" },
        { userId: ME.id, meal: "LUNCH", notes: "Nil", amount: "0.00", occurredAt: istInstant("2026-11-04", "13:00"), dedupeKey: "d3" },
      ],
    });
    const all = await foodAnalysis(db, ME.id, range);
    expect(all.groups[0]!.bars.map((b) => b.label).sort()).toEqual(["Lunch", "Tiffin"]);
    const lunch = await foodAnalysis(db, ME.id, range, { ...NO_FILTERS, meals: ["LUNCH"] });
    expect(lunch.groups[0]!.bars.map((b) => [b.label, b.valuePaise])).toEqual([["Lunch", 6000]]);
    const fish = await foodAnalysis(db, ME.id, range, { ...NO_FILTERS, q: "fish" });
    expect(fish.groups[0]!.bars.map((b) => b.label)).toEqual(["Lunch"]);
  });

  it("food: recent entries leave Nil out", async () => {
    const recent = await listRecentFood(db, ME.id, "LUNCH", 6);
    expect(recent.map((r) => r.notes)).toEqual(["Rice and fish"]);
  });

  it("shopping: by platform, narrowed by platform and search", async () => {
    const platforms = await listPlatforms(db, ME.id);
    await createPurchase(db, ME.id, rid(), { platformId: platforms[0]!.id, occurredAt: istInstant("2026-11-05", "10:00"), reason: "Groceries", amountPaise: 30000, recipientIds: [] });
    await createPurchase(db, ME.id, rid(), { platformId: platforms[1]!.id, occurredAt: istInstant("2026-11-06", "10:00"), reason: "Fruit", amountPaise: 12000, recipientIds: [] });
    expect((await shoppingAnalysis(db, ME.id, range)).groups[0]!.bars).toHaveLength(2);
    expect((await shoppingAnalysis(db, ME.id, range, { ...NO_FILTERS, platforms: [platforms[1]!.id] })).groups[0]!.bars.map((b) => b.valuePaise)).toEqual([12000]);
    expect((await shoppingAnalysis(db, ME.id, range, { ...NO_FILTERS, q: "grocer" })).groups[0]!.bars.map((b) => b.valuePaise)).toEqual([30000]);
  });

  it("debt and credit portal: filtered by the chosen names", () => {
    const people = [
      { partyId: "a", name: "Mukesh", totalDebtPaise: 1000, paidPaise: 0, remainingPaise: 1000 },
      { partyId: "b", name: "Dhanush", totalDebtPaise: 500, paidPaise: 100, remainingPaise: 400 },
    ];
    expect(debtAnalysis(people, "", { ...NO_FILTERS, recipients: ["b"] }).groups[0]!.bars.map((b) => b.label)).toEqual(["Dhanush"]);
    expect(debtAnalysis(people, "", { ...NO_FILTERS, q: "muk" }).groups[0]!.bars.map((b) => b.label)).toEqual(["Mukesh"]);
    const portals = [{ id: "p1", name: "HDFC", totalPaise: 7600000, usedPaise: 6875700, cardInfoSaved: true }, { id: "p2", name: "Slice", totalPaise: 100000, usedPaise: 1000, cardInfoSaved: true }];
    expect(portalAnalysis(portals, { ...NO_FILTERS, portals: ["p2"] }).groups[0]!.bars.map((b) => b.label)).toEqual(["Slice"]);
  });
});
