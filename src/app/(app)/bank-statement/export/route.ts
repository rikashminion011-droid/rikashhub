import { NextResponse, type NextRequest } from "next/server";
import { buildBankPdf, buildBankXlsx } from "@/features/bank-statement/export";
import { listBankStatementForExport } from "@/features/bank-statement/server/service";
import { istDateOf } from "@/features/quick-pay/datetime";
import { effectiveRange, parseTxFilters } from "@/features/quick-pay/filters";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";

const limiter = new RateLimiter(20, 60_000);

/** Downloads the rows that match the page's filters as Excel (.xlsx) or PDF. GET /bank-statement/export?format=xlsx|pdf&name=…&month=…&banks=… */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  if (!limiter.check(user.id).allowed) return NextResponse.json({ error: "Too many exports. Wait a minute and try again." }, { status: 429 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const format = params.format === "pdf" ? "pdf" : params.format === "xlsx" ? "xlsx" : null;
  if (!format) return NextResponse.json({ error: "Choose xlsx or pdf." }, { status: 400 });

  try {
    const filters = parseTxFilters(params);
    const { from, to } = effectiveRange(filters);
    const { rows, totals, truncated } = await listBankStatementForExport(getPrisma(), user.id, filters);
    const meta = { from, to, totals, generatedAt: new Date(), search: filters.q || undefined };
    const chosen = (params.name ?? "").normalize("NFKC").replace(/[\\/:*?"<>|\r\n]+/g, "-").trim().slice(0, 120);
    const base = chosen || `bank-statement-${istDateOf(meta.generatedAt)}`;
    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${base.replace(/"/g, "")}.${format}"; filename*=UTF-8''${encodeURIComponent(base)}.${format}`,
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    };
    if (format === "xlsx") {
      const file = await buildBankXlsx(rows, meta);
      return new NextResponse(new Uint8Array(file), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    }
    return new NextResponse(new Uint8Array(buildBankPdf(rows, meta)), { headers: { ...headers, "Content-Type": "application/pdf" } });
  } catch (error) {
    console.error("[bank-statement] export failed", error);
    return NextResponse.json({ error: "Could not create the export. Please try again." }, { status: 500 });
  }
}
