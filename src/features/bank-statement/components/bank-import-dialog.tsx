"use client";

import { CheckCircle2, FileText, Loader2, RotateCcw, Upload, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { importBankStatementAction } from "../actions";
import type { BsPreviewRow } from "../types";

type Status = "ready" | "reading" | "importing" | "done" | "failed";

interface Entry {
  key: number;
  file: File;
  bankId: string;
  status: Status;
  /** What happened, once it has: counts for a finished file, the reason for a failed one. */
  imported?: number;
  duplicates?: number;
  skipped?: number;
  error?: string;
  /** Lines of the file that could not be read. */
  problems?: string[];
}

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** A bank whose name appears in the file name is suggested for it (the choice stays yours). */
function suggest(fileName: string, banks: readonly { id: string; label: string }[]): string {
  const name = fileName.toLowerCase();
  const hit = banks.find((b) => b.label.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 3 && name.includes(w)));
  return hit?.id ?? "";
}

/**
 * Import bank statements, several at once. Choose any number of files (CSV, Excel or PDF); each is listed with its size and a
 * bank to import it into, chosen on its own, and can be removed before importing. Import All reads and saves every file that
 * has a bank, one after another: a file that fails does not stop the others, each file shows its own progress and its counts
 * (imported, already there, lines skipped), and a failed file can be tried again without importing the finished ones twice.
 */
export function BankImportDialog({ banks, importRows }: { banks: { id: string; label: string }[]; importRows: typeof importBankStatementAction }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const next = useRef(1);
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: number, change: Partial<Entry>) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...change } : e)));

  function add(files: FileList | File[]) {
    const fresh = [...files].map((file): Entry => ({ key: next.current++, file, bankId: suggest(file.name, banks), status: "ready" }));
    setEntries((list) => [...list, ...fresh]);
    if (input.current) input.current.value = "";
  }

  async function importOne(entry: Entry): Promise<boolean> {
    patch(entry.key, { status: "reading", error: undefined, problems: undefined });
    let rows: BsPreviewRow[] = [];
    let skipped = 0;
    let problems: string[] = [];
    try {
      const body = new FormData();
      body.set("file", entry.file);
      body.set("accountId", entry.bankId);
      const response = await fetch("/bank-statement/import", { method: "POST", body });
      const data = (await response.json()) as { ok: boolean; error?: string; rows?: BsPreviewRow[]; failures?: { text: string; error: string }[]; failureCount?: number };
      if (!data.ok) {
        patch(entry.key, { status: "failed", error: data.error ?? "Could not read that file.", problems: (data.failures ?? []).map((f) => `${f.text} — ${f.error}`.trim()) });
        return false;
      }
      rows = data.rows ?? [];
      skipped = data.failureCount ?? 0;
      problems = (data.failures ?? []).map((f) => `${f.text} — ${f.error}`);
    } catch {
      patch(entry.key, { status: "failed", error: "Could not reach the server. Check your connection and retry." });
      return false;
    }
    patch(entry.key, { status: "importing" });
    try {
      const r = await importRows({ accountId: entry.bankId, rows });
      if (!r.ok) {
        patch(entry.key, { status: "failed", error: r.error });
        return false;
      }
      patch(entry.key, { status: "done", imported: r.imported, duplicates: r.duplicates, skipped, problems });
      return true;
    } catch {
      patch(entry.key, { status: "failed", error: "Could not reach the server. Nothing may have been saved: retry is safe, rows already saved are not added twice." });
      return false;
    }
  }

  async function importAll() {
    if (running) return;
    // Only files that are waiting or failed: a finished file is never imported again.
    const todo = entries.filter((e) => (e.status === "ready" || e.status === "failed") && e.bankId);
    if (todo.length === 0) return;
    setRunning(true);
    let ok = 0;
    for (const entry of todo) if (await importOne(entry)) ok++;
    setRunning(false);
    if (ok > 0) {
      toast.success(`${ok} file${ok === 1 ? "" : "s"} imported.`);
      router.refresh();
    }
    if (ok < todo.length) toast.error(`${todo.length - ok} file${todo.length - ok === 1 ? "" : "s"} could not be imported. Fix and retry.`);
  }

  const unmapped = entries.filter((e) => (e.status === "ready" || e.status === "failed") && !e.bankId).length;
  const waiting = entries.filter((e) => (e.status === "ready" || e.status === "failed") && e.bankId).length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const totals = entries.reduce((t, e) => ({ imported: t.imported + (e.imported ?? 0), duplicates: t.duplicates + (e.duplicates ?? 0), skipped: t.skipped + (e.skipped ?? 0) }), { imported: 0, duplicates: 0, skipped: 0 });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        setOpen(next);
        // Closing after a finished import starts fresh next time; files that still wait or failed are kept.
        if (!next) setEntries((list) => list.filter((e) => e.status !== "done"));
      }}
    >
      <DialogTrigger render={<button type="button" title="Import bank statements" aria-label="Import bank statements" className="flex size-10 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}>
        <Upload className="size-5" aria-hidden />
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] gap-3 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import bank statements</DialogTitle>
          <DialogDescription>Choose any number of statement files (CSV, Excel or PDF), pick the bank of each, then press Import All. Rows of every bank are kept together in date order.</DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm text-muted-foreground hover:bg-muted/40">
          <Upload className="size-5" aria-hidden />
          <span>{entries.length === 0 ? "Choose statement files (up to 4 MB each)" : "Add more files"}</span>
          <input ref={input} type="file" multiple accept=".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files && add(e.target.files)} />
        </label>

        {entries.length > 0 ? (
          <ul className="space-y-2" aria-label="Files to import">
            {entries.map((e) => {
              const locked = e.status === "reading" || e.status === "importing" || e.status === "done";
              return (
                <li key={e.key} className={cn("space-y-2 rounded-xl border p-3", e.status === "done" && "border-green-300 bg-green-50/50", e.status === "failed" && "border-red-300 bg-red-50/50")}>
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-all">{e.file.name}</p>
                      <p className="text-xs text-muted-foreground">{size(e.file.size)}</p>
                    </div>
                    <button type="button" aria-label={`Remove ${e.file.name}`} disabled={e.status === "reading" || e.status === "importing"} onClick={() => setEntries((list) => list.filter((x) => x.key !== e.key))} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40">
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Bank for ${e.file.name}`} value={e.bankId} disabled={locked} onChange={(ev) => patch(e.key, { bankId: ev.target.value })} className={cn("h-10 min-w-0 flex-1 basis-40 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:text-sm", !e.bankId && "border-amber-400")}>
                      <option value="">Choose a bank</option>
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <StatusBadge entry={e} />
                  </div>
                  {e.status === "done" ? (
                    <p className="text-xs">
                      <span className="font-semibold">{e.imported} imported</span> · {e.duplicates} already there · {e.skipped} skipped
                    </p>
                  ) : null}
                  {e.error ? (
                    <p role="alert" className="text-xs break-words text-destructive">
                      {e.error}
                    </p>
                  ) : null}
                  {e.problems && e.problems.length > 0 ? (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Lines that could not be read ({e.problems.length})</summary>
                      <ul className="mt-1 space-y-0.5">
                        {e.problems.map((p, i) => (
                          <li key={i} className="break-words">
                            {p}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {unmapped > 0 ? <p className="text-xs text-amber-700">{unmapped} file{unmapped === 1 ? " has" : "s have"} no bank yet. Choose one for each; files without a bank are not imported.</p> : null}
        {totals.imported + totals.duplicates + totals.skipped > 0 ? (
          <p className="text-sm">
            <span className="font-semibold">Total: {totals.imported} imported</span> · {totals.duplicates} already there · {totals.skipped} skipped
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-2 bg-popover px-1 pt-1">
          {failed > 0 && !running ? <p className="mr-auto text-xs text-destructive">{failed} failed: Import All tries only those again.</p> : null}
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={running}>
            Close
          </Button>
          <Button type="button" onClick={importAll} disabled={running || waiting === 0} className="min-w-32">
            {running ? <Loader2 className="animate-spin" /> : failed > 0 && waiting === failed ? <RotateCcw /> : null} {failed > 0 && waiting === failed ? "Retry failed" : "Import All"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ entry }: { entry: Entry }) {
  switch (entry.status) {
    case "reading":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading…
        </span>
      );
    case "importing":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Importing…
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
          <CheckCircle2 className="size-3.5" aria-hidden /> Imported
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
          <XCircle className="size-3.5" aria-hidden /> Failed
        </span>
      );
    default:
      return <span className="text-xs text-muted-foreground">{entry.bankId ? "Ready" : "Needs a bank"}</span>;
  }
}
