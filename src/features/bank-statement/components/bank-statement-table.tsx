"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { DateRangePicker } from "@/components/shared/date-picker";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { sharedCategories } from "@/features/quick-pay/availability";
import { groupCategories } from "@/features/quick-pay/cascade";
import { ColumnFilter, ColumnSearch } from "@/features/quick-pay/components/column-filter";
import { ReasonCell } from "@/features/quick-pay/components/transactions-table";
import { listOf, useTxParams } from "@/features/quick-pay/components/use-tx-params";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { BankStatementActions } from "../actions";
import type { BsRow } from "../types";

const dayText = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" });
const KINDS = [
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Credit" },
];

const whenOf = (r: BsRow) => {
  const d = new Date(`${r.date}T00:00:00Z`);
  return { date: dayText.format(d), sub: r.time !== "00:00" ? `${r.time} – ${weekday.format(d)}` : weekday.format(d) };
};

/**
 * The Bank Statement list, drawn like Transaction History (same header with a filter on each column, Reason and Category
 * changed in place) but without the red and green row colours. The rows are in date order whichever bank they came from.
 * On a phone each row is a card.
 */
export function BankStatementTable({ rows, filtered, options, actions }: { rows: readonly BsRow[]; filtered: boolean; options: Pick<QuickPayOptions, "banks" | "categories" | "creditCategories">; actions: Pick<BankStatementActions, "patch" | "remove"> }) {
  const router = useRouter();
  const { params, go } = useTxParams();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [patched, setPatched] = useState<Record<string, BsRow>>({});
  const [deleting, setDeleting] = useState<BsRow | null>(null);
  const view = useMemo(() => rows.map((r) => patched[r.id] ?? r), [rows, patched]);
  const rawFrom = params.get("from") ?? "";
  const rawTo = params.get("to") ?? "";
  const bankFilter = useMemo(() => options.banks.map((b) => ({ value: b.id, label: b.label })), [options.banks]);
  const categoryFilter = useMemo(() => sharedCategories(options.categories, options.creditCategories).map((c) => ({ value: c.id, label: c.label })), [options.categories, options.creditCategories]);
  const debitGroups = useMemo(() => groupCategories(options.categories), [options.categories]);
  const creditGroups = useMemo(() => groupCategories(options.creditCategories), [options.creditCategories]);

  const patch = useCallback(
    async (id: string, change: { reason?: string; categoryId?: string | null }): Promise<string | null> => {
      const result = await actions.patch({ id, ...change });
      if (!result.ok) {
        toast.error(result.error);
        return result.error;
      }
      setPatched((p) => ({ ...p, [id]: result.row }));
      router.refresh();
      return null;
    },
    [actions, router],
  );

  async function confirmDelete(): Promise<string | null> {
    if (!deleting) return null;
    const result = await actions.remove({ id: deleting.id });
    if (!result.ok) return result.error;
    toast.success("Row deleted.");
    router.refresh();
    return null;
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        {filtered ? "Nothing matches these filters." : "No bank statement rows yet. Use Import to add a statement."}
      </p>
    );
  }

  const categoryCell = (row: BsRow) => (
    <CascadingSelect compact clearable ariaLabel={`Category of ${row.reason || row.details}`} groups={row.creditPaise > 0 ? creditGroups : debitGroups} value={row.categoryId} onChange={(v) => void patch(row.id, { categoryId: v })} placeholder="Category" searchPlaceholder="Search categories…" />
  );
  const types = listOf(params.get("types"));

  return (
    <>
      {/* Wide screens: a table */}
      <div className="hidden max-h-[calc(100dvh-14rem)] overflow-auto rounded-xl border bg-card md:block">
        <table className="w-full min-w-[72rem] text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted text-xs text-muted-foreground shadow-[0_1px_0_var(--color-border)]">
            <tr>
              <th scope="col" className="bg-muted px-3 py-2.5 text-left font-medium">
                <span className="inline-flex items-center gap-1">
                  Date &amp; Time <DateRangePicker iconOnly from={rawFrom} to={rawTo} max={today} ariaLabel="Filter dates" className="size-6 rounded border-0 bg-transparent [&_svg]:size-3.5" onChange={(r) => go({ from: r.from, to: r.to, month: "", all: "" })} />
                </span>
              </th>
              <th scope="col" className="bg-muted px-3 py-2.5 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  Debit <ColumnFilter label="Type" options={KINDS} selected={types} searchable={false} onApply={(v) => go({ types: v.join(",") })} />
                </span>
              </th>
              <th scope="col" className="bg-muted px-3 py-2.5 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  Credit <ColumnFilter label="Type" options={KINDS} selected={types} searchable={false} onApply={(v) => go({ types: v.join(",") })} />
                </span>
              </th>
              <th scope="col" className="bg-muted px-3 py-2.5 text-right font-medium">Balance</th>
              <th scope="col" className="bg-muted px-3 py-2.5 text-left font-medium">
                <span className="inline-flex items-center gap-1">
                  Transaction details <ColumnSearch label="Transaction details" value={params.get("q") ?? ""} onApply={(text) => go({ q: text })} />
                </span>
              </th>
              <th scope="col" className="bg-muted px-3 py-2.5 text-left font-medium">
                <span className="inline-flex items-center gap-1">
                  Bank <ColumnFilter label="Bank" options={bankFilter} selected={listOf(params.get("banks"))} onApply={(v) => go({ banks: v.join(",") })} />
                </span>
              </th>
              <th scope="col" className="bg-muted px-3 py-2.5 text-left font-medium">Reason</th>
              <th scope="col" className="w-44 bg-muted px-3 py-2.5 text-left font-medium">
                <span className="inline-flex items-center gap-1">
                  Category <ColumnFilter label="Category" options={categoryFilter} selected={listOf(params.get("cats"))} onApply={(v) => go({ cats: v.join(",") })} />
                </span>
              </th>
              <th scope="col" className="w-12 bg-muted px-2 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {view.map((row) => {
              const when = whenOf(row);
              return (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <p className="font-medium">{when.date}</p>
                    <p className="text-xs text-muted-foreground">{when.sub}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-destructive tabular-nums">{row.debitPaise ? formatINR(row.debitPaise) : ""}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-success tabular-nums">{row.creditPaise ? formatINR(row.creditPaise) : ""}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{row.balancePaise === null ? "" : formatINR(row.balancePaise)}</td>
                  <td className="max-w-72 px-3 py-2.5 break-words text-muted-foreground">{row.details}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{row.bank}</td>
                  <td className="max-w-56 px-3 py-1.5">
                    <ReasonCell value={row.reason} onCommit={(text) => patch(row.id, { reason: text })} />
                  </td>
                  <td className="px-3 py-1.5">{categoryCell(row)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label="Delete this row" onClick={() => setDeleting(row)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: one card for each row */}
      <ul className="space-y-2.5 md:hidden">
        {view.map((row) => {
          const when = whenOf(row);
          const debit = row.debitPaise > 0;
          return (
            <li key={row.id} className="space-y-2 rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={cn("text-base font-semibold tabular-nums", debit ? "text-destructive" : "text-success")}>
                    {debit ? "−" : "+"}
                    {formatINR(debit ? row.debitPaise : row.creditPaise)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {when.date} · {when.sub}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{row.bank}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete this row" onClick={() => setDeleting(row)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <p className="text-xs break-words text-muted-foreground">{row.details}</p>
              {row.balancePaise !== null ? <p className="text-xs text-muted-foreground">Balance {formatINR(row.balancePaise)}</p> : null}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Reason</p>
                <ReasonCell value={row.reason} onCommit={(text) => patch(row.id, { reason: text })} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Category</p>
                {categoryCell(row)}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this row?"
        description={deleting ? `${deleting.debitPaise > 0 ? "Debit" : "Credit"} of ${formatINR(deleting.debitPaise || deleting.creditPaise)} from ${deleting.bank} will be removed from Bank Statement. It stays removed if you import the statement again.` : ""}
        confirmLabel="Delete row"
        onConfirm={confirmDelete}
      />
    </>
  );
}
