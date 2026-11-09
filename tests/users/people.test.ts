import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ExpenseError,
  addParty,
  archiveOption,
  createExpense,
  ensureUserSetup,
  getExpenseFormData,
} from "@/features/expenses/server/service";
import { listPeople, renameParty } from "@/features/users/server/service";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com", name: "Me" };
const OTHER = { id: "22222222-2222-4222-8222-222222222222", email: "other@example.com", name: "Other" };

let database: TestDatabase;
let db: TestDatabase["prisma"];
let requests = 0;
const requestId = () => `00000000-0000-4000-8000-${String(++requests).padStart(12, "0")}`;

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  await ensureUserSetup(db, OTHER);
}, 90_000);
afterAll(async () => {
  await database?.close();
});

const idOf = async (userId: string, name: string) => {
  const data = await getExpenseFormData(db, userId);
  const found = data.parties.find((p) => p.name === name);
  if (!found) throw new Error(`no person "${name}"`);
  return found.id;
};

/** Saves one expense of `amountPaise` split over the named people (equal split). */
async function spend(userId: string, amountPaise: number, people: string[]) {
  const data = await getExpenseFormData(db, userId);
  const gpay = data.methods.find((m) => m.name === "GPay")!;
  const per = Math.floor(amountPaise / people.length);
  const allocations = await Promise.all(
    people.map(async (name, i) => ({
      partyId: await idOf(userId, name),
      amountPaise: i === 0 ? amountPaise - per * (people.length - 1) : per,
    })),
  );
  return createExpense(db, userId, requestId(), {
    amountPaise,
    notes: "test",
    date: "2026-11-06",
    methodId: gpay.id,
    accountId: gpay.accounts[0]!.id,
    categoryId: data.categories[0]!.id,
    isSplit: people.length > 1,
    allocations,
  });
}

describe("listPeople", () => {
  it("lists the starter people with no spending yet", async () => {
    const people = await listPeople(db, ME.id);
    expect(people.map((p) => p.name)).toEqual(["Personal", "Office", "Mukesh", "Save", "Balan"]);
    expect(people.every((p) => p.expenseCount === 0 && p.totalPaise === 0)).toBe(true);
  });

  it("adds up each person's share across expenses, including split ones", async () => {
    await spend(ME.id, 10000, ["Personal"]);
    await spend(ME.id, 9000, ["Personal", "Mukesh", "Balan"]); // 3000 each
    const byName = Object.fromEntries((await listPeople(db, ME.id)).map((p) => [p.name, p]));
    expect(byName.Personal).toMatchObject({ expenseCount: 2, totalPaise: 13000 });
    expect(byName.Mukesh).toMatchObject({ expenseCount: 1, totalPaise: 3000 });
    expect(byName.Balan).toMatchObject({ expenseCount: 1, totalPaise: 3000 });
    expect(byName.Office).toMatchObject({ expenseCount: 0, totalPaise: 0 });
  });

  it("does not count deleted expenses", async () => {
    const saved = await spend(ME.id, 5000, ["Office"]);
    expect((await listPeople(db, ME.id)).find((p) => p.name === "Office")!.totalPaise).toBe(5000);
    await db.transaction.update({ where: { id: saved.id }, data: { deletedAt: new Date() } });
    expect((await listPeople(db, ME.id)).find((p) => p.name === "Office")!.totalPaise).toBe(0);
  });

  it("only shows the signed-in user's own people and totals", async () => {
    await spend(OTHER.id, 77700, ["Personal"]);
    const mine = await listPeople(db, ME.id);
    expect(mine.find((p) => p.name === "Personal")!.totalPaise).toBe(13000);
    expect((await listPeople(db, OTHER.id)).find((p) => p.name === "Personal")!.totalPaise).toBe(77700);
  });

  it("leaves out removed people", async () => {
    const id = await addParty(db, ME.id, { name: "Temp" });
    await archiveOption(db, ME.id, { kind: "party", id });
    expect((await listPeople(db, ME.id)).map((p) => p.name)).not.toContain("Temp");
  });
});

describe("renameParty", () => {
  it("renames, and past expenses follow the new name", async () => {
    const id = await idOf(ME.id, "Balan");
    await renameParty(db, ME.id, { id, name: "  Balan K  " });
    const people = await listPeople(db, ME.id);
    expect(people.find((p) => p.id === id)).toMatchObject({ name: "Balan K", expenseCount: 1, totalPaise: 3000 });
  });

  it("allows changing only the capitalisation of the same person", async () => {
    const id = await idOf(ME.id, "Save");
    await renameParty(db, ME.id, { id, name: "SAVE" });
    expect((await listPeople(db, ME.id)).find((p) => p.id === id)!.name).toBe("SAVE");
  });

  it("refuses a name another person already has, ignoring case", async () => {
    const id = await idOf(ME.id, "Mukesh");
    await expect(renameParty(db, ME.id, { id, name: "office" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a name that belongs to a removed person, and says how to get it back", async () => {
    const gone = await addParty(db, ME.id, { name: "Ghost" });
    await archiveOption(db, ME.id, { kind: "party", id: gone });
    const id = await idOf(ME.id, "Mukesh");
    await expect(renameParty(db, ME.id, { id, name: "Ghost" })).rejects.toThrow("removed earlier");
  });

  it("lets two different users use the same name", async () => {
    const id = await idOf(OTHER.id, "Mukesh");
    await renameParty(db, OTHER.id, { id, name: "Balan K" });
  });

  it("rejects empty and over-long names", async () => {
    const id = await idOf(ME.id, "Mukesh");
    await expect(renameParty(db, ME.id, { id, name: "   " })).rejects.toThrow("Enter a name");
    await expect(renameParty(db, ME.id, { id, name: "x".repeat(61) })).rejects.toThrow("at most 60");
  });

  it("cannot rename somebody else's person or a removed one", async () => {
    const theirs = await idOf(OTHER.id, "Office");
    await expect(renameParty(db, ME.id, { id: theirs, name: "Hacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await idOf(OTHER.id, "Office")).toBe(theirs);

    const removed = await addParty(db, ME.id, { name: "Old" });
    await archiveOption(db, ME.id, { kind: "party", id: removed });
    await expect(renameParty(db, ME.id, { id: removed, name: "New" })).rejects.toBeInstanceOf(ExpenseError);
  });
});
