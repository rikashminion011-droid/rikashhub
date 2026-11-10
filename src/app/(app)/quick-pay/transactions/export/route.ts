import { NextResponse, type NextRequest } from "next/server";
import { buildPdf, buildXlsx } from "@/features/quick-pay/export";
import { effectiveRange, parseTxFilters } from "@/features/quick-pay/filters";
import { istDateOf } from "@/features/quick-pay/datetime";
import { listForExport } from "@/features/quick-pay/server/entries";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";

const limiter = new RateLimiter(20, 60_000);

/**
 * Downloads the transactions that match the page's filters as Excel (.xlsx) or PDF.
 * GET /quick-pay/transactions/export?format=xlsx|pdf&month=…&from=…&to=…&q=…
 */
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
    const { rows, totals, truncated } = await listForExport(getPrisma(), user.id, filters);
    const meta = { from, to, totals, generatedAt: new Date(), search: filters.q || undefined };
    const stamp = istDateOf(meta.generatedAt);

    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="gpay-transactions-${stamp}.${format}"`,
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    };

    if (format === "xlsx") {
      const file = await buildXlsx(rows, meta);
      return new NextResponse(new Uint8Array(file), {
        headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
    }
    const { bytes } = buildPdf(rows, meta);
    return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/pdf" } });
  } catch (error) {
    console.error("[quick-pay] export failed", error);
    return NextResponse.json({ error: "Could not create the export. Please try again." }, { status: 500 });
  }
}
