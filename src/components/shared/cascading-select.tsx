"use client";

import { Check, ChevronRight, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { flattenGroups, type CascadeGroup } from "@/features/quick-pay/cascade";
import { cn } from "@/lib/utils";

/**
 * A dropdown that shows main names; the ones with sub names open a menu beside them, like a
 * right-click menu (GPay › HDFC, IDFC, DBS). Typing in the search box switches to a flat list of matches.
 * On a narrow screen the sub names open underneath instead of beside.
 */
export function CascadingSelect({
  groups,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing found.",
  ariaLabel,
  id,
  invalid = false,
  clearable = false,
  footer,
  className,
  compact = false,
}: {
  groups: readonly CascadeGroup[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel: string;
  id?: string;
  invalid?: boolean;
  clearable?: boolean;
  footer?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [query, setQuery] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const flat = useMemo(() => flattenGroups(groups), [groups]);
  const selected = flat.find((o) => o.value === value) ?? null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? flat.filter((o) => o.label.toLowerCase().includes(q)) : [];
  }, [flat, query]);
  const searching = query.trim() !== "";

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openPanel() {
    setQuery("");
    // Start with the group of the current choice open.
    setOpenGroup(groups.find((g) => g.children.some((c) => c.value === value))?.name ?? null);
    // Open towards the left when the right edge of the screen is too close for the panel.
    const rect = root.current?.getBoundingClientRect();
    setAlignRight(!!rect && rect.left + 240 > window.innerWidth - 8);
    setOpen(true);
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  const row = "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent";

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
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
          compact ? "h-8" : "h-10",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label.replace(/ → /g, " › ") : placeholder}</span>
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
        <div data-popup="" className={cn("absolute z-50 mt-1 w-full min-w-60 max-w-[calc(100vw-1rem)] rounded-xl border bg-popover text-popover-foreground shadow-lg", alignRight ? "right-0" : "left-0")}>
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (matches[0]) choose(matches[0].value);
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={`Search ${ariaLabel}`}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul id={listId} role="menu" aria-label={ariaLabel} className="p-1 max-md:max-h-64 max-md:overflow-y-auto">
            {searching ? (
              matches.length === 0 ? (
                <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">{emptyText}</li>
              ) : (
                matches.map((m) => (
                  <li key={m.value} role="none">
                    <button type="button" role="menuitem" className={row} onClick={() => choose(m.value)}>
                      <span className="truncate">{m.label.replace(/ → /g, " › ")}</span>
                      {m.value === value ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                    </button>
                  </li>
                ))
              )
            ) : groups.length === 0 ? (
              <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">{emptyText}</li>
            ) : (
              groups.map((group) => {
                const hasChildren = group.children.length > 0;
                const expanded = openGroup === group.name;
                return (
                  <li key={group.name} role="none" className="relative" onMouseEnter={() => hasChildren && setOpenGroup(group.name)}>
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup={hasChildren ? "menu" : undefined}
                      aria-expanded={hasChildren ? expanded : undefined}
                      className={cn(row, expanded && "bg-accent")}
                      onClick={() => (hasChildren ? setOpenGroup(expanded ? null : group.name) : group.value && choose(group.value))}
                    >
                      <span className="truncate">{group.name}</span>
                      {hasChildren ? <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform max-md:rotate-90", expanded && "max-md:-rotate-90")} aria-hidden /> : group.value === value ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                    </button>

                    {hasChildren && expanded ? (
                      <ul
                        role="menu"
                        aria-label={`${group.name} options`}
                        className="p-1 max-md:ml-3 max-md:border-l md:absolute md:top-0 md:left-full md:ml-1 md:w-56 md:rounded-xl md:border md:bg-popover md:shadow-lg"
                      >
                        {group.value ? (
                          <li role="none">
                            <button type="button" role="menuitem" className={cn(row, "font-medium")} onClick={() => choose(group.value!)}>
                              <span className="truncate">{group.name}</span>
                              {group.value === value ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                            </button>
                          </li>
                        ) : null}
                        {group.children.map((child) => (
                          <li key={child.value} role="none">
                            <button type="button" role="menuitem" className={row} onClick={() => choose(child.value)}>
                              <span className="truncate">{child.name}</span>
                              {child.value === value ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
          {footer ? <div className="border-t p-1">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
