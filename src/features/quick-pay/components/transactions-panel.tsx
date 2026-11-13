"use client";

import { ArrowDownUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { deleteEntryAction, listPeriodAction } from "../actions";
import { formatTransactionWhen } from "../datetime";
import { periodRange, type Period } from "../period";
import type { QuickPayOptions, TxRow, TxTotals } from "../types";
import { EditEntryDialog, type EditActions } from "./edit-entry-dialog";
import { DATA_CHANGED_EVENT, notifyDataChanged, usePeriod } from "./period-context";

/** Sent by the page's tab bar when this tab is opened, so the list is read again and shows what was saved elsewhere. */
export const SHOW_TRANSACTIONS_EVENT = "quickpay:show-transactions";

export interface TransactionsPanelActions extends EditActions {
  listPeriod: typeof listPeriodAction;
  deleteEntry: typeof deleteEntryAction;
}

/**
 * The Transactions tab: the total debit and total credit for a period (Today, Yesterday, a week, a month, a year or any dates)
 * with the transactions of that period listed under it, each with Edit and Delete. A self transfer is one row.
 * The list can be turned between oldest first and newest first.
 */
export function TransactionsPanel({ today, options, actions }: { today: string; options: QuickPayOptions; actions: TransactionsPanelActions }) {
  const router = useRouter();
  // The period is chosen in the header above the tabs.
  const { period } = usePeriod(today);
  const [data, setData] = useState<{ rows: TxRow[]; totals: TxTotals; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oldestFirst, setOldestFirst] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TxRow | null>(null);
  const latest = useRef(0);

  const load = useCallback(
    (next: Period) => {
      const mine = ++latest.current;
      const { from, to } = periodRange(next);
      void actions
        .listPeriod({ from, to })
        .then((result) => {
          if (mine !== latest.current) return; // a newer choice is already on its way
          if (result.ok) {
            setData({ rows: result.rows, totals: result.totals, truncated: result.truncated });
            setError(null);
          } else setError(result.error);
        })
        .catch(() => mine === latest.current && setError("Could not load the transactions. Try again."));
    },
    [actions],
  );

  useEffect(() => load(period), [period, load]);
  useEffect(() => {
    const again = () => load(period);
    window.addEventListener(SHOW_TRANSACTIONS_EVENT, again);
    window.addEventListener(DATA_CHANGED_EVENT, again);
    return () => {
      window.removeEventListener(SHOW_TRANSACTIONS_EVENT, again);
      window.removeEventListener(DATA_CHANGED_EVENT, again);
    };
  }, [period, load]);

  async function confirmDelete(): Promise<string | null> {
    if (!deleting) return null;
    const result = await actions.deleteEntry({ id: deleting.id });
    if (!result.ok) return result.error;
    toast.success("Transaction deleted. Totals and balances updated.");
    notifyDataChanged();
    router.refresh();
    return null;
  }

  const rows = data ? (oldestFirst ? [...data.rows].reverse() : data.rows) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{data ? `${data.totals.count} record${data.totals.count === 1 ? "" : "s"} found` : "Loading…"}</p>
        <button type="button" onClick={() => setOldestFirst((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <ArrowDownUp className="size-3.5" aria-hidden />
          {oldestFirst ? "Oldest first" : "Newest first"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !data ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No transactions in this period.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const when = formatTransactionWhen(new Date(row.occurredAt));
            const title = row.transfer ? row.reason || "Self transfer" : row.reason || row.details || row.category || "Entry";
            const sub = row.transfer ? `${row.transfer.from} → ${row.transfer.to}` : [row.bankName, row.category].filter(Boolean).join(" · ");
            return (
              <li key={row.id} className="rounded-xl border bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-semibold">{title}</p>
                  <p className={cn("shrink-0 font-semibold tabular-nums", row.transfer ? "text-sky-600" : row.type === "DEBIT" ? "text-red-600" : "text-green-600")}>
                    {row.transfer ? "" : row.type === "DEBIT" ? "−" : "+"}
                    {formatINR(row.amountPaise)}
                  </p>
                </div>
                <div className="mt-0.5 flex items-start justify-between gap-3 text-sm text-muted-foreground">
                  <p className="min-w-0 truncate">{sub}</p>
                  <p className="shrink-0 text-xs">
                    {when.date} · {when.timeAndDay.split(" – ")[0]}
                  </p>
                </div>
                {row.shares.length > 0 ? (
                  <p className="mt-0.5 truncate text-xs text-amber-700">
                    {row.splitKind === "DEBT" ? "Debt" : "Split"}: {row.shares.map((s) => `${s.name} ${formatINR(s.sharePaise)}`).join(", ")}
                  </p>
                ) : null}
                <div className="mt-2 flex justify-end gap-2">
                  {row.transfer ? null : (
                    <Button type="button" variant="outline" size="sm" className="rounded-full px-4" onClick={() => setEditing(row.id)}>
                      Edit
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" className="rounded-full px-4 text-destructive hover:text-destructive" onClick={() => setDeleting(row)}>
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data?.truncated ? <p className="text-xs text-muted-foreground">Showing the latest 500. Narrow the period to see the rest.</p> : null}
      <Link href="/quick-pay/transactions" className="inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Open GPay Transactions (filters, balances, import and export)
      </Link>

      <EditEntryDialog
        entryId={editing}
        options={options}
        actions={actions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          notifyDataChanged();
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this transaction?"
        description={deleting ? `${deleting.transfer ? "Transfer" : deleting.type === "DEBIT" ? "Debit" : "Credit"} of ${formatINR(deleting.amountPaise)} will be removed, and the totals and bank balances recalculated. This cannot be undone.` : ""}
        confirmLabel="Delete transaction"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
