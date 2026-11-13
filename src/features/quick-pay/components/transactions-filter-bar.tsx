"use client";

import { Loader2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { DatePicker, MonthPicker } from "@/components/shared/date-picker";
import { MultiSelect } from "@/components/shared/multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { monthBounds } from "../datetime";
import type { QuickPayOptions } from "../types";

const KINDS = [
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Credit" },
  { value: "TRANSFER", label: "Self transfer" },
];

const list = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

/**
 * Month, From / To dates, search and multi-select filters (banks, categories, kinds, people). It opens on the current month,
 * with that month's first and last day in From and To. The URL is the source of truth, so a filtered view can be shared,
 * refreshed or reached with the back button. Choosing a month changes From and To with it; choosing dates makes a custom range.
 */
export function TransactionsFilterBar({ today, defaultMonth, options }: { today: string; defaultMonth: string; options: Pick<QuickPayOptions, "banks" | "categories" | "persons"> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const all = params.get("all") === "1";
  const rawFrom = params.get("from") ?? "";
  const rawTo = params.get("to") ?? "";
  const custom = Boolean(rawFrom || rawTo);
  // With nothing chosen, the current month is in force.
  const month = custom || all ? "" : (params.get("month") ?? defaultMonth);
  const bounds = month ? monthBounds(month) : null;
  const from = custom ? rawFrom : (bounds?.from ?? "");
  const to = custom ? rawTo : (bounds?.to ?? "");

  const banks = list(params.get("banks"));
  const cats = list(params.get("cats"));
  const people = list(params.get("people"));
  const types = list(params.get("types"));
  const multi = banks.length + cats.length + people.length + types.length;
  const changed = multi > 0 || Boolean(params.get("q")) || custom || all || (params.get("month") !== null && params.get("month") !== defaultMonth);

  const bankOptions = useMemo(() => options.banks.map((b) => ({ value: b.id, label: b.label })), [options.banks]);
  const categoryOptions = useMemo(() => options.categories.map((c) => ({ value: c.id, label: c.label })), [options.categories]);
  const personOptions = useMemo(() => options.persons.map((p) => ({ value: p.id, label: p.name })), [options.persons]);

  function go(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // any filter change starts again from the first page
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function onSearch(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: value.trim() }), 350);
  }

  /** Back to the current month with nothing else chosen. */
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setSearch("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3" role="search" aria-label="Filter transactions">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Month</Label>
          <MonthPicker value={month} max={today.slice(0, 7)} ariaLabel="Month" className="w-44" onChange={(m) => go({ month: m === defaultMonth ? "" : m, from: "", to: "", all: "" })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From date</Label>
          <DatePicker value={from} max={to || today} ariaLabel="From date" className="w-52" onChange={(d) => go({ from: d, month: "", all: "", ...(d && !rawTo ? { to: to || today } : {}) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To date</Label>
          <DatePicker value={to} min={from || undefined} max={today} ariaLabel="To date" className="w-52" onChange={(d) => go({ to: d, month: "", all: "", ...(d && !rawFrom ? { from: from || d } : {}) })} />
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="f-search" className="text-xs text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="f-search" type="search" value={search} placeholder="Reason, bank, category, person" onChange={(e) => onSearch(e.target.value)} className="pl-8" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Filter by</span>
        <MultiSelect label="Banks" options={bankOptions} selected={banks} onChange={(v) => go({ banks: v.join(",") })} />
        <MultiSelect label="Categories" options={categoryOptions} selected={cats} onChange={(v) => go({ cats: v.join(",") })} />
        <MultiSelect label="Type" options={KINDS} selected={types} searchable={false} onChange={(v) => go({ types: v.join(",") })} />
        <MultiSelect label="People" options={personOptions} selected={people} onChange={(v) => go({ people: v.join(",") })} />
        <div className="ml-auto flex items-center gap-2">
          {pending ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin" /> Updating…
            </span>
          ) : null}
          <Button type="button" variant={all ? "default" : "outline"} size="sm" onClick={() => go({ all: all ? "" : "1", month: "", from: "", to: "" })}>
            All time
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!changed && !search}>
            <X /> Clear filters
          </Button>
        </div>
      </div>
    </div>
  );
}
