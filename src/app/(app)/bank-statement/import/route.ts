import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { linesOfRuns, parseBankLines, parseBankTable, parseCsv, type BankParseResult } from "@/features/bank-statement/parse";
import { MAX_STATEMENT_ROWS, countAlreadySaved } from "@/features/bank-statement/server/service";
import { ImportFileError, MAX_IMPORT_BYTES, extractPdfRuns } from "@/features/quick-pay/import/pdf-text";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";

const limiter = new RateLimiter(10, 60_000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One Excel cell as the text the table reader expects (dates become YYYY-MM-DD). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
  if ("text" in value) return String(value.text);
  return "";
}

/**
 * Reads an uploaded bank statement (CSV, Excel or PDF) and returns its rows for the import preview. Nothing is saved here.
 * POST multipart/form-data with the file in "file" and the bank's id in "accountId".
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
    const accountId = String(form.get("accountId") ?? "");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file to import." }, { status: 400 });
    if (!UUID.test(accountId)) return NextResponse.json({ ok: false, error: "Choose the bank this statement is from." }, { status: 400 });
    const data = new Uint8Array(await file.arrayBuffer());
    if (data.byteLength === 0) throw new ImportFileError("That file is empty.");
    if (data.byteLength > MAX_IMPORT_BYTES) throw new ImportFileError("That file is too large. The limit is 4 MB.");

    let result: BankParseResult;
    const magic = String.fromCharCode(...data.slice(0, 5));
    if (magic.startsWith("%PDF-")) {
      result = parseBankLines(linesOfRuns(await extractPdfRuns(data)));
    } else if (magic.startsWith("PK")) {
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
      } catch {
        throw new ImportFileError("That Excel file could not be opened.");
      }
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new ImportFileError("That Excel file has no sheet.");
      const grid: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value));
        grid.push(cells);
      });
      result = parseBankTable(grid);
    } else {
      if (/\.xls$/i.test(file.name)) throw new ImportFileError("Old .xls files are not supported. Save it as .xlsx or .csv and upload again.");
      result = parseBankTable(parseCsv(new TextDecoder("utf-8").decode(data)));
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ ok: false, error: result.failures[0]?.error ?? "No transactions were found in that file.", failures: result.failures.slice(0, 20) }, { status: 422 });
    }
    if (result.rows.length > MAX_STATEMENT_ROWS) throw new ImportFileError(`That statement has more than ${MAX_STATEMENT_ROWS} rows.`);
    const alreadySaved = await countAlreadySaved(getPrisma(), user.id, accountId, result.rows);

    return NextResponse.json({ ok: true, fileName: file.name.slice(0, 120), rows: result.rows, failures: result.failures.slice(0, 20), failureCount: result.failures.length, alreadySaved }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ImportFileError) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
    console.error("[bank-statement] import preview failed", error);
    return NextResponse.json({ ok: false, error: "Could not read that file. Please try again." }, { status: 500 });
  }
}
