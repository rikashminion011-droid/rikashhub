"use client";

import { ListFilter, Loader2, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { MultiSelect, type MultiOption } from "@/components/shared/multi-select";
import { listOf, useTxParams } from "@/features/quick-pay/components/use-tx-params";
import { cn } from "@/lib/utils";
import type { ViewKey } from "../analysis";

export interface FilterOptions {
  banks: MultiOption[];
  categories: MultiOption[];
  meals: MultiOption[];
  platforms: MultiOption[];
  recipients: MultiOption[];
  portals: MultiOption[];
}

const KINDS: MultiOption[] = [
  { value: "DEBIT", label: "Debits" },
  { value: "CREDIT", label: "Credits" },
];

/**
 * The Dashboard's universal search and multi filter. The filters offered belong to the analysis that is open (banks and
 * categories for Transactions, meals for Food, platforms for Shopping, recipients for Debt, portals for Credit Portal), and the
 * analysis below is drawn from exactly what is chosen. The address holds every choice.
 */
export function AnalysisFilters({ view, options }: { view: ViewKey; options: FilterOptions }) {
  const { params, go, pending } = useTxParams();
  const [search, setSearch] = useState(params.get("aq") ?? "");
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const banks = listOf(params.get("abank"));
  const cats = listOf(params.get("acat"));
  const meals = listOf(params.get("ameal"));
  const plats = listOf(params.get("aplat"));
  const recs = listOf(params.get("arec"));
  const portals = listOf(params.get("aportal"));
  const kind = params.get("akind") === "CREDIT" ? ["CREDIT"] : [];
  const active = view === "transactions" ? banks.length + cats.length + kind.length : view === "food" ? meals.length : view === "shopping" ? plats.length : view === "debt" ? recs.length : portals.length;

  function onSearch(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ aq: value.trim() }), 350);
  }

  return (
    <div className="space-y-3" role="search" aria-label="Analysis filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search the analysis" aria-label="Search the analysis" className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm" />
        </div>
        <button
          type="button"
          aria-expanded={open}
          title="Filters"
          aria-label={`Filters${active ? `: ${active} applied` : ""}`}
          onClick={() => setOpen((o) => !o)}
          className={cn("relative flex size-10 items-center justify-center rounded-lg border border-input bg-background outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", (open || active > 0) && "border-primary bg-primary/10")}
        >
          <ListFilter className="size-5" aria-hidden />
          {active > 0 ? <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-red-500 px-1 text-[11px] leading-5 font-semibold text-white tabular-nums">{active}</span> : null}
        </button>
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
      </div>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <span className="text-xs font-medium text-muted-foreground">Filter by</span>
          {view === "transactions" ? (
            <>
              <MultiSelect label="Through" options={options.banks} selected={banks} onChange={(v) => go({ abank: v.join(",") })} />
              <MultiSelect label="Categories" options={options.categories} selected={cats} onChange={(v) => go({ acat: v.join(",") })} />
              <MultiSelect label="Credits only" options={KINDS.slice(1)} selected={kind} searchable={false} onChange={(v) => go({ akind: v.length ? "CREDIT" : "" })} />
            </>
          ) : null}
          {view === "food" ? <MultiSelect label="Meals" options={options.meals} selected={meals} searchable={false} onChange={(v) => go({ ameal: v.join(",") })} /> : null}
          {view === "shopping" ? <MultiSelect label="Platforms" options={options.platforms} selected={plats} onChange={(v) => go({ aplat: v.join(",") })} /> : null}
          {view === "debt" ? <MultiSelect label="Recipients" options={options.recipients} selected={recs} onChange={(v) => go({ arec: v.join(",") })} /> : null}
          {view === "portal" ? <MultiSelect label="Portals" options={options.portals} selected={portals} onChange={(v) => go({ aportal: v.join(",") })} /> : null}
          <button
            type="button"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              setSearch("");
              go({ aq: "", abank: "", acat: "", akind: "", ameal: "", aplat: "", arec: "", aportal: "" });
            }}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-3.5" /> Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
