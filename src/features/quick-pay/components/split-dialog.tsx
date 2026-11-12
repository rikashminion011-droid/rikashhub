"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { emptyState, type FormState } from "../entry-state";
import { resolveSplit } from "../split";
import { formatINR, parseAmountInput } from "@/lib/finance";
import type { QuickPayOptions, TxRow } from "../types";
import type { QuickPayErrors } from "../validation";
import { SplitControl } from "./split-control";

export interface SplitChoice {
  partyId: string;
  method: "PERCENT" | "FIXED";
  value: string;
}

/** Choose who a transaction is split with and their share, from the Split checkbox in the table. */
export function SplitDialog({
  row,
  options,
  onClose,
  onSave,
}: {
  /** The transaction being split, or null when closed. */
  row: TxRow | null;
  options: QuickPayOptions;
  onClose: () => void;
  onSave: (choice: SplitChoice) => Promise<string | null>;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{row ? <SplitBody key={row.id} row={row} options={options} onClose={onClose} onSave={onSave} /> : null}</DialogContent>
    </Dialog>
  );
}

function SplitBody({ row, options, onClose, onSave }: { row: TxRow; options: QuickPayOptions; onClose: () => void; onSave: (choice: SplitChoice) => Promise<string | null> }) {
  const [form, setFormState] = useState<FormState>(() => ({
    ...emptyState(options.settings, options),
    amount: (row.amountPaise / 100).toFixed(2),
    splitEnabled: true,
    // Editing an existing split starts from what it is now; a new one from the defaults in Customized Settings.
    partyId: row.partyId ?? options.settings.split.defaultPartyId,
    ...(row.splitPercent !== null ? { splitMethod: "PERCENT" as const, splitValue: String(Number(row.splitPercent.toFixed(2))) } : {}),
  }));
  const [errors, setErrors] = useState<QuickPayErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setForm = useCallback((update: (f: FormState) => FormState) => setFormState((f) => update(f)), []);
  const clearError = useCallback((key: keyof QuickPayErrors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);

  async function save() {
    if (!form.partyId) return setErrors({ split: "Choose the person this is split with." });
    const resolved = resolveSplit(row.amountPaise, { method: form.splitMethod, value: form.splitValue }, parseAmountInput);
    if (!resolved.ok) return setErrors({ splitValue: resolved.error });
    setSaving(true);
    setError(null);
    const problem = await onSave({ partyId: form.partyId, method: form.splitMethod, value: form.splitValue });
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
        <DialogTitle>{row.partyId ? "Change split" : "Split this transaction"}</DialogTitle>
        <DialogDescription>
          {row.type === "DEBIT" ? "Debit" : "Credit"} of {formatINR(row.amountPaise)}
          {row.reason || row.details ? ` · ${row.reason || row.details}` : ""}
        </DialogDescription>
      </DialogHeader>
      <SplitControl form={form} setForm={setForm} options={options} errors={errors} clearError={clearError} idPrefix="split" addPersonHref="/quick-pay/settings?tab=users" />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save split
        </Button>
      </DialogFooter>
    </form>
  );
}
