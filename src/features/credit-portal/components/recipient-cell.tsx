"use client";

import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { recipientSummary } from "../model";

/**
 * The people a transaction is for: the first one, then "+3 More" when there are more. Pressing More shows everyone. When a
 * `linkTo` is given, each name opens that person's page.
 */
export function RecipientCell({ names, linkTo }: { names: { id: string; name: string }[]; linkTo?: (id: string) => string }) {
  if (names.length === 0) return <span className="text-muted-foreground">—</span>;
  const { more } = recipientSummary(names.map((n) => n.name));
  const one = (n: { id: string; name: string }) =>
    linkTo ? (
      <Link href={linkTo(n.id)} className="font-medium underline-offset-4 hover:underline">
        {n.name}
      </Link>
    ) : (
      <span className="font-medium">{n.name}</span>
    );

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {one(names[0]!)}
      {more > 0 ? (
        <Popover.Root>
          <Popover.Trigger type="button" aria-label={`Show all ${names.length} people`} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">
            +{more} More
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={4} align="start" className="isolate z-[60]">
              <Popover.Popup data-popup="" className="w-56 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg outline-none">
                <p className="px-1.5 pb-1 text-xs font-semibold text-muted-foreground">Everyone ({names.length})</p>
                <ul className="space-y-0.5">
                  {names.map((n) => (
                    <li key={n.id} className="rounded-md px-1.5 py-1 text-sm hover:bg-accent">
                      {linkTo ? (
                        <Link href={linkTo(n.id)} className="block">
                          {n.name}
                        </Link>
                      ) : (
                        n.name
                      )}
                    </li>
                  ))}
                </ul>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </span>
  );
}
