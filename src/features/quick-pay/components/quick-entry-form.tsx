"use client";

import { ChevronLeft, ChevronRight, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { QuickPayActions } from "../actions";
import { formatTransactionWhen } from "../datetime";
import type { EntryDetails, QuickPayOptions, RecentCredit } from "../types";
import { MAX_REASON_LENGTH, validateQuickPayInput, type EntryType, type QuickPayErrors } from "../validation";

interface FormState {
  amount: string;
  type: EntryType;
  reason: string;
  accountId: string | null;
  categoryId: string | null;
  splitEnabled: boolean;
  partyId: string | null;
  creditsAdded: boolean;
}

const emptyState = (): FormState => ({ amount: "", type: "DEBIT", reason: "", accountId: null, categoryId: null, splitEnabled: false, partyId: null, creditsAdded: false });

const fromEntry = (e: EntryDetails): FormState => ({
  amount: (e.amountPaise / 100).toFixed(2),
  type: e.type,
  reason: e.reason,
  accountId: e.accountId,
  categoryId: e.categoryId,
  splitEnabled: e.partyId !== null,
  partyId: e.partyId,
  creditsAdded: false,
});

const newRequestId = () => crypto.randomUUID();

const SETTINGS = {
  banks: "/quick-pay/settings?tab=banks",
  categories: "/quick-pay/settings?tab=categories",
  persons: "/quick-pay/persons",
};

/** A link at the bottom of a dropdown that opens the right settings page in a new tab (so nothing typed is lost). */
function AddLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
    >
      <Plus className="size-3.5" aria-hidden />
      {children}
    </a>
  );
}

export function QuickEntryForm({
  initialOptions,
  initialEntry,
  actions,
}: {
  initialOptions: QuickPayOptions;
  /** Set when the page was opened to edit one saved entry (?entry=…). */
  initialEntry: EntryDetails | null;
  actions: QuickPayActions;
}) {
  const [options, setOptions] = useState(initialOptions);
  const [form, setForm] = useState<FormState>(initialEntry ? fromEntry(initialEntry) : emptyState());
  const [errors, setErrors] = useState<QuickPayErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);

  // Walking through saved entries: ids newest first; -1 means "a new entry".
  const [ids, setIds] = useState<string[]>([]);
  const [current, setCurrent] = useState<EntryDetails | null>(initialEntry);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const draft = useRef<FormState | null>(null);

  const [credits, setCredits] = useState<RecentCredit[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const index = current ? ids.indexOf(current.id) : -1;

  // ── Loading data the form needs ─────────────────────────────────────────

  const refreshIds = useCallback(async () => {
    const result = await actions.getEntryIds();
    if (result.ok) setIds(result.ids);
  }, [actions]);

  useEffect(() => {
    let cancelled = false;
    void actions.getEntryIds().then((result) => {
      if (!cancelled && result.ok) setIds(result.ids);
    });
    return () => {
      cancelled = true;
    };
  }, [actions]);

  /** Pick up banks, categories and people added in another tab as soon as you come back to this one. */
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await actions.getOptions();
      if (result.ok) setOptions(result.options);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [actions]);

  // The panel only exists for a Debit with "Credits Added" ticked. Recent credits are fetched each time it opens.
  const showCredits = form.type === "DEBIT" && form.creditsAdded;
  const loadingCredits = showCredits && credits === null;
  useEffect(() => {
    if (!showCredits || credits !== null) return;
    let cancelled = false;
    void actions.getRecentCredits().then((result) => {
      if (cancelled) return;
      if (result.ok) setCredits(result.credits);
      else {
        setCredits([]);
        toast.error(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showCredits, credits, actions]);

  // ── Switching between saved entries ─────────────────────────────────────

  async function goTo(target: number) {
    if (loadingEntry) return;
    // Leaving a new entry: remember what was typed so coming back restores it.
    if (!current) draft.current = form;

    if (target < 0) {
      setCurrent(null);
      setForm(draft.current ?? emptyState());
      setErrors({});
      setFormError(null);
      return;
    }
    const id = ids[target];
    if (!id) return;
    setLoadingEntry(true);
    const result = await actions.getEntry({ id });
    setLoadingEntry(false);
    if (!result.ok) {
      toast.error(result.error);
      void refreshIds();
      return;
    }
    setCurrent(result.entry);
    setForm(fromEntry(result.entry));
    setErrors({});
    setFormError(null);
  }

  const olderDisabled = loadingEntry || ids.length === 0 || (current ? index < 0 || index >= ids.length - 1 : false);
  const newerDisabled = loadingEntry || !current;

  // ── Save and delete ─────────────────────────────────────────────────────

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError(null);

    const input = {
      amount: form.amount,
      type: form.type,
      reason: form.reason,
      accountId: form.accountId,
      categoryId: form.categoryId,
      split: { enabled: form.splitEnabled, partyId: form.partyId },
    };
    const checked = validateQuickPayInput(input);
    if (!checked.ok) {
      setErrors(checked.errors);
      const first = (["amount", "bank", "split"] as const).find((k) => checked.errors[k]);
      if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});

    setSaving(true);
    let result: Awaited<ReturnType<QuickPayActions["saveEntry"]>>;
    try {
      result = await actions.saveEntry({ requestId, entryId: current?.id ?? null, ...input });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and try again." };
    }
    setSaving(false);

    if (!result.ok) {
      setErrors((result.fieldErrors ?? {}) as QuickPayErrors);
      setFormError(result.error);
      toast.error(result.error);
      return;
    }

    if (result.updated) {
      toast.success("Entry updated.");
      setCurrent({ ...current!, type: form.type, amountPaise: result.amountPaise, reason: form.reason.trim(), accountId: form.accountId!, categoryId: form.categoryId, partyId: form.splitEnabled ? form.partyId : null });
    } else {
      toast.success(result.duplicate ? "That entry was already saved." : `${form.type === "CREDIT" ? "Credit" : "Debit"} of ${formatINR(result.amountPaise)} saved.`, {
        description: "It now appears in GPay Transactions.",
        action: { label: "View", onClick: () => router.push("/quick-pay/transactions") },
      });
      setForm(emptyState());
      draft.current = null;
      setRequestId(newRequestId());
      setCredits(null);
    }
    void refreshIds();
  }

  async function removeEntry(): Promise<string | null> {
    if (!current) return null;
    const result = await actions.deleteEntry({ id: current.id });
    if (!result.ok) return result.error;
    toast.success("Entry deleted.");
    setCurrent(null);
    setForm(emptyState());
    draft.current = null;
    setRequestId(newRequestId());
    void refreshIds();
    return null;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const bankOptions = options.banks.map((b) => ({ value: b.id, label: b.label }));
  const categoryOptions = options.categories.map((c) => ({ value: c.id, label: c.label }));
  const personOptions = options.persons.map((p) => ({ value: p.id, label: p.name }));
  const when = current ? formatTransactionWhen(new Date(current.occurredAt)) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{current ? "Edit entry" : "New entry"}</CardTitle>
            <CardDescription>
              {when ? `${when.date} · ${when.timeAndDay}` : "Saved with the date and time you press Save."}
            </CardDescription>
          </div>

          {/* Switch between saved entries */}
          <div className="flex items-center gap-1" role="group" aria-label="Switch between saved entries">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Older entry" disabled={olderDisabled} onClick={() => goTo(current ? index + 1 : 0)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-24 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {loadingEntry ? "Loading…" : current ? (index >= 0 ? `${index + 1} of ${ids.length}` : "Saved entry") : ids.length ? `New · ${ids.length} saved` : "New"}
            </span>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Newer entry" disabled={newerDisabled} onClick={() => goTo(index > 0 ? index - 1 : -1)}>
              <ChevronRight />
            </Button>
            {current ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => goTo(-1)}>
                <Plus /> New
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} noValidate method="post" className={cn("space-y-6", loadingEntry && "pointer-events-none opacity-60")} aria-busy={loadingEntry}>
          {/* Value and type */}
          <div id="field-amount" className="scroll-mt-24 space-y-2">
            <Label htmlFor="qp-amount">Value</Label>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl text-muted-foreground">₹</span>
              <Input
                id="qp-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={form.amount}
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? "error-amount" : undefined}
                onChange={(e) => {
                  set("amount", e.target.value);
                  setErrors((x) => ({ ...x, amount: undefined }));
                }}
                className="h-14 pl-10 text-2xl font-semibold tabular-nums"
              />
            </div>
            {/* Small Credit / Debit toggle */}
            <div role="radiogroup" aria-label="Transaction type" className="inline-grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5 text-xs">
              {(["DEBIT", "CREDIT"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={form.type === t}
                  onClick={() => set("type", t)}
                  className={cn(
                    "h-7 min-w-20 rounded-md px-3 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    form.type === t
                      ? t === "DEBIT"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-success/15 text-success"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "DEBIT" ? "Debit" : "Credit"}
                </button>
              ))}
            </div>
            {errors.amount ? (
              <p id="error-amount" role="alert" className="text-xs text-destructive">
                {errors.amount}
              </p>
            ) : null}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="qp-reason">Reason</Label>
            <Input
              id="qp-reason"
              autoComplete="off"
              placeholder="What was it for?"
              maxLength={MAX_REASON_LENGTH}
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
            />
          </div>

          {/* Bank through */}
          <div id="field-bank" className="scroll-mt-24 space-y-2">
            <Label htmlFor="qp-bank">Bank Through</Label>
            <SearchableSelect
              id="qp-bank"
              ariaLabel="Bank through"
              options={bankOptions}
              value={form.accountId}
              onChange={(v) => {
                set("accountId", v);
                setErrors((x) => ({ ...x, bank: undefined }));
              }}
              placeholder="Choose a bank"
              searchPlaceholder="Search banks…"
              emptyText="No bank found. Use Add Details to create one."
              invalid={!!errors.bank}
              footer={<AddLink href={SETTINGS.banks}>Add Details</AddLink>}
            />
            {errors.bank ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.bank}
              </p>
            ) : null}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="qp-category">Category</Label>
            <SearchableSelect
              id="qp-category"
              ariaLabel="Category"
              options={categoryOptions}
              value={form.categoryId}
              onChange={(v) => set("categoryId", v)}
              placeholder="Choose a category (optional)"
              searchPlaceholder="Search categories…"
              emptyText="No category found."
              clearable
              footer={<AddLink href={SETTINGS.categories}>Add Category</AddLink>}
            />
          </div>

          {/* Split: the person only appears when Split is on */}
          <div id="field-split" className="scroll-mt-24 space-y-3">
            <label className="flex w-fit cursor-pointer items-center gap-3 text-sm font-medium">
              <Checkbox
                checked={form.splitEnabled}
                onCheckedChange={(next) => {
                  setForm((f) => ({ ...f, splitEnabled: next === true, partyId: next === true ? f.partyId : null }));
                  setErrors((x) => ({ ...x, split: undefined }));
                }}
              />
              Split
            </label>
            {form.splitEnabled ? (
              <div className="space-y-2">
                <SearchableSelect
                  ariaLabel="Person"
                  options={personOptions}
                  value={form.partyId}
                  onChange={(v) => {
                    set("partyId", v);
                    setErrors((x) => ({ ...x, split: undefined }));
                  }}
                  placeholder="Choose a person"
                  searchPlaceholder="Search people…"
                  emptyText="No people yet. Use Add a Person."
                  invalid={!!errors.split}
                  footer={<AddLink href={SETTINGS.persons}>Add a Person</AddLink>}
                />
                {errors.split ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.split}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Credits Added: only for a Debit, and only when ticked */}
          {form.type === "DEBIT" ? (
            <div className="space-y-3">
              <label className="flex w-fit cursor-pointer items-center gap-3 text-sm font-medium">
                <Checkbox
                  checked={form.creditsAdded}
                  onCheckedChange={(next) => {
                    set("creditsAdded", next === true);
                    if (next !== true) setCredits(null); // fetched fresh the next time it is opened
                  }}
                />
                Credits Added
              </label>
              {showCredits ? (
                <div className="rounded-xl border bg-muted/30 p-3" aria-live="polite">
                  {loadingCredits && !credits ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Loading recent credits…
                    </p>
                  ) : credits && credits.length > 0 ? (
                    <ul className="divide-y">
                      {credits.map((c) => (
                        <li key={c.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm first:pt-0 last:pb-0">
                          <span className="min-w-0 truncate">
                            <span className="font-semibold tabular-nums text-success">{formatINR(c.amountPaise)}</span>
                            <span className="text-muted-foreground"> – {c.reason || "No reason"}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatTransactionWhen(new Date(c.occurredAt)).date}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No credits saved yet. Credits you save will show up here, newest first.</p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {formError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" className="h-11 flex-1 text-base" disabled={saving || loadingEntry}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              {saving ? "Saving…" : current ? "Update Entry" : "Save Entry"}
            </Button>
            {current ? (
              <Button type="button" variant="outline" size="lg" className="h-11 text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 /> Delete
              </Button>
            ) : null}
          </div>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link href="/quick-pay/settings" className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline">
              <Settings2 className="size-3" /> Customized Settings
            </Link>
            <Link href="/quick-pay/persons" className="underline-offset-4 hover:text-foreground hover:underline">
              Person Management
            </Link>
            <Link href="/quick-pay/transactions" className="underline-offset-4 hover:text-foreground hover:underline">
              GPay Transactions
            </Link>
          </p>
        </form>
      </CardContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this entry?"
        description="It disappears from GPay Transactions and the bank balance is recalculated. This cannot be undone."
        confirmLabel="Delete entry"
        onConfirm={removeEntry}
      />
    </Card>
  );
}
