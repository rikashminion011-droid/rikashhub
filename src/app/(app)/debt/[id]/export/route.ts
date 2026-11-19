import { NextResponse, type NextRequest } from "next/server";
import { buildDebtPdf, buildDebtXlsx } from "@/features/debt/export";
import { getDebtHistory } from "@/features/debt/server/service";
import { istDateOf } from "@/features/quick-pay/datetime";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { hdfcFromParams, periodFromParams } from "@/lib/period-params";
import { RateLimiter } from "@/lib/security/rate-limit";

const limiter = new RateLimiter(20, 60_000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Downloads one recipient's transactions as Excel (.xlsx) or PDF, for the same period as the page. GET /debt/:id/export?format=xlsx|pdf&month=…&hfrom=… */
export async function GET(request: NextRequest, ctx: RouteContext<"/debt/[id]/export">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  if (!limiter.check(user.id).allowed) return NextResponse.json({ error: "Too many exports. Wait a minute and try again." }, { status: 429 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Choose a recipient." }, { status: 400 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const format = params.format === "pdf" ? "pdf" : params.format === "xlsx" ? "xlsx" : null;
  if (!format) return NextResponse.json({ error: "Choose xlsx or pdf." }, { status: 400 });

  try {
    const generatedAt = new Date();
    const today = istDateOf(generatedAt);
    const period = periodFromParams(params, today);
    const hdfc = hdfcFromParams(params, today);
    const history = await getDebtHistory(getPrisma(), user.id, id, { from: period.from, to: period.to, hdfc: { from: hdfc.from, to: hdfc.to } });
    const meta = { period: `${period.from} to ${period.to}`, hdfcPeriod: `${hdfc.from} to ${hdfc.to}`, generatedAt };
    const base = `${history.row.name.replace(/[\\/:*?"<>|\r\n]+/g, "-").trim() || "recipient"}-debt-report-${today}`;
    const headers = { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${base.replace(/"/g, "")}.${format}"; filename*=UTF-8''${encodeURIComponent(base)}.${format}` };
    if (format === "xlsx") {
      const file = await buildDebtXlsx(history, meta);
      return new NextResponse(new Uint8Array(file), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    }
    return new NextResponse(new Uint8Array(buildDebtPdf(history, meta)), { headers: { ...headers, "Content-Type": "application/pdf" } });
  } catch (error) {
    if (error instanceof Error && error.message === "That person no longer exists.") return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("[debt] export failed", error);
    return NextResponse.json({ error: "Could not create the export. Please try again." }, { status: 500 });
  }
}
