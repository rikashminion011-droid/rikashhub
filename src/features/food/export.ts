import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { formatINR, parseISODate } from "@/lib/finance";
import { formatDateTime, formatMonth, formatWeekday } from "./format";
import { MEAL_LABEL } from "./pricing";
import type { FoodEntryRow } from "./types";

/** Excel and PDF versions of Monthly Food Tracking. Pure functions: the route handler loads the data. */

export interface FoodExportMeta {
  /** The months covered ("2026-06"), oldest first. */
  months: readonly string[];
  totalPaise: number;
  generatedAt: Date;
}

export const describeMonths = (months: readonly string[]): string =>
  months.length === 0 ? "" : months.length === 1 ? formatMonth(months[0]!) : `${formatMonth(months[0]!)} to ${formatMonth(months.at(-1)!)}`;

const rupees = (paise: number) => paise / 100;

// ───────────────────────── File names ─────────────────────────

/** The name used when the user does not type one: "Monthly Food Tracking 2026-06" (or 2026-06 to 2026-08). */
export function defaultFileName(months: readonly string[]): string {
  if (months.length === 0) return "Monthly Food Tracking";
  return months.length === 1 ? `Monthly Food Tracking ${months[0]}` : `Monthly Food Tracking ${months[0]} to ${months.at(-1)}`;
}

/**
 * Makes a file name safe to send in a download header: no folders, no characters Windows or macOS reject,
 * no control characters, no leading dots, at most 100 characters, and no extension (the server adds the right one).
 * Returns null when nothing usable is left, so the caller can fall back to the default name.
 */
export function sanitizeFileName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let name = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  name = name.replace(/\.(xlsx|pdf)$/i, "").replace(/^[\s.]+/, "").replace(/[. ]+$/, "");
  if (name.length > 100) name = name.slice(0, 100).trim();
  // Names Windows reserves for devices.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = `${name}-file`;
  return name.length > 0 ? name : null;
}

/** A Content-Disposition value with an ASCII fallback and the full UTF-8 name. */
export function contentDisposition(name: string, extension: "xlsx" | "pdf"): string {
  const full = `${name}.${extension}`;
  const ascii = full.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`;
}

// ───────────────────────── Excel ─────────────────────────

const COLUMNS = ["Date", "Time", "Day", "Meal", "Food Item", "Amount", "Total Amount"] as const;
const HEADER_ROW = 6;

export async function buildFoodXlsx(rows: readonly FoodEntryRow[], meta: FoodExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rikash Hub";
  workbook.created = meta.generatedAt;
  const sheet = workbook.addWorksheet("Monthly Food Tracking", { views: [{ state: "frozen", ySplit: HEADER_ROW }] });

  sheet.addRow(["Monthly Food Tracking"]).font = { bold: true, size: 14 };
  sheet.addRow(["Period", describeMonths(meta.months)]).getCell(1).font = { bold: true };
  const total = sheet.addRow(["Total Amount", rupees(meta.totalPaise)]);
  total.getCell(1).font = { bold: true };
  total.getCell(2).numFmt = '"₹"#,##0.00';
  total.getCell(2).alignment = { horizontal: "left" };
  sheet.addRow(["Meals", rows.length]).getCell(1).font = { bold: true };
  sheet.addRow([]);

  const header = sheet.addRow([...COLUMNS]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };

  let running = 0;
  for (const row of rows) {
    const instant = new Date(row.occurredAt);
    const [h, m] = istTimeOf(instant).split(":").map(Number) as [number, number];
    running += row.amountPaise;
    const added = sheet.addRow([
      parseISODate(istDateOf(instant)), // a real date cell
      (h * 60 + m) / 1440, // a real time cell
      formatWeekday(instant),
      MEAL_LABEL[row.meal],
      row.notes,
      rupees(row.amountPaise),
      rupees(running),
    ]);
    added.getCell(1).numFmt = "dd mmm yyyy";
    added.getCell(2).numFmt = "h:mm AM/PM";
    added.getCell(6).numFmt = '"₹"#,##0.00';
    added.getCell(7).numFmt = '"₹"#,##0.00';
  }

  const totalRow = sheet.addRow(["Total", "", "", "", "", rupees(meta.totalPaise), rupees(meta.totalPaise)]);
  totalRow.font = { bold: true };
  totalRow.getCell(6).numFmt = '"₹"#,##0.00';
  totalRow.getCell(7).numFmt = '"₹"#,##0.00';

  sheet.columns = [{ width: 14 }, { width: 11 }, { width: 12 }, { width: 10 }, { width: 36 }, { width: 14 }, { width: 16 }];
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW + rows.length, column: COLUMNS.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ───────────────────────── PDF ─────────────────────────

/** The standard PDF fonts have no rupee sign, so the PDF writes "Rs." */
const pdfMoney = (paise: number) => formatINR(paise).replace("₹", "Rs. ");

export function buildFoodPdf(rows: readonly FoodEntryRow[], meta: FoodExportMeta): { bytes: Uint8Array; pages: number } {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold").setFontSize(18).text("Monthly Food Tracking", 40, 44);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(`Period: ${describeMonths(meta.months)}`, 40, 64);
  doc.text(`Report generated: ${formatDateTime(meta.generatedAt)}`, 40, 79);

  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Total Amount: ${pdfMoney(meta.totalPaise)}`, pageWidth - 40, 54, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(`${rows.length} meal${rows.length === 1 ? "" : "s"}`, pageWidth - 40, 70, { align: "right" });

  let running = 0;
  autoTable(doc, {
    startY: 96,
    head: [["Date and Time", "Day", "Food Item", "Amount", "Total Amount"]],
    body: rows.map((row) => {
      running += row.amountPaise;
      return [formatDateTime(new Date(row.occurredAt)), formatWeekday(new Date(row.occurredAt)), `${MEAL_LABEL[row.meal]}: ${row.notes}`, pdfMoney(row.amountPaise), pdfMoney(running)];
    }),
    foot: [["Total", "", "", pdfMoney(meta.totalPaise), pdfMoney(meta.totalPaise)]],
    showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 60 }, 3: { halign: "right", cellWidth: 62 }, 4: { halign: "right", cellWidth: 70 } },
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
  return { bytes: new Uint8Array(doc.output("arraybuffer")), pages };
}
