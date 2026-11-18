"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowDownUp, Check, FilePlus2, ListFilter, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { DateRangePicker } from "@/components/shared/date-picker";
import { MultiSelect } from "@/components/shared/multi-select";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/finance";
import { sharedCategories } from "../availability";
import { monthBounds } from "../datetime";
import type { QuickPayOptions } from "../types";
import { listOf, useTxParams } from "./use-tx-params";

const KINDS = [
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Credit" },
  { value: "TRANSFER", label: "Self transfer" },
];

const ICON = "relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The top of Transaction History: the totals (all, and how many are showing), the multi-filter, the search over everything,
 * the Credits and Debits quick filters, the Credit and Debit values, and one row of icons for the things you can do (add,
 * add in bulk, draft, report, refresh, dates, order, import, export). The address holds every choice.
 */
export function TransactionsToolbar({
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
  options: Pick<QuickPayOptions, "banks" | "categories" | "creditCategories" | "persons">;
  /** Every transaction there is, and how many match what is chosen. */
  total: number;
  showing: number;
  typeCounts: { debit: number; credit: number };
  totals: { debitPaise: number; creditPaise: number };
  /** The icons that need the server (Draft, Export Report, Import, Export). */
  slots: { draft: ReactNode; report: ReactNode; import: ReactNode; export: ReactNode };
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
  const people = listOf(params.get("people"));
  const by = listOf(params.get("by"));
  const types = listOf(params.get("types"));
  const activeFilters = banks.length + cats.length + people.length + by.length + (types.length > 1 || (types.length === 1 && types[0] === "TRANSFER") ? types.length : 0);
  const descending = params.get("order") !== "asc";
  // Credits and Debits are the quick filters; each shows only its own value.
  const onlyCredit = types.length === 1 && types[0] === "CREDIT";
  const onlyDebit = types.length === 1 && types[0] === "DEBIT";

  const bankOptions = useMemo(() => options.banks.map((b) => ({ value: b.id, label: b.label })), [options.banks]);
  const categoryOptions = useMemo(() => sharedCategories(options.categories, options.creditCategories).map((c) => ({ value: c.id, label: c.label })), [options.categories, options.creditCategories]);
  const personOptions = useMemo(() => options.persons.map((p) => ({ value: p.id, label: p.name })), [options.persons]);

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
    <div className="space-y-3" role="search" aria-label="Transaction History filters">
      {/* Totals, multi-filter, search, quick filters */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          Total
          <span className="rounded-md bg-red-50 px-2 py-0.5 tabular-nums text-red-600">{total}</span>
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold">
          Showing
          <span className="rounded-md bg-red-50 px-2 py-0.5 tabular-nums text-red-600">{showing}</span>
        </p>
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
            placeholder="Search transactions"
            aria-label="Search all transactions"
            className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Quick filters">
          {chip("Credits", typeCounts.credit, onlyCredit, () => go({ types: onlyCredit ? "" : "CREDIT" }), "bg-green-600")}
          {chip("Debits", typeCounts.debit, onlyDebit, () => go({ types: onlyDebit ? "" : "DEBIT" }), "bg-red-600")}
        </div>
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
      </div>

      {/* The multi-filter */}
      {panel ? (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filter by</span>
            <MultiSelect label="Through" options={bankOptions} selected={banks} onChange={(v) => go({ banks: v.join(",") })} />
            <MultiSelect label="Categories" options={categoryOptions} selected={cats} onChange={(v) => go({ cats: v.join(",") })} />
            <MultiSelect label="Type" options={KINDS} selected={types} searchable={false} onChange={(v) => go({ types: v.join(",") })} />
            <MultiSelect label="People" options={personOptions} selected={people} onChange={(v) => go({ people: v.join(",") })} />
            <MultiSelect label="Credited by" options={personOptions} selected={by} onChange={(v) => go({ by: v.join(",") })} />
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
                go({ q: "", banks: "", cats: "", people: "", by: "", types: "", all: "", month: "", from: "", to: "", order: "", size: "" });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" /> Clear filters
            </button>
          </div>
        </div>
      ) : null}

      {/* The icons */}
      <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label="Transaction History actions">
        <Link href="/quick-pay" title="Add Transaction" aria-label="Add Transaction" className={cn(ICON, "border-primary/60 text-primary")}>
          <Plus className="size-5" strokeWidth={2.6} aria-hidden />
        </Link>
        <Link href="/quick-pay/transactions/bulk" title="Add Bulk Transaction" aria-label="Add Bulk Transaction" className={ICON}>
          <FilePlus2 className="size-5" aria-hidden />
        </Link>
        {slots.draft}
        {slots.report}
        <button type="button" title="Refresh" aria-label="Refresh" onClick={refresh} className={ICON}>
          <RefreshCw className={cn("size-5", pending && "animate-spin")} aria-hidden />
        </button>
        <DateRangePicker iconOnly from={from} to={to} max={today} ariaLabel="From and To dates" onChange={(r) => go({ from: r.from, to: r.to, month: "", all: "" })} />
        {/* Order: one icon; it opens the two choices */}
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
        {slots.import}
        {slots.export}
      </div>

      {/* The values: Credits shows only the Credit Value, Debits only the Debit Value */}
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
