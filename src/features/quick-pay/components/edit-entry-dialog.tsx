"use client";

import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { QuickAddActions, QuickPayActions } from "../actions";
import { istDateOf, istTimeOf } from "../datetime";
import { defaultCreditSelection, fromEntry, toQuickPayInput, type FormState } from "../entry-state";
import type { EntryDetails, QuickPayOptions, RecentCredit } from "../types";
import { validateQuickPayInput, type QuickPayErrors } from "../validation";
import { EntryFields } from "./entry-fields";
import { useQuickAdd } from "./use-quick-add";

export type EditActions = Pick<QuickPayActions, "saveEntry" | "getEntry" | "getRecentCredits" | "getOptions"> & QuickAddActions;

/** Edit a saved transaction in a pop-up on the same page: every field, including its date and time. */
export function EditEntryDialog({
  entryId,
  options,
  actions,
  onClose,
  onSaved,
}: {
  /** The entry to edit, or null when the pop-up is closed. */
  entryId: string | null;
  options: QuickPayOptions;
  actions: EditActions;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={entryId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        {/* Mounted only while open, so it always loads the entry fresh. */}
        {entryId ? <EditBody key={entryId} entryId={entryId} options={options} actions={actions} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditBody({ entryId, options: initialOptions, actions, onClose, onSaved }: { entryId: string; options: QuickPayOptions; actions: EditActions; onClose: () => void; onSaved: () => void }) {
  // A copy, so a category or person added from inside this pop-up shows up in its lists straight away.
  const [options, setOptions] = useState(initialOptions);
  const adders = useQuickAdd(actions, setOptions);
  const [entry, setEntry] = useState<EntryDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setFormState] = useState<FormState | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [errors, setErrors] = useState<QuickPayErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [credits, setCredits] = useState<RecentCredit[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void actions.getEntry({ id: entryId }).then((result) => {
      if (cancelled) return;
      if (!result.ok) return setLoadError(result.error);
      setEntry(result.entry);
      setFormState(fromEntry(result.entry, options.settings));
      const when = new Date(result.entry.occurredAt);
      setDate(istDateOf(when));
      setTime(istTimeOf(when));
    });
    return () => {
      cancelled = true;
    };
  }, [actions, entryId, options.settings]);

  const showCredits = !!form && form.type === "DEBIT" && form.creditsAdded;
  const loadingCredits = showCredits && credits === null;
  useEffect(() => {
    if (!showCredits || credits !== null) return;
    let cancelled = false;
    void actions.getRecentCredits().then((result) => {
      if (cancelled) return;
      setCredits(result.ok ? result.credits : []);
      if (result.ok) setFormState((f) => (f && f.creditIds.length === 0 ? { ...f, creditIds: defaultCreditSelection(result.credits, options.settings.credits) } : f));
    });
    return () => {
      cancelled = true;
    };
  }, [showCredits, credits, actions, options.settings.credits]);

  const setForm = useCallback((update: (f: FormState) => FormState) => setFormState((f) => (f ? update(f) : f)), []);
  const clearError = useCallback((key: keyof QuickPayErrors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !entry || saving) return;
    setFormError(null);
    const input = toQuickPayInput(form);
    const checked = validateQuickPayInput(input);
    if (!checked.ok) return setErrors(checked.errors);
    setErrors({});

    setSaving(true);
    let result: Awaited<ReturnType<EditActions["saveEntry"]>>;
    try {
      result = await actions.saveEntry({ requestId: crypto.randomUUID(), entryId: entry.id, ...input, date, time });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and try again." };
    }
    setSaving(false);
    if (!result.ok) {
      setErrors((result.fieldErrors ?? {}) as QuickPayErrors);
      setFormError(result.error);
      return;
    }
    toast.success("Transaction updated. Totals and balances are recalculated.");
    onSaved();
    onClose();
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit transaction</DialogTitle>
        <DialogDescription>Change anything and press Save. The totals and bank balances update straight away.</DialogDescription>
      </DialogHeader>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : !form || !entry ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <EntryFields
            form={form}
            setForm={setForm}
            errors={errors}
            clearError={clearError}
            options={options}
            idPrefix="edit"
            credits={credits}
            loadingCredits={loadingCredits}
            onToggleCredits={(on) => {
              setFormState((f) => (f ? { ...f, creditsAdded: on, creditIds: on ? f.creditIds : [] } : f));
              if (!on) setCredits(null);
            }}
            onAddCategory={adders.addCategory}
            onAddPerson={adders.addPerson}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="edit-date" className="text-xs font-semibold text-muted-foreground">
                Date
              </label>
              <Input id="edit-date" type="date" value={date} max={istDateOf(new Date())} onChange={(e) => setDate(e.target.value)} className="h-10 text-base sm:text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-time" className="text-xs font-semibold text-muted-foreground">
                Time
              </label>
              <Input id="edit-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 text-base sm:text-sm" />
            </div>
          </div>
          {formError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !form}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
