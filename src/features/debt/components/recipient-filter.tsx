"use client";

import { Popover } from "@base-ui/react/popover";
import { ChevronsUpDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Which recipients to show. None ticked means everyone. The choice lives in the address (people=…), so it survives a refresh and
 * can be shared; one person alone gives a view of just their data.
 */
export function RecipientFilter({ people, selected }: { people: { id: string; name: string }[]; selected: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function choose(next: string[]) {
    const q = new URLSearchParams(params.toString());
    if (next.length > 0) q.set("people", next.join(","));
    else q.delete("people");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  const names = people.filter((p) => selected.includes(p.id)).map((p) => p.name);
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">Recipients</span>
      <Popover.Root>
        <Popover.Trigger type="button" aria-label="Choose recipients" className="flex h-10 min-w-48 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm">
          <span className="truncate">{names.length === 0 ? "All recipients" : names.join(", ")}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={4} align="start" collisionPadding={8} className="isolate z-[70]">
            <Popover.Popup data-popup="" className="w-64 max-w-[calc(100vw-1rem)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
              <button type="button" onClick={() => choose([])} className="flex min-h-10 w-full items-center rounded-md px-2.5 text-left text-sm font-medium hover:bg-accent sm:min-h-8">
                Show everyone
              </button>
              <ul className="max-h-60 overflow-y-auto">
                {people.map((p) => (
                  <li key={p.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm hover:bg-accent sm:min-h-8">
                      <Checkbox checked={selected.includes(p.id)} onCheckedChange={(on) => choose(on === true ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
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
