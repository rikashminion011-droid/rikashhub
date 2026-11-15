"use client";

import { Loader2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { DatePicker, MonthPicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { monthBounds } from "@/features/quick-pay/datetime";

/**
 * The period of a Credit Portal page: a month (the current month to begin with), or any From and To dates. The address holds
 * the choice, so it can be shared and survives a refresh. Other things in the address (the portal, the tab) are kept.
 */
export function PeriodFilter({ today, children }: { today: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const defaultMonth = today.slice(0, 7);

  const rawFrom = params.get("from") ?? "";
  const rawTo = params.get("to") ?? "";
  const custom = Boolean(rawFrom || rawTo);
  const month = custom ? "" : (params.get("month") ?? defaultMonth);
  const bounds = month ? monthBounds(month) : null;
  const from = custom ? rawFrom : (bounds?.from ?? "");
  const to = custom ? rawTo : (bounds?.to ?? "");
  const changed = custom || (params.get("month") !== null && params.get("month") !== defaultMonth);

  function go(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Choose the period">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Month</Label>
        <MonthPicker value={month} max={today.slice(0, 7)} ariaLabel="Month" className="w-44" onChange={(m) => go({ month: m === defaultMonth ? "" : m, from: "", to: "" })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">From date</Label>
        <DatePicker value={from} max={to || today} ariaLabel="From date" className="w-52" onChange={(d) => go({ from: d, month: "", ...(d && !rawTo ? { to: to || today } : {}) })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">To date</Label>
        <DatePicker value={to} min={from || undefined} max={today} ariaLabel="To date" className="w-52" onChange={(d) => go({ to: d, month: "", ...(d && !rawFrom ? { from: from || d } : {}) })} />
      </div>
      {changed ? (
        <Button type="button" variant="outline" size="sm" onClick={() => go({ month: "", from: "", to: "" })}>
          <X /> This month
        </Button>
      ) : null}
      {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
