import { Receipt } from "lucide-react";
import Link from "next/link";
import { formatINR } from "@/lib/finance";
import { formatTransactionWhen } from "../datetime";
import type { TxRow } from "../types";
import { RowActions } from "./row-actions";

/**
 * The transaction table. Columns: Date & Time, Debit, Credit, Reason, Bank, Category, Split, Balance.
 * A debit shows only under Debit and a credit only under Credit. The running Balance column is on hold.
 */
export function TransactionsTable({
  rows,
  filtered,
  deleteEntry,
}: {
  rows: readonly TxRow[];
  /** True when filters or a search are active, so the empty state can say so. */
  filtered: boolean;
  deleteEntry: React.ComponentProps<typeof RowActions>["deleteEntry"];
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
        <Receipt className="size-7 text-muted-foreground" aria-hidden />
        <p className="font-medium">{filtered ? "No transactions match these filters" : "No transactions yet"}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {filtered ? "Try a different month or date range, or clear the filters." : "Add your first entry or paste in a sheet of entries with Add Bulk."}
        </p>
        {!filtered ? (
          <Link href="/quick-pay" className="mt-1 text-sm font-medium underline underline-offset-4">
            Add an entry
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Date &amp; Time</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Debit</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Credit</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Reason</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Bank</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Category</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Split</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium" title="On hold for now">Balance</th>
            <th scope="col" className="w-24 px-4 py-2.5 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const when = formatTransactionWhen(new Date(row.occurredAt));
            return (
              <tr key={row.id} className="align-top hover:bg-muted/30">
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="font-medium">{when.date}</p>
                  <p className="text-xs text-muted-foreground">{when.timeAndDay}</p>
                </td>
                <td className="px-4 py-3 text-right font-medium text-destructive tabular-nums">{row.type === "DEBIT" ? formatINR(row.amountPaise) : ""}</td>
                <td className="px-4 py-3 text-right font-medium text-success tabular-nums">{row.type === "CREDIT" ? formatINR(row.amountPaise) : ""}</td>
                <td className="max-w-64 px-4 py-3 break-words">{row.reason || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3">{row.bank || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3">{row.category || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3">{row.person ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3 text-right text-muted-foreground" aria-label="Balance is on hold">—</td>
                <td className="px-4 py-3 text-right">
                  <RowActions id={row.id} summary={`${row.type === "DEBIT" ? "Debit" : "Credit"} of ${formatINR(row.amountPaise)}`} deleteEntry={deleteEntry} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
