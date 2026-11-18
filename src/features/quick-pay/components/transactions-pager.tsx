"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PAGE_SIZES } from "../filters";
import { useTxParams } from "./use-tx-params";

/**
 * The foot of Transaction History: "Page [1] of 33", how many transactions a page shows (chosen from a list), and the arrows.
 * The page number can be typed; Enter goes there. The page size is kept in the address.
 */
export function TransactionsPager({ page, pageCount, size, total }: { page: number; pageCount: number; size: number; total: number }) {
  const { go, pending } = useTxParams();
  const [typed, setTyped] = useState<string | null>(null);
  const goTo = (n: number) => go({ page: n <= 1 ? "" : String(Math.min(n, pageCount)) }, { keepPage: true });
  const arrow = "flex size-9 items-center justify-center rounded-lg border border-input bg-background outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav aria-label="Pages" className={cn("flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm", pending && "opacity-70")}>
      <p className="mr-auto text-muted-foreground tabular-nums">{total} transaction{total === 1 ? "" : "s"}</p>
      <label className="flex items-center gap-2">
        Page
        <input
          inputMode="numeric"
          aria-label="Page number"
          value={typed ?? String(page)}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setTyped(null)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const n = Number.parseInt(typed ?? "", 10);
            if (Number.isInteger(n) && n >= 1) goTo(n);
            setTyped(null);
          }}
          className="h-9 w-14 rounded-lg border border-input bg-background text-center text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        />
        of {pageCount}
      </label>
      <label className="flex items-center gap-2 border-l pl-4">
        <select
          aria-label="Transactions per page"
          value={size}
          onChange={(e) => go({ size: Number(e.target.value) === 50 ? "" : e.target.value })}
          className="h-9 rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        per page
      </label>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => goTo(page - 1)} className={arrow}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => goTo(page + 1)} className={arrow}>
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
