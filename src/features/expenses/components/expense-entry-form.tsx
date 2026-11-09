"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { ExpenseActions } from "../actions";
import {
  METHOD_KINDS,
  type ExpenseActionResult,
  type ExpenseFormData,
  type MethodKind,
  type OptionKind,
  type OptionsResult,
} from "../types";
import { MAX_NOTES_LENGTH, validateExpenseInput, type ExpenseFieldErrors, type ExpenseFormInput } from "../validation";
import { AddOptionDialog, ConfirmDialog } from "@/components/shared/option-dialogs";
import { ChoiceChips } from "./choice-chips";
import { SplitSection } from "./split-section";

type DialogState = null | "method" | "account" | "party" | "category";

const emptySplit = (): ExpenseFormInput["split"] => ({ enabled: false, mode: "EQUAL", selected: [] });
const newRequestId = () => crypto.randomUUID();

export function ExpenseEntryForm({
  initialData,
  today,
  actions,
}: {
  initialData: ExpenseFormData;
  /** Today's date (YYYY-MM-DD) in the user's timezone. */
  today: string;
  actions: ExpenseActions;
}) {
  const [data, setData] = useState(initialData);

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(today);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [split, setSplit] = useState(emptySplit);

  const [errors, setErrors] = useState<ExpenseFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One id per form fill: sending the same one twice can never save two expenses.
  const [requestId, setRequestId] = useState(newRequestId);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [newMethodKind, setNewMethodKind] = useState<MethodKind>("BANK");
  const [removing, setRemoving] = useState<{ kind: OptionKind; id: string; name: string } | null>(null);

  const method = data.methods.find((m) => m.id === methodId) ?? null;
  const methodHasAccounts = (method?.accounts.length ?? 0) > 0;
  const totalPaise = useMemo(() => {
    const parsed = parseAmountInput(amount);
    return parsed !== null && parsed > 0 ? parsed : null;
  }, [amount]);

  const clearError = (field: keyof ExpenseFieldErrors) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  // ── Choices: add and remove ──────────────────────────────────────────────

  /** Runs an "add" action; on success refreshes the choices and lets the caller select the new one. */
  async function saveOption(
    run: () => Promise<ExpenseActionResult<OptionsResult>>,
    afterAdd: (createdId: string | undefined) => void,
  ): Promise<string | null> {
    const result = await run();
    if (!result.ok) return result.error;
    setData(result.data);
    afterAdd(result.createdId);
    return null;
  }

  const addMethod = (name: string) =>
    saveOption(
      () => actions.addPaymentMethod({ name, kind: newMethodKind }),
      (id) => {
        if (!id) return;
        setMethodId(id);
        setAccountId(null);
        clearError("method");
        clearError("account");
      },
    );

  const addAccount = (name: string) =>
    methodId
      ? saveOption(
          () => actions.addAccount({ methodId, name }),
          (id) => {
            if (!id) return;
            setAccountId(id);
            clearError("account");
          },
        )
      : Promise.resolve("Choose a payment method first.");

  const addParty = (name: string) =>
    saveOption(
      () => actions.addParty({ name }),
      (id) => {
        if (!id) return;
        if (split.enabled) {
          setSplit((s) => ({ ...s, selected: [...s.selected, { partyId: id, amount: "" }] }));
        } else {
          setPartyId(id);
          clearError("party");
        }
      },
    );

  const addCategory = (name: string) =>
    saveOption(
      () => actions.addCategory({ name }),
      (id) => {
        if (!id) return;
        setCategoryId(id);
        clearError("category");
      },
    );

  async function removeOption(): Promise<string | null> {
    if (!removing) return null;
    const result = await actions.archiveOption({ kind: removing.kind, id: removing.id });
    if (!result.ok) return result.error;
    setData(result.data);
    // Forget the removed choice if it was selected.
    if (removing.kind === "method" && removing.id === methodId) {
      setMethodId(null);
      setAccountId(null);
    }
    if (removing.kind === "account" && removing.id === accountId) setAccountId(null);
    if (removing.kind === "category" && removing.id === categoryId) setCategoryId(null);
    if (removing.kind === "party") {
      if (removing.id === partyId) setPartyId(null);
      setSplit((s) => ({ ...s, selected: s.selected.filter((x) => x.partyId !== removing.id) }));
    }
    return null;
  }

  // ── Split on and off ─────────────────────────────────────────────────────

  function toggleSplit(enabled: boolean) {
    clearError("split");
    clearError("party");
    // Turning split on starts with the person already chosen in "To".
    setSplit(enabled ? { enabled: true, mode: "EQUAL", selected: partyId ? [{ partyId, amount: "" }] : [] } : emptySplit());
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  function reset() {
    setAmount("");
    setNotes("");
    setDate(today);
    setMethodId(null);
    setAccountId(null);
    setCategoryId(null);
    setPartyId(null);
    setSplit(emptySplit());
    setErrors({});
    setFormError(null);
    setRequestId(newRequestId());
  }

  function scrollToFirst(found: ExpenseFieldErrors) {
    const order: (keyof ExpenseFieldErrors)[] = ["amount", "notes", "date", "method", "account", "party", "category", "split"];
    const first = order.find((key) => found[key]);
    if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    const input: ExpenseFormInput = { amount, notes, date, methodId, accountId, categoryId, partyId, split };
    const checked = validateExpenseInput(input, { methodHasAccounts, today });
    if (!checked.ok) {
      setErrors(checked.errors);
      scrollToFirst(checked.errors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    let result: Awaited<ReturnType<ExpenseActions["createExpense"]>>;
    try {
      result = await actions.createExpense({ requestId, ...input });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and try again." };
    }
    setSubmitting(false);

    if (!result.ok) {
      const found = (result.fieldErrors ?? {}) as ExpenseFieldErrors;
      setErrors(found);
      setFormError(result.error);
      toast.error(result.error);
      scrollToFirst(found);
      return;
    }
    toast.success(result.duplicate ? "That expense was already saved." : `Expense of ${formatINR(result.amountPaise)} added.`);
    reset();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add expense</CardTitle>
        <CardDescription>Record what you spent, how you paid, and who it is for.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate method="post" className="space-y-6">
          {/* Value */}
          <Block id="amount" label="Value" htmlFor="expense-amount" error={errors.amount}>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl text-muted-foreground">
                ₹
              </span>
              <Input
                id="expense-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? "error-amount" : undefined}
                onChange={(e) => {
                  setAmount(e.target.value);
                  clearError("amount");
                  clearError("split");
                }}
                className="h-14 pl-10 text-2xl font-semibold tabular-nums"
              />
            </div>
          </Block>

          {/* Notes and date */}
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <Block id="notes" label="Notes" htmlFor="expense-notes" error={errors.notes}>
              <Input
                id="expense-notes"
                autoComplete="off"
                placeholder="What was it for?"
                maxLength={MAX_NOTES_LENGTH}
                value={notes}
                aria-invalid={!!errors.notes}
                aria-describedby={errors.notes ? "error-notes" : undefined}
                onChange={(e) => {
                  setNotes(e.target.value);
                  clearError("notes");
                }}
              />
            </Block>
            <Block id="date" label="Date" htmlFor="expense-date" error={errors.date}>
              <Input
                id="expense-date"
                type="date"
                max={today}
                value={date}
                aria-invalid={!!errors.date}
                aria-describedby={errors.date ? "error-date" : undefined}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearError("date");
                }}
              />
            </Block>
          </div>

          {/* By: payment method, then the account under it */}
          <Block id="method" label="By" error={errors.method}>
            <ChoiceChips
              label="Payment method"
              items={data.methods}
              value={methodId}
              onChange={(id) => {
                setMethodId(id);
                setAccountId(null);
                clearError("method");
                clearError("account");
              }}
              addLabel="Add payment method"
              onAdd={() => setDialog("method")}
              onRemove={(item) => setRemoving({ kind: "method", id: item.id, name: item.name })}
              invalid={!!errors.method}
              describedBy={errors.method ? "error-method" : undefined}
            />
          </Block>

          {method ? (
            <Block id="account" label={`Account under ${method.name}`} error={errors.account}>
              <ChoiceChips
                label={`Account under ${method.name}`}
                items={method.accounts}
                value={accountId}
                onChange={(id) => {
                  setAccountId(id);
                  clearError("account");
                }}
                addLabel="Add account"
                onAdd={() => setDialog("account")}
                onRemove={(item) => setRemoving({ kind: "account", id: item.id, name: item.name })}
                invalid={!!errors.account}
                describedBy={errors.account ? "error-account" : undefined}
                emptyHint={`Optional. Add the bank accounts you pay with through ${method.name}.`}
              />
            </Block>
          ) : null}

          {/* To: one person, or the split below */}
          {!split.enabled ? (
            <Block id="party" label="To" error={errors.party}>
              <ChoiceChips
                label="Who is it for"
                items={data.parties}
                value={partyId}
                onChange={(id) => {
                  setPartyId(id);
                  clearError("party");
                }}
                addLabel="Add user"
                onAdd={() => setDialog("party")}
                onRemove={(item) => setRemoving({ kind: "party", id: item.id, name: item.name })}
                invalid={!!errors.party}
                describedBy={errors.party ? "error-party" : undefined}
              />
            </Block>
          ) : null}

          {/* Category */}
          <Block id="category" label="Category" error={errors.category}>
            <ChoiceChips
              label="Category"
              items={data.categories}
              value={categoryId}
              onChange={(id) => {
                setCategoryId(id);
                clearError("category");
              }}
              addLabel="Add category"
              onAdd={() => setDialog("category")}
              onRemove={(item) => setRemoving({ kind: "category", id: item.id, name: item.name })}
              invalid={!!errors.category}
              describedBy={errors.category ? "error-category" : undefined}
            />
          </Block>

          {/* Split */}
          <div id="field-split" className="scroll-mt-24 space-y-3">
            <label className="flex w-fit cursor-pointer items-center gap-3 text-sm font-medium">
              <Checkbox checked={split.enabled} onCheckedChange={(next) => toggleSplit(next === true)} />
              Split this expense between people
            </label>
            {split.enabled ? (
              <SplitSection
                parties={data.parties}
                totalPaise={totalPaise}
                state={split}
                onChange={(next) => {
                  setSplit(next);
                  clearError("split");
                }}
                onAddUser={() => setDialog("party")}
                error={errors.split}
              />
            ) : null}
          </div>

          {formError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "Saving…" : "Add Expense"}
          </Button>
        </form>
      </CardContent>

      {/* Dialogs */}
      <AddOptionDialog
        open={dialog === "method"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Add payment method"
        description="For example PhonePe, Cash or a new bank."
        placeholder="Payment method name"
        extra={
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Type</legend>
            <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
              {METHOD_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={newMethodKind === k.value}
                  onClick={() => setNewMethodKind(k.value)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    newMethodKind === k.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </fieldset>
        }
        onSave={addMethod}
      />
      <AddOptionDialog
        open={dialog === "account"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Add account under ${method?.name ?? "method"}`}
        description="For example a bank linked to this payment method."
        placeholder="Account name"
        onSave={addAccount}
      />
      <AddOptionDialog
        open={dialog === "party"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Add user"
        description="Someone an expense can be for or split with."
        placeholder="Name"
        onSave={addParty}
      />
      <AddOptionDialog
        open={dialog === "category"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Add category"
        description="For example Travel, Groceries or Rent."
        placeholder="Category name"
        onSave={addCategory}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove "${removing?.name ?? ""}"?`}
        description={
          removing?.kind === "method"
            ? "It disappears from the list, together with its accounts. Expenses you already saved keep their details."
            : "It disappears from the list. Expenses you already saved keep their details."
        }
        onConfirm={removeOption}
      />
    </Card>
  );
}

/** Label + control + error, with ids the form can scroll to and screen readers can read. */
function Block({
  id,
  label,
  htmlFor,
  error,
  children,
}: {
  id: string;
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={`field-${id}`} className="scroll-mt-24 space-y-2">
      {htmlFor ? <Label htmlFor={htmlFor}>{label}</Label> : <p className="text-sm leading-none font-medium">{label}</p>}
      {children}
      {error ? (
        <p id={`error-${id}`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
