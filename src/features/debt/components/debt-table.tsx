"use client";

import { Loader2, ReceiptText, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { formatPercent } from "@/features/quick-pay/split";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { DebtActions } from "../actions";
import type { DebtHistory, DebtRow, DebtSummary } from "../types";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

/** What is left to pay, in words and colour: owes, settled, or paid ahead. */
function Remaining({ paise }: { paise: number }) {
  if (paise === 0) return <span className="font-semibold text-success tabular-nums">Settled</span>;
  return (
    <span className={cn("font-semibold tabular-nums", paise > 0 ? "text-destructive" : "text-success")}>
      {formatINR(Math.abs(paise))}
      {paise < 0 ? " ahead" : ""}
    </span>
  );
}

/** One row for every person: what they owe from splits, what they have paid, and what remains. */
export function DebtTable({ summary, actions }: { summary: DebtSummary; actions: DebtActions }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (summary.rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
        <UsersRound className="size-7 text-muted-foreground" aria-hidden />
        <p className="font-medium">No users yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">Add the people you split expenses with in Customized Settings. They appear here automatically.</p>
        <Link href="/quick-pay/settings?tab=users" className="mt-1 text-sm font-medium underline underline-offset-4">
          Add users
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Wide screens: a table */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">User Name</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Total Split Amount</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Split Percentage</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount Paid</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Remaining Amount</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Transaction Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {summary.rows.map((row) => (
              <tr key={row.partyId} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(row.totalSplitPaise)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.splitPercent === null ? "—" : formatPercent(row.splitPercent)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-success">{formatINR(row.paidPaise)}</td>
                <td className="px-4 py-3 text-right">
                  <Remaining paise={row.remainingPaise} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(row.partyId)}>
                    <ReceiptText /> View{row.splitCount ? ` (${row.splitCount})` : ""}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatINR(summary.totalSplitPaise)}</td>
              <td />
              <td className="px-4 py-3 text-right tabular-nums text-success">{formatINR(summary.totalPaidPaise)}</td>
              <td className="px-4 py-3 text-right">
                <Remaining paise={summary.totalRemainingPaise} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phones: a card for each person */}
      <ul className="space-y-3 md:hidden">
        {summary.rows.map((row) => (
          <li key={row.partyId} className="space-y-3 rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold">{row.name}</p>
              <Remaining paise={row.remainingPaise} />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Split total</dt>
                <dd className="font-medium tabular-nums">{formatINR(row.totalSplitPaise)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Split %</dt>
                <dd className="font-medium tabular-nums">{row.splitPercent === null ? "—" : formatPercent(row.splitPercent)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="font-medium tabular-nums text-success">{formatINR(row.paidPaise)}</dd>
              </div>
            </dl>
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpenId(row.partyId)}>
              <ReceiptText /> Transaction details{row.splitCount ? ` (${row.splitCount})` : ""}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(48rem,calc(100vw-2rem))]">
          {openId ? <HistoryBody key={openId} partyId={openId} actions={actions} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function HistoryBody({ partyId, actions }: { partyId: string; actions: DebtActions }) {
  const router = useRouter();
  const [history, setHistory] = useState<DebtHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void actions.getHistory({ partyId }).then((result) => {
      if (cancelled) return;
      if (result.ok) setHistory(result.history);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [actions, partyId]);

  if (error) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Transaction details</DialogTitle>
        </DialogHeader>
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      </>
    );
  }
  if (!history) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Transaction details</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      </>
    );
  }

  const { row } = history;
  const update = (next: DebtHistory) => {
    setHistory(next);
    router.refresh(); // the totals behind the dialog
  };

  return (
    <div className="min-w-0 space-y-5">
      <DialogHeader>
        <DialogTitle>{row.name}</DialogTitle>
        <DialogDescription>Every transaction split with {row.name}, and every payment they have made.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total split" value={formatINR(row.totalSplitPaise)} />
        <Stat label="Paid" value={formatINR(row.paidPaise)} tone="good" />
        <Stat label={row.remainingPaise < 0 ? "Paid ahead" : "Remaining"} value={formatINR(Math.abs(row.remainingPaise))} tone={row.remainingPaise > 0 ? "bad" : "good"} />
      </div>

      <PaymentForm partyId={row.partyId} actions={actions} onDone={update} />

      <section aria-labelledby="payments-heading" className="space-y-2">
        <h3 id="payments-heading" className="text-sm font-semibold">Payments ({history.payments.length})</h3>
        {history.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {history.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-semibold tabular-nums text-success">{formatINR(p.amountPaise)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.note || "—"}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{when.format(new Date(p.paidAt))}</span>
                <DeletePayment id={p.id} partyId={row.partyId} actions={actions} onDone={update} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="splits-heading" className="space-y-2">
        <h3 id="splits-heading" className="text-sm font-semibold">Split transactions ({history.splits.length})</h3>
        {history.splits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is split with {row.name} yet. Tick Split in Quick Entry and choose them.</p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-xl border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Date and time</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Details</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Transaction</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Share</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.splits.map((s) => (
                  <tr key={s.transactionId}>
                    <td className="px-3 py-2 whitespace-nowrap">{when.format(new Date(s.occurredAt))}</td>
                    <td className="max-w-48 truncate px-3 py-2" title={s.description}>{s.description || <span className="text-muted-foreground">—</span>}{s.bank ? <span className="text-muted-foreground"> · {s.bank}</span> : null}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(s.txAmountPaise)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPercent(s.percent)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatINR(s.sharePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums sm:text-lg", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{value}</p>
    </div>
  );
}

function PaymentForm({ partyId, actions, onDone }: { partyId: string; actions: DebtActions; onDone: (h: DebtHistory) => void }) {
  const now = new Date();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(istDateOf(now));
  const [time, setTime] = useState(istTimeOf(now));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await actions.addPayment({ partyId, amount, date, time, note });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setAmount("");
    setNote("");
    toast.success("Payment recorded. The remaining amount is updated.");
    onDone(result.history);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="text-sm font-semibold">Record a payment</p>
      <div className="grid gap-2 sm:grid-cols-[8rem_9rem_7rem_minmax(0,1fr)_auto]">
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
          <Input aria-label="Amount paid" inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 pl-6 text-base tabular-nums sm:text-sm" />
        </div>
        <Input aria-label="Date paid" type="date" value={date} max={istDateOf(new Date())} onChange={(e) => setDate(e.target.value)} className="h-10 text-base sm:text-sm" />
        <Input aria-label="Time paid" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 text-base sm:text-sm" />
        <Input aria-label="Note" placeholder="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="h-10 text-base sm:text-sm" />
        <Button type="submit" disabled={saving || amount.trim() === ""}>
          {saving ? <Loader2 className="animate-spin" /> : null} Add payment
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function DeletePayment({ id, partyId, actions, onDone }: { id: string; partyId: string; actions: DebtActions; onDone: (h: DebtHistory) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Delete this payment"
      disabled={busy}
      className="text-muted-foreground hover:text-destructive"
      onClick={async () => {
        setBusy(true);
        const result = await actions.deletePayment({ id, partyId });
        setBusy(false);
        if (!result.ok) return toast.error(result.error);
        toast.success("Payment deleted.");
        onDone(result.history);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}

export type { DebtRow };
