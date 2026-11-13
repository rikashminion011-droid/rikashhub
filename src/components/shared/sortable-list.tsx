"use client";

import { GripVertical, X } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

export interface SortableItem {
  id: string;
  label: string;
}

/**
 * A short list you can put in order: drag the grip (mouse or finger), or focus it and press the Up and Down arrows. Each row
 * can also be removed. Used to set the exact order a switch icon moves through.
 */
export function SortableList({ items, onChange, onRemove, emptyText }: { items: readonly SortableItem[]; onChange: (ids: string[]) => void; onRemove?: (id: string) => void; emptyText?: string }) {
  const list = useRef<HTMLUListElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const focusAfter = useRef<string | null>(null);

  const move = (id: string, to: number) => {
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || to === from) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    onChange(ids);
  };

  function onDown(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone; the drag still works without capture.
    }
    setDragging(id);
  }

  function onMove(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (dragging !== id || !list.current) return;
    const rows = [...list.current.querySelectorAll<HTMLElement>("[data-sortable-row]")];
    // The row the pointer is over is where this one belongs.
    const at = rows.findIndex((row) => {
      const r = row.getBoundingClientRect();
      return event.clientY >= r.top && event.clientY <= r.bottom;
    });
    if (at >= 0) move(id, at);
  }

  return items.length === 0 ? (
    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{emptyText ?? "Nothing here yet."}</p>
  ) : (
    <ul ref={list} className="space-y-1.5">
      {items.map((item, index) => (
        <li key={item.id} data-sortable-row className={cn("flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5", dragging === item.id && "border-neutral-950 shadow-sm")}>
          <button
            type="button"
            aria-label={`Move ${item.label}. Drag, or use the Up and Down arrows.`}
            ref={(el) => {
              if (el && focusAfter.current === item.id) {
                el.focus();
                focusAfter.current = null;
              }
            }}
            onPointerDown={(e) => onDown(e, item.id)}
            onPointerMove={(e) => onMove(e, item.id)}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                focusAfter.current = item.id;
                move(item.id, index + (e.key === "ArrowUp" ? -1 : 1));
              }
            }}
            className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md border text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
          <span className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
          {onRemove ? (
            <button type="button" aria-label={`Remove ${item.label}`} onClick={() => onRemove(item.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
