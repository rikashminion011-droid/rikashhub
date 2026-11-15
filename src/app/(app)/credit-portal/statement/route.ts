import { NextResponse, type NextRequest } from "next/server";
import { parseHdfcStatement } from "@/features/credit-portal/model";
import { savedStatementKeys } from "@/features/credit-portal/server/service";
import { ImportFileError, MAX_IMPORT_BYTES } from "@/features/quick-pay/import/pdf-text";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";

const limiter = new RateLimiter(10, 60_000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads an uploaded credit card statement PDF (HDFC) and returns its transactions for the import preview. Nothing is saved
 * here. POST multipart/form-data with the file in "file" and the portal's id in "portalId".
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to import." }, { status: 401 });
  if (!limiter.check(user.id).allowed) return NextResponse.json({ ok: false, error: "Too many imports. Wait a minute and try again." }, { status: 429 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMPORT_BYTES + 100_000) return NextResponse.json({ ok: false, error: "That file is too large. The limit is 4 MB." }, { status: 413 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const portalId = String(form.get("portalId") ?? "");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file to import." }, { status: 400 });
    if (!UUID.test(portalId)) return NextResponse.json({ ok: false, error: "Choose a portal first." }, { status: 400 });

    const data = new Uint8Array(await file.arrayBuffer());
    if (data.byteLength === 0) throw new ImportFileError("That file is empty.");
    if (data.byteLength > MAX_IMPORT_BYTES) throw new ImportFileError("That file is too large. The limit is 4 MB.");
    if (String.fromCharCode(...data.slice(0, 5)) !== "%PDF-") throw new ImportFileError("That file is not a PDF. Upload the credit card statement PDF.");

    const { extractText, getDocumentProxy } = await import("unpdf");
    let pages: string[];
    try {
      const pdf = await getDocumentProxy(data);
      if (pdf.numPages > 60) throw new ImportFileError("That statement has too many pages.");
      pages = (await extractText(pdf, { mergePages: false })).text;
    } catch (error) {
      if (error instanceof ImportFileError) throw error;
      throw new ImportFileError("That PDF could not be opened. It may be damaged or password protected.");
    }

    const statement = parseHdfcStatement(pages);
    if (statement.lines.length === 0) {
      return NextResponse.json({ ok: false, error: "No transactions were found. Upload the credit card statement PDF from the bank." }, { status: 422 });
    }
    const saved = await savedStatementKeys(getPrisma(), user.id, portalId);

    return NextResponse.json(
      {
        ok: true,
        fileName: file.name.slice(0, 120),
        lines: statement.lines.map((l) => ({ key: l.key, at: l.occurredAt.toISOString(), details: l.details, debitPaise: l.debitPaise, creditPaise: l.creditPaise })),
        skipped: statement.skipped.slice(0, 20),
        summary: statement.summary,
        savedKeys: saved,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ImportFileError) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
    console.error("[credit-portal] statement preview failed", error);
    return NextResponse.json({ ok: false, error: "Could not read that file. Please try again." }, { status: 500 });
  }
}
