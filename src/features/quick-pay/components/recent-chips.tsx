"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useRecentChoices } from "../recent-choices";

/**
 * "Recently used", under a dropdown: the last four options you used, to pick with one tap. Only options that can still be
 * chosen are shown.
 */
export function RecentChips({ field, options, selected, onPick }: { field: string; options: readonly { value: string; label: string }[]; selected: string | null; onPick: (value: string) => void }) {
  const recent = useRecentChoices(field);
  const chips = useMemo(() => {
    const byValue = new Map(options.map((o) => [o.value, o.label]));
    return recent
      .filter((v) => byValue.has(v))
      .slice(0, 4)
      .map((v) => ({ value: v, label: byValue.get(v)! }));
  }, [recent, options]);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Recently used">
      <span className="text-[11px] text-muted-foreground">Recent</span>
      {chips.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onPick(c.value)}
          aria-pressed={selected === c.value}
          className={cn("max-w-40 truncate rounded-full border px-2.5 py-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50", selected === c.value ? "border-primary bg-primary/10 font-medium text-foreground" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground")}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
