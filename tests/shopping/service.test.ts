import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import {
  addPlatform,
  createFromQuickEntry,
  createPurchase,
  deletePurchase,
  getImage,
  getPurchase,
  listPlatforms,
  listPurchases,
  removePlatform,
  renamePlatform,
  saveItems,
  setImage,
  shoppingByRecipient,
  updatePurchase,
} from "@/features/shopping/server/service";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "77777777-7777-4777-8777-777777777777", email: "shop-me@example.com", name: "Me" };
const OTHER = { id: "88888888-8888-4888-8888-888888888888", email: "shop-other@example.com", name: "Other" };

let database: TestDatabase;
let db: TestDatabase["prisma"];
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n + 7000).padStart(12, "0")}`;
let dmart = "";
let ab = "";
let a = "";
let b = "";

const input = (platformId: string, date: string, time: string, amountPaise: number, over: object = {}) => ({ platformId, occurredAt: istInstant(date, time), reason: "Groceries", amountPaise, recipientIds: [] as string[], ...over });
const png = new Uint8Array([137, 80, 78, 71]) as Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  await ensureUserSetup(db, OTHER);
  const parties = await db.expenseParty.findMany({ where: { userId: ME.id }, orderBy: { createdAt: "asc" } });
  a = parties[0]!.id;
  b = parties[1]!.id;
  const platforms = await listPlatforms(db, ME.id);
  dmart = platforms.find((p) => p.name === "D Mart")!.id;
  ab = platforms.find((p) => p.name === "AB Supermarket")!.id;
}, 60_000);
afterAll(async () => database?.close());

describe("platforms", () => {
  it("starts with D Mart and AB Supermarket, and refuses a duplicate name", async () => {
    expect((await listPlatforms(db, ME.id)).map((p) => p.name)).toEqual(["D Mart", "AB Supermarket"]);
    await expect(addPlatform(db, ME.id, " d  mart ")).rejects.toThrow(/already exists/);
  });
  it("adds, renames and hides a platform; other users are unaffected", async () => {
    const id = await addPlatform(db, ME.id, "Reliance");
    await renamePlatform(db, ME.id, id, "Reliance Fresh");
    expect((await listPlatforms(db, ME.id)).map((p) => p.name)).toContain("Reliance Fresh");
    await removePlatform(db, ME.id, id);
    expect((await listPlatforms(db, ME.id)).map((p) => p.name)).not.toContain("Reliance Fresh");
    expect((await listPlatforms(db, OTHER.id)).map((p) => p.name)).toEqual(["D Mart", "AB Supermarket"]);
    await expect(removePlatform(db, OTHER.id, dmart)).rejects.toThrow(/no longer exists/);
  });
});

describe("purchases", () => {
  it("numbers purchases by platform in date order, and renumbers when an older one is added", async () => {
    const k1 = await createPurchase(db, ME.id, rid(), input(dmart, "2026-11-10", "10:00", 10000));
    const k2 = await createPurchase(db, ME.id, rid(), input(dmart, "2026-11-12", "10:00", 20000));
    let list = await listPurchases(db, ME.id, { platformId: dmart, from: null, to: null, pendingOnly: false });
    expect(list.rows.map((r) => [r.platformName, r.number])).toEqual([["D Mart", 1], ["D Mart", 2]]);
    await createPurchase(db, ME.id, rid(), input(dmart, "2026-11-01", "09:00", 5000));
    list = await listPurchases(db, ME.id, { platformId: dmart, from: null, to: null, pendingOnly: false });
    expect(list.rows.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(list.rows.find((r) => r.id === k1.id)!.number).toBe(2);
    expect(list.rows.find((r) => r.id === k2.id)!.number).toBe(3);
    expect(list.totalPaise).toBe(35000);
  });

  it("does not create the same purchase twice for one request key", async () => {
    const key = rid();
    const first = await createPurchase(db, ME.id, key, input(ab, "2026-11-05", "12:00", 7000));
    const again = await createPurchase(db, ME.id, key, input(ab, "2026-11-05", "12:00", 7000));
    expect(again).toEqual({ id: first.id, duplicate: true });
  });

  it("filters by period and shows only pending ones when asked", async () => {
    const nov = await listPurchases(db, ME.id, { platformId: null, from: "2026-11-10", to: "2026-11-30", pendingOnly: false });
    expect(nov.rows.every((r) => r.occurredAt >= istInstant("2026-11-10", "00:00").toISOString())).toBe(true);
    const pending = await listPurchases(db, ME.id, { platformId: null, from: null, to: null, pendingOnly: true });
    expect(pending.rows.length).toBe(pending.pendingCount);
    expect(pending.rows.every((r) => r.pending)).toBe(true);
  });

  it("validates input and ignores another user's data", async () => {
    await expect(createPurchase(db, ME.id, rid(), input(dmart, "2026-11-05", "12:00", 0))).rejects.toThrow(/above zero/);
    await expect(createPurchase(db, ME.id, rid(), input(dmart, "2026-11-05", "12:00", 100, { reason: " " }))).rejects.toThrow(/reason/);
    await expect(createPurchase(db, OTHER.id, rid(), input(dmart, "2026-11-05", "12:00", 100))).rejects.toThrow(/no longer exists/);
    await expect(createPurchase(db, ME.id, rid(), input(dmart, "2026-11-05", "12:00", 100, { recipientIds: [rid()] }))).rejects.toThrow(/no longer exists/);
  });

  it("stays pending until image, recipients and items are all saved", async () => {
    const { id } = await createPurchase(db, ME.id, rid(), input(dmart, "2026-11-14", "10:00", 40000, { recipientIds: [a] }));
    expect((await getPurchase(db, ME.id, id))!.pending).toBe(true);
    await setImage(db, ME.id, id, png, "image/png");
    expect((await getPurchase(db, ME.id, id))!.pending).toBe(true);
    await saveItems(db, ME.id, id, [{ name: "Rice", quantity: 2, ratePaise: 15000, recipientIds: [a] }]);
    expect((await getPurchase(db, ME.id, id))!.pending).toBe(false);
    expect((await getImage(db, ME.id, id))!.type).toBe("image/png");
    expect(await getImage(db, OTHER.id, id)).toBeNull();
    await expect(setImage(db, ME.id, id, png, "text/html")).rejects.toThrow(/JPG, PNG or WebP/);
  });

  it("edits and deletes a purchase", async () => {
    const { id } = await createPurchase(db, ME.id, rid(), input(ab, "2026-11-06", "12:00", 1000));
    await updatePurchase(db, ME.id, id, input(dmart, "2026-11-06", "12:00", 2000, { reason: "Edited" }));
    const row = (await getPurchase(db, ME.id, id))!;
    expect([row.platformName, row.reason, row.amountPaise]).toEqual(["D Mart", "Edited", 2000]);
    await deletePurchase(db, ME.id, id);
    expect(await getPurchase(db, ME.id, id)).toBeNull();
    await expect(deletePurchase(db, ME.id, id)).rejects.toThrow(/no longer exists/);
  });
});

describe("item table", () => {
  it("totals each row as quantity x rate, ignores blank rows and replaces earlier rows", async () => {
    const { id } = await createPurchase(db, ME.id, rid(), input(dmart, "2026-11-15", "10:00", 100000));
    const saved = await saveItems(db, ME.id, id, [
      { name: "Rice", quantity: 2.5, ratePaise: 6000, recipientIds: [a] },
      { name: "", quantity: 0, ratePaise: 0, recipientIds: [] },
      { name: "Oil", quantity: 1, ratePaise: 12050, recipientIds: [a, b] },
    ]);
    expect(saved).toEqual({ count: 2, totalPaise: 15000 + 12050 });
    expect((await getPurchase(db, ME.id, id))!.items.map((i) => [i.name, i.quantity, i.totalPaise])).toEqual([["Rice", 2.5, 15000], ["Oil", 1, 12050]]);
    await saveItems(db, ME.id, id, [{ name: "Salt", quantity: 1, ratePaise: 2000, recipientIds: [] }]);
    expect((await getPurchase(db, ME.id, id))!.items).toHaveLength(1);
  });

  it("rejects bad rows", async () => {
    const { id } = await createPurchase(db, ME.id, rid(), input(dmart, "2026-11-15", "11:00", 1000));
    await expect(saveItems(db, ME.id, id, [])).rejects.toThrow(/at least one/);
    await expect(saveItems(db, ME.id, id, [{ name: "", quantity: 1, ratePaise: 100, recipientIds: [] }])).rejects.toThrow(/item name/);
    await expect(saveItems(db, ME.id, id, [{ name: "X", quantity: 0, ratePaise: 100, recipientIds: [] }])).rejects.toThrow(/quantity/);
    await expect(saveItems(db, OTHER.id, id, [{ name: "X", quantity: 1, ratePaise: 100, recipientIds: [] }])).rejects.toThrow(/no longer exists/);
  });
});

describe("Quick Entry link", () => {
  it("makes one Pending record per transaction and carries the details over", async () => {
    const tx = rid();
    const first = await createFromQuickEntry(db, ME.id, tx, input(ab, "2026-11-13", "18:00", 55000, { reason: "Weekly shop" }));
    const again = await createFromQuickEntry(db, ME.id, tx, input(ab, "2026-11-13", "18:00", 55000));
    expect(again).toEqual({ id: first.id, duplicate: true });
    const row = (await getPurchase(db, ME.id, first.id))!;
    expect([row.reason, row.amountPaise, row.pending, row.source]).toEqual(["Weekly shop", 55000, true, "QUICK_ENTRY"]);
  });
});

describe("what each person owes from shopping", () => {
  it("splits item totals evenly between their recipients and uses the purchase's recipients otherwise", async () => {
    const owed = await shoppingByRecipient(db, OTHER.id, { from: null, to: null });
    expect(owed.size).toBe(0);
    const p = await listPlatforms(db, OTHER.id);
    const parties = await db.expenseParty.findMany({ where: { userId: OTHER.id }, orderBy: { createdAt: "asc" } });
    const [x, y] = [parties[0]!.id, parties[1]!.id];
    const one = await createPurchase(db, OTHER.id, rid(), input(p[0]!.id, "2026-11-02", "10:00", 10001, { recipientIds: [x, y] }));
    expect(await shoppingByRecipient(db, OTHER.id, { from: null, to: null })).toEqual(new Map([[x, 5001], [y, 5000]]));
    await saveItems(db, OTHER.id, one.id, [{ name: "A", quantity: 1, ratePaise: 3000, recipientIds: [x] }, { name: "B", quantity: 2, ratePaise: 1000, recipientIds: [] }]);
    const after = await shoppingByRecipient(db, OTHER.id, { from: null, to: null });
    expect(after.get(x)).toBe(3000 + 1000);
    expect(after.get(y)).toBe(1000);
  });
});

describe("keeping a Quick Entry in step", () => {
  it("creates, updates and removes the record, and keeps what was added by hand", async () => {
    const { syncQuickEntryPurchase, platformOfEntry } = await import("@/features/shopping/server/service");
    const tx = rid();
    const at = istInstant("2026-11-09", "09:00");
    await syncQuickEntryPurchase(db, ME.id, tx, dmart, { occurredAt: at, reason: "Veg", amountPaise: 12000 });
    expect(await platformOfEntry(db, ME.id, tx)).toBe(dmart);
    const first = (await listPurchases(db, ME.id, { platformId: dmart, from: "2026-11-09", to: "2026-11-09", pendingOnly: true })).rows.find((r) => r.reason === "Veg")!;
    await setImage(db, ME.id, first.id, png, "image/png");
    await syncQuickEntryPurchase(db, ME.id, tx, ab, { occurredAt: at, reason: "Veg and fruit", amountPaise: 15000 });
    const moved = (await getPurchase(db, ME.id, first.id))!;
    expect([moved.platformName, moved.reason, moved.amountPaise, moved.hasImage]).toEqual(["AB Supermarket", "Veg and fruit", 15000, true]);
    await syncQuickEntryPurchase(db, ME.id, tx, null, { occurredAt: at, reason: "Veg", amountPaise: 15000 });
    expect(await getPurchase(db, ME.id, first.id)).toBeNull();
    expect(await platformOfEntry(db, ME.id, tx)).toBeNull();
    await syncQuickEntryPurchase(db, ME.id, tx, dmart, { occurredAt: at, reason: "Back again", amountPaise: 1000 });
    expect((await getPurchase(db, ME.id, first.id))!.reason).toBe("Back again");
  });
});
