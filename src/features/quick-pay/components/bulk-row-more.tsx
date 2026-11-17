"use client";

import { Popover } from "@base-ui/react/popover";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { availablePersons } from "../availability";
import { peopleShares, shareValueOf, type FormShare } from "../entry-state";
import type { QuickPayOptions } from "../types";
import type { BulkRow } from "../bulk-rows";
import type { AddResult } from "./inline-add";
import { PersonChips } from "./person-chips";
import { ShareFields } from "./split-control";

/**
 * The "Explore more" options of one Add Bulk row, in a small pop-up so the row stays a single line: for a Debit, Split and
 * Debt to (ticking one shows the people right there); for a Credit, who credited it. Same choices as Quick Entry.
 */
export function BulkRowMore({
  row,
  index,
  credit,
  amountPaise,
  options,
  invalid,
  onChange,
  onAddPerson,
}: {
  row: BulkRow;
  index: number;
  credit: boolean;
  amountPaise: number | null;
  options: QuickPayOptions;
  invalid: boolean;
  onChange: (changes: Partial<BulkRow>) => void;
  onAddPerson: (name: string) => Promise<AddResult>;
}) {
  const shares = row.shares as FormShare[];
  const kind = row.splitKind ?? (shares.length > 0 ? "SPLIT" : null);
  const chosen = shares.map((s) => s.partyId);
  const used = credit ? Boolean(row.creditedById) : kind !== null;
  const nameOf = (id: string) => options.persons.find((p) => p.id === id)?.name ?? "Person";

  const setKind = (next: "SPLIT" | "DEBT", on: boolean) => onChange({ splitKind: on ? next : null, shares: on ? row.shares : [] });

  const sharesFor = (k: "SPLIT" | "DEBT") => {
    const people = availablePersons(options, k, chosen);
    return (
      <div className="space-y-2 pb-2 pl-7">
        <PersonChips
          ariaLabel={k === "DEBT" ? "Who owes this" : "Split with"}
          people={people}
          selected={chosen}
          single={k === "DEBT"}
          invalid={invalid}
          onChange={(ids) => onChange({ shares: peopleShares(shares, ids, k, options.settings), splitKind: k })}
          onAddPerson={onAddPerson}
        />
        {shares.length > 0 ? (
          <ul className="space-y-1.5" aria-label={`Row ${index + 1} shares`}>
            {shares.map((share) => (
              <li key={share.partyId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={nameOf(share.partyId)}>
                  {nameOf(share.partyId)}
                </span>
                <ShareFields
                  compact
                  share={share}
                  name={nameOf(share.partyId)}
                  amountPaise={amountPaise}
                  savedPaise={null}
                  percentOptions={options.settings.split.percentOptions}
                  showPercent={options.settings.split.showPercent}
                  showAmount={options.settings.split.showAmount}
                  onChange={(method, value) => onChange({ shares: shareValueOf(shares, share.partyId, method, value) })}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        data-grid-control=""
        aria-label={`Row ${index + 1}: more options`}
        aria-invalid={invalid || undefined}
        className={cn(
          "relative flex h-8 w-full items-center justify-between gap-1 rounded-lg border border-transparent px-2 text-sm font-medium text-primary transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
          used && "bg-primary/5",
        )}
      >
        More
        <ChevronDown className="size-3.5" aria-hidden />
        {used ? <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" /> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={8} className="isolate z-[70]">
          <Popover.Popup data-popup="" className="w-[min(26rem,calc(100vw-1rem))] space-y-1 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl outline-none">
            <p className="pb-1 text-xs font-semibold text-muted-foreground">Row {index + 1}: explore more</p>
            {credit ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Credited By</p>
                <PersonChips
                  ariaLabel="Credited by"
                  single
                  noneLabel="Others"
                  people={options.persons}
                  selected={row.creditedById ? [row.creditedById] : []}
                  onChange={(ids) => onChange({ creditedById: ids[0] ?? null })}
                  onAddPerson={onAddPerson}
                />
              </div>
            ) : (
              <>
                <label className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-semibold", kind === "DEBT" && "cursor-not-allowed opacity-50")}>
                  <Checkbox checked={kind === "SPLIT"} disabled={kind === "DEBT"} aria-label="Split" onCheckedChange={(on) => setKind("SPLIT", on === true)} />
                  {options.settings.fields.labels.split}
                </label>
                {kind === "SPLIT" ? sharesFor("SPLIT") : null}
                <label className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-semibold", kind === "SPLIT" && "cursor-not-allowed opacity-50")}>
                  <Checkbox checked={kind === "DEBT"} disabled={kind === "SPLIT"} aria-label="Debt to" onCheckedChange={(on) => setKind("DEBT", on === true)} />
                  Debt to
                </label>
                {kind === "DEBT" ? sharesFor("DEBT") : null}
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
