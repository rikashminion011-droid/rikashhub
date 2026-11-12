"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { getOptionsAction, importGpayAction } from "../actions";
import { groupBanks } from "../cascade";
import { formatTransactionWhen } from "../datetime";
import { describeKind, type ParseFailure } from "../import/gpay-statement";
import { suggestBank } from "../import/matching";
import { banksNeeded, planImport, type ImportRow, type RowStatus } from "../import/plan";
import type { QuickPayOptions } from "../types";

export interface ImportActions {
  getOptions: typeof getOptionsAction;
  importGpay: typeof importGpayAction;
}

interface Preview {
  fileName: string;
  pages: number;
  rows: ImportRow[];
  failures: ParseFailure[];
  period: { from: string; to: string } | null;
  sentPaise: number | null;
  receivedPaise: number | null;
  existingKeys: string[];
}

type Filter = "all" | "new" | "duplicate" | "skipped" | "problems";

/** "Import": upload a Google Pay statement (PDF), check what it holds, choose your banks, and add the transactions. */
export function ImportDialog({ actions }: { actions: ImportActions }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload /> Import
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(64rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Import GPay transactions</DialogTitle>
          <DialogDescription>
            Upload the transaction statement PDF exported from Google Pay. You will see a preview before anything is added.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every visit starts fresh. */}
        {open ? <ImportBody actions={actions} onClose={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ImportBody({ actions, onClose }: { actions: ImportActions; onClose: () => void }) {
  const router = useRouter();
  const [options, setOptions] = useState<QuickPayOptions | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [bankMap, setBankMap] = useState<Record<string, string | null>>({});
  const [includeSelf, setIncludeSelf] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; duplicates: number; skipped: number; invalid: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Your banks, loaded when the box opens, for matching the statement's accounts to them.
  useEffect(() => {
    let cancelled = false;
    void actions.getOptions().then((result) => {
      if (cancelled) return;
      if (result.ok) setOptions(result.options);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [actions]);

  const bankGroups = useMemo(() => groupBanks(options?.banks ?? []), [options]);
  const existing = useMemo(() => new Set(preview?.existingKeys ?? []), [preview]);

  const needed = useMemo(() => (preview ? banksNeeded(preview.rows, includeSelf) : []), [preview, includeSelf]);
  const plan = useMemo(() => (preview ? planImport(preview.rows, { bankMap, includeSelfTransfers: includeSelf }, existing) : null), [preview, bankMap, includeSelf, existing]);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/quick-pay/transactions/import", { method: "POST", body });
      const json = (await response.json().catch(() => null)) as ({ ok: true } & Preview) | { ok: false; error: string } | null;
      if (!json || !json.ok) {
        setError(json && !json.ok ? json.error : "Could not read that file. Please try again.");
        return;
      }
      setPreview(json);
      // Suggest a bank for every account in the statement; you can change each one.
      const map: Record<string, string | null> = {};
      for (const name of banksNeeded(json.rows, true)) map[name] = options ? suggestBank(name, options.banks) : null;
      setBankMap(map);
      setFilter("all");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function runImport() {
    if (!preview || !plan || importing) return;
    setImporting(true);
    setError(null);
    let result: Awaited<ReturnType<ImportActions["importGpay"]>>;
    try {
      result = await actions.importGpay({ rows: preview.rows, bankMap, includeSelfTransfers: includeSelf });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing may have been saved: open the list, then upload again to check." };
    }
    setImporting(false);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    const r = result.result;
    setDone({ imported: r.imported, duplicates: r.duplicates, skipped: r.skipped, invalid: r.invalid.length + (preview?.failures.length ?? 0) });
    toast.success(`${r.imported} transaction${r.imported === 1 ? "" : "s"} imported.`, { description: "Total Debit, Total Credit and bank balances are updated." });
    router.refresh();
  }

  // ── Stage 3: the result ──
  if (done && preview && plan) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-green-50 p-4 text-green-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{done.imported} transaction{done.imported === 1 ? "" : "s"} imported</p>
            <p className="text-sm">
              {done.duplicates} already there (not added again) · {done.skipped} skipped · {done.invalid} could not be read. Total Debit, Total Credit and bank balances now include the new transactions.
            </p>
          </div>
        </div>
        <ResultTabs preview={preview} statuses={plan.statuses} filter={filter} setFilter={setFilter} counts={{ ...plan.counts, problems: plan.counts.invalid + preview.failures.length }} done />
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  // ── Stage 1: choose a file ──
  if (!preview) {
    return (
      <div className="min-w-0 space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void upload(file);
          }}
          className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors", dragging && "border-amber-400 bg-amber-50")}
        >
          {uploading ? <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden /> : <FileUp className="size-8 text-muted-foreground" aria-hidden />}
          <p className="font-medium">{uploading ? "Reading the statement…" : "Drop the Google Pay statement here"}</p>
          <p className="text-sm text-muted-foreground">PDF, up to 4 MB. Large statements can take a few seconds.</p>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="Choose the statement PDF"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <Button type="button" disabled={uploading} onClick={() => input.current?.click()}>
            Choose file
          </Button>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // ── Stage 2: preview ──
  const rows = preview.rows;
  const debit = rows.filter((r) => r.kind === "DEBIT").reduce((s, r) => s + r.amountPaise, 0);
  const credit = rows.filter((r) => r.kind === "CREDIT").reduce((s, r) => s + r.amountPaise, 0);
  const selfCount = rows.filter((r) => r.kind === "SELF_TRANSFER").length;
  const reconciled = preview.sentPaise !== null && preview.receivedPaise !== null && preview.failures.length === 0 ? debit === preview.sentPaise && credit === preview.receivedPaise : null;
  const unmatched = needed.filter((name) => !bankMap[name]);
  const problems = (plan?.counts.invalid ?? 0) + preview.failures.length;

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="min-w-0 truncate">
          <span className="font-medium">{preview.fileName}</span> <span className="text-muted-foreground">· {preview.pages} pages{preview.period ? ` · ${preview.period.from} to ${preview.period.to}` : ""}</span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(null)}>
          Choose another file
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Found" value={rows.length + preview.failures.length} />
        <Stat label="New to import" value={plan?.entries.length ?? 0} tone="good" />
        <Stat label="Already imported" value={plan?.counts.duplicate ?? 0} />
        <Stat label="Skipped" value={plan?.counts.skipped ?? 0} />
        <Stat label="Problems" value={problems} tone={problems ? "bad" : undefined} />
      </div>

      <p className={cn("flex items-start gap-2 text-sm", reconciled === false ? "text-amber-700" : "text-muted-foreground")}>
        {reconciled === true ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
        <span>
          Debits {formatINR(debit)} · Credits {formatINR(credit)}
          {reconciled === true ? " · matches the Sent and Received totals printed on the statement." : null}
          {reconciled === false ? ` · does not match the statement's own totals (Sent ${formatINR(preview.sentPaise ?? 0)}, Received ${formatINR(preview.receivedPaise ?? 0)}). Check the problems below before importing.` : null}
        </span>
      </p>

      {/* Which of your banks each statement account belongs to */}
      <section aria-labelledby="map-heading" className="space-y-2 rounded-xl border p-4">
        <h3 id="map-heading" className="text-sm font-semibold">Match the statement&apos;s accounts to your banks</h3>
        <p className="text-xs text-muted-foreground">Matched by name where possible. Leave one on &quot;Skip&quot; to not import its transactions.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {needed.map((name) => (
            <li key={name} className="space-y-1">
              <p className="text-sm">{name}</p>
              <CascadingSelect
                ariaLabel={`Your bank for ${name}`}
                groups={bankGroups}
                value={bankMap[name] ?? null}
                onChange={(v) => setBankMap((m) => ({ ...m, [name]: v }))}
                placeholder="Skip these transactions"
                searchPlaceholder="Search banks…"
                clearable
                invalid={!bankMap[name]}
              />
            </li>
          ))}
        </ul>
        {unmatched.length > 0 ? <p className="text-xs text-amber-700">{unmatched.length} account{unmatched.length === 1 ? " has" : "s have"} no bank chosen, so their transactions will be skipped.</p> : null}
        {selfCount > 0 ? (
          <label className="flex cursor-pointer items-start gap-2 pt-1 text-sm">
            <input type="checkbox" checked={includeSelf} onChange={(e) => setIncludeSelf(e.target.checked)} className="mt-1 size-4" />
            <span>
              Also import the {selfCount} self transfer{selfCount === 1 ? "" : "s"} (money moved between your own banks). Each is added as a Debit on the bank it left and a Credit on the bank it reached.
              <span className="block text-xs text-muted-foreground">Off by default: Google Pay leaves self transfers out of its own totals.</span>
            </span>
          </label>
        ) : null}
      </section>

      {plan ? <ResultTabs preview={preview} statuses={plan.statuses} filter={filter} setFilter={setFilter} counts={{ ...plan.counts, problems }} /> : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={importing}>
          Cancel
        </Button>
        <Button type="button" onClick={runImport} disabled={importing || !plan || plan.entries.length === 0}>
          {importing ? <Loader2 className="animate-spin" /> : <Upload />}
          {importing ? "Importing…" : `Import ${plan?.entries.length ?? 0} transaction${plan?.entries.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

const SHOWN = 150;

function ResultTabs({
  preview,
  statuses,
  filter,
  setFilter,
  counts,
  done = false,
}: {
  preview: Preview;
  statuses: RowStatus[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: { new: number; duplicate: number; skipped: number; problems: number };
  done?: boolean;
}) {
  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: preview.rows.length },
    { id: "new", label: done ? "Imported" : "New", count: counts.new },
    { id: "duplicate", label: "Already imported", count: counts.duplicate },
    { id: "skipped", label: "Skipped", count: counts.skipped },
    { id: "problems", label: done ? "Failed" : "Problems", count: counts.problems },
  ];

  const shown = useMemo(() => {
    const out: { row: ImportRow; status: RowStatus }[] = [];
    for (let i = 0; i < preview.rows.length && out.length < SHOWN; i++) {
      const status = statuses[i]!;
      const wanted = filter === "all" || (filter === "problems" ? status.state === "invalid" : status.state === filter);
      if (wanted) out.push({ row: preview.rows[i]!, status });
    }
    return out;
  }, [preview.rows, statuses, filter]);

  return (
    <div className="min-w-0 space-y-2">
      <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={filter === t.id}
            onClick={() => setFilter(t.id)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium", filter === t.id ? "border-neutral-950 bg-neutral-950 text-white" : "text-muted-foreground hover:bg-muted")}
          >
            {t.label} <span className="tabular-nums">{t.count}</span>
          </button>
        ))}
      </div>

      {filter === "problems" && preview.failures.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          {preview.failures.slice(0, 50).map((f, i) => (
            <li key={i}>
              <span className="font-medium text-destructive">Page {f.page}: {f.error}</span> <span className="text-muted-foreground">{f.text}</span>
            </li>
          ))}
          {preview.failures.length > 50 ? <li className="text-muted-foreground">…and {preview.failures.length - 50} more.</li> : null}
        </ul>
      ) : null}

      <div className="max-h-80 overflow-auto rounded-lg border">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Date and time</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Type</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Reason</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Bank</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Nothing here.</td>
              </tr>
            ) : (
              shown.map(({ row, status }) => {
                const when = formatTransactionWhen(new Date(row.occurredAt));
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{when.date}, {when.timeAndDay.split(" – ")[0]}</td>
                    <td className={cn("px-3 py-1.5", row.kind === "DEBIT" ? "text-destructive" : row.kind === "CREDIT" ? "text-success" : "text-muted-foreground")}>{describeKind(row.kind)}</td>
                    <td className="max-w-64 truncate px-3 py-1.5" title={row.reason}>{row.reason}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{row.bank}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(row.amountPaise)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <StatusChip status={status} done={done} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {shown.length === SHOWN ? `Showing the first ${SHOWN}. ` : ""}Every row is processed, whether or not it is shown here.
      </p>
    </div>
  );
}

function StatusChip({ status, done }: { status: RowStatus; done: boolean }) {
  const label =
    status.state === "new" ? (done ? "Imported" : "New") : status.state === "duplicate" ? "Already imported" : status.state === "skipped" ? status.why : status.why;
  const tone = status.state === "new" ? "bg-green-50 text-green-700" : status.state === "invalid" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={cn("rounded-md px-1.5 py-0.5 text-xs", tone)}>{label}</span>;
}
