import { NextResponse, type NextRequest } from "next/server";
import { buildFoodPdf, buildFoodXlsx, contentDisposition, defaultFileName, sanitizeFileName } from "@/features/food/export";
import { listFoodEntries } from "@/features/food/server/service";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";

const limiter = new RateLimiter(20, 60_000);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Downloads Monthly Food Tracking for a month range as Excel (.xlsx) or PDF, under the file name the user chose.
 * GET /food/export?format=xlsx|pdf&from=YYYY-MM&to=YYYY-MM&name=…
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  if (!limiter.check(user.id).allowed) return NextResponse.json({ error: "Too many exports. Wait a minute and try again." }, { status: 429 });

  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : params.get("format") === "xlsx" ? "xlsx" : null;
  if (!format) return NextResponse.json({ error: "Choose xlsx or pdf." }, { status: 400 });
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? from;
  if (!MONTH.test(from) || !MONTH.test(to)) return NextResponse.json({ error: "Choose a valid month." }, { status: 400 });

  try {
    const data = await listFoodEntries(getPrisma(), user.id, from, to);
    const meta = { months: data.months, totalPaise: data.totalPaise, generatedAt: new Date() };
    const name = sanitizeFileName(params.get("name")) ?? defaultFileName(data.months);
    const headers = { "Cache-Control": "private, no-store", "Content-Disposition": contentDisposition(name, format) };

    if (format === "xlsx") {
      const file = await buildFoodXlsx(data.rows, meta);
      return new NextResponse(new Uint8Array(file), {
        headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
    }
    const { bytes } = buildFoodPdf(data.rows, meta);
    return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/pdf" } });
  } catch (error) {
    console.error("[food] export failed", error);
    return NextResponse.json({ error: "Could not create the export. Please try again." }, { status: 500 });
  }
}
