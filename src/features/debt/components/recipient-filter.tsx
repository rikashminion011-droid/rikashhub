"use client";

import { Popover } from "@base-ui/react/popover";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import type { setDebtRecipientsAction } from "@/features/monthly-due/actions";

/**
 * Which recipients Debt Management shows. Select all ticks everyone; none ticked also means everyone. The choice is saved the
 * moment it changes: it is what this page opens on next time, and the only recipients counted in Monthly Due.
 */
export function RecipientFilter({ people, selected, save }: { people: { id: string; name: string }[]; selected: string[]; save: typeof setDebtRecipientsAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string[]>(selected);

  function choose(next: string[]) {
    setChosen(next);
    startTransition(async () => {
      const r = await save({ partyIds: next });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  const everyone = people.length > 0 && people.every((p) => chosen.includes(p.id));
  const names = people.filter((p) => chosen.includes(p.id)).map((p) => p.name);
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">Recipients</span>
      <Popover.Root>
        <Popover.Trigger type="button" aria-label="Choose recipients" className="flex h-10 min-w-48 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm">
          <span className="truncate">{names.length === 0 ? "All recipients" : everyone ? "All recipients" : names.join(", ")}</span>
          <ChevronsUpDown className={pending ? "size-3.5 shrink-0 animate-pulse text-muted-foreground" : "size-3.5 shrink-0 text-muted-foreground"} aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={4} align="start" collisionPadding={8} className="isolate z-[70]">
            <Popover.Popup data-popup="" className="flex max-h-[min(var(--available-height),24rem)] w-64 max-w-[calc(100vw-1rem)] flex-col rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
              <label className="flex min-h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm font-semibold hover:bg-accent sm:min-h-8">
                <Checkbox checked={everyone} onCheckedChange={(on) => choose(on === true ? people.map((p) => p.id) : [])} aria-label="Select all" />
                Select all
              </label>
              <ul className="min-h-0 flex-1 overflow-y-auto border-t pt-1">
                {people.map((p) => (
                  <li key={p.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm hover:bg-accent sm:min-h-8">
                      <Checkbox checked={chosen.includes(p.id)} onCheckedChange={(on) => choose(on === true ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
