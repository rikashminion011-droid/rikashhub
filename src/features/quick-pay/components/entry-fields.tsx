"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useMemo } from "react";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { groupBanks, groupCategories } from "../cascade";
import { categoriesFor, keywordsFor, visibleBanks } from "../availability";
import { withCategory, withKind, withReason, type FormState } from "../entry-state";
import { nextSwitch } from "../switching";
import type { QuickPayOptions, RecentCredit } from "../types";
import { MAX_REASON_LENGTH, type EntryType, type QuickPayErrors } from "../validation";
import { CreditsPanel } from "./credits-panel";
import { CycleButton } from "./cycle-button";
import { InlineAdd, type AddResult } from "./inline-add";
import { SplitControl } from "./split-control";
import { SelfTransferItem } from "./transfer-dialog";

const SETTINGS = {
  banks: "/quick-pay/settings?tab=banks",
};

/** A link at the bottom of a dropdown that opens the right settings section in a new tab (so nothing typed is lost). */
function AddLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
      <Plus className="size-3.5" aria-hidden />
      {children}
    </a>
  );
}

const labelClass = "text-xs font-semibold text-muted-foreground";

/** Older saved settings still call it "Credits Added"; it is now Credit History. */
const creditLabel = (label: string) => (label === "Credits Added" ? "Credit History" : label);

/**
 * The fields of an entry, laid out compactly so they fit a phone without scrolling:
 *   Amount · Debit · Credit             (one line)
 *   Reason · Category                   (one line)
 *   Bank Through (with its switch icon)
 *   Split · Debt · Credit History       (one line)
 * then the Split and Credit History sections when ticked. No boxes: the form is plain fields on the page.
 * Used by Quick Entry and by the edit pop-up.
 */
export function EntryFields({
  form,
  setForm,
  errors,
  clearError,
  options,
  idPrefix,
  credits,
  loadingCredits,
  onToggleCredits,
  onAddCategory,
  onAddPerson,
  onSelfTransfer,
}: {
  form: FormState;
  setForm: (update: (f: FormState) => FormState) => void;
  errors: QuickPayErrors;
  clearError: (key: keyof QuickPayErrors) => void;
  options: QuickPayOptions;
  idPrefix: string;
  credits: RecentCredit[] | null;
  loadingCredits: boolean;
  onToggleCredits: (on: boolean) => void;
  /** Adds a category right here (no trip to Customized Settings). Resolves with the new id. */
  onAddCategory: (name: string, type: EntryType) => Promise<AddResult>;
  /** Adds a person right here. Resolves with the new id. */
  onAddPerson: (name: string) => Promise<AddResult>;
  /** When given, the Bank Through list ends with a Self Transfer item that calls this (it opens the transfer pop-up). */
  onSelfTransfer?: () => void;
}) {
  const labels = options.settings.fields.labels;
  // Banks switched off in Customized Settings are not offered (the one already on the entry still is).
  const banks = useMemo(() => visibleBanks(options, [form.accountId]), [options, form.accountId]);
  const bankGroups = useMemo(() => groupBanks(banks), [banks]);
  const switches = options.settings.switch;
  // A Debit and a Credit have different categories.
  const categoryList = categoriesFor(options, form.type);
  const categoryGroups = useMemo(() => groupCategories(categoryList), [categoryList]);
  const showCredits = form.type === "DEBIT" && form.creditsAdded;
  const isDebit = form.type === "DEBIT";
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="space-y-3">
      {/* Amount, Debit and Credit on one line */}
      <div id={id("field-amount")} className="scroll-mt-24 space-y-1">
        <label htmlFor={id("amount")} className={labelClass}>
          {labels.amount}
        </label>
        <div className="flex items-stretch gap-2">
          <div
            className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-amber-300 bg-amber-50/60 focus-within:ring-3 focus-within:ring-amber-300/40 aria-[invalid=true]:border-destructive"
            aria-invalid={!!errors.amount}
          >
            <span aria-hidden className="flex w-9 items-center justify-center bg-amber-100/60 text-base">
              ₹
            </span>
            <Input
              id={id("amount")}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={form.amount}
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? id("error-amount") : undefined}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => ({ ...f, amount: value }));
                clearError("amount");
              }}
              className="h-10 min-w-0 rounded-none border-0 bg-transparent px-2 text-lg font-semibold tabular-nums shadow-none focus-visible:ring-0"
            />
          </div>
          <div role="radiogroup" aria-label="Transaction type" className="flex shrink-0 gap-1.5">
            {(["DEBIT", "CREDIT"] as const).map((t) => {
              const on = form.type === t;
              const debit = t === "DEBIT";
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      type: t,
                      // The category lists differ, so the choice is cleared; a Credit has no Debt and no Credits Added.
                      ...(f.type !== t ? { categoryId: null, categoryAuto: false, categoryManual: false } : {}),
                      ...(t === "CREDIT" ? { creditsAdded: false, creditIds: [], ...(f.splitKind === "DEBT" ? { splitKind: null, shares: [] } : {}) } : {}),
                    }))
                  }
                  className={cn(
                    "flex h-10 items-center justify-center gap-1 rounded-xl border px-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-3.5",
                    on
                      ? debit
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-green-300 bg-green-50 text-green-700"
                      : debit
                        ? "border-transparent bg-red-50/40 text-red-700/60 hover:bg-red-50"
                        : "border-transparent bg-green-50/40 text-green-700/60 hover:bg-green-50",
                  )}
                >
                  {debit ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />}
                  {debit ? "Debit" : "Credit"}
                </button>
              );
            })}
          </div>
        </div>
        {errors.amount ? (
          <p id={id("error-amount")} role="alert" className="text-xs text-destructive">
            {errors.amount}
          </p>
        ) : null}
      </div>

      {/* Reason and Category on one line (each kind has its own categories) */}
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 space-y-1">
          <label htmlFor={id("reason")} className={labelClass}>
            {labels.reason}
          </label>
          <Input
            id={id("reason")}
            autoComplete="off"
            placeholder="What was it for?"
            maxLength={MAX_REASON_LENGTH}
            value={form.reason}
            onChange={(e) => {
              const value = e.target.value;
              setForm((f) => withReason(f, value, keywordsFor(options, f.type)));
            }}
            className="h-10 text-base sm:text-sm"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor={id("category")} className={labelClass}>
            {labels.category}
            {form.categoryAuto ? <span className="ml-1 font-normal text-amber-600">· auto</span> : null}
          </label>
          <CascadingSelect
            id={id("category")}
            ariaLabel={labels.category}
            groups={categoryGroups}
            value={form.categoryId}
            onChange={(v) => setForm((f) => withCategory(f, v))}
            placeholder="Optional"
            searchPlaceholder="Search categories…"
            emptyText="No category found. Add one below."
            clearable
            footer={
              <InlineAdd
                label="New category"
                placeholder="Add a category…"
                onAdd={async (name) => {
                  const result = await onAddCategory(name, form.type);
                  if (result.ok) setForm((f) => withCategory(f, result.id));
                  return result;
                }}
              />
            }
          />
        </div>

      </div>

      {/* Bank Through on its own line */}
      <div id={id("field-bank")} className="scroll-mt-24 space-y-1">
        <label htmlFor={id("bank")} className={labelClass}>
          {labels.bank}
        </label>
        <div className="flex items-center gap-2">
          <CascadingSelect
            id={id("bank")}
            ariaLabel={labels.bank}
            groups={bankGroups}
            value={form.accountId}
            onChange={(v) => {
              setForm((f) => ({ ...f, accountId: v }));
              clearError("bank");
            }}
            placeholder="Choose a bank"
            searchPlaceholder="Search banks…"
            emptyText="No bank found. Use Add Details to create one."
            invalid={!!errors.bank}
            footer={
              <>
                {onSelfTransfer ? <SelfTransferItem onOpen={onSelfTransfer} /> : null}
                <AddLink href={SETTINGS.banks}>Add Details</AddLink>
              </>
            }
            className="min-w-0 flex-1"
          />
          {switches.bank.enabled ? (
            <CycleButton
              label="Switch to the next bank"
              disabled={banks.length < 2}
              onClick={() => {
                setForm((f) => ({ ...f, accountId: nextSwitch(switches.bank, banks.map((b) => b.id), f.accountId) }));
                clearError("bank");
              }}
            />
          ) : null}
        </div>
      </div>
      {errors.bank ? (
        <p role="alert" className="-mt-2 text-xs text-destructive">
          {errors.bank}
        </p>
      ) : null}

      {/* Split, Debt and Credits Added, below Bank Through. Split and Debt cannot both be on; Credits Added is separate. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2" role="group" aria-label="Share and credits">
        <label className={cn("flex h-9 items-center gap-2 text-sm font-semibold", form.splitKind === "DEBT" ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
          <Checkbox
            checked={form.splitKind === "SPLIT"}
            disabled={form.splitKind === "DEBT"}
            onCheckedChange={(next) => {
              setForm((f) => withKind(f, next === true ? "SPLIT" : null, options.settings, options.settings.split.defaultPartyId));
              clearError("split");
              clearError("splitValue");
            }}
          />
          {labels.split}
        </label>
        {isDebit ? (
          <label className={cn("flex h-9 items-center gap-2 text-sm font-semibold", form.splitKind === "SPLIT" ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
            <Checkbox
              checked={form.splitKind === "DEBT"}
              disabled={form.splitKind === "SPLIT"}
              onCheckedChange={(next) => {
                setForm((f) => withKind(f, next === true ? "DEBT" : null, options.settings, options.settings.split.defaultPartyId));
                clearError("split");
                clearError("splitValue");
              }}
            />
            Debt
          </label>
        ) : null}
        {isDebit ? (
          <label className="flex h-9 cursor-pointer items-center gap-2 text-sm font-semibold">
            <Checkbox checked={form.creditsAdded} onCheckedChange={(next) => onToggleCredits(next === true)} />
            <span className="whitespace-nowrap">{creditLabel(labels.creditsAdded)}</span>
          </label>
        ) : null}
      </div>

      {form.splitKind ? <SplitControl form={form} setForm={setForm} options={options} errors={errors} clearError={clearError} idPrefix={idPrefix} onAddPerson={onAddPerson} /> : null}

      {showCredits ? (
        <CreditsPanel
          credits={credits}
          loading={loadingCredits}
          selected={form.creditIds}
          onChoose={(creditId, on) => setForm((f) => ({ ...f, creditIds: on ? [creditId] : [] }))}
          canCycle={switches.credit.enabled}
          onCycle={() =>
            setForm((f) => {
              const next = nextSwitch(switches.credit, (credits ?? []).filter((c) => c.type === "CREDIT").map((c) => c.id), f.creditIds[0] ?? null);
              return next ? { ...f, creditIds: [next] } : f;
            })
          }
          source={options.settings.credits.source}
          debitAmount={form.amount}
        />
      ) : null}
    </div>
  );
}
