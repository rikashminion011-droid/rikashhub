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
  portalShares,
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

describe("statement lines stay in date order and do not move around", () => {
  const order = async (portal: string) => (await listStatement(db, ME.id, portal, { from: null, to: null })).rows.map((r) => r.details);

  it("lines printed at the same minute keep the order the statement prints them in", async () => {
    const portal = await addPortal(db, ME.id, "Order Test");
    // Four GST rows share the same date and time (as in a real HDFC statement), plus rows on other days.
    const lines = [
      line("a", "2026-10-15", "00:00", 1125, { details: "SGST-A" }),
      line("b", "2026-10-15", "00:00", 405, { details: "CGST-B" }),
      line("c", "2026-10-15", "00:00", 405, { details: "SGST-C" }),
      line("d", "2026-10-15", "00:00", 1125, { details: "CGST-D" }),
      line("e", "2026-10-18", "10:48", 14900, { details: "GOOGLEPLAY" }),
      line("f", "2026-10-14", "09:00", 500, { details: "EARLIER" }),
    ];
    await importStatement(db, ME.id, portal, lines);
    expect(await order(portal)).toEqual(["EARLIER", "SGST-A", "CGST-B", "SGST-C", "CGST-D", "GOOGLEPLAY"]);
  });

  it("editing a line (reason, people, category) does not move it, however often the list is read", async () => {
    const portal = await addPortal(db, ME.id, "Stable Test");
    await importStatement(db, ME.id, portal, ["a", "b", "c", "d", "e"].map((k) => line(k, "2026-10-15", "00:00", 100, { details: `ROW-${k}` })));
    const before = await order(portal);
    expect(before).toEqual(["ROW-a", "ROW-b", "ROW-c", "ROW-d", "ROW-e"]);

    const rows = (await listStatement(db, ME.id, portal, { from: null, to: null })).rows;
    for (const index of [2, 0, 3, 2, 1]) {
      const row = rows[index]!;
      await updateStatementEntry(db, ME.id, row.id, { reason: `edited ${index}`, recipientIds: index % 2 === 0 ? [dhanush, mukesh] : [dhanush], categoryId: null });
      expect(await order(portal)).toEqual(before);
    }
    for (let i = 0; i < 5; i++) expect(await order(portal)).toEqual(before);
  });

  it("rows that already tie on date and creation time (imported before this fix) are still always listed in one fixed order", async () => {
    const portal = await addPortal(db, ME.id, "Legacy Test");
    const sameMoment = new Date("2026-10-15T00:00:00.000Z");
    // Rows with the same date AND the same creation time are listed by id, and that order never changes when a row is edited.
    const keys = ["f", "e", "d", "c", "b", "a"];
    await db.creditStatementEntry.createMany({
      data: keys.map((k) => ({ id: `00000000-0000-4000-8000-0000000000${k.charCodeAt(0) - 48}`, userId: ME.id, portalId: portal, occurredAt: sameMoment, createdAt: sameMoment, details: `LEGACY-${k}`, debit: "10.00", credit: "0.00", recipientIds: [], dedupeKey: `${portal}|legacy-${k}` })),
    });
    const first = await order(portal);
    expect(first).toEqual(["LEGACY-a", "LEGACY-b", "LEGACY-c", "LEGACY-d", "LEGACY-e", "LEGACY-f"]);
    const rows = (await listStatement(db, ME.id, portal, { from: null, to: null })).rows;
    await updateStatementEntry(db, ME.id, rows[3]!.id, { reason: "touched", recipientIds: [mukesh], categoryId: null });
    await updateStatementEntry(db, ME.id, rows[0]!.id, { reason: "touched too", recipientIds: [], categoryId: null });
    expect(await order(portal)).toEqual(first);
  });

  it("unbilled rows typed on the same date and time keep their sheet order", async () => {
    const portal = await addPortal(db, ME.id, "Unbilled Order");
    await saveUnbilledBulk(db, ME.id, portal, rid(), ["x1", "x2", "x3", "x4"].map((k) => unbilled(k, "2026-10-20", "10:00", 100, { reason: k })));
    const reasons = async () => (await listUnbilled(db, ME.id, portal, { from: null, to: null })).map((r) => r.reason);
    expect(await reasons()).toEqual(["x1", "x2", "x3", "x4"]);
    const first = (await listUnbilled(db, ME.id, portal, { from: null, to: null }))[1]!;
    await updateUnbilled(db, ME.id, first.id, { occurredAt: first.occurredAt ? new Date(first.occurredAt) : istInstant("2026-10-20", "10:00"), reason: "x2 edited", kind: "DEBIT", amountPaise: 100, recipientIds: [dhanush] });
    expect(await reasons()).toEqual(["x1", "x2 edited", "x3", "x4"]);
  });
});

describe("a recipient's report shows their share of a line that is for several people", () => {
  const range = { from: null, to: null };
  const report = (portal: string, who: string) => listForRecipient(db, ME.id, portal, who, range);

  it("Netflix ₹200 for two people is ₹100 each, not ₹200 each", async () => {
    const portal = await addPortal(db, ME.id, "Share Two");
    await importStatement(db, ME.id, portal, [line("n", "2026-10-11", "23:04", 20000, { details: "NETFLIX", recipientIds: [dhanush, mukesh] })]);
    for (const who of [dhanush, mukesh]) {
      const r = (await report(portal, who)).statement;
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ debitPaise: 10000, creditPaise: 0, sharedWith: 2, fullPaise: 20000 });
    }
  });

  it("₹200 for three people is 200/3 each, the odd paise going to the first two, and the three add up to ₹200", async () => {
    const third = (await db.expenseParty.create({ data: { userId: ME.id, name: "Third Share", nameKey: "third share" } })).id;
    const portal = await addPortal(db, ME.id, "Share Three");
    await importStatement(db, ME.id, portal, [line("t", "2026-10-12", "10:00", 20000, { recipientIds: [dhanush, mukesh, third] })]);
    const shares = await Promise.all([dhanush, mukesh, third].map(async (who) => (await report(portal, who)).statement[0]!));
    expect(shares.map((s) => s.debitPaise)).toEqual([6667, 6667, 6666]);
    expect(shares.reduce((sum, s) => sum + s.debitPaise, 0)).toBe(20000);
    expect(shares.every((s) => s.sharedWith === 3 && s.fullPaise === 20000)).toBe(true);
  });

  it("a credit (refund) and an unbilled transaction are shared the same way", async () => {
    const portal = await addPortal(db, ME.id, "Share Kinds");
    await importStatement(db, ME.id, portal, [line("r", "2026-10-13", "09:00", 0, { creditPaise: 3000, recipientIds: [dhanush, mukesh] })]);
    await saveUnbilledBulk(db, ME.id, portal, rid(), [unbilled("u", "2026-10-14", "09:00", 9001, { reason: "Pending", recipientIds: [dhanush, mukesh] })]);
    const a = await report(portal, dhanush);
    const b = await report(portal, mukesh);
    expect(a.statement[0]).toMatchObject({ creditPaise: 1500, debitPaise: 0, sharedWith: 2, fullPaise: 3000 });
    expect(b.statement[0]).toMatchObject({ creditPaise: 1500, sharedWith: 2 });
    expect(a.unbilled[0]).toMatchObject({ amountPaise: 4501, sharedWith: 2, fullPaise: 9001 });
    expect(b.unbilled[0]).toMatchObject({ amountPaise: 4500, sharedWith: 2, fullPaise: 9001 });
  });

  it("a line for one person is theirs in full, with no sharing note, and a person not on it does not see it", async () => {
    const portal = await addPortal(db, ME.id, "Share One");
    await importStatement(db, ME.id, portal, [line("o", "2026-10-15", "09:00", 12345, { recipientIds: [dhanush] })]);
    const mine = (await report(portal, dhanush)).statement[0]!;
    expect(mine.debitPaise).toBe(12345);
    expect(mine.sharedWith).toBeUndefined();
    expect((await report(portal, mukesh)).statement).toHaveLength(0);
  });

  it("matches what Debt Management counts for the same person and line", async () => {
    const portal = await addPortal(db, ME.id, "Share Debt");
    await importStatement(db, ME.id, portal, [line("d", "2026-10-16", "09:00", 20001, { details: "ODD AMOUNT", recipientIds: [mukesh, dhanush] })]);
    const debt = (await portalShares(db, ME.id, range)).filter((s) => s.portalId === portal);
    for (const who of [dhanush, mukesh]) {
      const inDebt = debt.find((s) => s.partyId === who)!.amountPaise;
      expect((await report(portal, who)).statement[0]!.debitPaise).toBe(inDebt);
    }
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
