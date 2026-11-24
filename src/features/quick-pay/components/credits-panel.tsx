"use client";

import { Loader2, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { getCreditPreferencesAction, setAllocationModeAction } from "@/features/credit-history/actions";
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
  canCycle: cycleEnabled = true,
  source,
  debitAmount,
  onTurnOff,
}: {
  /** Closes Credit History and detaches any chosen credit. */
  onTurnOff?: () => void;
  credits: RecentCredit[] | null;
  loading: boolean;
  selected: readonly string[];
  /** Picks this credit, or clears the choice when it is already the chosen one. */
  onChoose: (id: string, on: boolean) => void;
  onCycle: () => void;
  /** False when the switch icon is turned off in Customized Settings. */
  canCycle?: boolean;
  source: CreditSource;
  debitAmount: string;
}) {
  const chosen = (credits ?? []).filter((c) => selected.includes(c.id) && c.type === "CREDIT");
  const addedPaise = chosen.reduce((sum, c) => sum + c.amountPaise, 0);
  const debitPaise = parseAmountInput(debitAmount);
  const canCycle = (credits ?? []).filter((c) => c.type === "CREDIT").length > 1;

  // The two allocation modes are kept for next time: new debits go to the default credit source, or to the latest credit.
  const [mode, setMode] = useState<"DEFAULT" | "RECENT" | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getCreditPreferencesAction().then((r) => !cancelled && r.ok && setMode(r.mode));
    return () => {
      cancelled = true;
    };
  }, []);
  async function chooseMode(next: "DEFAULT" | "RECENT") {
    setMode(next);
    const r = await setAllocationModeAction({ mode: next });
    if (!r.ok) return;
    // Switching the mode picks that source for this debit too (you can still choose any other below).
    const target = (credits ?? []).find((c) => c.type === "CREDIT" && (next === "DEFAULT" ? c.isDefault : c.isLatest));
    if (target) onChoose(target.id, true);
  }

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{CREDIT_SOURCE_LABEL[source]}: choose one</p>
        {cycleEnabled ? <CycleButton label="Switch to the next credit" onClick={onCycle} disabled={!canCycle} className="size-8" /> : null}
      </div>
      <div role="radiogroup" aria-label="How credits are allocated" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5 text-xs font-medium">
        {(
          [
            ["DEFAULT", "Default Credit Source"],
            ["RECENT", "Recent Credit Transaction"],
          ] as const
        ).map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => void chooseMode(value)} className={cn("rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
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
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none focus-visible:bg-accent", isCredit ? "hover:bg-accent/50" : "opacity-60", on && "bg-accent")}
                >
                  <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", on ? "border-primary" : "border-input")}>
                    {on ? <span className="size-2 rounded-full bg-primary" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className={isCredit ? "font-semibold tabular-nums text-green-600" : "font-semibold tabular-nums text-red-600"}>
                      {isCredit ? "+" : "−"}
                      {formatINR(c.amountPaise)}
                    </span>
                    <span className="text-muted-foreground"> {c.reason ? `– ${c.reason}` : ""}</span>
                    {isCredit && c.remainingPaise !== undefined ? (
                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                        Balance <span className={cn("font-semibold", c.remainingPaise < 0 ? "text-destructive" : "text-foreground")}>{c.remainingPaise < 0 ? "−" : ""}{formatINR(Math.abs(c.remainingPaise))}</span>
                        {c.isDefault ? <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-primary"><Star className="size-2.5" aria-hidden /> Default</span> : null}
                        {c.isLatest ? <span className="ml-1.5 rounded bg-muted px-1 text-foreground">Latest</span> : null}
                      </span>
                    ) : null}
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
      {onTurnOff ? (
        <button type="button" onClick={onTurnOff} className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Don&apos;t attach a credit (no automatic allocation)
        </button>
      ) : null}
    </div>
  );
}
