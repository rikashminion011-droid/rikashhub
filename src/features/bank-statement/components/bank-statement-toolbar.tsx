"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowDownUp, Check, ListFilter, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { DateRangePicker } from "@/components/shared/date-picker";
import { MultiSelect } from "@/components/shared/multi-select";
import { sharedCategories } from "@/features/quick-pay/availability";
import { listOf, useTxParams } from "@/features/quick-pay/components/use-tx-params";
import { monthBounds } from "@/features/quick-pay/datetime";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Credit" },
];

const ICON = "relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The top of Bank Statement, laid out like Transaction History: the totals (all, and how many are showing), the multi-filter,
 * the search over everything, the Credits and Debits quick filters, the Credit and Debit values, and one row of icons. The
 * address holds every choice.
 */
export function BankStatementToolbar({
  today,
  defaultMonth,
  options,
  total,
  showing,
  typeCounts,
  totals,
  slots,
}: {
  today: string;
  defaultMonth: string;
  options: Pick<QuickPayOptions, "banks" | "categories" | "creditCategories">;
  total: number;
  showing: number;
  typeCounts: { debit: number; credit: number };
  totals: { debitPaise: number; creditPaise: number };
  /** What needs the server: View Balance, Import and Export Report. */
  slots: { import: ReactNode; report: ReactNode; balances: ReactNode };
}) {
  const { params, go, pending, refresh } = useTxParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [panel, setPanel] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const all = params.get("all") === "1";
  const rawFrom = params.get("from") ?? "";
  const rawTo = params.get("to") ?? "";
  const custom = Boolean(rawFrom || rawTo);
  const month = custom || all ? "" : (params.get("month") ?? defaultMonth);
  const bounds = month ? monthBounds(month) : null;
  const from = custom ? rawFrom : (bounds?.from ?? "");
  const to = custom ? rawTo : (bounds?.to ?? "");

  const banks = listOf(params.get("banks"));
  const cats = listOf(params.get("cats"));
  const types = listOf(params.get("types"));
  const activeFilters = banks.length + cats.length + (types.length > 1 ? types.length : 0);
  const descending = params.get("order") !== "asc";
  const onlyCredit = types.length === 1 && types[0] === "CREDIT";
  const onlyDebit = types.length === 1 && types[0] === "DEBIT";

  const bankOptions = useMemo(() => options.banks.map((b) => ({ value: b.id, label: b.label })), [options.banks]);
  const categoryOptions = useMemo(() => sharedCategories(options.categories, options.creditCategories).map((c) => ({ value: c.id, label: c.label })), [options.categories, options.creditCategories]);

  function onSearch(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: value.trim() }), 350);
  }

  const chip = (label: string, count: number, active: boolean, onClick: () => void, tone: string) => (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("relative h-10 rounded-lg border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", active ? "border-primary bg-primary/10 text-foreground" : "border-input bg-background hover:bg-muted")}
    >
      {label}
      <span className={cn("absolute -top-2 -right-1.5 min-w-5 rounded-full px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums", tone)}>{count > 999 ? "999+" : count}</span>
    </button>
  );

  return (
    <div className="space-y-3" role="search" aria-label="Bank Statement filters">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          Total
          <span className="rounded-md bg-red-50 px-2 py-0.5 text-red-600 tabular-nums">{total}</span>
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold">
          Showing
          <span className="rounded-md bg-red-50 px-2 py-0.5 text-red-600 tabular-nums">{showing}</span>
        </p>
        {slots.balances}
        <button
          type="button"
          aria-expanded={panel}
          aria-label={`Filters${activeFilters ? `: ${activeFilters} applied` : ""}`}
          title="Filters"
          onClick={() => setPanel((p) => !p)}
          className={cn(ICON, (panel || activeFilters > 0) && "border-primary bg-primary/10")}
        >
          <ListFilter className="size-5" aria-hidden />
          {activeFilters > 0 ? <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-red-500 px-1 text-[11px] leading-5 font-semibold text-white tabular-nums">{activeFilters}</span> : null}
        </button>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search bank statement"
            aria-label="Search the bank statement"
            className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Quick filters">
          {chip("Credits", typeCounts.credit, onlyCredit, () => go({ types: onlyCredit ? "" : "CREDIT" }), "bg-green-600")}
          {chip("Debits", typeCounts.debit, onlyDebit, () => go({ types: onlyDebit ? "" : "DEBIT" }), "bg-red-600")}
        </div>
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
      </div>

      {panel ? (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filter by</span>
            <MultiSelect label="Bank" options={bankOptions} selected={banks} onChange={(v) => go({ banks: v.join(",") })} />
            <MultiSelect label="Categories" options={categoryOptions} selected={cats} onChange={(v) => go({ cats: v.join(",") })} />
            <MultiSelect label="Type" options={KINDS} selected={types} searchable={false} onChange={(v) => go({ types: v.join(",") })} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={() => go({ all: all ? "" : "1", month: "", from: "", to: "" })} className={cn("h-9 rounded-lg border px-3 font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", all ? "border-primary bg-primary/10" : "border-input")}>
              All time
            </button>
            <button
              type="button"
              onClick={() => {
                if (timer.current) clearTimeout(timer.current);
                setSearch("");
                go({ q: "", banks: "", cats: "", types: "", all: "", month: "", from: "", to: "", order: "", size: "" });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" /> Clear filters
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label="Bank Statement actions">
        {slots.import}
        {slots.report}
        <button type="button" title="Refresh" aria-label="Refresh" onClick={refresh} className={ICON}>
          <RefreshCw className={cn("size-5", pending && "animate-spin")} aria-hidden />
        </button>
        <DateRangePicker iconOnly from={from} to={to} max={today} ariaLabel="From and To dates" onChange={(r) => go({ from: r.from, to: r.to, month: "", all: "" })} />
        <Popover.Root>
          <Popover.Trigger type="button" title="Order" aria-label={`Order: ${descending ? "new to old" : "old to new"}`} className={ICON}>
            <ArrowDownUp className="size-5" aria-hidden />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={8} className="isolate z-[70]">
              <Popover.Popup data-popup="" className="w-48 rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl outline-none">
                {(
                  [
                    ["desc", "New to Old"],
                    ["asc", "Old to New"],
                  ] as const
                ).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => go({ order: value === "asc" ? "asc" : "" })} className="flex min-h-10 w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-accent">
                    {label}
                    {(value === "desc") === descending ? <Check className="size-4" aria-hidden /> : null}
                  </button>
                ))}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2" aria-live="polite">
        {!onlyDebit ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Credit Value </span>
            <span className="text-xl font-semibold text-green-600 tabular-nums">{formatINR(totals.creditPaise)}</span>
          </p>
        ) : null}
        {!onlyCredit ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Debit Value </span>
            <span className="text-xl font-semibold text-red-600 tabular-nums">{formatINR(totals.debitPaise)}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
