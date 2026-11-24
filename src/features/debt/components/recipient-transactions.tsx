"use client";

import { ArrowDownUp, Columns3, FileSpreadsheet, FileText, Loader2, MoreVertical, MoveDown, MoveUp, Pencil, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ColumnFilter } from "@/features/quick-pay/components/column-filter";
import { EditEntryDialog, type EditActions } from "@/features/quick-pay/components/edit-entry-dialog";
import { istDateOf } from "@/features/quick-pay/datetime";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { resetRecipientColumnsAction, saveRecipientColumnsAction } from "../actions";
import { COLUMNS, DEFAULT_FILTERS, SOURCE_LABEL, filterItems, filtersToQuery, totalsOf, visibleColumns, whenOf, type ColumnId, type ColumnPrefs, type KindFilter, type RecipientFilters } from "../recipient-view";
import type { DebtItem } from "../types";
import { DeleteManualDebt } from "./delete-manual-debt";

const LABEL = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label])) as Record<ColumnId, string>;
const ICON = "relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * One recipient's transactions, controlled like Transaction History: how many are showing, a search over everything, Credits and
 * Debits quick filters, a date range and calendar, an order, Refresh, PDF and Excel export (of exactly what is shown, in the
 * columns chosen), the Credit and Debit values with what remains, a column picker (show, hide, reorder, reset: kept for this
 * recipient) and editing of the original transaction. On a phone each line is a card.
 */
export function RecipientTransactions({
  partyId,
  items,
  columns: initialColumns,
  exportBase,
  options,
  editActions,
  saveColumns,
  resetColumns,
}: {
  partyId: string;
  items: DebtItem[];
  columns: ColumnPrefs;
  /** The period and HDFC date of the page, as a query string, carried into the export. */
  exportBase: string;
  options: QuickPayOptions;
  editActions: EditActions;
  saveColumns: typeof saveRecipientColumnsAction;
  resetColumns: typeof resetRecipientColumnsAction;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<RecipientFilters>(DEFAULT_FILTERS);
  const [types, setTypes] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [places, setPlaces] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<ColumnPrefs>(initialColumns);
  const [editing, setEditing] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const today = istDateOf(new Date());

  const typeOptions = useMemo(() => [...new Set(items.map((i) => i.source))].map((s) => ({ value: s, label: SOURCE_LABEL[s] })), [items]);
  const catOptions = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort().map((v) => ({ value: v, label: v })), [items]);
  const placeOptions = useMemo(() => [...new Set(items.map((i) => i.related).filter(Boolean))].sort().map((v) => ({ value: v, label: v })), [items]);
  const shown = useMemo(() => filterItems(items, filters).filter((i) => (types.length === 0 || types.includes(i.source)) && (cats.length === 0 || cats.includes(i.category)) && (places.length === 0 || places.includes(i.related))), [items, filters, types, cats, places]);
  const totals = totalsOf(shown);
  const cols = visibleColumns(prefs);
  const narrowed = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) || types.length + cats.length + places.length > 0;
  const onlyCredit = filters.kind === "CREDIT";
  const onlyDebit = filters.kind === "DEBIT";
  const exportQuery = [exportBase, filtersToQuery(filters)].filter(Boolean).join("&");
  const exportHref = (format: "pdf" | "xlsx") => `/debt/${partyId}/export?format=${format}${exportQuery ? `&${exportQuery}` : ""}`;
  const set = (change: Partial<RecipientFilters>) => setFilters((f) => ({ ...f, ...change }));
  const kindChip = (label: string, kind: KindFilter, count: number, tone: string) => (
    <button type="button" aria-pressed={filters.kind === kind} onClick={() => set({ kind: filters.kind === kind ? "ALL" : kind })} className={cn("relative h-10 rounded-lg border px-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50", filters.kind === kind ? "border-primary bg-primary/10" : "border-input bg-background hover:bg-muted")}>
      {label}
      <span className={cn("absolute -top-2 -right-1.5 min-w-5 rounded-full px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums", tone)}>{count}</span>
    </button>
  );

  async function changeColumns(next: ColumnPrefs) {
    setPrefs(next);
    const r = await saveColumns({ partyId, order: next.order, hidden: next.hidden });
    if (!r.ok) return void toast.error(r.error);
    setPrefs(r.columns);
  }

  const cell = (i: DebtItem, c: ColumnId) => {
    const payment = i.source === "PAYMENT";
    switch (c) {
      case "date":
        return <td key={c} className="px-3 py-2.5 whitespace-nowrap">{whenOf(i.occurredAt)}</td>;
      case "type":
        return <td key={c} className="px-3 py-2.5 whitespace-nowrap">{SOURCE_LABEL[i.source]}</td>;
      case "reason":
        return (
          <td key={c} className="max-w-56 px-3 py-2.5 break-words">
            {i.href ? (
              <Link href={i.href} className="underline-offset-4 hover:underline">
                {i.reason || "Open"}
              </Link>
            ) : (
              i.reason || <span className="text-muted-foreground">—</span>
            )}
          </td>
        );
      case "category":
        return <td key={c} className="px-3 py-2.5">{i.category || <span className="text-muted-foreground">—</span>}</td>;
      case "related":
        return <td key={c} className="px-3 py-2.5">{i.related || <span className="text-muted-foreground">—</span>}</td>;
      case "debt":
        return <td key={c} className="px-3 py-2.5 text-right font-medium text-destructive tabular-nums">{payment ? "" : formatINR(i.amountPaise)}</td>;
      case "paid":
        return <td key={c} className="px-3 py-2.5 text-right font-medium text-success tabular-nums">{payment ? formatINR(i.amountPaise) : ""}</td>;
    }
  };

  const rowMenu = (i: DebtItem) => {
    const entryId = i.id.startsWith("tx:") ? i.id.slice(3) : null;
    if (entryId) {
      return (
        <Button variant="ghost" size="icon-sm" aria-label="Edit this transaction" onClick={() => setEditing(entryId)}>
          <Pencil />
        </Button>
      );
    }
    if (i.source === "MANUAL") return <DeleteManualDebt id={i.id.replace("manual:", "")} />;
    return i.href ? (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Open the original" />}>
          <MoreVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => router.push(i.href!)}>
            <Pencil /> Edit in {i.source === "SHOPPING" ? "Shopping Records" : i.source === "CREDIT_PORTAL" ? "Credit Portal" : "its page"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3" role="search" aria-label="Transaction filters">
        <p className="flex items-center gap-2 text-sm font-semibold">
          Total <span className="rounded-md bg-red-50 px-2 py-0.5 text-red-600 tabular-nums">{items.length}</span>
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold">
          Showing <span className="rounded-md bg-red-50 px-2 py-0.5 text-red-600 tabular-nums">{shown.length}</span>
        </p>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search transactions" aria-label="Search all transactions" className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm" />
        </div>
        <div className="flex gap-2.5" role="group" aria-label="Quick filters">
          {kindChip("Credits", "CREDIT", items.filter((i) => i.source === "PAYMENT").length, "bg-green-600")}
          {kindChip("Debits", "DEBIT", items.filter((i) => i.source !== "PAYMENT").length, "bg-red-600")}
        </div>
        {narrowed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setTypes([]);
              setCats([]);
              setPlaces([]);
            }}
          >
            <X /> Clear filters
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label="Transaction actions">
        <button type="button" title="Refresh" aria-label="Refresh" onClick={() => startRefresh(() => router.refresh())} className={ICON}>
          <RefreshCw className={cn("size-5", refreshing && "animate-spin")} aria-hidden />
        </button>
        <DateRangePicker iconOnly from={filters.from} to={filters.to} max={today} ariaLabel="From and To dates" onChange={(r) => set({ from: r.from, to: r.to })} />
        <button type="button" title="Order" aria-label={`Order: ${filters.order === "desc" ? "new to old" : "old to new"}`} onClick={() => set({ order: filters.order === "desc" ? "asc" : "desc" })} className={ICON}>
          <ArrowDownUp className="size-5" aria-hidden />
        </button>
        <ColumnsPicker prefs={prefs} onChange={changeColumns} onReset={async () => {
          const r = await resetColumns({ partyId });
          if (r.ok) setPrefs(r.columns);
          else toast.error(r.error);
        }} />
        <a href={exportHref("pdf")} download title="Export as PDF" aria-label="Export as PDF" className={ICON}>
          <FileText className="size-5" aria-hidden />
        </a>
        <a href={exportHref("xlsx")} download title="Download Excel" aria-label="Download Excel" className={ICON}>
          <FileSpreadsheet className="size-5" aria-hidden />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2" aria-live="polite">
        {!onlyDebit ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Total Credit Value </span>
            <span className="text-xl font-semibold text-green-600 tabular-nums">{formatINR(totals.creditPaise)}</span>
          </p>
        ) : null}
        {!onlyCredit ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Total Debit Value </span>
            <span className="text-xl font-semibold text-red-600 tabular-nums">{formatINR(totals.debitPaise)}</span>
          </p>
        ) : null}
        <p className="text-sm">
          <span className="text-muted-foreground">{totals.remainingPaise < 0 ? "Paid ahead " : "Remaining Balance "}</span>
          <span className={cn("text-xl font-semibold tabular-nums", totals.remainingPaise > 0 && "text-destructive")}>{formatINR(Math.abs(totals.remainingPaise))}</span>
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{items.length === 0 ? "Nothing is recorded in this period." : "Nothing matches the search and filters."}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b bg-muted text-xs text-muted-foreground">
                <tr>
                  {cols.map((c) => (
                    <th key={c} scope="col" className={cn("px-3 py-2.5 font-medium", c === "debt" || c === "paid" ? "text-right" : "text-left")}>
                      <span className={cn("inline-flex items-center gap-1", (c === "debt" || c === "paid") && "justify-end")}>
                        {LABEL[c]}
                        {c === "date" ? <DateRangePicker iconOnly from={filters.from} to={filters.to} max={today} ariaLabel="Filter dates" className="size-6 rounded border-0 bg-transparent [&_svg]:size-3.5" onChange={(r) => set({ from: r.from, to: r.to })} /> : null}
                        {c === "type" ? <ColumnFilter label="Type" options={typeOptions} selected={types} searchable={false} onApply={setTypes} /> : null}
                        {c === "category" ? <ColumnFilter label="Category" options={catOptions} selected={cats} onApply={setCats} /> : null}
                        {c === "related" ? <ColumnFilter label="Portal / platform" options={placeOptions} selected={places} onApply={setPlaces} /> : null}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="w-12 px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
                    {cols.map((c) => cell(i, c))}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{rowMenu(i)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  {cols.map((c, n) => (
                    <td key={c} className={cn("px-3 py-2.5", (c === "debt" || c === "paid") && "text-right tabular-nums")}>
                      {n === 0 ? "Total" : c === "debt" ? formatINR(totals.debitPaise) : c === "paid" ? formatINR(totals.creditPaise) : ""}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {shown.map((i) => {
              const payment = i.source === "PAYMENT";
              return (
                <li key={i.id} className="space-y-1 rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {i.href ? (
                        <Link href={i.href} className="text-sm font-medium break-words">
                          {i.reason || "Open"}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium break-words">{i.reason || "—"}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {whenOf(i.occurredAt)} · {SOURCE_LABEL[i.source]}
                        {i.category ? ` · ${i.category}` : ""}
                        {i.related ? ` · ${i.related}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <p className={cn("font-semibold tabular-nums", payment ? "text-success" : "text-destructive")}>{formatINR(i.amountPaise)}</p>
                      {rowMenu(i)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <EditEntryDialog entryId={editing} options={options} actions={editActions} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
    </div>
  );
}

/** Show or hide each column and move it up or down; Reset goes back to the standard columns. */
function ColumnsPicker({ prefs, onChange, onReset }: { prefs: ColumnPrefs; onChange: (next: ColumnPrefs) => void | Promise<void>; onReset: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const move = (id: ColumnId, by: -1 | 1) => {
    const i = prefs.order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= prefs.order.length) return;
    const order = [...prefs.order];
    [order[i], order[j]] = [order[j]!, order[i]!];
    void run(() => onChange({ ...prefs, order }));
  };
  const toggle = (id: ColumnId, on: boolean) => {
    const hidden = on ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id];
    // At least one column stays.
    if (hidden.length >= prefs.order.length) return;
    void run(() => onChange({ ...prefs, hidden }));
  };
  return (
    <Popover.Root>
      <Popover.Trigger type="button" title="Columns" aria-label="Customize columns" className={ICON}>
        <Columns3 className="size-5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={8} className="isolate z-[70]">
          <Popover.Popup data-popup="" className="w-64 rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl outline-none">
            <div className="flex items-center justify-between px-1 pb-1">
              <p className="text-xs font-semibold text-muted-foreground">Columns {busy ? <Loader2 className="ml-1 inline size-3 animate-spin" aria-hidden /> : null}</p>
              <button type="button" onClick={() => void run(onReset)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium hover:bg-accent">
                <RotateCcw className="size-3" aria-hidden /> Reset
              </button>
            </div>
            <ul>
              {prefs.order.map((id, n) => (
                <li key={id} className="flex items-center gap-1 rounded-md px-1 hover:bg-accent/50">
                  <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={!prefs.hidden.includes(id)} onCheckedChange={(on) => toggle(id, on === true)} aria-label={`Show ${LABEL[id]}`} />
                    {LABEL[id]}
                  </label>
                  <button type="button" aria-label={`Move ${LABEL[id]} up`} disabled={n === 0} onClick={() => move(id, -1)} className="flex size-7 items-center justify-center rounded hover:bg-muted disabled:opacity-30">
                    <MoveUp className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`Move ${LABEL[id]} down`} disabled={n === prefs.order.length - 1} onClick={() => move(id, 1)} className="flex size-7 items-center justify-center rounded hover:bg-muted disabled:opacity-30">
                    <MoveDown className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">Kept for this person. Exports use these columns.</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
