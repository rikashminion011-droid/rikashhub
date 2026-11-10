"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { saveBulkAction } from "../actions";
import { groupBanks, groupCategories } from "../cascade";
import type { QuickPayOptions } from "../types";
import { MAX_BULK_ROWS, isBlankBulkRow, validateBulk, type BulkRowErrors, type BulkRowInput } from "../validation";

const newKey = () => crypto.randomUUID();
const newRequestId = () => crypto.randomUUID();

const blankRow = (date: string, time: string): BulkRowInput => ({
  key: newKey(), date, time, debit: "", credit: "", reason: "", accountId: null, categoryId: null, partyId: null,
});

/**
 * Spreadsheet-style entry: one row per transaction with its own date and time. Debit and Credit
 * are mutually exclusive. Nothing is saved until Save All, and then every row is saved together.
 */
export function BulkEntry({
  options,
  today,
  nowTime,
  saveBulk,
}: {
  options: QuickPayOptions;
  /** Today's date (YYYY-MM-DD) and the current time (HH:mm) in IST, used to pre-fill new rows. */
  today: string;
  nowTime: string;
  saveBulk: typeof saveBulkAction;
}) {
  const [rows, setRows] = useState<BulkRowInput[]>(() => Array.from({ length: 5 }, () => blankRow(today, nowTime)));
  const [errors, setErrors] = useState<Record<string, BulkRowErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One id per sheet: sending the same sheet again (retry, double click) can never save it twice.
  const [requestId, setRequestId] = useState(newRequestId);

  const bankGroups = useMemo(() => groupBanks(options.banks), [options.banks]);
  const categoryGroups = useMemo(() => groupCategories(options.categories), [options.categories]);
  const persons = options.persons.map((p) => ({ value: p.id, label: p.name }));

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    let filled = 0;
    for (const r of rows) {
      if (isBlankBulkRow(r)) continue;
      filled++;
      debit += parseAmountInput(r.debit) ?? 0;
      credit += parseAmountInput(r.credit) ?? 0;
    }
    return { debit, credit, filled };
  }, [rows]);

  function update(key: string, changes: Partial<BulkRowInput>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...changes } : r)));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: {} }));
  }

  function addRows(count: number) {
    setRows((all) => {
      const last = all.at(-1);
      // New rows start from the previous row's date and time, which is what you want when typing a day's entries.
      return [...all, ...Array.from({ length: count }, () => blankRow(last?.date ?? today, last?.time ?? nowTime))];
    });
  }

  function removeRow(key: string) {
    setRows((all) => (all.length > 1 ? all.filter((r) => r.key !== key) : [blankRow(today, nowTime)]));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
  }

  async function saveAll() {
    if (saving) return;
    setFormError(null);

    const checked = validateBulk(rows, new Date());
    if (!checked.ok) {
      setErrors(checked.errors);
      setFormError(checked.message);
      const firstBad = rows.find((r) => checked.errors[r.key]);
      if (firstBad) document.getElementById(`row-${firstBad.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});

    setSaving(true);
    let result: Awaited<ReturnType<typeof saveBulkAction>>;
    try {
      result = await saveBulk({ requestId, rows });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and press Save All again." };
    }
    setSaving(false);

    if (!result.ok) {
      setFormError(result.error);
      if ("rowErrors" in result) setErrors(result.rowErrors);
      toast.error(result.error);
      return;
    }
    toast.success(result.duplicate ? "That sheet was already saved." : `${result.count} transaction${result.count === 1 ? "" : "s"} saved.`, {
      description: "Totals, the table and bank balances are updated.",
    });
    setRows(Array.from({ length: 5 }, () => blankRow(today, nowTime)));
    setRequestId(newRequestId());
  }

  const cell = "px-1.5 py-1.5 align-top";
  const bad = (key: string, field: keyof BulkRowErrors) => Boolean(errors[key]?.[field]);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[78rem] text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-2 py-2 text-center font-medium">#</th>
              <th scope="col" className="w-40 px-1.5 py-2 text-left font-medium">Date</th>
              <th scope="col" className="w-28 px-1.5 py-2 text-left font-medium">Time</th>
              <th scope="col" className="w-32 px-1.5 py-2 text-left font-medium">Debit</th>
              <th scope="col" className="w-32 px-1.5 py-2 text-left font-medium">Credit</th>
              <th scope="col" className="min-w-56 px-1.5 py-2 text-left font-medium">Reason</th>
              <th scope="col" className="w-52 px-1.5 py-2 text-left font-medium">Bank Through</th>
              <th scope="col" className="w-52 px-1.5 py-2 text-left font-medium">Category</th>
              <th scope="col" className="w-40 px-1.5 py-2 text-left font-medium">Split</th>
              <th scope="col" className="w-10 px-1.5 py-2">
                <span className="sr-only">Remove row</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => {
              const e = errors[row.key] ?? {};
              const hasDebit = row.debit.trim() !== "";
              const hasCredit = row.credit.trim() !== "";
              return (
                <tr key={row.key} id={`row-${row.key}`} className={cn(Object.keys(e).length > 0 && "bg-destructive/5")}>
                  <td className="px-2 py-3 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</td>
                  <td className={cell}>
                    <Input type="date" aria-label={`Row ${index + 1} date`} value={row.date} max={today} aria-invalid={bad(row.key, "date")} onChange={(ev) => update(row.key, { date: ev.target.value })} className="h-8" />
                    {e.date ? <p className="mt-0.5 text-[11px] text-destructive">{e.date}</p> : null}
                  </td>
                  <td className={cell}>
                    <Input type="time" aria-label={`Row ${index + 1} time`} value={row.time} aria-invalid={bad(row.key, "time")} onChange={(ev) => update(row.key, { time: ev.target.value })} className="h-8" />
                    {e.time ? <p className="mt-0.5 text-[11px] text-destructive">{e.time}</p> : null}
                  </td>
                  <td className={cell}>
                    <Input
                      inputMode="decimal"
                      aria-label={`Row ${index + 1} debit`}
                      placeholder="0.00"
                      value={row.debit}
                      disabled={hasCredit}
                      aria-invalid={bad(row.key, "amount")}
                      onChange={(ev) => update(row.key, { debit: ev.target.value })}
                      className="h-8 text-right tabular-nums"
                    />
                  </td>
                  <td className={cell}>
                    <Input
                      inputMode="decimal"
                      aria-label={`Row ${index + 1} credit`}
                      placeholder="0.00"
                      value={row.credit}
                      disabled={hasDebit}
                      aria-invalid={bad(row.key, "amount")}
                      onChange={(ev) => update(row.key, { credit: ev.target.value })}
                      className="h-8 text-right tabular-nums"
                    />
                  </td>
                  <td className={cell}>
                    <Input aria-label={`Row ${index + 1} reason`} placeholder="Reason" value={row.reason} maxLength={200} onChange={(ev) => update(row.key, { reason: ev.target.value })} className="h-8" />
                    {e.amount ? <p className="mt-0.5 text-[11px] text-destructive">{e.amount}</p> : null}
                    {e.reason ? <p className="mt-0.5 text-[11px] text-destructive">{e.reason}</p> : null}
                  </td>
                  <td className={cell}>
                    <CascadingSelect compact ariaLabel={`Row ${index + 1} bank`} groups={bankGroups} value={row.accountId} onChange={(v) => update(row.key, { accountId: v })} placeholder="Bank" searchPlaceholder="Search banks…" invalid={bad(row.key, "bank")} />
                    {e.bank ? <p className="mt-0.5 text-[11px] text-destructive">{e.bank}</p> : null}
                  </td>
                  <td className={cell}>
                    <CascadingSelect compact clearable ariaLabel={`Row ${index + 1} category`} groups={categoryGroups} value={row.categoryId} onChange={(v) => update(row.key, { categoryId: v })} placeholder="Category" searchPlaceholder="Search categories…" />
                  </td>
                  <td className={cell}>
                    <SearchableSelect compact clearable ariaLabel={`Row ${index + 1} split`} options={persons} value={row.partyId} onChange={(v) => update(row.key, { partyId: v })} placeholder="Person" searchPlaceholder="Search people…" />
                  </td>
                  <td className="px-1.5 py-1.5 align-top">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${index + 1}`} className="text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.key)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => addRows(1)} disabled={rows.length >= MAX_BULK_ROWS}>
          <Plus /> Add row
        </Button>
        <Button type="button" variant="outline" onClick={() => addRows(5)} disabled={rows.length + 5 > MAX_BULK_ROWS}>
          <Plus /> Add 5 rows
        </Button>
        <p className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {totals.filled} row{totals.filled === 1 ? "" : "s"} · Debit {formatINR(totals.debit)} · Credit {formatINR(totals.credit)}
        </p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={saveAll} disabled={saving || totals.filled === 0}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : `Save All${totals.filled ? ` (${totals.filled})` : ""}`}
        </Button>
        <Link href="/quick-pay/transactions" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Back to GPay Transactions
        </Link>
      </div>
    </div>
  );
}
