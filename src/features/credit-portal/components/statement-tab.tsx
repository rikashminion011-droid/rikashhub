"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Download, Loader2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { groupCategories } from "@/features/quick-pay/cascade";
import { PeoplePicker } from "@/features/quick-pay/components/people-picker";
import type { AddResult } from "@/features/quick-pay/components/inline-add";
import { formatClock, formatLongDate } from "@/features/quick-pay/date-format";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import type { CategoryOption } from "@/features/quick-pay/types";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { PortalActions } from "../actions";
import type { StatementSummary } from "../model";
import type { StatementRow } from "../server/service";
import { PeriodFilter } from "./period-filter";

const when = (iso: string) => {
  const d = new Date(iso);
  return { date: formatLongDate(istDateOf(d)), time: formatClock(istTimeOf(d)) };
};

interface PreviewLine {
  key: string;
  at: string;
  details: string;
  debitPaise: number;
  creditPaise: number;
}
interface Preview {
  fileName: string;
  lines: PreviewLine[];
  skipped: string[];
  summary: StatementSummary;
  savedKeys: string[];
}

/**
 * The Statement of a portal: the lines of the bank's statement. Import the statement PDF (an amount with a + in front, shown
 * green, is a credit; the others are debits), then fill in the reason, recipients and category of each line. Lines that show an
 * unbilled transaction settle it, so it is not counted twice. The Recipient heading opens a person's own page.
 */
export function StatementTab({
  portalId,
  portalName,
  rows,
  totals,
  people: initialPeople,
  categories,
  creditCategories,
  actions,
  addPerson,
  today,
  defaultRange,
  exportHref,
}: {
  portalId: string;
  portalName: string;
  rows: StatementRow[];
  totals: { debitPaise: number; creditPaise: number };
  people: { id: string; name: string }[];
  categories: CategoryOption[];
  creditCategories: CategoryOption[];
  actions: Pick<PortalActions, "importStatement" | "updateStatementEntry" | "deleteStatementEntry" | "setCardInfo">;
  addPerson: (name: string) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
  today: string;
  /** The period shown when none is chosen (HDFC: the 16th to the 15th). Without one, the current month. */
  defaultRange?: { from: string; to: string };
  exportHref: string;
}) {
  const router = useRouter();
  const [people, setPeople] = useState(initialPeople);
  const [deleting, setDeleting] = useState<StatementRow | null>(null);
  const debitGroups = useMemo(() => groupCategories(categories), [categories]);
  const creditGroups = useMemo(() => groupCategories(creditCategories), [creditCategories]);

  const onAddPerson = async (name: string): Promise<AddResult> => {
    const r = await addPerson(name);
    if (!r.ok) return r;
    setPeople((p) => (p.some((x) => x.id === r.id) ? p : [...p, { id: r.id, name: r.name }]));
    return { ok: true, id: r.id };
  };

  async function save(row: StatementRow, change: Partial<{ reason: string; recipientIds: string[]; categoryId: string | null }>) {
    const next = { reason: row.reason, recipientIds: row.recipientIds, categoryId: row.categoryId, ...change };
    const r = await actions.updateStatementEntry({ id: row.id, ...next });
    if (!r.ok) toast.error(r.error);
    else router.refresh();
  }

  const recipientPage = (id: string) => `/credit-cards/recipient/${id}?portal=${portalId}`;

  return (
    <div className="space-y-4">
      <PeriodFilter today={today} defaultRange={defaultRange}>
        <ImportDialog portalId={portalId} portalName={portalName} actions={actions} onDone={() => router.refresh()} />
        <a href={exportHref} className={cn(buttonVariants({ variant: "outline" }))}>
          <Download /> Export
        </a>
      </PeriodFilter>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm" aria-live="polite">
        <span>
          <span className="text-muted-foreground">Total debit </span>
          <span className="font-semibold text-red-600 tabular-nums">{formatINR(totals.debitPaise)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Total credit </span>
          <span className="font-semibold text-green-600 tabular-nums">{formatINR(totals.creditPaise)}</span>
        </span>
        <span className="text-muted-foreground">{rows.length} line{rows.length === 1 ? "" : "s"}</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">No statement lines in this period. Use Import to add the bank statement.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card xl:overflow-visible">
          <table className="w-full min-w-[68rem] text-sm xl:min-w-0">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Date and Time</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Transaction Details</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Reason</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Debit</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Credit</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  {/* Opens the page of any one person */}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<button type="button" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:text-foreground hover:underline" aria-label="Recipient: open a person's page" />}>
                      Recipient <ChevronDown className="size-3" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {people.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground">No people yet.</p> : null}
                      {people.map((p) => (
                        <DropdownMenuItem key={p.id} render={<Link href={recipientPage(p.id)} />}>
                          {p.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Category</th>
                <th scope="col" className="w-10 px-2 py-2.5">
                  <span className="sr-only">Delete</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const t = when(r.occurredAt);
                const credit = r.creditPaise > 0;
                return (
                  <tr key={r.id} className="align-top hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <p className="font-medium">{t.date}</p>
                      <p className="text-xs text-muted-foreground">{t.time}</p>
                    </td>
                    <td className="max-w-60 px-3 py-2 break-words text-muted-foreground">
                      {r.details}
                      {r.settledUnbilled ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Settled unbilled</span> : null}
                    </td>
                    <td className="px-3 py-1.5">
                      <Input aria-label={`Reason for ${r.details}`} placeholder="Reason" maxLength={200} defaultValue={r.reason} onBlur={(e) => e.target.value.trim() !== r.reason && void save(r, { reason: e.target.value })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-8 min-w-36 text-base sm:text-sm" />
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-red-600 tabular-nums">{r.debitPaise ? formatINR(r.debitPaise) : ""}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-green-600 tabular-nums">{credit ? formatINR(r.creditPaise) : ""}</td>
                    <td className="px-3 py-1.5">
                      <div className="min-w-44">
                        <PeoplePicker compact bare ariaLabel={`Recipients of ${r.details}`} people={people} selected={r.recipientIds} onChange={(ids) => void save(r, { recipientIds: ids })} onAddPerson={onAddPerson} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="min-w-40">
                        <CascadingSelect compact clearable ariaLabel={`Category of ${r.details}`} groups={credit ? creditGroups : debitGroups} value={r.categoryId} onChange={(v) => void save(r, { categoryId: v })} placeholder="Category" searchPlaceholder="Search categories…" />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${r.details}`} onClick={() => setDeleting(r)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this statement line?"
        description={deleting ? `${deleting.details}. If it settled an unbilled transaction, that one is unbilled again.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return null;
          const r = await actions.deleteStatementEntry({ id: deleting.id });
          if (!r.ok) return r.error;
          toast.success("Line deleted.");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}

// ───────────────────────── Import ─────────────────────────

function ImportDialog({ portalId, portalName, actions, onDone }: { portalId: string; portalName: string; actions: Pick<PortalActions, "importStatement" | "setCardInfo">; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload /> Import
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(56rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Import {portalName} statement</DialogTitle>
          <DialogDescription>Upload the credit card statement PDF from the bank. You see what it holds before anything is saved. Fill in the reason, recipients and category afterwards in the table.</DialogDescription>
        </DialogHeader>
        {open ? <ImportBody portalId={portalId} actions={actions} onClose={() => setOpen(false)} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ImportBody({ portalId, actions, onClose, onDone }: { portalId: string; actions: Pick<PortalActions, "importStatement" | "setCardInfo">; onClose: () => void; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; duplicates: number; settled: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const saved = useMemo(() => new Set(preview?.savedKeys ?? []), [preview]);
  const fresh = preview ? preview.lines.filter((l) => !saved.has(l.key)) : [];
  const debit = fresh.reduce((s, l) => s + l.debitPaise, 0);
  const credit = fresh.reduce((s, l) => s + l.creditPaise, 0);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("portalId", portalId);
      const res = await fetch("/credit-cards/statement", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as ({ ok: true } & Preview) | { ok: false; error: string } | null;
      if (!json || !json.ok) return setError(json && !json.ok ? json.error : "Could not read that file. Please try again.");
      setPreview(json);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function runImport() {
    if (!preview || importing) return;
    setImporting(true);
    setError(null);
    const r = await actions.importStatement({
      portalId,
      lines: preview.lines.map((l) => ({ key: l.key, at: l.at, details: l.details, debitPaise: l.debitPaise, creditPaise: l.creditPaise, reason: "", recipientIds: [], categoryId: null })),
    });
    setImporting(false);
    if (!r.ok) return setError(r.error);
    setDone(r);
    onDone();
  }

  async function applySummary() {
    const s = preview?.summary;
    if (!s || s.totalCreditPaise === null || s.availableCreditPaise === null) return;
    const r = await actions.setCardInfo({ id: portalId, total: (s.totalCreditPaise / 100).toFixed(2), used: (Math.max(0, s.totalCreditPaise - s.availableCreditPaise) / 100).toFixed(2) });
    if (r.ok) {
      toast.success("Card information updated from the statement.");
      onDone();
    } else toast.error(r.error);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          <span>
            <span className="font-semibold">{done.imported} line{done.imported === 1 ? "" : "s"} imported.</span>
            {done.duplicates > 0 ? ` ${done.duplicates} were already there and were skipped.` : ""}
            {done.settled > 0 ? ` ${done.settled} unbilled transaction${done.settled === 1 ? " was" : "s were"} settled by the statement.` : ""}
          </span>
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!preview ? (
        <div className="space-y-3">
          <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Statement PDF" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          <Button type="button" onClick={() => input.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />} {uploading ? "Reading…" : "Choose the PDF"}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-semibold">{preview.fileName}</span> · {preview.lines.length} lines found, {fresh.length} new
            {preview.lines.length - fresh.length > 0 ? `, ${preview.lines.length - fresh.length} already imported` : ""}. Debits {formatINR(debit)} · Credits {formatINR(credit)}.
          </p>
          {preview.summary.totalCreditPaise !== null && preview.summary.availableCreditPaise !== null ? (
            <p className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              The statement shows a credit limit of {formatINR(preview.summary.totalCreditPaise)} with {formatINR(preview.summary.availableCreditPaise)} available.
              <button type="button" onClick={() => void applySummary()} className="font-medium underline underline-offset-4">
                Use these for Card Information
              </button>
            </p>
          ) : null}
          {preview.skipped.length > 0 ? (
            <div role="alert" className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="flex items-start gap-2 font-medium">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {preview.skipped.length} line{preview.skipped.length === 1 ? "" : "s"} could not be read and will be left out. Add {preview.skipped.length === 1 ? "it" : "them"} by hand:
              </p>
              <ul className="list-disc space-y-0.5 pl-9 break-words">
                {preview.skipped.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="max-h-[50vh] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date and Time</th>
                  <th className="px-3 py-2 text-left font-medium">Transaction Details</th>
                  <th className="px-3 py-2 text-right font-medium">Debit</th>
                  <th className="px-3 py-2 text-right font-medium">Credit</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.lines.map((l) => {
                  const t = when(l.at);
                  const old = saved.has(l.key);
                  return (
                    <tr key={l.key} className={old ? "opacity-50" : undefined}>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {t.date}, {t.time}
                      </td>
                      <td className="px-3 py-1.5 break-words">{l.details}</td>
                      <td className="px-3 py-1.5 text-right text-red-600 tabular-nums">{l.debitPaise ? formatINR(l.debitPaise) : ""}</td>
                      <td className="px-3 py-1.5 text-right text-green-600 tabular-nums">{l.creditPaise ? formatINR(l.creditPaise) : ""}</td>
                      <td className="px-3 py-1.5 text-xs">{old ? "Already imported" : "New"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {preview ? (
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { setPreview(null); setError(null); }} disabled={importing}>
            Choose another file
          </Button>
          <Button type="button" onClick={runImport} disabled={importing || fresh.length === 0}>
            {importing ? <Loader2 className="animate-spin" /> : null} {importing ? "Importing…" : `Import ${fresh.length} new line${fresh.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      ) : null}
    </div>
  );
}
