"use client";

import { PeoplePicker } from "./people-picker";
import type { AddResult } from "./inline-add";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { withPeople, withShareValue, type FormShare, type FormState } from "../entry-state";
import { resolveShares } from "../shares";
import { formatPercent, resolveSplit } from "../split";
import type { QuickPayOptions } from "../types";
import type { QuickPayErrors } from "../validation";

const CUSTOM = "custom";
const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/**
 * Who a transaction is shared with, for a Split or a Debt. Pick any number of people from one dropdown (or add a new one
 * right there); each gets a line: name, percentage (from your list) and the amount, which can also be typed by hand. The
 * amounts update as the transaction amount or the percentages change.
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

  const totals = amountPaise ? resolveShares(amountPaise, form.shares.map(({ partyId, method, value }) => ({ partyId, method, value }))) : null;

  return (
    <div id={`${idPrefix}-field-split`} className="scroll-mt-24 space-y-2 rounded-xl border bg-muted/30 p-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">{kind === "DEBT" ? "Who owes this" : "Split with"}</p>
        <PeoplePicker
          ariaLabel="People"
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
        {errors.split ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.split}
          </p>
        ) : null}
      </div>

      {form.shares.length > 0 ? (
        <ul className="space-y-1.5" aria-label="Shares">
          {form.shares.map((share, index) => (
            <ShareLine
              key={share.partyId}
              // What will really be saved (the last person takes the odd paisa), so the screen and the saved amounts agree.
              savedPaise={totals?.ok ? (totals.shares[index]?.sharePaise ?? null) : null}
              share={share}
              name={nameOf(share.partyId)}
              amountPaise={amountPaise}
              percentOptions={percentOptions}
              onChange={(method, value) => {
                setForm((f) => withShareValue(f, share.partyId, method, value));
                clearError("splitValue");
              }}
            />
          ))}
        </ul>
      ) : null}

      {/* The calculation, shown as you type */}
      <p aria-live="polite" className={cn("text-sm", errors.splitValue || (totals && !totals.ok && form.shares.length > 0) ? "text-destructive" : "text-muted-foreground")}>
        {errors.splitValue ??
          (form.shares.length === 0
            ? "Choose one or more people."
            : !amountPaise
              ? "Enter the amount to see the shares."
              : totals?.ok
                ? kind === "DEBT"
                  ? `They owe ${formatINR(totals.sharedPaise)}${totals.restPaise > 0 ? ` · Your share ${formatINR(totals.restPaise)}` : ""}`
                  : `Shared ${formatINR(totals.sharedPaise)} of ${formatINR(amountPaise)} · Your share ${formatINR(totals.restPaise)}`
                : totals && !totals.ok
                  ? totals.error
                  : "")}
      </p>
    </div>
  );
}

/** One person: name, percentage list and the amount (typed or calculated), all on one line. */
function ShareLine({
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
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
      <span className="truncate text-sm font-medium" title={name}>
        {name}
      </span>
      <select
        aria-label={`${name}: split percentage`}
        value={inList ? String(percent) : CUSTOM}
        onChange={(e) => {
          if (e.target.value !== CUSTOM) onChange("PERCENT", e.target.value);
        }}
        className="h-9 w-[5.5rem] rounded-lg border border-input bg-background px-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
      >
        {percentOptions.map((p) => (
          <option key={p} value={String(p)}>
            {formatPercent(p)}
          </option>
        ))}
        <option value={CUSTOM}>{percent !== null && !inList && Number.isFinite(percent) ? formatPercent(percent) : "Custom"}</option>
      </select>
      <div className="relative w-28">
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
          className="h-9 w-full rounded-lg border border-input bg-background pr-2 pl-6 text-right text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        />
      </div>
    </li>
  );
}
