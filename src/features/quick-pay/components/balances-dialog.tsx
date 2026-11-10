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
import type { BalancesData } from "../types";
import { istDateOf, istTimeOf } from "../datetime";
import { parseOpeningBalance } from "../validation";

export interface BalanceActions {
  getBalances: typeof getBalancesAction;
  setOpeningBalance: typeof setOpeningBalanceAction;
}

/** "View Balances": every bank with an editable opening balance and the balance worked out from the entries. */
export function BalancesDialog({ actions }: { actions: BalanceActions }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Landmark /> View Balances
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Bank balances</DialogTitle>
          <DialogDescription>
            Current balance = Opening balance + credits − debits, counting only entries from the opening date and time onwards. Set an opening balance with its date and time and press Save; balances update by themselves whenever entries are added, edited or deleted.
          </DialogDescription>
        </DialogHeader>
        <BalancesBody actions={actions} />
      </DialogContent>
    </Dialog>
  );
}

function BalancesBody({ actions }: { actions: BalanceActions }) {
  const [data, setData] = useState<BalancesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Loaded fresh every time the dialog opens (this component only exists while it is open).
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
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading balances…
      </p>
    );
  }
  if (data.groups.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No banks yet. Add one in Customized Settings.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Account</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Opening balance, date and time</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Credits</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Debits</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Current balance</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map((group) => (
              <GroupRows key={group.id} group={group} actions={actions} onChange={setData} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2" colSpan={4}>Total across all banks</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(data.totalCurrentPaise)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  actions,
  onChange,
}: {
  group: BalancesData["groups"][number];
  actions: BalanceActions;
  onChange: (next: BalancesData) => void;
}) {
  const hasAccounts = group.accounts.length > 0;
  return (
    <>
      {hasAccounts ? (
        <tr className="border-t bg-muted/20">
          <th scope="row" className="px-3 py-2 text-left font-semibold">{group.name}</th>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(group.total.openingPaise)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(group.total.creditsPaise)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(group.total.debitsPaise)}</td>
          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(group.total.currentPaise)}</td>
        </tr>
      ) : null}
      {group.accounts.map((line) => (
        <LineRow key={line.id} line={line} label={`${group.name} → ${line.name}`} indent actions={actions} onChange={onChange} />
      ))}
      {group.direct ? (
        <LineRow line={group.direct} label={hasAccounts ? `${group.name} (direct)` : group.name} indent={hasAccounts} actions={actions} onChange={onChange} />
      ) : null}
    </>
  );
}

function LineRow({
  line,
  label,
  indent,
  actions,
  onChange,
}: {
  line: BalanceLine;
  label: string;
  indent: boolean;
  actions: BalanceActions;
  onChange: (next: BalancesData) => void;
}) {
  const saved = (line.openingPaise / 100).toFixed(2);
  const savedAt = line.openingAt ? new Date(line.openingAt) : null;
  const savedDate = savedAt ? istDateOf(savedAt) : "";
  const savedTime = savedAt ? istTimeOf(savedAt) : "";
  const [text, setText] = useState(saved);
  const [date, setDate] = useState(savedDate);
  const [time, setTime] = useState(savedTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountDirty = text.trim() !== saved && parseOpeningBalance(text) !== line.openingPaise;
  const dirty = amountDirty || date !== savedDate || (date !== "" && time !== savedTime);

  async function save() {
    if (parseOpeningBalance(text) === null) {
      setError("Enter an amount like 2000 or -500.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await actions.setOpeningBalance({ accountId: line.id, amount: text, date: date || undefined, time: date ? time || "00:00" : undefined });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.balances);
    toast.success(`Opening balance of ${label} updated.`);
  }

  return (
    <tr className="border-t align-top">
      <th scope="row" className={cn("px-3 py-2 text-left font-normal", indent && "pl-8")}>{label}</th>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div className="relative w-32">
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
            <Input
              inputMode="decimal"
              aria-label={`Opening balance of ${label}`}
              aria-invalid={!!error}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && dirty) {
                  e.preventDefault();
                  void save();
                }
              }}
              className="h-8 pl-6 text-right tabular-nums"
            />
          </div>
          <Input
            type="date"
            aria-label={`Opening date of ${label}`}
            value={date}
            max={istDateOf(new Date())}
            onChange={(e) => {
              setDate(e.target.value);
              if (e.target.value && !time) setTime("00:00");
              setError(null);
            }}
            className="h-8 w-36"
          />
          <Input
            type="time"
            aria-label={`Opening time of ${label}`}
            value={time}
            disabled={!date}
            onChange={(e) => {
              setTime(e.target.value);
              setError(null);
            }}
            className="h-8 w-28"
          />
          <Button type="button" size="icon-sm" variant={dirty ? "default" : "ghost"} disabled={!dirty || saving} aria-label={`Save opening balance of ${label}`} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
          </Button>
        </div>
        {error ? <p role="alert" className="mt-1 text-right text-xs text-destructive">{error}</p> : null}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-success">{formatINR(line.creditsPaise)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatINR(line.debitsPaise)}</td>
      <td className={cn("px-3 py-2 text-right font-medium tabular-nums", line.currentPaise < 0 && "text-destructive")}>{formatINR(line.currentPaise)}</td>
    </tr>
  );
}
