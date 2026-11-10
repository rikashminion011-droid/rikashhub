"use client";

import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A dropdown you can type into to find an option. Keyboard friendly (arrows, Enter, Esc) and
 * readable by screen readers. `footer` is shown under the list, e.g. an "Add details" link.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing found.",
  ariaLabel,
  id,
  invalid = false,
  clearable = false,
  disabled = false,
  footer,
  className,
  compact = false,
}: {
  options: readonly SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel: string;
  id?: string;
  invalid?: boolean;
  /** Show an x to clear the choice (for optional fields). */
  clearable?: boolean;
  disabled?: boolean;
  footer?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Close when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openList() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30",
          compact ? "h-8" : "h-9",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          {clearable && selected ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Clear ${ariaLabel}`}
              className="rounded p-0.5 hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="size-3.5" />
            </span>
          ) : null}
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full min-w-56 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={`Search ${ariaLabel}`}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">{emptyText}</li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm",
                    index === active && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === value ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                </li>
              ))
            )}
          </ul>
          {footer ? <div className="border-t p-1">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
