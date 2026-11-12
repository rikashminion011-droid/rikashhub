import type { TextRun } from "./gpay-statement";

/** The biggest statement accepted, in bytes. The six-month statement used to design this is about 1.4 MB. */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_PAGES = 400;

export class ImportFileError extends Error {}

/**
 * Reads a PDF and returns the positioned text runs of every page. Server only (uses unpdf, a build of pdf.js).
 * Throws ImportFileError with a plain message for files that are not usable PDFs.
 */
export async function extractPdfRuns(data: Uint8Array): Promise<TextRun[][]> {
  if (data.byteLength === 0) throw new ImportFileError("That file is empty.");
  if (data.byteLength > MAX_IMPORT_BYTES) throw new ImportFileError("That file is too large. The limit is 4 MB.");
  // A real PDF starts with "%PDF-".
  if (String.fromCharCode(...data.slice(0, 5)) !== "%PDF-") throw new ImportFileError("That file is not a PDF. Upload the statement exported from Google Pay.");

  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(data);
  } catch {
    throw new ImportFileError("That PDF could not be opened. It may be damaged or password protected.");
  }
  if (pdf.numPages > MAX_IMPORT_PAGES) throw new ImportFileError(`That statement has ${pdf.numPages} pages. The limit is ${MAX_IMPORT_PAGES}.`);

  const pages: TextRun[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const runs: TextRun[] = [];
    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      runs.push({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 });
    }
    pages.push(runs);
  }
  return pages;
}
