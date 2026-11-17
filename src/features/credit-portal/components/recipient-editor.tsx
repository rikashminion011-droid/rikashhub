"use client";

import { useEffect, useRef, useState } from "react";
import type { AddResult } from "@/features/quick-pay/components/inline-add";
import { PeoplePicker } from "@/features/quick-pay/components/people-picker";
import { cn } from "@/lib/utils";

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * Choosing the recipients of a saved line. People are ticked in the list as many as needed and nothing is saved while the
 * list is open; it is saved once, when you press Done (or click away, or press Escape). That way the page does not refresh
 * under your hand between ticks, and the line shows what you picked straight away.
 */
export function RecipientEditor({
  ariaLabel,
  people,
  value,
  onSave,
  onAddPerson,
}: {
  ariaLabel: string;
  people: readonly { id: string; name: string }[];
  /** The recipients as last saved. */
  value: readonly string[];
  /** Saves the new recipients. Should resolve once the save is done. */
  onSave: (ids: string[]) => Promise<void>;
  onAddPerson: (name: string) => Promise<AddResult>;
}) {
  const [ids, setIds] = useState<string[]>([...value]);
  // Read when the list closes: the latest choice, even if the click that closed it came in the same moment as the last tick.
  const latest = useRef<string[]>([...value]);
  const [saving, setSaving] = useState(false);

  // When the saved value changes from outside (after a refresh, or a change in another tab), show it.
  const key = [...value].sort().join(",");
  const [seen, setSeen] = useState(key);
  if (key !== seen) {
    setSeen(key);
    setIds([...value]);
  }
  useEffect(() => {
    latest.current = ids;
  }, [ids]);

  return (
    <div className={cn("min-w-44 transition-opacity", saving && "opacity-60")} aria-busy={saving || undefined}>
      <PeoplePicker
        compact
        bare
        ariaLabel={ariaLabel}
        people={people}
        selected={ids}
        onChange={(next) => {
          latest.current = next;
          setIds(next);
        }}
        onAddPerson={onAddPerson}
        onClose={() => {
          const chosen = latest.current;
          if (sameSet(chosen, value)) return;
          setSaving(true);
          void onSave(chosen).finally(() => setSaving(false));
        }}
      />
    </div>
  );
}
