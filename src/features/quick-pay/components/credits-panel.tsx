"use client";

import { Loader2 } from "lucide-react";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { CREDIT_SOURCE_LABEL, type CreditSource } from "../settings-model";
import type { RecentCredit } from "../types";
import { CycleButton } from "./cycle-button";

const shortDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/**
 * Credit History: the recent credits you can attach to this debit (which ones are shown is a Customized Setting). One credit
 * can be chosen at a time: choosing another replaces it, and choosing the same one again clears it. The switch icon moves to
 * the next credit in the list.
 */
export function CreditsPanel({
  credits,
  loading,
  selected,
  onChoose,
  onCycle,
  source,
  debitAmount,
}: {
  credits: RecentCredit[] | null;
  loading: boolean;
  selected: readonly string[];
  /** Picks this credit, or clears the choice when it is already the chosen one. */
  onChoose: (id: string, on: boolean) => void;
  onCycle: () => void;
  source: CreditSource;
  debitAmount: string;
}) {
  const chosen = (credits ?? []).filter((c) => selected.includes(c.id) && c.type === "CREDIT");
  const addedPaise = chosen.reduce((sum, c) => sum + c.amountPaise, 0);
  const debitPaise = parseAmountInput(debitAmount);
  const canCycle = (credits ?? []).filter((c) => c.type === "CREDIT").length > 1;

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{CREDIT_SOURCE_LABEL[source]}: choose one</p>
        <CycleButton label="Switch to the next credit" onClick={onCycle} disabled={!canCycle} className="size-8" />
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </p>
      ) : credits && credits.length > 0 ? (
        <ul role="radiogroup" aria-label="Credit history" className="max-h-48 divide-y overflow-x-hidden overflow-y-auto rounded-lg border">
          {credits.map((c) => {
            const isCredit = c.type === "CREDIT";
            const on = selected.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!isCredit}
                  onClick={() => onChoose(c.id, !on)}
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none focus-visible:bg-accent", isCredit ? "hover:bg-accent/50" : "opacity-60", on && "bg-amber-50")}
                >
                  <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", on ? "border-neutral-900" : "border-input")}>
                    {on ? <span className="size-2 rounded-full bg-neutral-900" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className={isCredit ? "font-semibold tabular-nums text-green-600" : "font-semibold tabular-nums text-red-600"}>
                      {isCredit ? "+" : "−"}
                      {formatINR(c.amountPaise)}
                    </span>
                    <span className="text-muted-foreground"> {c.reason ? `– ${c.reason}` : ""}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{shortDay.format(new Date(c.occurredAt))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing to show yet. Credits you save will appear here, newest first.</p>
      )}
      {chosen.length > 0 ? (
        <p className="text-sm">
          Credit added: <span className="font-semibold tabular-nums text-green-600">{formatINR(addedPaise)}</span>
          {debitPaise ? (
            <span className="text-muted-foreground">
              {" "}
              · Debit {formatINR(debitPaise)} · Net {formatINR(debitPaise - addedPaise)}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
