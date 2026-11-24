import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { cartLabel, cleanLink, createCartCategory, createCartItem, deleteCartItem, listCartCategories, listCartItems, updateCartItem } from "@/features/shopping-cart/server/service";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const A = { id: "55555555-5555-4555-8555-555555555551", email: "cart-a@example.com", name: "A" };
const B = { id: "55555555-5555-4555-8555-555555555552", email: "cart-b@example.com", name: "B" };
let database: TestDatabase;
let db: TestDatabase["prisma"];

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, A);
  await ensureUserSetup(db, B);
}, 180_000);
afterAll(async () => database?.close());

const input = (name: string, plannedMonth: string, extra: { categoryId?: string | null; newCategory?: string; productLink?: string } = {}) => ({ name, plannedMonth, categoryId: extra.categoryId ?? null, newCategory: extra.newCategory, productLink: extra.productLink ?? "" });

describe("shopping cart", () => {
  it("numbers items Cart 01, Cart 02 for ever, even after one is deleted, and per user", async () => {
    const one = await createCartItem(db, A.id, input("Laptop bag", "2026-11"));
    const two = await createCartItem(db, A.id, input("Headphones", "2026-11"));
    expect([one.cartLabel, two.cartLabel]).toEqual(["Cart 01", "Cart 02"]);
    await deleteCartItem(db, A.id, two.id);
    const three = await createCartItem(db, A.id, input("Desk lamp", "2026-12"));
    expect(three.cartLabel).toBe("Cart 03");
    expect((await createCartItem(db, B.id, input("Someone else", "2026-11"))).cartLabel).toBe("Cart 01");
    expect(cartLabel(120)).toBe("Cart 120");
  });

  it("makes categories on the spot, once per name, and lists them all", async () => {
    const made = await createCartItem(db, A.id, input("Monitor", "2026-11", { newCategory: "  Electronics " }));
    expect(made.category).toBe("Electronics");
    await createCartItem(db, A.id, input("Keyboard", "2026-11", { newCategory: "electronics" }));
    await createCartCategory(db, A.id, "Personal");
    expect((await listCartCategories(db, A.id)).map((c) => c.name)).toEqual(["Electronics", "Personal"]);
    // Another user does not see them.
    expect(await listCartCategories(db, B.id)).toEqual([]);
  });

  it("filters by month and by category on their own and together", async () => {
    const [electronics] = await listCartCategories(db, A.id);
    const all = await listCartItems(db, A.id, { month: null, categoryId: null });
    expect(all.length).toBeGreaterThanOrEqual(4);
    const nov = await listCartItems(db, A.id, { month: "2026-11", categoryId: null });
    expect(nov.every((i) => i.plannedMonth === "2026-11")).toBe(true);
    const cat = await listCartItems(db, A.id, { month: null, categoryId: electronics!.id });
    expect(cat.map((i) => i.name).sort()).toEqual(["Keyboard", "Monitor"]);
    expect((await listCartItems(db, A.id, { month: "2026-12", categoryId: electronics!.id }))).toEqual([]);
    expect((await listCartItems(db, A.id, { month: "2026-11", categoryId: electronics!.id })).map((i) => i.name).sort()).toEqual(["Keyboard", "Monitor"]);
  });

  it("edits an item without changing its number, and only for its owner", async () => {
    const [item] = await listCartItems(db, A.id, { month: "2026-12", categoryId: null });
    const updated = await updateCartItem(db, A.id, item!.id, input("Desk lamp (LED)", "2027-01", { productLink: "example.com/lamp" }));
    expect([updated.cartLabel, updated.name, updated.plannedMonth, updated.productLink]).toEqual([item!.cartLabel, "Desk lamp (LED)", "2027-01", "https://example.com/lamp"]);
    await expect(updateCartItem(db, B.id, item!.id, input("x", "2026-11"))).rejects.toThrow(/no longer exists/);
    await expect(deleteCartItem(db, B.id, item!.id)).rejects.toThrow(/no longer exists/);
  });

  it("checks the name, the month and the link", async () => {
    await expect(createCartItem(db, A.id, input("", "2026-11"))).rejects.toThrow(/item name/);
    await expect(createCartItem(db, A.id, input("x", "2026-13"))).rejects.toThrow(/month/);
    expect(cleanLink("")).toBeNull();
    expect(cleanLink("shop.com/a b")).toBe("https://shop.com/a%20b");
    expect(() => cleanLink("javascript:alert(1)")).toThrow(/http/);
    expect(() => cleanLink("data:text/html,hi")).toThrow(/http/);
  });
});
