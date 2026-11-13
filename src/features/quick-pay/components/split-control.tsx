"use client";

import { CycleButton } from "./cycle-button";
import { PeoplePicker } from "./people-picker";
import type { AddResult } from "./inline-add";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { withPeople, withShareValue, type FormShare, type FormState } from "../entry-state";
import { cycleId } from "../entry-state";
import { resolveShares } from "../shares";
import { formatPercent, resolveSplit } from "../split";
import type { QuickPayOptions } from "../types";
import type { QuickPayErrors } from "../validation";

const CUSTOM = "custom";
const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/**
 * Who a transaction is shared with, for a Split or a Debt, kept to one line: the people dropdown, then (for one person) their
 * percentage and amount, then the switch icon. With several people each one gets a line of their own underneath. Amounts
 * update as the transaction amount or the percentages change, and can be typed by hand.
 */
export function SplitControl({
  form,
  setForm,
  options,
  errors,
  clearError,
  idPrefix,
  onAddPerson,
}: {
  form: FormState;
  setForm: (update: (f: FormState) => FormState) => void;
  options: QuickPayOptions;
  errors: QuickPayErrors;
  clearError: (key: keyof QuickPayErrors) => void;
  idPrefix: string;
  onAddPerson: (name: string) => Promise<AddResult>;
}) {
  const { percentOptions } = options.settings.split;
  const kind = form.splitKind ?? "SPLIT";
  const amountPaise = parseAmountInput(form.amount);
  const nameOf = (id: string) => options.persons.find((p) => p.id === id)?.name ?? "Person";
  const several = form.shares.length > 1;

  const totals = amountPaise ? resolveShares(amountPaise, form.shares.map(({ partyId, method, value }) => ({ partyId, method, value }))) : null;
  const edit = (share: FormShare) => (method: "PERCENT" | "FIXED", value: string) => {
    setForm((f) => withShareValue(f, share.partyId, method, value));
    clearError("splitValue");
  };

  const picker = (
    <PeoplePicker
      ariaLabel={kind === "DEBT" ? "Who owes this" : "Split with"}
      people={options.persons}
      selected={form.shares.map((s) => s.partyId)}
      invalid={!!errors.split}
      onChange={(ids) => {
        setForm((f) => withPeople(f, ids, options.settings.split));
        clearError("split");
        clearError("splitValue");
      }}
      onAddPerson={onAddPerson}
    />
  );
  const cycle = (
    <CycleButton
      label={several ? "Switch person (works with one person)" : "Switch to the next person"}
      disabled={several || options.persons.length < 2}
      onClick={() => {
        const next = cycleId(options.persons.map((p) => p.id), form.shares[0]?.partyId ?? null);
        if (next) setForm((f) => withPeople(f, [next], options.settings.split));
        clearError("split");
      }}
    />
  );

  return (
    <div id={`${idPrefix}-field-split`} className="scroll-mt-24 space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{picker}</div>
        {form.shares.length === 1 ? (
          <ShareFields
            share={form.shares[0]!}
            name={nameOf(form.shares[0]!.partyId)}
            amountPaise={amountPaise}
            savedPaise={totals?.ok ? (totals.shares[0]?.sharePaise ?? null) : null}
            percentOptions={percentOptions}
            onChange={edit(form.shares[0]!)}
          />
        ) : null}
        {cycle}
      </div>

      {several ? (
        <ul className="space-y-1.5" aria-label="Shares">
          {form.shares.map((share, index) => (
            <li key={share.partyId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={nameOf(share.partyId)}>
                {nameOf(share.partyId)}
              </span>
              <ShareFields
                share={share}
                name={nameOf(share.partyId)}
                amountPaise={amountPaise}
                // What will really be saved (the last person takes the odd paisa), so the screen and the saved amounts agree.
                savedPaise={totals?.ok ? (totals.shares[index]?.sharePaise ?? null) : null}
                percentOptions={percentOptions}
                onChange={edit(share)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/* Only said when there is something to say: a mistake, or the total across several people */}
      {errors.split || errors.splitValue || (totals && !totals.ok && form.shares.length > 0) ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.split ?? errors.splitValue ?? (totals && !totals.ok ? totals.error : "")}
        </p>
      ) : several && totals?.ok ? (
        <p aria-live="polite" className={cn("text-sm text-muted-foreground")}>
          {kind === "DEBT"
            ? `They owe ${formatINR(totals.sharedPaise)}${totals.restPaise > 0 ? ` · Your share ${formatINR(totals.restPaise)}` : ""}`
            : `Shared ${formatINR(totals.sharedPaise)} of ${formatINR(amountPaise!)} · Your share ${formatINR(totals.restPaise)}`}
        </p>
      ) : null}
    </div>
  );
}

/** A person's percentage list and amount (typed or calculated). */
function ShareFields({
  share,
  name,
  amountPaise,
  percentOptions,
  savedPaise,
  onChange,
}: {
  savedPaise: number | null;
  share: FormShare;
  name: string;
  amountPaise: number | null;
  percentOptions: readonly number[];
  onChange: (method: "PERCENT" | "FIXED", value: string) => void;
}) {
  const resolved = amountPaise ? resolveSplit(amountPaise, { method: share.method, value: share.value }, parseAmountInput) : null;
  const percent = share.method === "PERCENT" ? Number(share.value) : resolved?.ok ? resolved.percent : null;
  const inList = percent !== null && percentOptions.includes(percent);
  const shown = share.method === "FIXED" ? share.value : savedPaise !== null ? rupees(savedPaise) : resolved?.ok ? rupees(resolved.sharePaise) : "";

  return (
    <>
      <select
        aria-label={`${name}: split percentage`}
        value={inList ? String(percent) : CUSTOM}
        onChange={(e) => {
          if (e.target.value !== CUSTOM) onChange("PERCENT", e.target.value);
        }}
        className="h-10 w-[5.25rem] shrink-0 rounded-lg border border-input bg-background px-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
      >
        {percentOptions.map((p) => (
          <option key={p} value={String(p)}>
            {formatPercent(p)}
          </option>
        ))}
        <option value={CUSTOM}>{percent !== null && !inList && Number.isFinite(percent) ? formatPercent(percent) : "Custom"}</option>
      </select>
      <div className="relative w-24 shrink-0">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
          ₹
        </span>
        <input
          aria-label={`${name}: amount`}
          inputMode="decimal"
          autoComplete="off"
          value={shown}
          placeholder="0"
          onChange={(e) => onChange("FIXED", e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-background pr-2 pl-6 text-right text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        />
      </div>
    </>
  );
}
