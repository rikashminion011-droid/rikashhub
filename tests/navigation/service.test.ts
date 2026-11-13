import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { DEFAULT_LAYOUT, addSection, moveItem, moveItemToSection, renameItem, setHidden } from "@/features/navigation/model";
import { getNavLayout, resetNavLayout, saveNavLayout } from "@/features/navigation/server/service";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", email: "nav-me@example.com", name: "Me" };
const OTHER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", email: "nav-other@example.com", name: "Other" };

let database: TestDatabase;
let db: TestDatabase["prisma"];

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  await ensureUserSetup(db, OTHER);
});
afterAll(async () => {
  await database.close();
});

describe("navigation layout storage", () => {
  it("starts with the built-in layout", async () => {
    expect(await getNavLayout(db, ME.id)).toEqual(DEFAULT_LAYOUT);
  });

  it("saves a customised layout and loads it back exactly", async () => {
    let layout = renameItem(DEFAULT_LAYOUT, "/debt", "Loans");
    layout = setHidden(layout, "/savings", true);
    layout = addSection(layout, "fav", "Favourites");
    layout = moveItemToSection(layout, "/quick-pay", "fav");
    layout = moveItem(layout, "/dashboard", 1);
    const saved = await saveNavLayout(db, ME.id, layout);
    expect(saved).toEqual(layout);
    expect(await getNavLayout(db, ME.id)).toEqual(layout);
  });

  it("keeps each user's layout private", async () => {
    expect(await getNavLayout(db, OTHER.id)).toEqual(DEFAULT_LAYOUT);
    await saveNavLayout(db, OTHER.id, renameItem(DEFAULT_LAYOUT, "/user", "Me"));
    expect((await getNavLayout(db, ME.id)).titles["/user"]).toBeUndefined();
    expect((await getNavLayout(db, OTHER.id)).titles["/user"]).toBe("Me");
  });

  it("tidies a layout on the way in and refuses one it cannot read", async () => {
    const saved = await saveNavLayout(db, ME.id, {
      sections: [{ id: "only", title: "  All   pages ", itemIds: ["/debt", "/ghost"] }],
      titles: { "/debt": "  Loans ", "/ghost": "x" },
      hidden: ["/ghost"],
    });
    expect(saved.sections).toHaveLength(1);
    expect(saved.sections[0]!.title).toBe("All pages");
    expect(saved.sections[0]!.itemIds[0]).toBe("/debt");
    expect(saved.sections[0]!.itemIds).not.toContain("/ghost");
    expect(saved.sections[0]!.itemIds).toHaveLength(DEFAULT_LAYOUT.sections.flatMap((s) => s.itemIds).length); // every page still present
    expect(saved.titles).toEqual({ "/debt": "Loans" });
    await expect(saveNavLayout(db, ME.id, { nonsense: true })).rejects.toThrow();
    await expect(saveNavLayout(db, ME.id, { sections: [], titles: {}, hidden: Array.from({ length: 200 }, (_, i) => `/p${i}`) })).rejects.toThrow();
  });

  it("falls back to the built-in layout when stored data is damaged", async () => {
    await db.navigationSettings.update({ where: { userId: ME.id }, data: { data: { sections: "broken" } } });
    expect(await getNavLayout(db, ME.id)).toEqual(DEFAULT_LAYOUT);
  });

  it("reset goes back to the built-in layout, and only for that user", async () => {
    await saveNavLayout(db, ME.id, renameItem(DEFAULT_LAYOUT, "/debt", "Loans"));
    expect(await resetNavLayout(db, ME.id)).toEqual(DEFAULT_LAYOUT);
    expect(await getNavLayout(db, ME.id)).toEqual(DEFAULT_LAYOUT);
    expect((await getNavLayout(db, OTHER.id)).titles["/user"]).toBe("Me");
  });
});
