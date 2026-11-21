"use client";

import { CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatINR } from "@/lib/finance";
import type { importBankStatementAction } from "../actions";
import type { BsPreviewRow } from "../types";

interface Preview {
  fileName: string;
  rows: BsPreviewRow[];
  failures: { text: string; error: string }[];
  failureCount: number;
  alreadySaved: number;
}

const dayText = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/**
 * Import a bank statement: choose the bank, then the file (CSV, Excel or PDF). A preview shows what was read and how many rows
 * are new; nothing is saved until Import is pressed. Importing the same statement again adds nothing twice.
 */
export function BankImportDialog({ banks, importRows }: { banks: { id: string; label: string }[]; importRows: typeof importBankStatementAction }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bankId, setBankId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; duplicates: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function reset() {
    setPreview(null);
    setError(null);
    setDone(null);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function upload(file: File) {
    if (!bankId) return setError("Choose the bank this statement is from first.");
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("accountId", bankId);
      const response = await fetch("/bank-statement/import", { method: "POST", body });
      const data = (await response.json()) as { ok: boolean; error?: string } & Partial<Preview>;
      if (!data.ok) setError(data.error ?? "Could not read that file.");
      else setPreview({ fileName: data.fileName ?? file.name, rows: data.rows ?? [], failures: data.failures ?? [], failureCount: data.failureCount ?? 0, alreadySaved: data.alreadySaved ?? 0 });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const result = await importRows({ accountId: bankId, rows: preview.rows });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDone({ imported: result.imported, duplicates: result.duplicates });
    toast.success(`${result.imported} row${result.imported === 1 ? "" : "s"} imported.`);
    router.refresh();
  }

  const dates = preview ? preview.rows.map((r) => r.date).sort() : [];
  const debit = preview?.rows.reduce((s, r) => s + r.debitPaise, 0) ?? 0;
  const credit = preview?.rows.reduce((s, r) => s + r.creditPaise, 0) ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<button type="button" title="Import bank statement" aria-label="Import bank statement" className="flex size-10 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}>
        <Upload className="size-5" aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import bank statement</DialogTitle>
          <DialogDescription>Choose the bank, then upload its statement as CSV, Excel or PDF. Rows of every bank are kept together in date order.</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-green-50 p-4 text-green-900">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">
                  {done.imported} row{done.imported === 1 ? "" : "s"} imported
                </p>
                <p className="text-sm">{done.duplicates} already there (not added again).</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Import another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <label htmlFor="bs-bank" className="text-xs font-medium text-muted-foreground">
                Bank
              </label>
              <select
                id="bs-bank"
                value={bankId}
                onChange={(e) => {
                  setBankId(e.target.value);
                  setPreview(null);
                  setError(null);
                }}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
              >
                <option value="">Choose a bank</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm text-muted-foreground hover:bg-muted/40">
              {busy && !preview ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <FileUp className="size-6" aria-hidden />}
              <span>{preview ? preview.fileName : "Choose the statement file (CSV, Excel or PDF, up to 4 MB)"}</span>
              <input
                ref={input}
                type="file"
                accept=".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </label>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {preview ? (
              <div className="space-y-3">
                <p className="text-sm">
                  <span className="font-semibold">{preview.rows.length} rows</span> from {dayText.format(new Date(`${dates[0]}T00:00:00Z`))} to {dayText.format(new Date(`${dates.at(-1)}T00:00:00Z`))} · Debit {formatINR(debit)} · Credit {formatINR(credit)}.{" "}
                  <span className="text-muted-foreground">
                    {preview.rows.length - preview.alreadySaved} new, {preview.alreadySaved} already imported.
                    {preview.failureCount > 0 ? ` ${preview.failureCount} line${preview.failureCount === 1 ? "" : "s"} could not be read.` : ""}
                  </span>
                </p>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <table className="w-full min-w-[34rem] text-xs">
                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Date</th>
                        <th className="px-2 py-1.5 text-left font-medium">Details</th>
                        <th className="px-2 py-1.5 text-right font-medium">Debit</th>
                        <th className="px-2 py-1.5 text-right font-medium">Credit</th>
                        <th className="px-2 py-1.5 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.rows.slice(0, 50).map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 whitespace-nowrap">{dayText.format(new Date(`${r.date}T00:00:00Z`))}</td>
                          <td className="max-w-64 truncate px-2 py-1.5">{r.details}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.debitPaise ? formatINR(r.debitPaise) : ""}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.creditPaise ? formatINR(r.creditPaise) : ""}</td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">{r.balancePaise === null ? "" : formatINR(r.balancePaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 50 ? <p className="text-xs text-muted-foreground">Showing the first 50 of {preview.rows.length} rows.</p> : null}
                {preview.failures.length > 0 ? (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Lines that could not be read</summary>
                    <ul className="mt-1 space-y-0.5">
                      {preview.failures.map((f, i) => (
                        <li key={i} className="break-words">
                          {f.text} — {f.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={reset}>
                    Choose another file
                  </Button>
                  <Button onClick={save} disabled={busy || preview.rows.length === preview.alreadySaved}>
                    {busy ? <Loader2 className="animate-spin" /> : null} Import {preview.rows.length - preview.alreadySaved} new row{preview.rows.length - preview.alreadySaved === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
