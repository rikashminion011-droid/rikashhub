import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatINR, parseISODate } from "@/lib/finance";
import { formatTransactionWhen, istDateOf, istTimeOf, istInstant } from "./datetime";
import type { TxRow, TxTotals } from "./types";

/** Builds the Excel and PDF versions of a transaction list. Pure functions: the route handler does the data loading. */

export interface ExportMeta {
  /** Inclusive range as YYYY-MM-DD, or nulls for all time. */
  from: string | null;
  to: string | null;
  totals: TxTotals;
  generatedAt: Date;
  /** The search text, when one was used. */
  search?: string;
}

const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", month: "long", day: "numeric", year: "numeric" });

/** "June 1, 2026 – June 30, 2026", "From June 1, 2026", or "All time". */
export function describeRange(from: string | null, to: string | null): string {
  const fmt = (d: string) => dayLabel.format(istInstant(d, "12:00"));
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Up to ${fmt(to)}`;
  return "All time";
}

const rupees = (paise: number) => paise / 100;
const weekdayOf = (instant: Date) => formatTransactionWhen(instant).timeAndDay.split(" – ")[1] ?? "";

// ───────────────────────── Excel ─────────────────────────

const COLUMNS = ["Date", "Time", "Day", "Debit", "Credit", "Reason", "Bank", "Category", "Split"] as const;

export async function buildXlsx(rows: readonly TxRow[], meta: ExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rikash Finance";
  workbook.created = meta.generatedAt;
  const sheet = workbook.addWorksheet("GPay Transactions", { views: [{ state: "frozen", ySplit: 7 }] });

  sheet.addRow(["GPay Transactions"]).font = { bold: true, size: 14 };
  sheet.addRow(["Period", describeRange(meta.from, meta.to)]);
  if (meta.search) sheet.addRow(["Search", meta.search]);
  else sheet.addRow([]);
  const totalDebit = sheet.addRow(["Total Debit", rupees(meta.totals.debitPaise)]);
  const totalCredit = sheet.addRow(["Total Credit", rupees(meta.totals.creditPaise)]);
  for (const row of [totalDebit, totalCredit]) {
    row.getCell(1).font = { bold: true };
    row.getCell(2).numFmt = '"₹"#,##0.00';
    row.getCell(2).alignment = { horizontal: "left" };
  }
  sheet.addRow(["Generated", `${formatTransactionWhen(meta.generatedAt).date}, ${formatTransactionWhen(meta.generatedAt).timeAndDay.split(" – ")[0]}`]);
  sheet.getRow(2).getCell(1).font = { bold: true };

  const header = sheet.addRow([...COLUMNS]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  header.alignment = { vertical: "middle" };

  for (const row of rows) {
    const instant = new Date(row.occurredAt);
    const [h, m] = istTimeOf(instant).split(":").map(Number) as [number, number];
    const added = sheet.addRow([
      parseISODate(istDateOf(instant)), // a real date cell
      (h * 60 + m) / 1440, // a real time cell
      weekdayOf(instant),
      row.type === "DEBIT" ? rupees(row.amountPaise) : null,
      row.type === "CREDIT" ? rupees(row.amountPaise) : null,
      row.reason,
      row.bank,
      row.category,
      row.person ?? "",
    ]);
    added.getCell(1).numFmt = "mmmm d, yyyy";
    added.getCell(2).numFmt = "h:mm AM/PM";
    added.getCell(4).numFmt = '"₹"#,##0.00';
    added.getCell(5).numFmt = '"₹"#,##0.00';
  }

  const totalRow = sheet.addRow(["Total", "", "", rupees(meta.totals.debitPaise), rupees(meta.totals.creditPaise), "", "", "", ""]);
  totalRow.font = { bold: true };
  totalRow.getCell(4).numFmt = '"₹"#,##0.00';
  totalRow.getCell(5).numFmt = '"₹"#,##0.00';

  sheet.columns = [{ width: 18 }, { width: 11 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 38 }, { width: 22 }, { width: 22 }, { width: 16 }];
  sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7 + rows.length, column: COLUMNS.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ───────────────────────── PDF ─────────────────────────

/** The standard PDF fonts have no rupee sign, so the PDF writes "Rs." */
const pdfMoney = (paise: number) => formatINR(paise).replace("₹", "Rs. ");

export function buildPdf(rows: readonly TxRow[], meta: ExportMeta): { bytes: Uint8Array; pages: number } {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generated = formatTransactionWhen(meta.generatedAt);

  doc.setFont("helvetica", "bold").setFontSize(18).text("GPay Transactions Report", 40, 44);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(`Period: ${describeRange(meta.from, meta.to)}${meta.search ? `   |   Search: "${meta.search}"` : ""}`, 40, 64);
  doc.text(`Report generated: ${generated.date}, ${generated.timeAndDay.split(" – ")[0]}`, 40, 79);

  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Total Debit: ${pdfMoney(meta.totals.debitPaise)}`, pageWidth - 40, 54, { align: "right" });
  doc.text(`Total Credit: ${pdfMoney(meta.totals.creditPaise)}`, pageWidth - 40, 70, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(`${meta.totals.count} transaction${meta.totals.count === 1 ? "" : "s"}`, pageWidth - 40, 85, { align: "right" });

  autoTable(doc, {
    startY: 100,
    head: [["Date & Time", "Debit", "Credit", "Reason", "Bank", "Category", "Split"]],
    body: rows.map((row) => {
      const when = formatTransactionWhen(new Date(row.occurredAt));
      return [
        `${when.date}\n${when.timeAndDay}`,
        row.type === "DEBIT" ? pdfMoney(row.amountPaise) : "",
        row.type === "CREDIT" ? pdfMoney(row.amountPaise) : "",
        row.reason,
        row.bank,
        row.category,
        row.person ?? "",
      ];
    }),
    foot: [["Total", pdfMoney(meta.totals.debitPaise), pdfMoney(meta.totals.creditPaise), "", "", "", ""]],
    showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 110 }, 1: { halign: "right", cellWidth: 80 }, 2: { halign: "right", cellWidth: 80 } },
    margin: { left: 40, right: 40, bottom: 40 },
    // Keep a row's two-line date together and repeat the header on every page.
    rowPageBreak: "avoid",
    showHead: "everyPage",
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    doc.text(`Page ${page} of ${pages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
  }
  return { bytes: new Uint8Array(doc.output("arraybuffer")), pages };
}
