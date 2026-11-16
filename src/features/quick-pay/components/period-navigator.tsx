"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRESETS, canStep, periodFor, periodLabel, periodRange, stepPeriod, type Period, type PresetKind } from "../period";

/**
 * "‹ Today ›": the arrows step back and forward (Yesterday, Day before yesterday, then dates), and the middle button opens
 * a list: Today, This week, This month, This year and Custom, where one date or a From and To range can be chosen.
 */
export function PeriodNavigator({ value, onChange, today, className }: { value: Period; onChange: (next: Period) => void; today: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const range = periodRange(value);
  // The custom editor stays open while Custom is the choice and the list is open.
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);

  function choose(kind: PresetKind) {
    if (kind === "custom") {
      setCustomFrom(range.from);
      setCustomTo(range.to);
      onChange({ kind: "custom", from: range.from, to: range.to });
      return; // stays open so the dates can be picked
    }
    onChange(periodFor(kind, today));
    setOpen(false);
  }

  function setDates(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= today && to <= today) onChange({ kind: "custom", from, to });
  }

  const arrow = "flex size-9 items-center sm:size-8 justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <button type="button" aria-label="Earlier" className={arrow} disabled={!canStep(value, -1, today)} onClick={() => onChange(stepPeriod(value, -1))}>
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          type="button"
          aria-haspopup="listbox"
          className="flex h-9 min-w-28 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8"
        >
          <span className="truncate">{periodLabel(value, today)}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          {/* A positioner keeps the list inside the screen, so it is never cut off on a narrow phone. */}
          <Popover.Positioner sideOffset={4} align="center" collisionPadding={8} className="isolate z-[70]">
            <Popover.Popup data-popup="" className="w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
              <ul role="listbox" aria-label="Period">
                {PRESETS.map((p) => {
                  const selected = p.kind === "custom" ? value.kind === "custom" : value.kind === p.kind && periodLabel(value, today) === periodLabel(periodFor(p.kind, today), today);
                  return (
                    <li key={p.kind} role="option" aria-selected={selected}>
                      <button type="button" onClick={() => choose(p.kind)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground sm:min-h-9">
                        {p.label}
                        {selected ? <Check className="size-3.5" aria-hidden /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {value.kind === "custom" ? (
                <div className="mt-1 grid grid-cols-2 gap-2 border-t p-2">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    From
                    <input type="date" value={customFrom} max={today} onChange={(e) => setDates(e.target.value, customFrom === customTo || customTo < e.target.value ? e.target.value : customTo)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm" />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    To
                    <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setDates(customFrom, e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm" />
                  </label>
                  <p className="col-span-2 text-xs text-muted-foreground">Pick one date, or From and To.</p>
                </div>
              ) : null}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <button type="button" aria-label="Later" className={arrow} disabled={!canStep(value, 1, today)} onClick={() => onChange(stepPeriod(value, 1))}>
        <ChevronRight className="size-4" aria-hidden />
      </button>

    </div>
  );
}
