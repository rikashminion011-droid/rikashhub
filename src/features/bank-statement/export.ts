import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describeRange } from "@/features/quick-pay/export";
import { formatINR } from "@/lib/finance";
import type { BsRow, BsTotals } from "./types";

/** The Excel and PDF versions of the Bank Statement list. Pure: the route loads the rows. */

export interface BsExportMeta {
  from: string | null;
  to: string | null;
  totals: BsTotals;
  generatedAt: Date;
  search?: string;
}

const rupees = (paise: number) => paise / 100;
/** The standard PDF fonts have no rupee sign, so the PDF writes "Rs." */
const pdfMoney = (paise: number) => formatINR(paise).replace("₹", "Rs. ");
const dayText = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
const whenOf = (r: BsRow) => `${dayText.format(new Date(`${r.date}T00:00:00Z`))}${r.time !== "00:00" ? ` ${r.time}` : ""}`;

export async function buildBankXlsx(rows: readonly BsRow[], meta: BsExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rikash Hub";
  workbook.created = meta.generatedAt;
  const sheet = workbook.addWorksheet("Bank Statement", { views: [{ state: "frozen", ySplit: 6 }] });
  sheet.addRow(["Bank Statement"]).font = { bold: true, size: 14 };
  sheet.addRow(["Period", describeRange(meta.from, meta.to)]);
  sheet.addRow(["Search", meta.search ?? ""]);
  const debit = sheet.addRow(["Total Debit", rupees(meta.totals.debitPaise)]);
  const credit = sheet.addRow(["Total Credit", rupees(meta.totals.creditPaise)]);
  for (const r of [debit, credit]) {
    r.getCell(1).font = { bold: true };
    r.getCell(2).numFmt = '"₹"#,##0.00';
    r.getCell(2).alignment = { horizontal: "left" };
  }
  sheet.addRow(["Date and time", "Debit", "Credit", "Balance", "Transaction details", "Bank", "Reason", "Category"]).font = { bold: true };
  for (const r of rows) sheet.addRow([whenOf(r), r.debitPaise ? rupees(r.debitPaise) : null, r.creditPaise ? rupees(r.creditPaise) : null, r.balancePaise === null ? null : rupees(r.balancePaise), r.details, r.bank, r.reason, r.category]);
  sheet.addRow(["Total", rupees(meta.totals.debitPaise), rupees(meta.totals.creditPaise), null, "", "", "", ""]).font = { bold: true };
  sheet.columns = [{ width: 20 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 50 }, { width: 18 }, { width: 24 }, { width: 20 }];
  for (const col of [2, 3, 4]) sheet.getColumn(col).numFmt = '"₹"#,##0.00';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildBankPdf(rows: readonly BsRow[], meta: BsExportMeta): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold").setFontSize(18).text("Bank Statement Report", 40, 44);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(`Period: ${describeRange(meta.from, meta.to)}${meta.search ? `   |   Search: "${meta.search}"` : ""}`, 40, 64);
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Total Debit: ${pdfMoney(meta.totals.debitPaise)}`, pageWidth - 40, 54, { align: "right" });
  doc.text(`Total Credit: ${pdfMoney(meta.totals.creditPaise)}`, pageWidth - 40, 70, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(`${meta.totals.count} row${meta.totals.count === 1 ? "" : "s"}`, pageWidth - 40, 85, { align: "right" });

  autoTable(doc, {
    startY: 100,
    head: [["Date", "Debit", "Credit", "Balance", "Transaction details", "Bank", "Reason", "Category"]],
    body: rows.map((r) => [whenOf(r), r.debitPaise ? pdfMoney(r.debitPaise) : "", r.creditPaise ? pdfMoney(r.creditPaise) : "", r.balancePaise === null ? "" : pdfMoney(r.balancePaise), r.details, r.bank, r.reason, r.category]),
    foot: [["Total", pdfMoney(meta.totals.debitPaise), pdfMoney(meta.totals.creditPaise), "", "", "", "", ""]],
    showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3.5, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 70 }, 1: { halign: "right", cellWidth: 70 }, 2: { halign: "right", cellWidth: 70 }, 3: { halign: "right", cellWidth: 75 } },
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
