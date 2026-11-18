"use client";

import { Popover } from "@base-ui/react/popover";
import { Funnel, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * The filter on a column heading: a small funnel that opens a box with a search, Select all, the choices, and Clear / Apply.
 * Nothing changes until Apply. The funnel is filled in when the column is filtered.
 */
export function ColumnFilter({
  label,
  options,
  selected,
  onApply,
  searchable = true,
}: {
  /** The column's name, for screen readers and the search box. */
  label: string;
  options: readonly FilterOption[];
  selected: readonly string[];
  onApply: (values: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([...selected]);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const allShown = shown.length > 0 && shown.every((o) => draft.includes(o.value));
  const active = selected.length > 0;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft([...selected]);
          setQuery("");
        }
      }}
    >
      <Popover.Trigger
        type="button"
        aria-label={`Filter ${label}${active ? `: ${selected.length} chosen` : ""}`}
        className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", active && "bg-primary/10 text-primary")}
      >
        <Funnel className={cn("size-3.5", active && "fill-current")} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="isolate z-[70]">
          <Popover.Popup data-popup="" className="flex max-h-[min(var(--available-height),24rem)] w-64 max-w-[calc(100vw-1rem)] flex-col rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl outline-none">
            {searchable ? (
              <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-input px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
                <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label}`} className="h-9 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm" />
              </div>
            ) : null}
            <ul className="min-h-0 flex-1 overflow-y-auto">
              <li>
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm font-semibold hover:bg-accent sm:min-h-8">
                  <Checkbox checked={allShown} onCheckedChange={(on) => setDraft((d) => (on === true ? [...new Set([...d, ...shown.map((o) => o.value)])] : d.filter((v) => !shown.some((o) => o.value === v))))} aria-label="Select all" />
                  Select all
                </label>
              </li>
              {shown.length === 0 ? <li className="px-2 py-3 text-center text-xs text-muted-foreground">Nothing found.</li> : null}
              {shown.map((o) => (
                <li key={o.value}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent sm:min-h-8">
                    <Checkbox checked={draft.includes(o.value)} onCheckedChange={(on) => setDraft((d) => (on === true ? [...d, o.value] : d.filter((v) => v !== o.value)))} />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex shrink-0 items-center justify-between border-t pt-2">
              <button
                type="button"
                disabled={draft.length === 0 && !active}
                onClick={() => {
                  onApply([]);
                  setOpen(false);
                }}
                className="px-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply(draft);
                  setOpen(false);
                }}
                className="h-9 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Apply
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The filter on a column that holds text (Reason): a box to type in, Clear and Apply. */
export function ColumnSearch({ label, value, onApply }: { label: string; value: string; onApply: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const active = value.trim() !== "";
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <Popover.Trigger
        type="button"
        aria-label={`Filter ${label}${active ? ": " + value : ""}`}
        className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", active && "bg-primary/10 text-primary")}
      >
        <Funnel className={cn("size-3.5", active && "fill-current")} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="isolate z-[70]">
          <Popover.Popup data-popup="" className="w-64 max-w-[calc(100vw-1rem)] rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl outline-none">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onApply(draft.trim());
                setOpen(false);
              }}
            >
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-input px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
                <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label}`} className="h-9 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm" />
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <button
                  type="button"
                  disabled={!active && draft === ""}
                  onClick={() => {
                    onApply("");
                    setOpen(false);
                  }}
                  className="px-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Clear
                </button>
                <button type="submit" className="h-9 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50">
                  Apply
                </button>
              </div>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
