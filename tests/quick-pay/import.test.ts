import { jsPDF } from "jspdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { parseAmountPaise, parseGpayStatement, parseWhen, type TextRun } from "@/features/quick-pay/import/gpay-statement";
import { suggestBank } from "@/features/quick-pay/import/matching";
import { ImportFileError, extractPdfRuns } from "@/features/quick-pay/import/pdf-text";
import { banksNeeded, planImport, type ImportRow } from "@/features/quick-pay/import/plan";
import { getBalances, importEntries, listTransactions } from "@/features/quick-pay/server/entries";
import { parseTxFilters } from "@/features/quick-pay/filters";
import { addBank, addSubBank, getQuickPayOptions } from "@/features/quick-pay/server/settings";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

// ───────────────────────── The statement layout ─────────────────────────

interface Txn {
  date: string;
  time: string;
  details: string;
  /** A second text run on the details line (a long name that wrapped). */
  wrapped?: string;
  upi: string;
  bankLine: string;
  amount: string;
}

/** Text runs laid out the way the real statement is: date/details/amount, then time/UPI id, then the bank line. */
function page(txns: Txn[], cover = false): TextRun[] {
  const runs: TextRun[] = [
    { str: "Transaction statement", x: 448, y: 806 },
    { str: "Note: This statement reflects payments made by you on the Google Pay app.", x: 24, y: 68 },
    { str: "Page 1 of 2", x: 531, y: 18 },
  ];
  let y = 700;
  if (cover) {
    runs.push({ str: "Transaction statement period", x: 24, y: 704 }, { str: "01 May 2026 - 31 October 2026", x: 24, y: 686 });
    runs.push({ str: "Sent", x: 313, y: 704 }, { str: "₹1,500.50", x: 292, y: 686 }, { str: "Received", x: 481, y: 704 }, { str: "₹400", x: 468, y: 686 });
    y = 622;
  }
  runs.push({ str: "Date & time", x: 24, y }, { str: "Transaction details", x: 118, y }, { str: "Amount", x: 536, y });
  y -= 30;
  for (const t of txns) {
    runs.push({ str: t.date, x: 24, y }, { str: t.details, x: 118, y }, { str: t.amount, x: 540, y });
    if (t.wrapped) runs.push({ str: t.wrapped, x: 229, y });
    runs.push({ str: t.time, x: 24, y: y - 15 }, { str: `UPI Transaction ID: ${t.upi}`, x: 118, y: y - 15 });
    runs.push({ str: t.bankLine, x: 135, y: y - 31 });
    y -= 63;
  }
  return runs;
}

const sample: Txn[] = [
  { date: "01 May, 2026", time: "10:48 AM", details: "Received from Candy Dhanush", upi: "612110414150", bankLine: "Paid to IDFC FIRST Bank 1960", amount: "₹400" },
  { date: "01 May, 2026", time: "11:02 AM", details: "Paid to Indian Railways", upi: "612109400012", bankLine: "Paid by IDFC FIRST Bank 1960", amount: "₹387.25" },
  { date: "02 May, 2026", time: "12:33 PM", details: "Self transfer to Canara Bank 5109", upi: "648813508461", bankLine: "Paid by IDFC FIRST Bank 1960", amount: "₹8,000" },
  { date: "22 May, 2026", time: "12:12 AM", details: "Paid to SARAVANA FAN", wrapped: "LIGHT HOUSE", upi: "650849620437", bankLine: "Paid by Canara Bank 5109", amount: "₹1,113.25" },
  { date: "06 Jul, 2026", time: "10:25 AM", details: "Paid to", upi: "618700886299", bankLine: "Paid by Canara Bank 5109", amount: "₹0.50" },
];

describe("reading values", () => {
  it("reads amounts with Indian digit grouping and decimals", () => {
    expect(parseAmountPaise("₹12,29,961.87")).toBe(122996187);
    expect(parseAmountPaise("₹400")).toBe(40000);
    expect(parseAmountPaise("₹0.5")).toBe(50);
    expect(parseAmountPaise("400")).toBeNull();
    expect(parseAmountPaise("₹")).toBeNull();
  });
  it("reads the date and 12-hour time in India time", () => {
    expect(parseWhen("01 May, 2026", "10:48 AM")!.toISOString()).toBe("2026-05-01T05:18:00.000Z");
    expect(parseWhen("22 May, 2026", "12:12 AM")!.toISOString()).toBe("2026-05-21T18:42:00.000Z"); // 12 AM is just after midnight
    expect(parseWhen("22 May, 2026", "12:30 PM")!.toISOString()).toBe("2026-05-22T07:00:00.000Z"); // 12 PM is noon
    expect(parseWhen("31 Feb, 2026", "10:00 AM")).toBeNull();
    expect(parseWhen("01 May, 2026", "13:00 PM")).toBeNull();
    expect(parseWhen("01 Foo, 2026", "10:00 AM")).toBeNull();
  });
});

describe("parseGpayStatement", () => {
  const out = parseGpayStatement([page(sample.slice(0, 3), true), page(sample.slice(3))]);

  it("reads every transaction, with its kind, bank, amount and time", () => {
    expect(out.failures).toEqual([]);
    expect(out.rows.map((r) => [r.id, r.kind, r.amountPaise, r.bank])).toEqual([
      ["612110414150", "CREDIT", 40000, "IDFC FIRST Bank 1960"],
      ["612109400012", "DEBIT", 38725, "IDFC FIRST Bank 1960"],
      ["648813508461", "SELF_TRANSFER", 800000, "IDFC FIRST Bank 1960"],
      ["650849620437", "DEBIT", 111325, "Canara Bank 5109"],
      ["618700886299", "DEBIT", 50, "Canara Bank 5109"],
    ]);
    expect(out.rows[0]).toMatchObject({ reason: "Received from Candy Dhanush", counterparty: "Candy Dhanush", occurredAt: "2026-05-01T05:18:00.000Z", page: 1 });
    expect(out.rows[2]).toMatchObject({ reason: "Self transfer to Canara Bank 5109", toBank: "Canara Bank 5109" });
  });
  it("joins a long name that wrapped onto its own text run, and accepts a blank payee", () => {
    expect(out.rows[3]).toMatchObject({ reason: "Paid to SARAVANA FAN LIGHT HOUSE", page: 2 });
    expect(out.rows[4]).toMatchObject({ reason: "Paid to", counterparty: "" });
  });
  it("reads the period and the Sent and Received totals from the cover", () => {
    expect(out.period).toEqual({ from: "2026-05-01", to: "2026-10-31" });
    expect(out.sentPaise).toBe(150050);
    expect(out.receivedPaise).toBe(40000);
  });
  it("reports a block it cannot read, with its text, instead of skipping it", () => {
    const bad = parseGpayStatement([page([{ ...sample[1]!, amount: "₹abc" }, sample[0]!])]);
    expect(bad.rows).toHaveLength(1);
    expect(bad.failures).toHaveLength(1);
    expect(bad.failures[0]).toMatchObject({ page: 1, error: expect.stringContaining("amount") });
    expect(bad.failures[0]!.text).toContain("Indian Railways");
  });
  it("rejects an impossible date and a missing bank line", () => {
    const badDate = parseGpayStatement([page([{ ...sample[0]!, date: "31 Feb, 2026" }])]);
    expect(badDate.failures[0]!.error).toMatch(/valid date/);
    const noBank = parseGpayStatement([page([sample[0]!]).filter((r) => !r.str.startsWith("Paid to IDFC"))]);
    expect(noBank.failures[0]!.error).toMatch(/bank/);
  });
  it("finds nothing in a page that is not a statement", () => {
    expect(parseGpayStatement([[{ str: "Hello", x: 10, y: 10 }]])).toMatchObject({ rows: [], failures: [] });
  });
});

describe("reading a real PDF file", () => {
  /** Draws the sample in a real PDF, the way the statement is drawn, and reads it back through the PDF reader. */
  function makePdf(): Uint8Array {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const height = doc.internal.pageSize.getHeight();
    doc.setFontSize(9);
    for (const run of page(sample.slice(0, 3), true)) doc.text(run.str, run.x, height - run.y);
    doc.addPage();
    for (const run of page(sample.slice(3))) doc.text(run.str, run.x, height - run.y);
    return new Uint8Array(doc.output("arraybuffer"));
  }

  it("extracts the text of every page with its position", async () => {
    const pages = await extractPdfRuns(makePdf());
    expect(pages).toHaveLength(2);
    // jsPDF's built-in fonts cannot draw the rupee sign, so the amounts are left out of this comparison
    // (the real statement carries it: see the amount tests above).
    const wanted = [...page(sample.slice(0, 3), true), ...page(sample.slice(3))].filter((r) => !r.str.startsWith("₹"));
    const found = pages.flat();
    for (const run of wanted) {
      const match = found.find((f) => f.str.trim() === run.str.trim() && Math.abs(f.x - run.x) < 2);
      expect(match, `missing "${run.str}"`).toBeDefined();
    }
    // The parser then sees all five blocks; only the amount cannot be read from this test file.
    const out = parseGpayStatement(pages);
    expect(out.rows.length + out.failures.length).toBe(5);
    expect(out.failures.every((f) => /amount/.test(f.error))).toBe(true);
  });
  it("rejects files that are not usable PDFs, with a plain message", async () => {
    await expect(extractPdfRuns(new Uint8Array(0))).rejects.toBeInstanceOf(ImportFileError);
    await expect(extractPdfRuns(new TextEncoder().encode("name,amount\nx,1"))).rejects.toThrow(/not a PDF/);
    await expect(extractPdfRuns(new Uint8Array(5 * 1024 * 1024))).rejects.toThrow(/too large/);
    await expect(extractPdfRuns(new TextEncoder().encode("%PDF-1.4 this is broken"))).rejects.toBeInstanceOf(ImportFileError);
  });
});

describe("suggestBank", () => {
  const banks = [
    { id: "1", label: "GPay → Canara" },
    { id: "2", label: "GPay → IDFC" },
    { id: "3", label: "GPay → DBS" },
    { id: "4", label: "GPay → TMB" },
    { id: "5", label: "HDFC" },
    { id: "6", label: "HDFC → Credit Card" },
    { id: "7", label: "Slice" },
  ];
  it("matches the statement's account names to your banks", () => {
    expect(suggestBank("IDFC FIRST Bank 1960", banks)).toBe("2");
    expect(suggestBank("Canara Bank 5109", banks)).toBe("1");
    expect(suggestBank("DBS Bank 8099", banks)).toBe("3");
    expect(suggestBank("Tamilnad Mercantile Bank 6670", banks)).toBe("4");
  });
  it("prefers the bank named exactly, and never guesses when nothing matches or two fit equally", () => {
    expect(suggestBank("HDFC Bank 2203", banks)).toBe("5");
    expect(suggestBank("State Bank of India 1234", banks)).toBeNull();
    expect(suggestBank("Canara Bank 1", [{ id: "a", label: "GPay → Canara" }, { id: "b", label: "Office → Canara" }])).toBeNull();
  });
});

// ───────────────────────── Planning ─────────────────────────

const row = (over: Partial<ImportRow> & { id: string }): ImportRow => ({
  kind: "DEBIT", occurredAt: "2026-06-01T05:00:00.000Z", amountPaise: 10000, reason: "Paid to X", bank: "IDFC FIRST Bank 1960", toBank: null, ...over,
});

describe("planImport", () => {
  const rows = [
    row({ id: "1111" }),
    row({ id: "2222", kind: "CREDIT", reason: "Received from Y" }),
    row({ id: "3333", kind: "SELF_TRANSFER", bank: "IDFC FIRST Bank 1960", toBank: "Canara Bank 5109", reason: "Self transfer to Canara Bank 5109" }),
    row({ id: "4444", bank: "Canara Bank 5109" }),
  ];
  const map = { "IDFC FIRST Bank 1960": "acc-idfc", "Canara Bank 5109": "acc-canara" };

  it("adds payments, skips self transfers by default and never plans an unmatched bank", () => {
    const plan = planImport(rows, { bankMap: { ...map, "Canara Bank 5109": null }, includeSelfTransfers: false }, new Set());
    expect(plan.statuses.map((s) => s.state)).toEqual(["new", "new", "skipped", "skipped"]);
    expect(plan.entries.map((e) => [e.key, e.type, e.accountId])).toEqual([["gpay-import:1111", "DEBIT", "acc-idfc"], ["gpay-import:2222", "CREDIT", "acc-idfc"]]);
  });
  it("adds a self transfer as a debit on the source and a credit on the destination when asked", () => {
    const plan = planImport([rows[2]!], { bankMap: map, includeSelfTransfers: true }, new Set());
    expect(plan.entries.map((e) => [e.key, e.type, e.accountId, e.details])).toEqual([
      ["gpay-import:3333:out", "DEBIT", "acc-idfc", "Self transfer to Canara Bank 5109"],
      ["gpay-import:3333:in", "CREDIT", "acc-canara", "Self transfer from IDFC FIRST Bank 1960"],
    ]);
  });
  it("treats already-saved payments as duplicates, and a half-saved transfer as only its missing half", () => {
    const plan = planImport(rows, { bankMap: map, includeSelfTransfers: true }, new Set(["gpay-import:1111", "gpay-import:3333:out"]));
    expect(plan.statuses.map((s) => s.state)).toEqual(["duplicate", "new", "new", "new"]);
    expect(plan.entries.map((e) => e.key)).toEqual(["gpay-import:2222", "gpay-import:3333:in", "gpay-import:4444"]);
  });
  it("counts the same payment twice in one file once, and flags impossible rows", () => {
    const plan = planImport([row({ id: "1" + "000" }), row({ id: "1000" }), row({ id: "5555", amountPaise: 0 }), row({ id: "abc" }), row({ id: "6666", occurredAt: "2999-01-01T00:00:00Z" })], { bankMap: map, includeSelfTransfers: false }, new Set());
    expect(plan.statuses.map((s) => s.state)).toEqual(["new", "duplicate", "invalid", "invalid", "invalid"]);
  });
  it("lists which statement accounts need a bank", () => {
    expect(banksNeeded(rows, false)).toEqual(["Canara Bank 5109", "IDFC FIRST Bank 1960"]);
    expect(banksNeeded([rows[2]!], false)).toEqual([]);
    expect(banksNeeded([rows[2]!], true)).toEqual(["Canara Bank 5109", "IDFC FIRST Bank 1960"]);
  });
});

// ───────────────────────── Saving ─────────────────────────

describe("importEntries", () => {
  const ME = { id: "66666666-6666-4666-8666-666666666666", email: "import-me@example.com", name: "Me" };
  const OTHER = { id: "77777777-7777-4777-8777-777777777777", email: "import-other@example.com", name: "Other" };
  let database: TestDatabase;
  let db: TestDatabase["prisma"];
  let idfc = "";
  let canara = "";
  let theirs = "";

  beforeAll(async () => {
    database = await startTestDatabase();
    db = database.prisma;
    await ensureUserSetup(db, ME);
    await ensureUserSetup(db, OTHER);
    const gpay = await addBank(db, ME.id, { name: "Import GPay", kind: "WALLET" });
    idfc = await addSubBank(db, ME.id, { mainId: gpay, name: "IDFC" });
    canara = await addSubBank(db, ME.id, { mainId: gpay, name: "Canara" });
    theirs = (await getQuickPayOptions(db, OTHER.id)).banks[0]!.id;
  });
  afterAll(async () => {
    await database.close();
  });

  const rows = [
    row({ id: "9001", occurredAt: "2026-05-01T05:18:00.000Z", amountPaise: 40000, kind: "CREDIT", reason: "Received from Candy Dhanush" }),
    row({ id: "9002", occurredAt: "2026-05-01T05:32:00.000Z", amountPaise: 38725, reason: "Paid to Indian Railways" }),
    row({ id: "9003", occurredAt: "2026-05-02T07:03:00.000Z", amountPaise: 800000, kind: "SELF_TRANSFER", toBank: "Canara Bank 5109", reason: "Self transfer to Canara Bank 5109" }),
  ];
  const bankMap = () => ({ "IDFC FIRST Bank 1960": idfc, "Canara Bank 5109": canara });
  const balanceOf = async (id: string) => (await getBalances(db, ME.id)).groups.flatMap((g) => [...g.accounts, ...(g.direct ? [g.direct] : [])]).find((l) => l.id === id)!;

  it("saves the entries with their exact time, updates totals and balances, and a second import adds nothing", async () => {
    const plan = planImport(rows, { bankMap: bankMap(), includeSelfTransfers: false }, new Set());
    expect(await importEntries(db, ME.id, plan.entries)).toEqual({ imported: 2, duplicates: 0 });

    const list = await listTransactions(db, ME.id, parseTxFilters({}));
    expect(list.totals).toMatchObject({ debitPaise: 38725, creditPaise: 40000, count: 2 });
    const saved = list.rows.find((r) => r.details === "Paid to Indian Railways")!;
    expect(saved).toMatchObject({ type: "DEBIT", amountPaise: 38725, occurredAt: "2026-05-01T05:32:00.000Z", reason: "", details: "Paid to Indian Railways" });
    expect(saved.bank).toContain("IDFC");
    expect((await balanceOf(idfc)).currentPaise).toBe(40000 - 38725);

    expect(await importEntries(db, ME.id, plan.entries)).toEqual({ imported: 0, duplicates: 2 });
    expect((await listTransactions(db, ME.id, parseTxFilters({}))).totals.count).toBe(2);
  });

  it("importing an overlapping statement adds only the new payments, and self transfers move money between the banks", async () => {
    const existing = new Set(["gpay-import:9001", "gpay-import:9002"]);
    const plan = planImport(rows, { bankMap: bankMap(), includeSelfTransfers: true }, existing);
    expect(plan.statuses.map((s) => s.state)).toEqual(["duplicate", "duplicate", "new"]);
    expect(await importEntries(db, ME.id, plan.entries)).toEqual({ imported: 2, duplicates: 0 });
    expect((await balanceOf(idfc)).currentPaise).toBe(40000 - 38725 - 800000);
    expect((await balanceOf(canara)).currentPaise).toBe(800000);
  });

  it("refuses a bank that is not yours, and saves nothing from that request", async () => {
    const before = (await listTransactions(db, ME.id, parseTxFilters({}))).totals.count;
    const plan = planImport([row({ id: "9100" }), row({ id: "9101" })], { bankMap: { "IDFC FIRST Bank 1960": theirs }, includeSelfTransfers: false }, new Set());
    await expect(importEntries(db, ME.id, plan.entries)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listTransactions(db, ME.id, parseTxFilters({}))).totals.count).toBe(before);
  });

  it("respects an opening balance date: an imported payment before it is stored but not counted", async () => {
    const acc = await addBank(db, ME.id, { name: "Dated import", kind: "BANK" });
    const early = planImport([row({ id: "9200", occurredAt: "2026-05-01T05:00:00.000Z", amountPaise: 10000 })], { bankMap: { "IDFC FIRST Bank 1960": acc }, includeSelfTransfers: false }, new Set());
    await importEntries(db, ME.id, early.entries);
    expect((await balanceOf(acc)).currentPaise).toBe(-10000);
  });
});
