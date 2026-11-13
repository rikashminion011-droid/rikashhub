"use client";

import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { QuickPayActions } from "../actions";
import { formatTransactionWhen } from "../datetime";
import { defaultCreditSelection, emptyState, fromEntry, type FormState } from "../entry-state";
import type { EntryDetails, QuickPayOptions, RecentCredit } from "../types";
import { validateQuickPayInput, type QuickPayErrors } from "../validation";
import { EntryFields } from "./entry-fields";

const newRequestId = () => crypto.randomUUID();

/** The Quick Entry form: record a debit or credit. Compact, with the same fields as the edit pop-up in GPay Transactions. */
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
  const [form, setFormState] = useState<FormState>(() => (initialEntry ? fromEntry(initialEntry, initialOptions.settings) : emptyState(initialOptions.settings, initialOptions)));
  const [errors, setErrors] = useState<QuickPayErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);

  // Walking through saved entries: ids newest first; no current entry means "a new entry".
  const [ids, setIds] = useState<string[]>([]);
  const [current, setCurrent] = useState<EntryDetails | null>(initialEntry);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const draft = useRef<FormState | null>(null);

  const [credits, setCredits] = useState<RecentCredit[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  const setForm = useCallback((update: (f: FormState) => FormState) => setFormState((f) => update(f)), []);
  const clearError = useCallback((key: keyof QuickPayErrors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);
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

  /** Pick up banks, categories, people and settings changed in another tab as soon as you come back to this one. */
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

  // The Credits Added panel only exists for a Debit with it ticked. What it lists comes from Customized Settings,
  // and is fetched each time it opens.
  const showCredits = form.type === "DEBIT" && form.creditsAdded;
  const loadingCredits = showCredits && credits === null;
  useEffect(() => {
    if (!showCredits || credits !== null) return;
    let cancelled = false;
    void actions.getRecentCredits().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setCredits(result.credits);
        // The first time it opens, select what the settings say to select (nothing, the latest, or the newest few).
        setFormState((f) => (f.creditIds.length > 0 ? f : { ...f, creditIds: defaultCreditSelection(result.credits, options.settings.credits) }));
      } else {
        setCredits([]);
        toast.error(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showCredits, credits, actions, options.settings.credits]);

  function toggleCredits(on: boolean) {
    setFormState((f) => ({ ...f, creditsAdded: on, creditIds: on ? f.creditIds : [] }));
    if (!on) setCredits(null); // fetched fresh the next time it is opened
  }

  // ── Switching between saved entries ─────────────────────────────────────

  async function goTo(target: number) {
    if (loadingEntry) return;
    // Leaving a new entry: remember what was typed so coming back restores it.
    if (!current) draft.current = form;

    if (target < 0) {
      setCurrent(null);
      setFormState(draft.current ?? emptyState(options.settings, options));
      setCredits(null);
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
    setFormState(fromEntry(result.entry, options.settings));
    setCredits(null);
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
      split: { enabled: form.splitEnabled, partyId: form.partyId, method: form.splitMethod, value: form.splitValue },
      creditIds: form.type === "DEBIT" ? form.creditIds : [],
    };
    const checked = validateQuickPayInput(input);
    if (!checked.ok) {
      setErrors(checked.errors);
      const first = (["amount", "bank", "split"] as const).find((k) => checked.errors[k]) ?? (checked.errors.splitValue ? "split" : null);
      if (first) document.getElementById(`qp-field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      setCurrent({
        ...current!,
        type: form.type,
        amountPaise: result.amountPaise,
        reason: form.reason.trim(),
        accountId: form.accountId!,
        categoryId: form.categoryId,
        partyId: form.splitEnabled ? form.partyId : null,
        splitPercent: checked.value.partyId ? checked.value.percent : null,
        creditIds: input.creditIds,
      });
    } else {
      toast.success(result.duplicate ? "That entry was already saved." : `${form.type === "CREDIT" ? "Credit" : "Debit"} of ${formatINR(result.amountPaise)} saved.`, {
        description: "It now appears in GPay Transactions.",
        action: { label: "View", onClick: () => router.push("/quick-pay/transactions") },
      });
      setFormState(emptyState(options.settings, options));
      draft.current = null;
      setRequestId(newRequestId());
      setCredits(null);
      router.refresh(); // today's summary and recent entries
    }
    void refreshIds();
  }

  async function removeEntry(): Promise<string | null> {
    if (!current) return null;
    const result = await actions.deleteEntry({ id: current.id });
    if (!result.ok) return result.error;
    toast.success("Entry deleted.");
    setCurrent(null);
    setFormState(emptyState(options.settings, options));
    draft.current = null;
    setRequestId(newRequestId());
    setCredits(null);
    void refreshIds();
    router.refresh();
    return null;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const when = current ? formatTransactionWhen(new Date(current.occurredAt)) : null;

  // overflow-visible: the bank and category lists open over the card's edge, so the card must not clip them.
  return (
    <Card className="gap-3 overflow-visible py-4">
      <CardHeader className="px-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg">{current ? "Edit Entry" : "Quick Entry"}</CardTitle>
            {when ? <p className="truncate text-xs text-muted-foreground">{when.date} · {when.timeAndDay}</p> : null}
          </div>

          {/* Switch between saved entries */}
          <div className="flex items-center gap-1" role="group" aria-label="Switch between saved entries">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Older entry" disabled={olderDisabled} onClick={() => goTo(current ? index + 1 : 0)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {loadingEntry ? "Loading…" : current ? (index >= 0 ? `${index + 1} of ${ids.length}` : "Saved") : ids.length ? `New · ${ids.length}` : "New"}
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

      <CardContent className="px-4 sm:px-5">
        <form onSubmit={onSubmit} noValidate method="post" className={cn("space-y-3", loadingEntry && "pointer-events-none opacity-60")} aria-busy={loadingEntry}>
          <EntryFields
            form={form}
            setForm={setForm}
            errors={errors}
            clearError={clearError}
            options={options}
            idPrefix="qp"
            credits={credits}
            loadingCredits={loadingCredits}
            onToggleCredits={toggleCredits}
          />

          {formError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" className="h-11 flex-1 rounded-xl bg-neutral-900 text-base text-white hover:bg-neutral-800" disabled={saving || loadingEntry}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {saving ? "Saving…" : current ? "Update Entry" : "Save Entry"}
            </Button>
            {current ? (
              <Button type="button" variant="outline" size="lg" className="h-11 rounded-xl text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 /> Delete
              </Button>
            ) : null}
          </div>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link href="/quick-pay/settings" className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline">
              <Settings2 className="size-3" /> Customized Settings
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
