"use client";

import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { CREDIT_SOURCE_LABEL, type CreditSource } from "../settings-model";
import type { RecentCredit } from "../types";

const shortDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/**
 * Credits Added: the recent transactions you can add to this debit (which ones are shown is a Customized Setting).
 * Tick any number; the ticked credits are saved with the debit and counted in "Credits added".
 */
export function CreditsPanel({
  credits,
  loading,
  selected,
  onToggle,
  source,
  debitAmount,
}: {
  credits: RecentCredit[] | null;
  loading: boolean;
  selected: readonly string[];
  onToggle: (id: string, on: boolean) => void;
  source: CreditSource;
  debitAmount: string;
}) {
  const chosen = (credits ?? []).filter((c) => selected.includes(c.id) && c.type === "CREDIT");
  const addedPaise = chosen.reduce((sum, c) => sum + c.amountPaise, 0);
  const debitPaise = parseAmountInput(debitAmount);

  return (
    <div className="rounded-xl border bg-muted/30 p-3" aria-live="polite">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{CREDIT_SOURCE_LABEL[source]}: tick the credits to add to this debit</p>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </p>
      ) : credits && credits.length > 0 ? (
        <ul className="max-h-48 divide-y overflow-x-hidden overflow-y-auto">
          {credits.map((c) => {
            const isCredit = c.type === "CREDIT";
            return (
              <li key={c.id} className="py-1.5 first:pt-0 last:pb-0">
                <label className={isCredit ? "flex cursor-pointer items-center gap-3 text-sm" : "flex items-center gap-3 text-sm opacity-60"}>
                  <Checkbox checked={selected.includes(c.id)} disabled={!isCredit} onCheckedChange={(next) => onToggle(c.id, next === true)} aria-label={`Add ${formatINR(c.amountPaise)}`} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className={isCredit ? "font-semibold tabular-nums text-green-600" : "font-semibold tabular-nums text-red-600"}>
                      {isCredit ? "+" : "−"}
                      {formatINR(c.amountPaise)}
                    </span>
                    <span className="text-muted-foreground"> {c.reason ? `– ${c.reason}` : ""}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{shortDay.format(new Date(c.occurredAt))}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing to show yet. Credits you save will appear here, newest first.</p>
      )}
      {chosen.length > 0 ? (
        <p className="mt-2 border-t pt-2 text-sm">
          Credits added: <span className="font-semibold tabular-nums text-green-600">{formatINR(addedPaise)}</span>
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
