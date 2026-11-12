"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMonths } from "../format";

const VALID = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Month-wise filter: a From month and a To month (equal for a single month). The list and totals update
 * as soon as either changes, and the choice lives in the address so a refresh keeps it.
 */
export function FoodFilters({ from, to, thisMonth }: { from: string; to: string; thisMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function go(nextFrom: string, nextTo: string) {
    if (!VALID.test(nextFrom) || !VALID.test(nextTo)) return;
    // Keep the range in order if one end is moved past the other.
    const [a, b] = nextFrom <= nextTo ? [nextFrom, nextTo] : [nextTo, nextFrom];
    startTransition(() => router.replace(`${pathname}?from=${a}&to=${b}`));
  }

  const presets: { label: string; from: string; to: string }[] = [
    { label: "This month", from: thisMonth, to: thisMonth },
    { label: "Last month", from: addMonths(thisMonth, -1), to: addMonths(thisMonth, -1) },
    { label: "Last 3 months", from: addMonths(thisMonth, -2), to: thisMonth },
    { label: "Last 6 months", from: addMonths(thisMonth, -5), to: thisMonth },
  ];

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="food-from" className="text-xs font-medium text-muted-foreground">From month</label>
          <Input id="food-from" type="month" value={from} max="2100-12" onChange={(e) => go(e.target.value, to)} className="h-10 w-44 text-base sm:text-sm" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="food-to" className="text-xs font-medium text-muted-foreground">To month</label>
          <Input id="food-to" type="month" value={to} max="2100-12" onChange={(e) => go(from, e.target.value)} className="h-10 w-44 text-base sm:text-sm" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <Button key={p.label} type="button" size="sm" variant={active ? "default" : "outline"} aria-pressed={active} onClick={() => go(p.from, p.to)}>
              {p.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
