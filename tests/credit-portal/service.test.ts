import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import {
  addPortal,
  deleteStatementEntry,
  deleteUnbilled,
  importStatement,
  listForRecipient,
  listPortals,
  listStatement,
  listUnbilled,
  removePortal,
  renamePortal,
  saveUnbilledBulk,
  savedStatementKeys,
  setCardInfo,
  updateStatementEntry,
  updateUnbilled,
  type StatementInput,
  type UnbilledInput,
} from "@/features/credit-portal/server/service";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const ME = { id: "55555555-5555-4555-8555-555555555555", email: "cp-me@example.com", name: "Me" };
const OTHER = { id: "66666666-6666-4666-8666-666666666666", email: "cp-other@example.com", name: "Other" };

let database: TestDatabase;
let db: TestDatabase["prisma"];
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n + 9000).padStart(12, "0")}`;
let hdfc = "";
let dhanush = "";
let mukesh = "";

const unbilled = (key: string, date: string, time: string, amountPaise: number, over: Partial<UnbilledInput> = {}): UnbilledInput => ({
  key, occurredAt: istInstant(date, time), reason: "", kind: "DEBIT", amountPaise, recipientIds: [], ...over,
});
const line = (key: string, date: string, time: string, debitPaise: number, over: Partial<StatementInput> = {}): StatementInput => ({
  key, occurredAt: istInstant(date, time), details: `MERCHANT ${key}`, debitPaise, creditPaise: 0, reason: "", recipientIds: [], categoryId: null, ...over,
});

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  await ensureUserSetup(db, OTHER);
  const parties = await db.expenseParty.findMany({ where: { userId: ME.id }, orderBy: { createdAt: "asc" } });
  dhanush = (parties.find((p) => p.name === "Dhanush") ?? parties[0]!).id;
  mukesh = (parties.find((p) => p.name === "Mukesh") ?? parties[1]!).id;
  hdfc = (await listPortals(db, ME.id)).find((p) => p.name === "HDFC")!.id;
});
afterAll(async () => {
  await database.close();
});

describe("portals", () => {
  it("a new user starts with HDFC, Slice, Amazon Pay Later and Flipkart Pay Later", async () => {
    expect((await listPortals(db, ME.id)).map((p) => p.name)).toEqual(["HDFC", "Slice", "Amazon Pay Later", "Flipkart Pay Later"]);
    expect((await listPortals(db, ME.id)).length).toBe(4); // not added again on the next read
  });

  it("adds, renames and removes portals, refuses a repeat name, and brings a removed one back", async () => {
    const id = await addPortal(db, ME.id, "  Paytm  Postpaid ");
    expect((await listPortals(db, ME.id)).find((p) => p.id === id)).toMatchObject({ name: "Paytm Postpaid", cardInfoSaved: false });
    await expect(addPortal(db, ME.id, "paytm postpaid")).rejects.toMatchObject({ code: "CONFLICT" });
    await renamePortal(db, ME.id, id, "Paytm Later");
    await expect(renamePortal(db, ME.id, id, "hdfc")).rejects.toMatchObject({ code: "CONFLICT" });
    await removePortal(db, ME.id, id);
    expect((await listPortals(db, ME.id)).some((p) => p.id === id)).toBe(false);
    expect(await addPortal(db, ME.id, "Paytm Later")).toBe(id);
  });

  it("card information: balance is total minus used, and it is shown again when the portal is chosen", async () => {
    const saved = await setCardInfo(db, ME.id, hdfc, { totalPaise: 7600000, usedPaise: 4500000 });
    expect(saved).toMatchObject({ totalPaise: 7600000, usedPaise: 4500000, cardInfoSaved: true });
    expect((await listPortals(db, ME.id)).find((p) => p.id === hdfc)).toMatchObject({ totalPaise: 7600000, usedPaise: 4500000 });
    await expect(setCardInfo(db, ME.id, hdfc, { totalPaise: -1, usedPaise: 0 })).rejects.toThrow();
  });

  it("is private to each user", async () => {
    await expect(setCardInfo(db, OTHER.id, hdfc, { totalPaise: 1, usedPaise: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveUnbilledBulk(db, OTHER.id, hdfc, rid(), [unbilled("a", "2026-11-01", "10:00", 100)])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("unbilled transactions", () => {
  it("saves a sheet together, in date order, with recipients, and once when sent twice", async () => {
    const id = rid();
    const rows = [
      unbilled("2", "2026-11-12", "20:00", 20000, { reason: "Netflix", recipientIds: [dhanush, mukesh] }),
      unbilled("1", "2026-11-10", "09:00", 5000, { reason: "Tea" }),
    ];
    expect(await saveUnbilledBulk(db, ME.id, hdfc, id, rows)).toEqual({ count: 2, duplicate: false });
    expect(await saveUnbilledBulk(db, ME.id, hdfc, id, rows)).toEqual({ count: 2, duplicate: true });
    const list = await listUnbilled(db, ME.id, hdfc, { from: "2026-11-01", to: "2026-11-30" });
    expect(list.map((r) => r.reason)).toEqual(["Tea", "Netflix"]);
    expect(list[1]).toMatchObject({ amountPaise: 20000, kind: "DEBIT", recipientIds: [dhanush, mukesh], settled: false });
  });

  it("filters by the period and refuses bad rows and people that are not yours", async () => {
    expect(await listUnbilled(db, ME.id, hdfc, { from: "2027-01-01", to: "2027-01-31" })).toEqual([]);
    await expect(saveUnbilledBulk(db, ME.id, hdfc, rid(), [unbilled("x", "2026-11-01", "10:00", 0)])).rejects.toThrow();
    await expect(saveUnbilledBulk(db, ME.id, hdfc, rid(), [unbilled("x", "2026-11-01", "10:00", 100, { recipientIds: ["99999999-9999-4999-8999-999999999999"] })])).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveUnbilledBulk(db, ME.id, hdfc, rid(), [unbilled("x", "2099-01-01", "10:00", 100)])).rejects.toThrow("future");
  });
});

describe("statement lines settle unbilled transactions", () => {
  it("a Netflix purchase for Dhanush is settled when the statement shows the same amount for Dhanush, and counted once", async () => {
    const portal = await addPortal(db, ME.id, "Settle Test");
    await saveUnbilledBulk(db, ME.id, portal, rid(), [unbilled("n", "2026-10-11", "23:04", 20000, { reason: "Netflix", recipientIds: [dhanush] }), unbilled("o", "2026-10-11", "23:30", 7000, { recipientIds: [mukesh] })]);
    const result = await importStatement(db, ME.id, portal, [line("a", "2026-10-12", "00:00", 20000, { recipientIds: [dhanush], reason: "Netflix" })]);
    expect(result).toEqual({ imported: 1, duplicates: 0, settled: 1 });
    const un = await listUnbilled(db, ME.id, portal, { from: null, to: null });
    expect(un.find((r) => r.reason === "Netflix")!.settled).toBe(true);
    expect(un.find((r) => r.amountPaise === 7000)!.settled).toBe(false); // a different person: left alone
    const st = await listStatement(db, ME.id, portal, { from: null, to: null });
    expect(st.rows[0]).toMatchObject({ settledUnbilled: true, debitPaise: 20000 });
    expect(st.totals).toEqual({ debitPaise: 20000, creditPaise: 0 });
  });

  it("importing the same statement again adds nothing", async () => {
    const portal = await addPortal(db, ME.id, "Repeat Test");
    const lines = [line("k1", "2026-10-01", "10:00", 100), line("k2", "2026-10-02", "10:00", 0, { creditPaise: 200 })];
    expect(await importStatement(db, ME.id, portal, lines)).toMatchObject({ imported: 2, duplicates: 0 });
    expect(await importStatement(db, ME.id, portal, lines)).toMatchObject({ imported: 0, duplicates: 2 });
    expect((await savedStatementKeys(db, ME.id, portal)).sort()).toEqual(["k1", "k2"]);
    expect((await listStatement(db, ME.id, portal, { from: null, to: null })).totals).toEqual({ debitPaise: 100, creditPaise: 200 });
  });

  it("a line with the people filled in later still settles its unbilled transaction, and deleting the line releases it", async () => {
    const portal = await addPortal(db, ME.id, "Late Match");
    await saveUnbilledBulk(db, ME.id, portal, rid(), [unbilled("u", "2026-10-20", "10:00", 9900, { recipientIds: [dhanush] })]);
    await importStatement(db, ME.id, portal, [line("s", "2026-10-21", "10:00", 9900)]);
    let un = await listUnbilled(db, ME.id, portal, { from: null, to: null });
    expect(un[0]!.settled).toBe(false); // the statement line has no recipient yet
    const stId = (await listStatement(db, ME.id, portal, { from: null, to: null })).rows[0]!.id;
    await updateStatementEntry(db, ME.id, stId, { reason: "Dinner", recipientIds: [dhanush], categoryId: null });
    un = await listUnbilled(db, ME.id, portal, { from: null, to: null });
    expect(un[0]!.settled).toBe(true);
    await deleteStatementEntry(db, ME.id, stId);
    un = await listUnbilled(db, ME.id, portal, { from: null, to: null });
    expect(un[0]!.settled).toBe(false);
  });

  it("changing an unbilled transaction lets it be matched again; a deleted one is gone", async () => {
    const portal = await addPortal(db, ME.id, "Edit Test");
    await saveUnbilledBulk(db, ME.id, portal, rid(), [unbilled("e", "2026-10-05", "10:00", 4000, { recipientIds: [mukesh] })]);
    await importStatement(db, ME.id, portal, [line("t", "2026-10-06", "10:00", 4000, { recipientIds: [mukesh] })]);
    const [row] = await listUnbilled(db, ME.id, portal, { from: null, to: null });
    expect(row!.settled).toBe(true);
    await updateUnbilled(db, ME.id, row!.id, { occurredAt: istInstant("2026-10-05", "10:00"), reason: "x", kind: "DEBIT", amountPaise: 4100, recipientIds: [mukesh] });
    expect((await listUnbilled(db, ME.id, portal, { from: null, to: null }))[0]!.settled).toBe(false);
    await deleteUnbilled(db, ME.id, row!.id);
    expect(await listUnbilled(db, ME.id, portal, { from: null, to: null })).toEqual([]);
  });

  it("a recipient page lists their statement lines and their unbilled transactions that are not settled", async () => {
    const portal = await addPortal(db, ME.id, "Recipient Test");
    await saveUnbilledBulk(db, ME.id, portal, rid(), [unbilled("1", "2026-10-02", "10:00", 100, { recipientIds: [mukesh] }), unbilled("2", "2026-10-03", "10:00", 200, { recipientIds: [dhanush] })]);
    await importStatement(db, ME.id, portal, [line("a", "2026-10-03", "10:00", 100, { recipientIds: [mukesh] }), line("b", "2026-10-04", "10:00", 300, { recipientIds: [mukesh] }), line("c", "2026-10-04", "11:00", 400)]);
    const m = await listForRecipient(db, ME.id, portal, mukesh, { from: null, to: null });
    expect(m.statement.map((r) => r.debitPaise)).toEqual([100, 300]);
    expect(m.unbilled).toEqual([]); // the first one was settled by the statement
    const d = await listForRecipient(db, ME.id, portal, dhanush, { from: null, to: null });
    expect(d.statement).toEqual([]);
    expect(d.unbilled.map((r) => r.amountPaise)).toEqual([200]);
  });

  it("refuses a line that is both a debit and a credit, or neither", async () => {
    const portal = await addPortal(db, ME.id, "Bad Lines");
    await expect(importStatement(db, ME.id, portal, [line("z", "2026-10-01", "10:00", 100, { creditPaise: 100 })])).rejects.toThrow();
    await expect(importStatement(db, ME.id, portal, [line("z", "2026-10-01", "10:00", 0)])).rejects.toThrow();
  });
});
