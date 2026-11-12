import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildPdf, buildXlsx, describeRange, type ExportMeta } from "@/features/quick-pay/export";
import type { TxRow } from "@/features/quick-pay/types";

const row = (i: number, over: Partial<TxRow> = {}): TxRow => ({
  id: `id-${i}`,
  occurredAt: new Date(Date.UTC(2026, 5, 25, 3, 51 - (i % 50))).toISOString(),
  type: "DEBIT",
  amountPaise: 12345,
  reason: `Reason ${i}`,
  details: "",
  bank: "GPay → HDFC",
  bankName: "HDFC",
  bankId: null,
  category: "Food → Dosa",
  categoryId: null,
  person: i % 2 ? "Mukesh" : null,
  partyId: null,
  sharePaise: null,
  splitPercent: null,
  linkedCreditsPaise: 0,
  ...over,
});

const meta = (over: Partial<ExportMeta> = {}): ExportMeta => ({
  from: "2026-06-01",
  to: "2026-06-30",
  totals: { debitPaise: 12345, creditPaise: 50000, count: 2 },
  generatedAt: new Date("2026-11-10T04:30:00Z"),
  ...over,
});

describe("describeRange", () => {
  it("describes the selected period", () => {
    expect(describeRange("2026-06-01", "2026-06-30")).toBe("June 1, 2026 – June 30, 2026");
    expect(describeRange("2026-06-01", "2026-06-01")).toBe("June 1, 2026");
    expect(describeRange("2026-06-01", null)).toBe("From June 1, 2026");
    expect(describeRange(null, "2026-06-30")).toBe("Up to June 30, 2026");
    expect(describeRange(null, null)).toBe("All time");
  });
});

describe("Excel export", () => {
  async function read(rows: TxRow[], m = meta()) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildXlsx(rows, m)) as never);
    return workbook.getWorksheet("GPay Transactions")!;
  }

  it("has the period, totals, headers and one line per transaction", async () => {
    const sheet = await read([row(1), row(2, { type: "CREDIT", amountPaise: 50000, reason: "Salary", bank: "HDFC", category: "", person: null })]);
    expect(sheet.getCell("A1").value).toBe("GPay Transactions");
    expect(sheet.getCell("B2").value).toBe("June 1, 2026 – June 30, 2026");
    expect(sheet.getCell("B4").value).toBe(123.45);
    expect(sheet.getCell("B5").value).toBe(500);
    expect(sheet.getRow(7).values).toEqual([undefined, "Date", "Time", "Day", "Debit", "Credit", "Transaction details", "Reason", "Bank", "Category", "Split"]);
  });

  it("keeps dates and times as real Excel dates and times, in IST, with the weekday", async () => {
    const sheet = await read([row(1)]);
    const r = sheet.getRow(8);
    expect(r.getCell(1).value).toEqual(new Date("2026-06-25T00:00:00.000Z"));
    expect(r.getCell(1).numFmt).toBe("mmmm d, yyyy");
    // Stored as a fraction of a day (0.3889 = 09:20, the time in IST); the reader shows it as a time on Excel's day zero.
    expect(r.getCell(2).value).toEqual(new Date("1899-12-30T09:20:00.000Z"));
    expect(r.getCell(2).numFmt).toBe("h:mm AM/PM");
    expect(r.getCell(3).value).toBe("Thursday");
  });

  it("puts a debit only under Debit and a credit only under Credit, never both", async () => {
    const sheet = await read([row(1), row(2, { type: "CREDIT", amountPaise: 50000 })]);
    const debit = sheet.getRow(8);
    const credit = sheet.getRow(9);
    expect([debit.getCell(4).value, debit.getCell(5).value]).toEqual([123.45, null]);
    expect([credit.getCell(4).value, credit.getCell(5).value]).toEqual([null, 500]);
    expect(debit.getCell(4).numFmt).toBe('"₹"#,##0.00');
  });

  it("includes reason, bank, category and person, and a totals row", async () => {
    const sheet = await read([row(1)]);
    const r = sheet.getRow(8);
    expect([7, 8, 9, 10].map((c) => r.getCell(c).value)).toEqual(["Reason 1", "HDFC", "Food → Dosa", "Mukesh"]);
    const total = sheet.getRow(9);
    expect([total.getCell(1).value, total.getCell(4).value, total.getCell(5).value]).toEqual(["Total", 123.45, 500]);
  });

  it("notes the search that was used, and works with no rows", async () => {
    const sheet = await read([], meta({ search: "petrol", totals: { debitPaise: 0, creditPaise: 0, count: 0 } }));
    expect(sheet.getCell("B3").value).toBe("petrol");
    expect(sheet.getCell("B4").value).toBe(0);
  });
});

describe("PDF export", () => {
  it("is a real PDF report with the period, totals and the table", () => {
    const { bytes, pages } = buildPdf([row(1), row(2, { type: "CREDIT" })], meta());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pages).toBe(1);
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it("spreads a long list over several pages", () => {
    const rows = Array.from({ length: 150 }, (_, i) => row(i));
    const { pages, bytes } = buildPdf(rows, meta({ totals: { debitPaise: 150 * 12345, creditPaise: 0, count: 150 } }));
    expect(pages).toBeGreaterThan(2);
    expect(new TextDecoder().decode(bytes.slice(-6))).toContain("%%EOF");
  });

  it("handles an empty list and long text without failing", () => {
    expect(buildPdf([], meta({ totals: { debitPaise: 0, creditPaise: 0, count: 0 } })).pages).toBe(1);
    expect(buildPdf([row(1, { reason: "x ".repeat(300) })], meta()).pages).toBeGreaterThanOrEqual(1);
  });
});
