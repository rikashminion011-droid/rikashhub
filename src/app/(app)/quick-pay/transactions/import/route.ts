import { NextResponse, type NextRequest } from "next/server";
import { parseGpayStatement } from "@/features/quick-pay/import/gpay-statement";
import { IMPORT_KEY_PREFIX, keysOf, type ImportRow } from "@/features/quick-pay/import/plan";
import { ImportFileError, MAX_IMPORT_BYTES, extractPdfRuns } from "@/features/quick-pay/import/pdf-text";
import { findImportedKeys } from "@/features/quick-pay/server/entries";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";

const limiter = new RateLimiter(10, 60_000);

/**
 * Reads an uploaded Google Pay statement and returns what is in it, for the import preview.
 * Nothing is saved here. POST multipart/form-data with the file in the "file" field.
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
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file to import." }, { status: 400 });

    const pages = await extractPdfRuns(new Uint8Array(await file.arrayBuffer()));
    const statement = parseGpayStatement(pages);
    if (statement.rows.length === 0 && statement.failures.length === 0) {
      return NextResponse.json({ ok: false, error: "No transactions were found. Upload the \"Transaction statement\" PDF exported from Google Pay." }, { status: 422 });
    }

    const rows: ImportRow[] = statement.rows.map((r) => ({ id: r.id, kind: r.kind, occurredAt: r.occurredAt, amountPaise: r.amountPaise, reason: r.reason, bank: r.bank, toBank: r.toBank }));
    const imported = await findImportedKeys(getPrisma(), user.id, rows.flatMap(keysOf));

    return NextResponse.json(
      {
        ok: true,
        fileName: file.name.slice(0, 120),
        pages: pages.length,
        rows,
        failures: statement.failures,
        period: statement.period,
        sentPaise: statement.sentPaise,
        receivedPaise: statement.receivedPaise,
        existingKeys: imported.filter((k) => k.startsWith(IMPORT_KEY_PREFIX)),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ImportFileError) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
    console.error("[quick-pay] import preview failed", error);
    return NextResponse.json({ ok: false, error: "Could not read that file. Please try again." }, { status: 500 });
  }
}
