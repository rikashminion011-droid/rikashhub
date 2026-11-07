"use client";

import { Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { equalSplit, formatINR, parseAmountInput, summarizeSplit } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { NamedOption } from "../types";
import type { ExpenseFormInput, SplitMode } from "../validation";

type SplitState = ExpenseFormInput["split"];

/**
 * The "split between people" area: every user with a checkbox, an amount for each ticked person,
 * Equal / Manual modes, and a live "remaining" line that must reach zero before saving.
 */
export function SplitSection({
  parties,
  totalPaise,
  state,
  onChange,
  onAddUser,
  error,
}: {
  parties: readonly NamedOption[];
  /** The expense amount in paise, or null while the amount box is empty or invalid. */
  totalPaise: number | null;
  state: SplitState;
  onChange: (next: SplitState) => void;
  onAddUser: () => void;
  error?: string;
}) {
  const selectedIds = state.selected.map((s) => s.partyId);
  const shares = totalPaise !== null && selectedIds.length > 0 ? equalSplit(totalPaise, selectedIds.length) : [];

  /** Amount shown for a ticked person: the computed share (equal) or what was typed (manual). */
  function amountFor(partyId: string): string {
    const index = selectedIds.indexOf(partyId);
    if (index < 0) return "";
    if (state.mode === "EQUAL") return shares[index] !== undefined ? (shares[index] / 100).toFixed(2) : "";
    return state.selected[index]!.amount;
  }

  function toggle(partyId: string, checked: boolean) {
    if (checked) {
      if (selectedIds.includes(partyId)) return;
      onChange({ ...state, selected: [...state.selected, { partyId, amount: "" }] });
    } else {
      onChange({ ...state, selected: state.selected.filter((s) => s.partyId !== partyId) });
    }
  }

  function setAmount(partyId: string, amount: string) {
    onChange({ ...state, selected: state.selected.map((s) => (s.partyId === partyId ? { ...s, amount } : s)) });
  }

  function setMode(mode: SplitMode) {
    if (mode === state.mode) return;
    // Switching to manual starts from the current equal shares, so only small tweaks are needed.
    const selected =
      mode === "MANUAL"
        ? state.selected.map((s, i) => ({ ...s, amount: shares[i] !== undefined ? (shares[i] / 100).toFixed(2) : s.amount }))
        : state.selected;
    onChange({ ...state, mode, selected });
  }

  const amounts = state.selected.map((s, i) => (state.mode === "EQUAL" ? (shares[i] ?? 0) : (parseAmountInput(s.amount) ?? 0)));
  const summary = totalPaise !== null ? summarizeSplit(totalPaise, amounts) : null;

  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
      <div role="radiogroup" aria-label="Split method" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["EQUAL", "Equal split"],
            ["MANUAL", "Manual split"],
          ] as const
        ).map(([mode, text]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={state.mode === mode}
            onClick={() => setMode(mode)}
            className={cn(
              "h-8 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              state.mode === mode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {text}
          </button>
        ))}
      </div>

      <ul className="space-y-2" aria-label="People to split between">
        {parties.map((party) => {
          const checked = selectedIds.includes(party.id);
          return (
            <li key={party.id} className="flex items-center gap-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
                <Checkbox checked={checked} onCheckedChange={(next) => toggle(party.id, next === true)} />
                <span className="truncate">{party.name}</span>
              </label>
              {checked ? (
                <div className="relative w-32 shrink-0">
                  <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    inputMode="decimal"
                    aria-label={`Amount for ${party.name}`}
                    value={amountFor(party.id)}
                    readOnly={state.mode === "EQUAL"}
                    onChange={(e) => setAmount(party.id, e.target.value)}
                    className={cn("h-9 pl-7 text-right tabular-nums", state.mode === "EQUAL" && "bg-muted text-muted-foreground")}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onAddUser}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors outline-none hover:border-foreground/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-3.5" aria-hidden />
        Add user
      </button>

      <div aria-live="polite" className="grid grid-cols-3 gap-2 rounded-lg border bg-background p-3 text-center text-xs">
        <Figure label="Expense" value={summary ? formatINR(summary.totalPaise) : "₹0.00"} />
        <Figure label="Allocated" value={summary ? formatINR(summary.allocatedPaise) : "₹0.00"} />
        <Figure
          label="Remaining"
          value={summary ? formatINR(summary.remainingPaise) : "₹0.00"}
          tone={!summary || state.selected.length === 0 ? "muted" : summary.isBalanced ? "good" : "bad"}
        />
      </div>

      {error ? (
        <p id="split-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Figure({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "good" | "bad" }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
