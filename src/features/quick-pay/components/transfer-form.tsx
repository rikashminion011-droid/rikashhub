"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/finance";
import type { saveTransferAction } from "../actions";
import { groupBanks } from "../cascade";
import { visibleBanks } from "../availability";
import { nextSwitch } from "../switching";
import type { QuickPayOptions } from "../types";
import { MAX_REASON_LENGTH, validateTransfer, type TransferErrors } from "../validation";
import { CycleButton } from "./cycle-button";
import { notifyDataChanged } from "./period-context";

const labelClass = "text-xs font-semibold text-muted-foreground";
const newRequestId = () => crypto.randomUUID();

/**
 * Self Transfer: move money from one of your banks to another. Pick the bank it leaves and the bank it goes to, the amount
 * and a reason, and save. Both balances change at once, and the transfer is one transaction in GPay Transactions.
 */
export function TransferForm({ options, saveTransfer }: { options: QuickPayOptions; saveTransfer: typeof saveTransferAction }) {
  const router = useRouter();
  // Banks switched off in Customized Settings are not offered here either.
  const banks = useMemo(() => visibleBanks(options), [options]);
  const groups = useMemo(() => groupBanks(banks), [banks]);
  const ids = useMemo(() => banks.map((b) => b.id), [banks]);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<TransferErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError(null);
    const checked = validateTransfer({ fromId, toId, amount, reason });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    let result: Awaited<ReturnType<typeof saveTransferAction>>;
    try {
      result = await saveTransfer({ requestId, fromId, toId, amount, reason });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and try again." };
    }
    setSaving(false);
    if (!result.ok) {
      setErrors((result.fieldErrors ?? {}) as TransferErrors);
      setFormError(result.error);
      toast.error(result.error);
      return;
    }
    const name = (id: string | null) => options.banks.find((b) => b.id === id)?.label ?? "";
    toast.success(result.duplicate ? "That transfer was already saved." : `Moved ${formatINR(result.amountPaise)} from ${name(fromId)} to ${name(toId)}.`, {
      description: "Both bank balances are updated. It shows as one transaction in GPay Transactions.",
    });
    setAmount("");
    setReason("");
    setRequestId(newRequestId());
    notifyDataChanged();
    router.refresh();
  }

  const bank = (which: "from" | "to") => {
    const value = which === "from" ? fromId : toId;
    const set = which === "from" ? setFromId : setToId;
    const error = errors[which];
    return (
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={`tr-${which}`} className={labelClass}>
          {which === "from" ? "From bank" : "To bank"}
        </label>
        <div className="flex items-center gap-2">
          <CascadingSelect
            id={`tr-${which}`}
            ariaLabel={which === "from" ? "From bank" : "To bank"}
            groups={groups}
            value={value}
            onChange={(v) => {
              set(v);
              setErrors((e) => ({ ...e, [which]: undefined }));
            }}
            placeholder="Choose a bank"
            searchPlaceholder="Search banks…"
            emptyText="No bank found."
            invalid={!!error}
            className="min-w-0 flex-1"
          />
          {options.settings.switch.bank.enabled ? (
            <CycleButton
              label={`Switch the ${which === "from" ? "From" : "To"} bank to the next one`}
              disabled={ids.length < 2}
              onClick={() => {
                set(nextSwitch(options.settings.switch.bank, ids, value));
                setErrors((e) => ({ ...e, [which]: undefined }));
              }}
            />
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {bank("from")}
        <ArrowRight className="mt-8 hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
        {bank("to")}
      </div>

      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="space-y-1">
          <label htmlFor="tr-amount" className={labelClass}>
            Amount
          </label>
          <div className="flex overflow-hidden rounded-xl border border-amber-300 bg-amber-50/60 focus-within:ring-3 focus-within:ring-amber-300/40 aria-[invalid=true]:border-destructive" aria-invalid={!!errors.amount}>
            <span aria-hidden className="flex w-9 items-center justify-center bg-amber-100/60 text-base">
              ₹
            </span>
            <Input
              id="tr-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErrors((x) => ({ ...x, amount: undefined }));
              }}
              className="h-10 min-w-0 rounded-none border-0 bg-transparent px-2 text-lg font-semibold tabular-nums shadow-none focus-visible:ring-0"
            />
          </div>
          {errors.amount ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.amount}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <label htmlFor="tr-reason" className={labelClass}>
            Reason
          </label>
          <Input id="tr-reason" autoComplete="off" placeholder="What was it for?" maxLength={MAX_REASON_LENGTH} value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 text-base sm:text-sm" />
        </div>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-11 w-full rounded-xl bg-neutral-900 text-base text-white hover:bg-neutral-800" disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Check />}
        {saving ? "Saving…" : "Save Transfer"}
      </Button>
    </form>
  );
}
