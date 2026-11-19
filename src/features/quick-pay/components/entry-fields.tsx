"use client";

import { ChevronDown, Plus } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { flattenGroups, groupBanks, groupCategories } from "../cascade";
import { categoriesFor, keywordsFor, visibleBanks } from "../availability";
import { withCategory, withKind, withOfficeDebt, withReason, type FormState } from "../entry-state";
import { nextSwitch } from "../switching";
import type { QuickPayOptions, RecentCredit } from "../types";
import { MAX_REASON_LENGTH, type EntryType, type QuickPayErrors } from "../validation";
import { CreditsPanel } from "./credits-panel";
import { RecentChips } from "./recent-chips";
import { CycleButton } from "./cycle-button";
import { InlineAdd, type AddResult } from "./inline-add";
import { PersonChips } from "./person-chips";
import { SplitControl } from "./split-control";
import { ReasonCategoryDialog } from "./reason-category-dialog";
import { SelfTransferItem } from "./transfer-dialog";
import { SelfTransferButton, TypeToggle } from "./type-toggle";

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

/** One tick box in the Explore more list. */
/** Keeps the people chosen above and folds the options away. (Nothing is lost: Save Entry saves the whole entry.) */
function SaveChoice({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50">
      Save
    </button>
  );
}

function OptionRow({ checked, disabled = false, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <label className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-semibold", disabled && "cursor-not-allowed opacity-50")}>
      <Checkbox checked={checked} disabled={disabled} aria-label={label} onCheckedChange={(next) => onChange(next === true)} />
      {label}
    </label>
  );
}

/**
 * The fields of an entry, laid out compactly so they fit a phone with little scrolling:
 *   [date]  − Debit  + Credit  ⇄ Self Transfer     (one line; the date comes from the page via `headerLeft`)
 *   Amount
 *   Reason (with its Category tick) · Category
 *   Through (with its switch icon)
 *   Explore more: Split, Debt to, Shopping Portals, one under another; ticking one shows the people (or portals) right there
 * Credit History is no longer a tick box: double-click the Debit (−) button, or press and hold it on a phone.
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
  onAssignReason,
  headerLeft,
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
  /** When given, the Through list ends with a Self Transfer item and a Self Transfer button sits beside Debit and Credit. */
  onSelfTransfer?: () => void;
  /** When given, a small checkbox in the Reason box opens a pop-up that puts the reason under a category. */
  onAssignReason?: (reason: string, type: EntryType, input: { categoryId: string | null; newCategory?: string }) => Promise<{ ok: true; categoryId: string } | { ok: false; error: string }>;
  /** What goes at the start of the top line, normally the date. */
  headerLeft?: ReactNode;
}) {
  const labels = options.settings.fields.labels;
  // Banks switched off in Customized Settings are not offered (the one already on the entry still is).
  const banks = useMemo(() => visibleBanks(options, [form.accountId]), [options, form.accountId]);
  const bankGroups = useMemo(() => groupBanks(banks), [banks]);
  const switches = options.settings.switch;
  // A Debit and a Credit share one list of categories.
  const categoryList = categoriesFor(options, form.type);
  const categoryGroups = useMemo(() => groupCategories(categoryList), [categoryList]);
  const showCredits = form.type === "DEBIT" && form.creditsAdded;
  const isDebit = form.type === "DEBIT";
  const [reasonFocus, setReasonFocus] = useState(false);
  const [reasonDialog, setReasonDialog] = useState(false);
  // Explore more starts open when the entry already uses one of its options (for example when editing).
  const [moreOpen, setMoreOpen] = useState(() => form.splitKind !== null || form.shoppingPlatformId !== null || form.creditedById !== null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  // When a Split or Debt appears (for example Office picks its Debt), the options open so it can be seen.
  const [seenKind, setSeenKind] = useState(form.splitKind);
  if (form.splitKind !== seenKind) {
    setSeenKind(form.splitKind);
    if (form.splitKind) setMoreOpen(true);
  }
  const debitRef = useRef<HTMLButtonElement>(null);
  // A mistake in the people or their shares is shown where it can be fixed.
  const splitProblem = errors.split || errors.splitValue;
  const [shownProblem, setShownProblem] = useState(false);
  if (Boolean(splitProblem) !== shownProblem) {
    setShownProblem(Boolean(splitProblem));
    if (splitProblem && form.splitKind) setMoreOpen(true);
  }
  // Reasons used often, narrowed by what is typed. A reason that is already typed in full is not offered again.
  const suggestions = useMemo(() => {
    const typed = form.reason.trim().toLowerCase();
    return options.frequentReasons.filter((r) => r.toLowerCase() !== typed && (typed === "" || r.toLowerCase().includes(typed))).slice(0, 6);
  }, [options.frequentReasons, form.reason]);
  const id = (name: string) => `${idPrefix}-${name}`;

  const setKind = (kind: "SPLIT" | "DEBT", on: boolean) => {
    setForm((f) => withKind(f, on ? kind : null, options.settings, options.settings.split.defaultPartyId));
    clearError("split");
    clearError("splitValue");
  };

  /** Double-click (or hold) on Debit: the recent credits to attach. Works from Credit too, by switching to Debit first. */
  const openHistory = () => {
    if (!isDebit) setForm((f) => ({ ...f, type: "DEBIT" }));
    if (!form.creditsAdded || !isDebit) onToggleCredits(true);
    setCreditsOpen(true);
  };
  const closeHistory = () => {
    setCreditsOpen(false);
    // Closing without choosing a credit means none is attached.
    if (form.creditsAdded && form.creditIds.length === 0) onToggleCredits(false);
  };

  return (
    <div className="space-y-3">
      {/* The date (from the page), Debit −, Credit + and Self Transfer on one line */}
      <div className="flex items-center gap-2" role="group" aria-label="Date, Debit or Credit, Self Transfer">
        {headerLeft ? <div className="min-w-0 flex-1">{headerLeft}</div> : null}
        <TypeToggle
          value={form.type}
          debitRef={debitRef}
          historyOn={isDebit && form.creditIds.length > 0}
          onDebitHistory={openHistory}
          onChange={(t) =>
            setForm((f) => ({
              ...f,
              type: t,
              // A Credit has no Debt, no Credit History and no shopping portal.
              ...(t === "CREDIT" ? { creditsAdded: false, creditIds: [], shoppingPlatformId: null, ...(f.splitKind === "DEBT" ? { splitKind: null, shares: [] } : {}) } : {}),
            }))
          }
        />
        {onSelfTransfer ? <SelfTransferButton onClick={onSelfTransfer} /> : null}
      </div>

      {/* Amount */}
      <div id={id("field-amount")} className="scroll-mt-24 space-y-1">
        <label htmlFor={id("amount")} className={labelClass}>
          {labels.amount}
        </label>
        <div
          className="flex min-w-0 overflow-hidden rounded-xl border border-primary/40 bg-white focus-within:ring-3 focus-within:ring-primary/25 aria-[invalid=true]:border-destructive"
          aria-invalid={!!errors.amount}
        >
          <span aria-hidden className="flex w-9 items-center justify-center bg-muted text-base text-primary">
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
        {errors.amount ? (
          <p id={id("error-amount")} role="alert" className="text-xs text-destructive">
            {errors.amount}
          </p>
        ) : null}
      </div>

      {/* Reason (its Category tick sits in the box) and Category on one line */}
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 space-y-1">
          <label htmlFor={id("reason")} className={labelClass}>
            {labels.reason}
          </label>
          <div className="relative">
            <Input
              id={id("reason")}
              autoComplete="off"
              placeholder="What was it for?"
              maxLength={MAX_REASON_LENGTH}
              value={form.reason}
              onFocus={() => setReasonFocus(true)}
              onBlur={() => setReasonFocus(false)}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => withOfficeDebt(withReason(f, value, keywordsFor(options, f.type)), options));
              }}
              className={cn("h-10 text-base sm:text-sm", onAssignReason && "pr-9")}
            />
            {onAssignReason ? (
              <span className="absolute top-1/2 right-2.5 -translate-y-1/2" title="Choose which category this reason belongs to">
                <Checkbox checked={reasonDialog} disabled={form.reason.trim() === ""} onCheckedChange={(next) => setReasonDialog(next === true)} aria-label="Put this reason under a category" />
              </span>
            ) : null}
            {reasonFocus && suggestions.length > 0 ? (
              <ul role="listbox" aria-label="Reasons you use often" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
                {suggestions.map((r) => (
                  <li key={r} role="option" aria-selected={false}>
                    <button
                      type="button"
                      // Pressing a suggestion must not blur the box first, or the list would vanish before the tap lands.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setForm((f) => withOfficeDebt(withReason(f, r, keywordsFor(options, f.type)), options));
                        setReasonFocus(false);
                      }}
                      className="flex min-h-10 w-full items-center rounded-md px-2.5 py-1.5 text-left text-base hover:bg-accent hover:text-accent-foreground sm:min-h-8 sm:text-sm"
                    >
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor={id("category")} className={labelClass}>
            {labels.category}
            {form.categoryAuto ? <span className="ml-1 font-normal text-primary">· auto</span> : null}
          </label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <CascadingSelect
                id={id("category")}
                ariaLabel={labels.category}
                groups={categoryGroups}
                value={form.categoryId}
                onChange={(v) => setForm((f) => withOfficeDebt(withCategory(f, v), options))}
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
                      if (result.ok) setForm((f) => withOfficeDebt(withCategory(f, result.id), options));
                      return result;
                    }}
                  />
                }
              />
            </div>
            {switches.category.enabled ? (
              <CycleButton
                label="Switch to the next category"
                disabled={categoryList.filter((c) => !c.isSub).length < 2}
                onClick={() => setForm((f) => withOfficeDebt(withCategory(f, nextSwitch(switches.category, categoryList.filter((c) => !c.isSub).map((c) => c.id), f.categoryId)), options))}
              />
            ) : null}
          </div>
          <RecentChips field="category" options={flattenGroups(categoryGroups)} selected={form.categoryId} onPick={(v) => setForm((f) => withOfficeDebt(withCategory(f, v), options))} />
        </div>
      </div>

      {/* Through, under Category */}
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
        <RecentChips
          field="bank"
          options={flattenGroups(bankGroups)}
          selected={form.accountId}
          onPick={(v) => {
            setForm((f) => ({ ...f, accountId: v }));
            clearError("bank");
          }}
        />
      </div>
      {errors.bank ? (
        <p role="alert" className="-mt-2 text-xs text-destructive">
          {errors.bank}
        </p>
      ) : null}

      {/* Explore more: the options one under another. Ticking one shows the people (or portals) right under it. */}
      <div>
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={id("more")}
          onClick={() => setMoreOpen((open) => !open)}
          className="flex h-9 items-center gap-1.5 rounded-lg text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden />
          Explore more
        </button>
        {moreOpen ? (
          <div id={id("more")} className="mt-1 space-y-1 rounded-xl border bg-card/70 p-3">
            {/* A Credit says who gave the money: Others, or one of your people. It counts as a payment by that person in Debt Management. */}
            {!isDebit ? (
              <div className="space-y-2 pb-1">
                <p className="text-sm font-semibold">Credited By</p>
                <PersonChips
                  ariaLabel="Credited by"
                  single
                  noneLabel="Others"
                  people={options.persons}
                  selected={form.creditedById ? [form.creditedById] : []}
                  onChange={(ids) => setForm((f) => ({ ...f, creditedById: ids[0] ?? null }))}
                  onAddPerson={onAddPerson}
                />
                <SaveChoice onClick={() => setMoreOpen(false)} />
              </div>
            ) : null}
            <OptionRow label={labels.split} checked={form.splitKind === "SPLIT"} disabled={form.splitKind === "DEBT"} onChange={(on) => setKind("SPLIT", on)} />
            {form.splitKind === "SPLIT" ? (
              <div className="pb-2 pl-7">
                <SplitControl chips form={form} setForm={setForm} options={options} errors={errors} clearError={clearError} idPrefix={idPrefix} onAddPerson={onAddPerson} />
                {form.shares.length > 0 ? <SaveChoice onClick={() => setMoreOpen(false)} /> : null}
              </div>
            ) : null}

            {isDebit ? (
              <>
                <OptionRow label="Debt to" checked={form.splitKind === "DEBT"} disabled={form.splitKind === "SPLIT"} onChange={(on) => setKind("DEBT", on)} />
                {form.splitKind === "DEBT" ? (
                  <div className="pb-2 pl-7">
                    <SplitControl chips form={form} setForm={setForm} options={options} errors={errors} clearError={clearError} idPrefix={idPrefix} onAddPerson={onAddPerson} />
                    {form.shares.length > 0 ? <SaveChoice onClick={() => setMoreOpen(false)} /> : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {isDebit && options.shoppingPlatforms.length > 0 ? (
              <>
                <OptionRow
                  label="Shopping Portals"
                  checked={form.shoppingPlatformId !== null}
                  onChange={(on) => setForm((f) => ({ ...f, shoppingPlatformId: on ? (f.shoppingPlatformId ?? options.shoppingPlatforms[0]!.id) : null }))}
                />
                {form.shoppingPlatformId !== null ? (
                  <div className="space-y-2 pb-2 pl-7">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <PersonChips
                          ariaLabel="Shopping platform"
                          single
                          people={options.shoppingPlatforms}
                          selected={[form.shoppingPlatformId]}
                          // One portal stays chosen while this is ticked: tapping the chosen one again changes nothing.
                          onChange={(ids) => setForm((f) => ({ ...f, shoppingPlatformId: ids[0] ?? f.shoppingPlatformId }))}
                        />
                      </div>
                      {switches.shopping.enabled ? (
                        <CycleButton
                          label="Switch to the next shopping platform"
                          disabled={options.shoppingPlatforms.length < 2}
                          onClick={() => setForm((f) => ({ ...f, shoppingPlatformId: nextSwitch(switches.shopping, options.shoppingPlatforms.map((p) => p.id), f.shoppingPlatformId) }))}
                        />
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">Saving adds this purchase to Shopping Records as Pending. Add the image, recipients and items there.</p>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Credit History: opens beside the Debit button (double-click, or press and hold) */}
      <Popover.Root open={creditsOpen && showCredits} onOpenChange={(open) => !open && closeHistory()}>
        <Popover.Portal>
          <Popover.Positioner anchor={() => debitRef.current} side="bottom" align="start" sideOffset={6} collisionPadding={8} className="isolate z-[70]">
            <Popover.Popup data-popup="" className="w-[min(26rem,calc(100vw-1rem))] rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl outline-none">
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
                onTurnOff={() => {
                  setForm((f) => ({ ...f, creditIds: [] }));
                  onToggleCredits(false);
                  setCreditsOpen(false);
                }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      {onAssignReason ? (
        <ReasonCategoryDialog
          open={reasonDialog}
          onOpenChange={setReasonDialog}
          reason={form.reason.trim()}
          categories={categoryList}
          currentId={form.categoryId}
          onAssign={async (input) => {
            const done = await onAssignReason(form.reason.trim(), form.type, input);
            if (!done.ok) return done.error;
            setForm((f) => withOfficeDebt(withCategory(f, done.categoryId), options));
            return null;
          }}
        />
      ) : null}
    </div>
  );
}
