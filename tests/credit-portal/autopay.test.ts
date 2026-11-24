import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addPortal } from "@/features/credit-portal/server/service";
import { addAutopay, deleteAutopay, listAutopay } from "@/features/credit-portal/server/autopay";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const U = { id: "88888888-8888-4888-8888-888888888881", email: "autopay@example.com", name: "Auto" };
let database: TestDatabase;
let db: TestDatabase["prisma"];
let portal = "";

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, U);
  portal = await addPortal(db, U.id, "HDFC");
}, 180_000);
afterAll(async () => database?.close());

describe("autopay", () => {
  it("keeps My and Office autopay in separate lists, each with its own total", async () => {
    await addAutopay(db, U.id, { portalId: portal, owner: "MY", date: "2026-11-05", amountPaise: 150000 });
    await addAutopay(db, U.id, { portalId: portal, owner: "MY", date: "2026-11-02", amountPaise: 50050 });
    await addAutopay(db, U.id, { portalId: portal, owner: "OFFICE", date: "2026-11-10", amountPaise: 99900 });
    const data = await listAutopay(db, U.id, portal);
    expect(data.my.rows.map((r) => r.date)).toEqual(["2026-11-02", "2026-11-05"]);
    expect(data.my.totalPaise).toBe(200050);
    expect(data.office.totalPaise).toBe(99900);
  });

  it("removes one and refuses bad input", async () => {
    const data = await listAutopay(db, U.id, portal);
    await deleteAutopay(db, U.id, data.office.rows[0]!.id);
    expect((await listAutopay(db, U.id, portal)).office.totalPaise).toBe(0);
    await expect(addAutopay(db, U.id, { portalId: portal, owner: "MY", date: "nope", amountPaise: 100 })).rejects.toThrow(/date/);
    await expect(addAutopay(db, U.id, { portalId: portal, owner: "MY", date: "2026-11-05", amountPaise: 0 })).rejects.toThrow(/above zero/);
  });
});
