"use client";

import { Landmark, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { getBalancesAction, setOpeningBalanceAction } from "../actions";
import type { BalanceLine } from "../balances";
import { istDateOf, istTimeOf } from "../datetime";
import type { BalancesData } from "../types";
import { parseOpeningBalance } from "../validation";

export interface BalanceActions {
  getBalances: typeof getBalancesAction;
  setOpeningBalance: typeof setOpeningBalanceAction;
}

interface Line {
  line: BalanceLine;
  /** Just the bank's own name: "Canara", "HDFC". */
  name: string;
}

/** Every bank you can pick, as one flat list with short names. */
function flatten(data: BalancesData): Line[] {
  return data.groups.flatMap((g) => [
    ...g.accounts.map((line) => ({ line, name: line.name })),
    ...(g.direct ? [{ line: g.direct, name: g.accounts.length > 0 ? `${g.name} (direct)` : g.name }] : []),
  ]);
}

/**
 * "View Balances": one row per bank. Enter the balance a bank had at a date and time; its current balance is then worked out
 * as that balance plus every credit and minus every debit after that moment, and it follows your transactions from then on.
 */
export function BalancesDialog({ actions }: { actions: BalanceActions }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Landmark /> View Balances
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(48rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Bank balances</DialogTitle>
          <DialogDescription>
            Enter a bank&apos;s balance at a date and time and press Save. Its balance now is that amount plus the credits and minus the debits after it, and updates by itself whenever transactions are added, edited, deleted or imported.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open: it loads fresh each time. */}
        {open ? <BalancesBody actions={actions} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function BalancesBody({ actions }: { actions: BalanceActions }) {
  const [data, setData] = useState<BalancesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void actions.getBalances().then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result.balances);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [actions]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <p className="flex min-w-0 items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading balances…
      </p>
    );
  }
  const lines = flatten(data);
  if (lines.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No banks yet. Add one in Customized Settings.</p>;

  return (
    <div className="min-w-0 space-y-3">
      <div className="hidden grid-cols-[minmax(6rem,1fr)_minmax(0,2fr)_9rem_8rem] gap-3 px-3 text-xs font-medium text-muted-foreground md:grid">
        <span>Account</span>
        <span>Date and Time</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Balance now</span>
      </div>
      <ul className="divide-y rounded-xl border">
        {lines.map(({ line, name }) => (
          <BalanceRow key={line.id} line={line} name={name} actions={actions} onChange={setData} />
        ))}
      </ul>
      <p className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm font-semibold">
        <span>Total across all banks</span>
        <span className="tabular-nums">{formatINR(data.totalCurrentPaise)}</span>
      </p>
    </div>
  );
}

function BalanceRow({ line, name, actions, onChange }: { line: BalanceLine; name: string; actions: BalanceActions; onChange: (next: BalancesData) => void }) {
  const savedAmount = (line.openingPaise / 100).toFixed(2);
  const savedAt = line.openingAt ? new Date(line.openingAt) : null;
  const savedDate = savedAt ? istDateOf(savedAt) : "";
  const savedTime = savedAt ? istTimeOf(savedAt) : "";

  const [amount, setAmount] = useState(savedAmount);
  const [date, setDate] = useState(savedDate);
  const [time, setTime] = useState(savedTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountDirty = amount.trim() !== savedAmount && parseOpeningBalance(amount) !== line.openingPaise;
  const dirty = amountDirty || date !== savedDate || (date !== "" && time !== savedTime);

  async function save() {
    if (parseOpeningBalance(amount) === null) return setError("Enter an amount like 2000 or -500.");
    setSaving(true);
    setError(null);
    const result = await actions.setOpeningBalance({ accountId: line.id, amount, date: date || undefined, time: date ? time || "00:00" : undefined });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onChange(result.balances);
    toast.success(`${name} updated. Its balance now follows your transactions.`);
  }

  return (
    <li className="space-y-2 px-3 py-3 md:grid md:grid-cols-[minmax(6rem,1fr)_minmax(0,2fr)_9rem_8rem] md:items-start md:gap-3 md:space-y-0">
      <div className="flex items-center justify-between gap-2 md:block">
        <p className="font-medium">{name}</p>
        {/* Phones show the balance now beside the name */}
        <p className={cn("font-semibold tabular-nums md:hidden", line.currentPaise < 0 && "text-destructive")}>{formatINR(line.currentPaise)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          type="date"
          aria-label={`Date of the balance of ${name}`}
          value={date}
          max={istDateOf(new Date())}
          onChange={(e) => {
            setDate(e.target.value);
            if (e.target.value && !time) setTime("00:00");
            setError(null);
          }}
          className="h-9 w-36 text-base sm:text-sm"
        />
        <Input
          type="time"
          aria-label={`Time of the balance of ${name}`}
          value={time}
          disabled={!date}
          onChange={(e) => {
            setTime(e.target.value);
            setError(null);
          }}
          className="h-9 w-28 text-base sm:text-sm"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
            ₹
          </span>
          <Input
            inputMode="decimal"
            aria-label={`Balance of ${name} at that date and time`}
            aria-invalid={!!error}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) {
                e.preventDefault();
                void save();
              }
            }}
            className="h-9 pl-6 text-right text-base tabular-nums sm:text-sm"
          />
        </div>
        <Button type="button" size="icon-sm" variant={dirty ? "default" : "ghost"} disabled={!dirty || saving} aria-label={`Save the balance of ${name}`} onClick={save}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
        </Button>
      </div>

      <div className="hidden text-right md:block">
        <p className={cn("font-semibold tabular-nums", line.currentPaise < 0 && "text-destructive")}>{formatINR(line.currentPaise)}</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          +{formatINR(line.creditsPaise)} −{formatINR(line.debitsPaise)}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive md:col-span-4">
          {error}
        </p>
      ) : null}
    </li>
  );
}
