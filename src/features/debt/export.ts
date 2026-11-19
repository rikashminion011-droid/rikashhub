import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatINR } from "@/lib/finance";
import type { DebtHistory, DebtItem } from "./types";

/** The Excel and PDF versions of one recipient's transactions. Pure functions: the route loads the data. */

const LABEL: Record<DebtItem["source"], string> = { SPLIT: "Split", DEBT: "Debt", SHOPPING: "Shopping", CREDIT_PORTAL: "Credit Portal", MANUAL: "Added debt", PAYMENT: "Payment" };
const at = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const rupees = (paise: number) => paise / 100;
/** The standard PDF fonts have no rupee sign, so the PDF writes "Rs." */
const pdfMoney = (paise: number) => formatINR(paise).replace("₹", "Rs. ");

export interface DebtExportMeta {
  period: string;
  hdfcPeriod: string;
  generatedAt: Date;
}

function sums(items: readonly DebtItem[]) {
  const owed = items.filter((i) => i.source !== "PAYMENT").reduce((s, i) => s + i.amountPaise, 0);
  const paid = items.filter((i) => i.source === "PAYMENT").reduce((s, i) => s + i.amountPaise, 0);
  return { owed, paid };
}

export async function buildDebtXlsx(history: DebtHistory, meta: DebtExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rikash Hub";
  workbook.created = meta.generatedAt;
  const sheet = workbook.addWorksheet("Debt");
  sheet.addRow([`${history.row.name} - Debt report`]).font = { bold: true, size: 14 };
  sheet.addRow(["Period", meta.period]);
  sheet.addRow(["HDFC statement date", meta.hdfcPeriod]);
  sheet.addRow([]);
  const head = sheet.addRow(["Date and time", "Type", "Reason", "Category", "Portal / platform", "Debt", "Paid / Credited"]);
  head.font = { bold: true };
  for (const i of history.items) {
    const payment = i.source === "PAYMENT";
    sheet.addRow([at.format(new Date(i.occurredAt)), LABEL[i.source], i.reason, i.category, i.related, payment ? null : rupees(i.amountPaise), payment ? rupees(i.amountPaise) : null]);
  }
  const { owed, paid } = sums(history.items);
  sheet.addRow(["Total", "", "", "", "", rupees(owed), rupees(paid)]).font = { bold: true };
  const outstanding = sheet.addRow(["Outstanding balance", "", "", "", "", rupees(history.row.remainingPaise), ""]);
  outstanding.font = { bold: true };
  sheet.columns = [{ width: 24 }, { width: 16 }, { width: 36 }, { width: 20 }, { width: 24 }, { width: 16 }, { width: 16 }];
  for (const col of [6, 7]) sheet.getColumn(col).numFmt = '"₹"#,##0.00';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildDebtPdf(history: DebtHistory, meta: DebtExportMeta): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const { owed, paid } = sums(history.items);

  doc.setFont("helvetica", "bold").setFontSize(18).text(`${history.row.name} - Debt report`, 40, 44);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(`Period: ${meta.period}   |   HDFC statement date: ${meta.hdfcPeriod}`, 40, 64);
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Total debt: ${pdfMoney(owed)}`, pageWidth - 40, 44, { align: "right" });
  doc.text(`Paid / credited: ${pdfMoney(paid)}`, pageWidth - 40, 60, { align: "right" });
  doc.text(`${history.row.remainingPaise < 0 ? "Paid ahead" : "Outstanding"}: ${pdfMoney(Math.abs(history.row.remainingPaise))}`, pageWidth - 40, 76, { align: "right" });

  autoTable(doc, {
    startY: 92,
    head: [["Date and time", "Type", "Reason", "Category", "Portal / platform", "Debt", "Paid / Credited"]],
    body: history.items.map((i) => {
      const payment = i.source === "PAYMENT";
      return [at.format(new Date(i.occurredAt)), LABEL[i.source], i.reason, i.category, i.related, payment ? "" : pdfMoney(i.amountPaise), payment ? pdfMoney(i.amountPaise) : ""];
    }),
    foot: [["Total", "", "", "", "", pdfMoney(owed), pdfMoney(paid)]],
    showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    columnStyles: { 5: { halign: "right", cellWidth: 80 }, 6: { halign: "right", cellWidth: 90 } },
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
