"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface ChipItem {
  id: string;
  name: string;
}

/**
 * A single-choice group shown as tappable chips, with an "add" chip at the end and an optional
 * Edit mode that shows a remove (x) button on each chip. Works as a radio group for screen readers.
 */
export function ChoiceChips({
  label,
  items,
  value,
  onChange,
  addLabel,
  onAdd,
  onRemove,
  invalid,
  describedBy,
  emptyHint,
}: {
  label: string;
  items: readonly ChipItem[];
  value: string | null;
  onChange: (id: string) => void;
  addLabel: string;
  onAdd: () => void;
  /** When given, an Edit button appears and each chip can be removed. */
  onRemove?: (item: ChipItem) => void;
  invalid?: boolean;
  describedBy?: string;
  emptyHint?: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="flex flex-wrap items-center gap-2"
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <span key={item.id} className="inline-flex items-center">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(item.id)}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted",
                  editing && onRemove && "rounded-r-none border-r-0",
                  invalid && !selected && "border-destructive/50",
                )}
              >
                {item.name}
              </button>
              {editing && onRemove ? (
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => onRemove(item)}
                  className="inline-flex h-9 w-8 items-center justify-center rounded-r-full border border-l-0 border-border bg-background text-muted-foreground transition-colors outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </span>
          );
        })}

        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 text-sm text-muted-foreground transition-colors outline-none hover:border-foreground/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-3.5" aria-hidden />
          {addLabel}
        </button>

        {onRemove && items.length > 0 ? (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
            className="ml-auto text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {editing ? "Done" : "Edit"}
          </button>
        ) : null}
      </div>
      {items.length === 0 && emptyHint ? <p className="mt-2 text-xs text-muted-foreground">{emptyHint}</p> : null}
    </div>
  );
}
