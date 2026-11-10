"use client";

import { Loader2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Month, custom From / To dates and search. The URL is the source of truth, so a filtered view can be
 * shared, refreshed or reached with the back button. Choosing a month clears the custom range and the other way round.
 */
export function TransactionsFilterBar({ today }: { today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const month = params.get("month") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const active = Boolean(month || from || to || params.get("q"));

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

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setSearch("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3" role="search" aria-label="Filter transactions">
      <div className="space-y-1">
        <Label htmlFor="f-month" className="text-xs text-muted-foreground">Month</Label>
        <Input id="f-month" type="month" value={month} max={today.slice(0, 7)} onChange={(e) => go({ month: e.target.value, from: "", to: "" })} className="w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-from" className="text-xs text-muted-foreground">From date</Label>
        <Input id="f-from" type="date" value={from} max={to || today} onChange={(e) => go({ from: e.target.value, month: "" })} className="w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-to" className="text-xs text-muted-foreground">To date</Label>
        <Input id="f-to" type="date" value={to} min={from || undefined} max={today} onChange={(e) => go({ to: e.target.value, month: "" })} className="w-40" />
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        <Label htmlFor="f-search" className="text-xs text-muted-foreground">Search</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="f-search" type="search" value={search} placeholder="Reason, bank, category, person" onChange={(e) => onSearch(e.target.value)} className="pl-8" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {pending ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="size-3.5 animate-spin" /> Updating…
          </span>
        ) : null}
        <Button type="button" variant="outline" onClick={clear} disabled={!active && !search}>
          <X /> Clear filters
        </Button>
      </div>
    </div>
  );
}
