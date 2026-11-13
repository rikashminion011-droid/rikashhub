"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { QuickAddActions, QuickPayActions } from "../actions";
import { emptyState, withKind, type FormState } from "../entry-state";
import { resolveShares, type ShareInput, type SplitKind } from "../shares";
import type { QuickPayOptions, TxRow } from "../types";
import type { QuickPayErrors } from "../validation";
import { SplitControl } from "./split-control";
import { useQuickAdd } from "./use-quick-add";

export interface SplitChoice {
  kind: SplitKind;
  shares: ShareInput[];
}

export type SplitDialogActions = Pick<QuickPayActions, "getOptions"> & QuickAddActions;

/** Choose who a transaction is shared with (a Split or a Debt) and each person's share, from the Split box in the table. */
export function SplitDialog({
  row,
  options,
  actions,
  onClose,
  onSave,
}: {
  /** The transaction being shared, or null when closed. */
  row: TxRow | null;
  options: QuickPayOptions;
  actions: SplitDialogActions;
  onClose: () => void;
  onSave: (choice: SplitChoice) => Promise<string | null>;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        {row ? <SplitBody key={row.id} row={row} options={options} actions={actions} onClose={onClose} onSave={onSave} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SplitBody({
  row,
  options: initialOptions,
  actions,
  onClose,
  onSave,
}: {
  row: TxRow;
  options: QuickPayOptions;
  actions: SplitDialogActions;
  onClose: () => void;
  onSave: (choice: SplitChoice) => Promise<string | null>;
}) {
  // A copy, so a person added from inside this pop-up shows up straight away.
  const [options, setOptions] = useState(initialOptions);
  const adders = useQuickAdd(actions, setOptions);
  const isDebit = row.type === "DEBIT";

  const [form, setFormState] = useState<FormState>(() => {
    const base = { ...emptyState(initialOptions.settings, initialOptions), amount: (row.amountPaise / 100).toFixed(2), type: row.type };
    if (row.shares.length > 0) {
      // Editing: start from what is saved, and never re-divide anyone's share.
      return {
        ...base,
        splitKind: row.splitKind ?? "SPLIT",
        shares: row.shares.map((x) => ({ partyId: x.partyId, method: "PERCENT" as const, value: String(Number(x.percent.toFixed(2))), edited: true })),
      };
    }
    return withKind({ ...base, splitKind: "SPLIT", shares: [] }, "SPLIT", initialOptions.settings, initialOptions.settings.split.defaultPartyId);
  });
  const [errors, setErrors] = useState<QuickPayErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setForm = useCallback((update: (f: FormState) => FormState) => setFormState((f) => update(f)), []);
  const clearError = useCallback((key: keyof QuickPayErrors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);

  async function save() {
    const kind = form.splitKind ?? "SPLIT";
    if (form.shares.length === 0) return setErrors({ split: "Choose the people this is shared with." });
    const lines = form.shares.map(({ partyId, method, value }) => ({ partyId, method, value }));
    const resolved = resolveShares(row.amountPaise, lines, parseAmountInput);
    if (!resolved.ok) return setErrors({ splitValue: resolved.error });
    setSaving(true);
    setError(null);
    const problem = await onSave({ kind, shares: lines });
    setSaving(false);
    if (problem) return setError(problem);
    onClose();
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>{row.shares.length > 0 ? "Change who this is shared with" : "Share this transaction"}</DialogTitle>
        <DialogDescription>
          {isDebit ? "Debit" : "Credit"} of {formatINR(row.amountPaise)}
          {row.reason || row.details ? ` · ${row.reason || row.details}` : ""}
        </DialogDescription>
      </DialogHeader>

      {/* Split or Debt: only one of the two at a time */}
      <div className="flex items-center gap-5" role="group" aria-label="Share as">
        <label className={cn("flex h-9 items-center gap-2 text-sm font-semibold", form.splitKind === "DEBT" ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
          <Checkbox checked={form.splitKind === "SPLIT"} disabled={form.splitKind === "DEBT"} onCheckedChange={(next) => setForm((f) => withKind(f, next === true ? "SPLIT" : null, options.settings, null))} />
          {options.settings.fields.labels.split}
        </label>
        {isDebit ? (
          <label className={cn("flex h-9 items-center gap-2 text-sm font-semibold", form.splitKind === "SPLIT" ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
            <Checkbox checked={form.splitKind === "DEBT"} disabled={form.splitKind === "SPLIT"} onCheckedChange={(next) => setForm((f) => withKind(f, next === true ? "DEBT" : null, options.settings, null))} />
            Debt
          </label>
        ) : null}
      </div>

      {form.splitKind ? <SplitControl form={form} setForm={setForm} options={options} errors={errors} clearError={clearError} idPrefix="split" onAddPerson={adders.addPerson} /> : <p className="text-sm text-muted-foreground">Tick Split or Debt to choose people.</p>}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !form.splitKind}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
