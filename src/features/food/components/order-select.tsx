"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Oldest to Newest or Newest to Oldest. The choice lives in the address (order=desc), so a refresh keeps it. */
export function OrderSelect({ value }: { value: "asc" | "desc" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="space-y-1">
      <label htmlFor="food-order" className="text-xs font-medium text-muted-foreground">
        Order
      </label>
      <select
        id="food-order"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "desc") next.set("order", "desc");
          else next.delete("order");
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
        className="h-10 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
      >
        <option value="asc">Oldest to Newest</option>
        <option value="desc">Newest to Oldest</option>
      </select>
    </div>
  );
}
