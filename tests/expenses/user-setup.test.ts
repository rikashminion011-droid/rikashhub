import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { ensureUserSetup } from "@/features/expenses/server/service";

const USER = { id: "33333333-3333-4333-8333-333333333333", email: "me@example.com", name: "Me" };

/** A database stand-in that records which queries ran. Only what the fast path needs is real. */
function fakeDb(existing: { email: string; profile: { expenseDefaultsSeededAt: Date | null } | null } | null) {
  const calls: string[] = [];
  const db = {
    user: {
      findUnique: async () => {
        calls.push("user.findUnique");
        return existing;
      },
      upsert: async () => {
        calls.push("user.upsert");
        throw new Error("slow path reached");
      },
    },
  } as unknown as PrismaClient;
  return { db, calls };
}

const READY = { email: USER.email, profile: { expenseDefaultsSeededAt: new Date() } };

describe("ensureUserSetup fast path", () => {
  it("costs a single query for a user who is already set up", async () => {
    const { db, calls } = fakeDb(READY);
    await ensureUserSetup(db, USER);
    expect(calls).toEqual(["user.findUnique"]);
  });

  it("costs no query at all on later requests from the same server", async () => {
    const { db, calls } = fakeDb(READY);
    await ensureUserSetup(db, USER);
    await ensureUserSetup(db, USER);
    await ensureUserSetup(db, USER);
    expect(calls).toEqual(["user.findUnique"]);
  });

  it("runs the full setup for a brand-new user", async () => {
    const { db, calls } = fakeDb(null);
    await expect(ensureUserSetup(db, USER)).rejects.toThrow("slow path reached");
    expect(calls).toEqual(["user.findUnique", "user.upsert"]);
  });

  it("runs the full setup when the starter data has not been created yet", async () => {
    const { db, calls } = fakeDb({ email: USER.email, profile: { expenseDefaultsSeededAt: null } });
    await expect(ensureUserSetup(db, USER)).rejects.toThrow("slow path reached");
    expect(calls).toContain("user.upsert");
  });

  it("runs the full setup when the user has no profile row", async () => {
    const { db, calls } = fakeDb({ email: USER.email, profile: null });
    await expect(ensureUserSetup(db, USER)).rejects.toThrow("slow path reached");
    expect(calls).toContain("user.upsert");
  });

  it("syncs a changed email instead of trusting the stored one", async () => {
    const { db, calls } = fakeDb({ ...READY, email: "old@example.com" });
    await expect(ensureUserSetup(db, USER)).rejects.toThrow("slow path reached");
    expect(calls).toContain("user.upsert");
  });

  it("does not remember a failed setup, so the next request tries again", async () => {
    const { db, calls } = fakeDb(null);
    await expect(ensureUserSetup(db, USER)).rejects.toThrow();
    await expect(ensureUserSetup(db, USER)).rejects.toThrow();
    expect(calls.filter((c) => c === "user.findUnique")).toHaveLength(2);
  });

  it("keeps separate memory per database client", async () => {
    const first = fakeDb(READY);
    const second = fakeDb(READY);
    await ensureUserSetup(first.db, USER);
    await ensureUserSetup(second.db, USER);
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
  });
});
