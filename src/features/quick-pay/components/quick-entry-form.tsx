"use client";

import { Check, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/finance";
import type { QuickAddActions, QuickPayActions } from "../actions";
import { formatTransactionWhen } from "../datetime";
import { defaultCreditSelection, emptyState, fromEntry, toQuickPayInput, type FormState } from "../entry-state";
import type { EntryDetails, QuickPayOptions, RecentCredit } from "../types";
import { validateQuickPayInput, type QuickPayErrors } from "../validation";
import { EntryFields } from "./entry-fields";
import { notifyDataChanged } from "./period-context";
import { SelfTransferDialog } from "./transfer-dialog";
import { useQuickAdd } from "./use-quick-add";

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
  actions: QuickPayActions & QuickAddActions;
}) {
  const [options, setOptions] = useState(initialOptions);
  const [form, setFormState] = useState<FormState>(() => (initialEntry ? fromEntry(initialEntry, initialOptions.settings) : emptyState(initialOptions.settings, initialOptions)));
  const [errors, setErrors] = useState<QuickPayErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);

  // The saved entry being edited (opened with ?entry=…); none means a new entry.
  const [current, setCurrent] = useState<EntryDetails | null>(initialEntry);

  const [credits, setCredits] = useState<RecentCredit[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const router = useRouter();

  const setForm = useCallback((update: (f: FormState) => FormState) => setFormState((f) => update(f)), []);
  const clearError = useCallback((key: keyof QuickPayErrors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);
  const adders = useQuickAdd(actions, setOptions);

  // ── Loading data the form needs ─────────────────────────────────────────

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

  /** Leaves the entry being edited and starts a fresh one. */
  function startNew() {
    setCurrent(null);
    setFormState(emptyState(options.settings, options));
    setRequestId(newRequestId());
    setCredits(null);
    setErrors({});
    setFormError(null);
    router.replace("/quick-pay");
  }

  // ── Save and delete ─────────────────────────────────────────────────────

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError(null);

    const input = toQuickPayInput(form);
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

    notifyDataChanged();
    if (result.updated) {
      toast.success("Entry updated.");
      setCurrent({
        ...current!,
        type: form.type,
        amountPaise: result.amountPaise,
        reason: form.reason.trim(),
        accountId: form.accountId!,
        categoryId: input.categoryId,
        splitKind: checked.value.splitKind,
        shares: checked.value.shares.map((x) => ({ partyId: x.partyId, name: options.persons.find((p) => p.id === x.partyId)?.name ?? "", percent: x.percent, sharePaise: x.sharePaise })),
        creditIds: [...(input.creditIds ?? [])],
      });
    } else {
      toast.success(result.duplicate ? "That entry was already saved." : `${form.type === "CREDIT" ? "Credit" : "Debit"} of ${formatINR(result.amountPaise)} saved.`, {
        description: "It now appears in GPay Transactions.",
        action: { label: "View", onClick: () => router.push("/quick-pay/transactions") },
      });
      setFormState(emptyState(options.settings, options));
      setRequestId(newRequestId());
      setCredits(null);
      router.refresh(); // today's summary and recent entries
    }
  }

  async function removeEntry(): Promise<string | null> {
    if (!current) return null;
    const result = await actions.deleteEntry({ id: current.id });
    if (!result.ok) return result.error;
    toast.success("Entry deleted.");
    notifyDataChanged();
    setCurrent(null);
    setFormState(emptyState(options.settings, options));
    setRequestId(newRequestId());
    setCredits(null);
    router.refresh();
    router.replace("/quick-pay");
    return null;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const when = current ? formatTransactionWhen(new Date(current.occurredAt)) : null;

  // No title and no box: plain fields on the page. Only an entry opened for editing gets a small heading.
  return (
    <div className="space-y-3">
      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Edit Entry</p>
            {when ? <p className="truncate text-xs text-muted-foreground">{when.date} · {when.timeAndDay}</p> : null}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={startNew}>
            <Plus /> New
          </Button>
        </div>
      ) : null}

      <div>
        <form onSubmit={onSubmit} noValidate method="post" className="space-y-3">
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
            onAddCategory={adders.addCategory}
            onAddPerson={adders.addPerson}
            onSelfTransfer={actions.saveTransfer ? () => setTransferOpen(true) : undefined}
          />

          {formError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" className="h-11 flex-1 rounded-xl bg-neutral-900 text-base text-white hover:bg-neutral-800" disabled={saving}>
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
      </div>

      {actions.saveTransfer ? <SelfTransferDialog open={transferOpen} onOpenChange={setTransferOpen} options={options} saveTransfer={actions.saveTransfer} /> : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this entry?"
        description="It disappears from GPay Transactions and the bank balance is recalculated. This cannot be undone."
        confirmLabel="Delete entry"
        onConfirm={removeEntry}
      />
    </div>
  );
}
