"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { DateRangePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * The Credit Portal > HDFC > Statement date: its own From and To, apart from the general date. HDFC statement lines follow only
 * this; everything else follows the general date. It opens on HDFC's 15th to 15th cycle.
 */
export function HdfcPeriodFilter({ today, cycle }: { today: string; cycle: { from: string; to: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const rawFrom = params.get("hfrom") ?? "";
  const rawTo = params.get("hto") ?? "";
  const custom = Boolean(rawFrom || rawTo);

  function go(from: string, to: string) {
    const next = new URLSearchParams(params.toString());
    if (from) next.set("hfrom", from);
    else next.delete("hfrom");
    if (to) next.set("hto", to);
    else next.delete("hto");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Choose the HDFC statement period">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">HDFC statement date</Label>
        <DateRangePicker from={custom ? rawFrom : cycle.from} to={custom ? rawTo : cycle.to} max={today} ariaLabel="HDFC statement From and To dates" className="w-60" onChange={(r) => go(r.from, r.to)} />
      </div>
      {custom ? (
        <Button type="button" variant="outline" size="sm" onClick={() => go("", "")}>
          <X /> Billing cycle
        </Button>
      ) : null}
    </div>
  );
}
