import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { listStatement, listUnbilled } from "@/features/credit-portal/server/service";
import { formatClock, formatLongDate } from "@/features/quick-pay/date-format";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { parseISODate } from "@/lib/finance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rupees = (paise: number) => Math.round(paise) / 100;
const when = (iso: string) => ({ date: formatLongDate(istDateOf(new Date(iso))), time: formatClock(istTimeOf(new Date(iso))) });

function validDate(value: string | null): string | null {
  if (!value) return null;
  try {
    parseISODate(value);
    return value;
  } catch {
    return null;
  }
}

/** Downloads the table of the open Credit Portal tab as an Excel file, with the same columns and the same period. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  const q = request.nextUrl.searchParams;
  const portalId = q.get("portal") ?? "";
  if (!UUID.test(portalId)) return NextResponse.json({ error: "Choose a portal." }, { status: 400 });
  const tab = q.get("tab") === "statement" ? "statement" : "unbilled";
  const range = { from: validDate(q.get("from")), to: validDate(q.get("to")) };

  const db = getPrisma();
  const portal = await db.creditPortal.findFirst({ where: { id: portalId, userId: user.id, deletedAt: null } });
  if (!portal) return NextResponse.json({ error: "That portal no longer exists." }, { status: 404 });
  const people = new Map((await db.expenseParty.findMany({ where: { userId: user.id } })).map((p) => [p.id, p.name]));
  const names = (ids: string[]) => ids.map((id) => people.get(id) ?? "").filter(Boolean).join(", ");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(tab === "statement" ? "Statement" : "Unbilled");
  sheet.addRow([`${portal.name} - ${tab === "statement" ? "Statement" : "Unbilled Transactions"}`]).font = { bold: true, size: 14 };
  sheet.addRow([range.from || range.to ? `Period: ${range.from ?? "start"} to ${range.to ?? "today"}` : "All dates"]);
  sheet.addRow([]);

  if (tab === "statement") {
    const { rows, totals } = await listStatement(db, user.id, portalId, range);
    const head = sheet.addRow(["Date and Time", "Transaction Details", "Reason", "Debit", "Credit", "Recipient", "Category"]);
    head.font = { bold: true };
    const cats = new Map((await db.transactionCategory.findMany({ where: { userId: user.id } })).map((c) => [c.id, c.name]));
    for (const r of rows) {
      const t = when(r.occurredAt);
      sheet.addRow([`${t.date}, ${t.time}`, r.details, r.reason, r.debitPaise ? rupees(r.debitPaise) : null, r.creditPaise ? rupees(r.creditPaise) : null, names(r.recipientIds), r.categoryId ? (cats.get(r.categoryId) ?? "") : ""]);
    }
    const total = sheet.addRow(["Total", "", "", rupees(totals.debitPaise), rupees(totals.creditPaise), "", ""]);
    total.font = { bold: true };
    sheet.columns = [{ width: 28 }, { width: 44 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 24 }, { width: 20 }];
  } else {
    const rows = (await listUnbilled(db, user.id, portalId, range)).filter((r) => !r.settled);
    const head = sheet.addRow(["Date and Time", "Reason", "Debit", "Amount", "Recipient"]);
    head.font = { bold: true };
    for (const r of rows) {
      const t = when(r.occurredAt);
      sheet.addRow([`${t.date}, ${t.time}`, r.reason || r.details, r.kind === "DEBIT" ? "Debit" : "Credit", rupees(r.amountPaise), names(r.recipientIds)]);
    }
    const sum = rows.reduce((s, r) => s + (r.kind === "DEBIT" ? r.amountPaise : -r.amountPaise), 0);
    sheet.addRow(["Total", "", "", rupees(sum), ""]).font = { bold: true };
    sheet.columns = [{ width: 28 }, { width: 36 }, { width: 10 }, { width: 14 }, { width: 28 }];
  }
  for (const col of [tab === "statement" ? 4 : 4, 5]) sheet.getColumn(col).numFmt = '"₹"#,##0.00';

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const file = `${portal.name.replace(/[^a-z0-9]+/gi, "-")}-${tab}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
