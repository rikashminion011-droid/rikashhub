import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatINR } from "@/lib/finance";
import { COLUMNS, SOURCE_LABEL, totalsOf, whenOf, type ColumnId } from "./recipient-view";
import type { DebtItem } from "./types";

/**
 * The Excel and PDF versions of one recipient's transactions. They hold exactly what the page shows for the chosen filters and
 * date range, in the columns and order chosen for that recipient. Pure: the route loads and filters the rows.
 */

export interface DebtExportMeta {
  /** The recipient. */
  name: string;
  period: string;
  hdfcPeriod: string;
  /** The filters in words ("Search: tea"), printed under the heading. */
  filters: string[];
  generatedAt: Date;
}

const LABEL = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label])) as Record<ColumnId, string>;
const rupees = (paise: number) => paise / 100;
/** The standard PDF fonts have no rupee sign, so the PDF writes "Rs." */
const pdfMoney = (paise: number) => formatINR(paise).replace("₹", "Rs. ");

const isPayment = (i: DebtItem) => i.source === "PAYMENT";
const textOf = (i: DebtItem, c: ColumnId): string => (c === "date" ? whenOf(i.occurredAt) : c === "type" ? SOURCE_LABEL[i.source] : c === "reason" ? i.reason : c === "category" ? i.category : c === "related" ? i.related : "");

export async function buildDebtXlsx(items: readonly DebtItem[], columns: readonly ColumnId[], meta: DebtExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rikash Hub";
  workbook.created = meta.generatedAt;
  const sheet = workbook.addWorksheet("Debt");
  sheet.addRow([`${meta.name} - Debt report`]).font = { bold: true, size: 14 };
  sheet.addRow(["Period", meta.period]);
  sheet.addRow(["HDFC statement date", meta.hdfcPeriod]);
  sheet.addRow(["Filters", meta.filters.join("; ") || "None"]);
  sheet.addRow([]);
  sheet.addRow(columns.map((c) => LABEL[c])).font = { bold: true };
  for (const i of items) sheet.addRow(columns.map((c) => (c === "debt" ? (isPayment(i) ? null : rupees(i.amountPaise)) : c === "paid" ? (isPayment(i) ? rupees(i.amountPaise) : null) : textOf(i, c))));
  const t = totalsOf(items);
  sheet.addRow(columns.map((c, n) => (n === 0 ? "Total" : c === "debt" ? rupees(t.debitPaise) : c === "paid" ? rupees(t.creditPaise) : ""))).font = { bold: true };
  sheet.addRow(["Outstanding balance", rupees(t.remainingPaise)]).font = { bold: true };
  columns.forEach((c, n) => {
    const col = sheet.getColumn(n + 1);
    col.width = c === "reason" ? 36 : c === "date" ? 24 : 18;
    if (c === "debt" || c === "paid") col.numFmt = '"₹"#,##0.00';
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildDebtPdf(items: readonly DebtItem[], columns: readonly ColumnId[], meta: DebtExportMeta): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const t = totalsOf(items);

  doc.setFont("helvetica", "bold").setFontSize(18).text(`${meta.name} - Debt report`, 40, 44);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(`Period: ${meta.period}   |   HDFC statement date: ${meta.hdfcPeriod}`, 40, 64);
  if (meta.filters.length > 0) doc.text(`Filters: ${meta.filters.join("; ")}`, 40, 78);
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Debit: ${pdfMoney(t.debitPaise)}`, pageWidth - 40, 44, { align: "right" });
  doc.text(`Credit: ${pdfMoney(t.creditPaise)}`, pageWidth - 40, 60, { align: "right" });
  doc.text(`${t.remainingPaise < 0 ? "Paid ahead" : "Remaining"}: ${pdfMoney(Math.abs(t.remainingPaise))}`, pageWidth - 40, 76, { align: "right" });

  const right: Record<string, { halign: "right" }> = {};
  columns.forEach((c, n) => {
    if (c === "debt" || c === "paid") right[n] = { halign: "right" };
  });
  autoTable(doc, {
    startY: 92,
    head: [columns.map((c) => LABEL[c])],
    body: items.map((i) => columns.map((c) => (c === "debt" ? (isPayment(i) ? "" : pdfMoney(i.amountPaise)) : c === "paid" ? (isPayment(i) ? pdfMoney(i.amountPaise) : "") : textOf(i, c)))),
    foot: [columns.map((c, n) => (n === 0 ? "Total" : c === "debt" ? pdfMoney(t.debitPaise) : c === "paid" ? pdfMoney(t.creditPaise) : ""))],
    showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    columnStyles: right,
    margin: { left: 40, right: 40, bottom: 40 },
    rowPageBreak: "avoid",
    showHead: "everyPage",
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    doc.text(`Page ${page} of ${pages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
