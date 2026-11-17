"use client";

import { cn } from "@/lib/utils";
import type { PersonOption } from "../types";
import { InlineAdd, type AddResult } from "./inline-add";

/**
 * Everyone you can pick, shown right where you ticked the option, so a person is one tap away (no dropdown to open).
 * `single` lets only one be chosen; a new person can be added at the end and is chosen straight away.
 */
export function PersonChips({
  people,
  selected,
  onChange,
  onAddPerson,
  single = false,
  invalid = false,
  noneLabel,
  ariaLabel,
}: {
  /** An extra first chip that means "nobody" (for example Others); it is lit while no one is chosen. */
  noneLabel?: string;
  people: readonly PersonOption[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  onAddPerson?: (name: string) => Promise<AddResult>;
  single?: boolean;
  invalid?: boolean;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} data-invalid={invalid || undefined} className={cn("space-y-2 rounded-xl", invalid && "ring-1 ring-destructive/60")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {noneLabel ? (
          <button
            type="button"
            aria-pressed={selected.length === 0}
            onClick={() => onChange([])}
            className={cn(
              "h-8 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected.length === 0 ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent",
            )}
          >
            {noneLabel}
          </button>
        ) : null}
        {people.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(single ? (on ? [] : [p.id]) : on ? selected.filter((id) => id !== p.id) : [...selected, p.id])}
              className={cn(
                "h-8 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent",
              )}
            >
              {p.name}
            </button>
          );
        })}
        {people.length === 0 && !noneLabel ? <span className="text-xs text-muted-foreground">No people yet. Add one below.</span> : null}
      </div>
      {onAddPerson ? (
        <div className="rounded-lg border bg-background">
          <InlineAdd
            label="New person"
            placeholder="Add a person…"
            onAdd={async (name) => {
              const result = await onAddPerson(name);
              if (result.ok) onChange(single ? [result.id] : [...selected, result.id]);
              return result;
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
