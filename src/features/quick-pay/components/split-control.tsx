"use client";

import { Plus } from "lucide-react";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { Input } from "@/components/ui/input";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { FormState } from "../entry-state";
import { formatPercent, resolveSplit } from "../split";
import type { QuickPayOptions } from "../types";
import type { QuickPayErrors } from "../validation";

const CUSTOM = "custom";

/**
 * Who a transaction is split with, and their share: a person, a percentage from your list (or one typed by hand), and the
 * calculated amount, which updates as the amount or the percentage changes. With the fixed-amount method you type the
 * share instead and the percentage is worked out.
 */
export function SplitControl({
  form,
  setForm,
  options,
  errors,
  clearError,
  idPrefix,
  addPersonHref,
}: {
  form: FormState;
  setForm: (update: (f: FormState) => FormState) => void;
  options: QuickPayOptions;
  errors: QuickPayErrors;
  clearError: (key: keyof QuickPayErrors) => void;
  idPrefix: string;
  addPersonHref?: string;
}) {
  const { percentOptions } = options.settings.split;
  const persons = options.persons.map((p) => ({ value: p.id, label: p.name }));
  const amountPaise = parseAmountInput(form.amount);
  const resolved = amountPaise && form.partyId ? resolveSplit(amountPaise, { method: form.splitMethod, value: form.splitValue }, parseAmountInput) : null;

  const numeric = Number(form.splitValue);
  const inList = form.splitMethod === "PERCENT" && percentOptions.includes(numeric) && form.splitValue.trim() !== "";
  const customOpen = form.splitMethod === "PERCENT" && !inList;

  return (
    <div id={`${idPrefix}-field-split`} className="scroll-mt-24 space-y-2 rounded-xl border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <SearchableSelect
            ariaLabel="Person"
            options={persons}
            value={form.partyId}
            onChange={(v) => {
              setForm((f) => ({ ...f, partyId: v }));
              clearError("split");
            }}
            placeholder="Choose a person"
            searchPlaceholder="Search people…"
            emptyText="No people yet. Add one in Customized Settings."
            invalid={!!errors.split}
            footer={
              addPersonHref ? (
                <a href={addPersonHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium hover:bg-accent">
                  <Plus className="size-3.5" aria-hidden /> Add a Person
                </a>
              ) : null
            }
          />
          {errors.split ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.split}
            </p>
          ) : null}
        </div>

        {form.splitMethod === "PERCENT" ? (
          <div className="flex items-center gap-2">
            <select
              aria-label="Split percentage"
              value={inList ? String(numeric) : CUSTOM}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, splitValue: v === CUSTOM ? "" : v }));
                clearError("splitValue");
              }}
              className="h-10 w-28 rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
            >
              {percentOptions.map((p) => (
                <option key={p} value={String(p)}>
                  {formatPercent(p)}
                </option>
              ))}
              <option value={CUSTOM}>Custom…</option>
            </select>
            {customOpen ? (
              <div className="relative w-24">
                <Input
                  aria-label="Custom percentage"
                  inputMode="decimal"
                  autoFocus
                  value={form.splitValue}
                  placeholder="e.g. 18"
                  aria-invalid={!!errors.splitValue}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, splitValue: e.target.value }));
                    clearError("splitValue");
                  }}
                  className="h-10 pr-6 text-right text-base tabular-nums sm:text-sm"
                />
                <span aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="relative w-36">
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
              ₹
            </span>
            <Input
              aria-label="Person's share"
              inputMode="decimal"
              value={form.splitValue}
              placeholder="Share"
              aria-invalid={!!errors.splitValue}
              onChange={(e) => {
                setForm((f) => ({ ...f, splitValue: e.target.value }));
                clearError("splitValue");
              }}
              className="h-10 pl-6 text-right text-base tabular-nums sm:text-sm"
            />
          </div>
        )}
      </div>

      {/* The calculation, shown as you type */}
      <p aria-live="polite" className={cn("text-sm", errors.splitValue || (resolved && !resolved.ok) ? "text-destructive" : "text-muted-foreground")}>
        {errors.splitValue ??
          (resolved?.ok
            ? `${options.persons.find((p) => p.id === form.partyId)?.name ?? "Person"}: ${formatPercent(resolved.percent)} of ${formatINR(amountPaise!)} = ${formatINR(resolved.sharePaise)} · Your share ${formatINR(amountPaise! - resolved.sharePaise)}`
            : resolved && !resolved.ok && form.splitValue.trim() !== ""
              ? resolved.error
              : amountPaise
                ? "Choose a person and a share."
                : "Enter the amount to see the share.")}
      </p>
    </div>
  );
}
