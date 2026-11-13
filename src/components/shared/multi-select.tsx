"use client";

import { Popover } from "@base-ui/react/popover";
import { ChevronsUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface MultiOption {
  value: string;
  label: string;
}

/**
 * A dropdown where any number of options can be ticked at once (it stays open while you tick). The button shows the label and
 * how many are ticked. Used for the filters of GPay Transactions.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = true,
  className,
}: {
  label: string;
  options: readonly MultiOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const chosen = options.filter((o) => selected.includes(o.value));

  return (
    <Popover.Root onOpenChange={(open) => open && setQuery("")}>
      <Popover.Trigger
        type="button"
        aria-label={`${label}${chosen.length ? `: ${chosen.length} selected` : ""}`}
        className={cn("flex h-9 min-w-36 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50", selected.length > 0 && "border-neutral-950", className)}
      >
        <span className="truncate">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {chosen.length > 0 ? <span className="rounded-full bg-neutral-950 px-1.5 text-xs font-semibold text-white tabular-nums">{chosen.length}</span> : null}
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="start" className="isolate z-[60]">
          <Popover.Popup data-popup="" className="w-64 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none">
            {searchable && options.length > 6 ? (
              <div className="flex items-center gap-2 border-b px-2.5">
                <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  aria-label={`Search ${label}`}
                  className="h-9 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
                />
              </div>
            ) : null}
            <ul role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-60 overflow-y-auto p-1">
              {shown.length === 0 ? (
                <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">Nothing found.</li>
              ) : (
                shown.map((o) => (
                  <li key={o.value} role="option" aria-selected={selected.includes(o.value)}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                      <Checkbox checked={selected.includes(o.value)} onCheckedChange={(on) => onChange(on === true ? [...selected, o.value] : selected.filter((v) => v !== o.value))} />
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    </label>
                  </li>
                ))
              )}
            </ul>
            {selected.length > 0 ? (
              <div className="border-t p-1">
                <button type="button" onClick={() => onChange([])} className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  Clear {label.toLowerCase()}
                </button>
              </div>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
