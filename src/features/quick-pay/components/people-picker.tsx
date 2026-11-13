"use client";

import { ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { PersonOption } from "../types";
import { InlineAdd, type AddResult } from "./inline-add";

/**
 * A dropdown where any number of people can be ticked. The list stays open while you tick, and a new person can be added
 * at the bottom without leaving the page (they are ticked straight away).
 */
export function PeoplePicker({
  people,
  selected,
  onChange,
  onAddPerson,
  invalid = false,
  ariaLabel,
  bare = false,
  compact = false,
}: {
  bare?: boolean;
  compact?: boolean;
  people: readonly PersonOption[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  onAddPerson: (name: string) => Promise<AddResult>;
  invalid?: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, query]);
  const names = selected.map((id) => people.find((p) => p.id === id)?.name).filter((n): n is string => !!n);

  const toggle = (id: string, on: boolean) => onChange(on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id));

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        data-grid-control=""
        aria-expanded={open}
        data-invalid={invalid || undefined}
        onClick={() => {
          setQuery("");
          setOpen((o) => !o);
        }}
        className={cn("flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-left text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-invalid:border-destructive sm:text-sm", compact ? "h-8" : "h-10", bare && "border-transparent bg-transparent shadow-none hover:bg-muted/60 focus-visible:bg-background")}
      >
        <span className={cn("truncate", names.length === 0 && "text-muted-foreground")}>{names.length > 0 ? names.join(", ") : bare ? "Person" : "Choose people"}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {names.length > 1 ? <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-foreground">{names.length}</span> : null}
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </span>
      </button>

      {open ? (
        <div data-popup="" className="absolute left-0 z-50 mt-1 w-full min-w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Search people…"
              aria-label="Search people"
              className="h-9 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label={ariaLabel} className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">{people.length === 0 ? "No people yet. Add one below." : "No one found."}</li>
            ) : (
              filtered.map((person) => (
                <li key={person.id} role="option" aria-selected={selected.includes(person.id)}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                    <Checkbox checked={selected.includes(person.id)} onCheckedChange={(next) => toggle(person.id, next === true)} />
                    <span className="min-w-0 flex-1 truncate">{person.name}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
          <div className="border-t">
            <InlineAdd
              label="New person"
              placeholder="Add a person…"
              onAdd={async (name) => {
                const result = await onAddPerson(name);
                if (result.ok) onChange([...new Set([...selected, result.id])]);
                return result;
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
