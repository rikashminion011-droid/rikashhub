"use client";

import { Check, Link2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DatePicker, TimePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntryFields } from "@/features/quick-pay/components/entry-fields";
import { useQuickAdd } from "@/features/quick-pay/components/use-quick-add";
import type { QuickAddActions, QuickPayActions } from "@/features/quick-pay/actions";
import { defaultCreditSelection, emptyState, toQuickPayInput, withReason, type FormState } from "@/features/quick-pay/entry-state";
import { keywordsFor } from "@/features/quick-pay/availability";
import type { QuickPayOptions, RecentCredit } from "@/features/quick-pay/types";
import { validateQuickPayInput, type QuickPayErrors } from "@/features/quick-pay/validation";
import { formatINR } from "@/lib/finance";
import type { linkBankRowAction } from "../actions";

export type LinkActions = Pick<QuickPayActions, "saveEntry" | "getRecentCredits" | "getOptions"> & QuickAddActions & { link: typeof linkBankRowAction };

export interface LinkRow {
  id: string;
  date: string;
  time: string;
  accountId: string;
  bank: string;
  details: string;
  debitPaise: number;
  creditPaise: number;
}

/** A short Reason suggested from a statement narration: reference numbers and UPI / DR / CR codes are dropped. */
export function suggestReason(details: string): string {
  const words = details
    .replace(/\b\d{6,}\b/g, " ")
    .split(/[\s/|,\-_]+/)
    .filter((w) => w && !/^(upi|dr|cr|neft|imps|rtgs|atm|cash|pos|ach|ref|txn|ib|billpay|you|are|paying|for|an|order)$/i.test(w) && !/^[a-z0-9]{1,3}$/i.test(w) && !/@/.test(w) && !/^\*+/.test(w));
  return words.slice(0, 4).join(" ").slice(0, 40);
}

/**
 * Link: turns a statement row that is not in Transaction History into a Quick Entry transaction, in a compact pop-up (a bottom
 * sheet on a phone) with the same fields, lists and rules as Quick Entry. The amount, kind, bank, date and a short Reason are
 * filled in from the row; the rest (Category, Split, Debt, Credited by...) is what is missing. Save & Link saves the entry and
 * links the row to it, so the row leaves Not entered. The same statement row always makes the same entry, so pressing twice or
 * retrying after an error never makes a second transaction.
 */
export function LinkEntryDialog({ row, options: initialOptions, actions, onClose, onLinked }: { row: LinkRow | null; options: QuickPayOptions; actions: LinkActions; onClose: () => void; onLinked: () => void }) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-xl">
        {row ? <Body key={row.id} row={row} options={initialOptions} actions={actions} onClose={onClose} onLinked={onLinked} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({ row, options: initialOptions, actions, onClose, onLinked }: { row: LinkRow; options: QuickPayOptions; actions: LinkActions; onClose: () => void; onLinked: () => void }) {
  const [options, setOptions] = useState(initialOptions);
  const adders = useQuickAdd(actions, setOptions);
  const type = row.debitPaise > 0 ? "DEBIT" : "CREDIT";
  const paise = row.debitPaise || row.creditPaise;
  const [form, setFormState] = useState<FormState>(() => {
    const base = emptyState(initialOptions.settings, initialOptions);
    const reason = suggestReason(row.details);
    const filled: FormState = { ...base, amount: (paise / 100).toFixed(2), type, accountId: row.accountId, categoryId: type === base.type ? base.categoryId : null };
    return withReason(filled, reason, keywordsFor(initialOptions, type));
  });
  const [date, setDate] = useState(row.date);
  const [time, setTime] = useState(row.time !== "00:00" ? row.time : "12:00");
  const [errors, setErrors] = useState<QuickPayErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [credits, setCredits] = useState<RecentCredit[] | null>(null);
  const requested = useRef(false);

  const showCredits = form.type === "DEBIT" && form.creditsAdded;
  useEffect(() => {
    if (!showCredits || credits !== null || requested.current) return;
    requested.current = true;
    void actions.getRecentCredits().then((result) => {
      setCredits(result.ok ? result.credits : []);
      if (result.ok) setFormState((f) => (f.creditIds.length === 0 ? { ...f, creditIds: defaultCreditSelection(result.credits, options.settings.credits) } : f));
    });
  }, [showCredits, credits, actions, options.settings.credits]);

  const setForm = useCallback((update: (f: FormState) => FormState) => setFormState((f) => update(f)), []);
  const clearError = useCallback((key: keyof QuickPayErrors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError(null);
    // The amount, kind and bank are the statement's: they cannot be changed here, or the entry would not match the row.
    const input = toQuickPayInput({ ...form, amount: (paise / 100).toFixed(2), type, accountId: row.accountId });
    const checked = validateQuickPayInput(input);
    if (!checked.ok) return setErrors(checked.errors);
    setErrors({});
    setSaving(true);
    try {
      // The statement row's id is the request id: the same row can only ever make one entry.
      const saved = await actions.saveEntry({ requestId: row.id, entryId: null, ...input, date, time });
      if (!saved.ok) {
        setErrors((saved.fieldErrors ?? {}) as QuickPayErrors);
        setFormError(saved.error);
        return;
      }
      const linked = await actions.link({ rowId: row.id, transactionId: saved.id });
      if (!linked.ok) {
        setFormError(`${linked.error} The entry was saved; press Save & Link again to link it.`);
        return;
      }
      toast.success("Linked. The row is now entered in Transaction History.");
      onLinked();
      onClose();
    } catch {
      setFormError("Could not reach the server. Nothing may have been saved. Check your connection and press Save & Link again: it never makes a second entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-3">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Link2 className="size-4" aria-hidden /> Link to Transaction History
        </DialogTitle>
        <DialogDescription className="break-words">
          {row.bank} · {type === "DEBIT" ? "Debit" : "Credit"} {formatINR(paise)} · {row.details}
        </DialogDescription>
      </DialogHeader>
      <EntryFields form={form} setForm={setForm} errors={errors} clearError={clearError} options={options} idPrefix="link" credits={credits} loadingCredits={showCredits && credits === null} onToggleCredits={(on) => setFormState((f) => ({ ...f, creditsAdded: on, creditIds: on ? f.creditIds : [] }))} onAddCategory={adders.addCategory} onAddPerson={adders.addPerson} lock={{ amount: true, type: true, bank: true }} />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Date</label>
          <DatePicker ariaLabel="Date" value={date} max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })} onChange={setDate} className="h-10" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Time</label>
          <TimePicker ariaLabel="Time" value={time} onChange={setTime} className="h-10" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">The amount, kind and bank come from the statement. Change the amount or bank here and the entry would no longer match it, so they are set for you.</p>
      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          {saving ? "Saving…" : "Save & Link"}
        </Button>
      </DialogFooter>
    </form>
  );
}
