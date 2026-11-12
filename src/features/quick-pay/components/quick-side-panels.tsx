import { ArrowRight, History, Receipt } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/finance";
import { formatTransactionWhen } from "../datetime";
import type { TxRow } from "../types";

/** The latest saved entries, newest first, with a link to the full list. */
export function RecentEntries({ rows }: { rows: readonly TxRow[] }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex-row items-center justify-between gap-3 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden /> Recent Entries
        </CardTitle>
        <Link href="/quick-pay/transactions" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          View All <ArrowRight className="size-3" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-amber-50">
              <Receipt className="size-6" aria-hidden />
            </span>
            <p className="font-semibold">No recent transactions</p>
            <p className="text-sm text-muted-foreground">Your latest entries will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const when = formatTransactionWhen(new Date(row.occurredAt));
              return (
                <li key={row.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.reason || row.details || row.category || "Entry"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.bankName ? `${row.bankName} · ` : ""}
                      {when.date}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold tabular-nums ${row.type === "DEBIT" ? "text-red-600" : "text-green-600"}`}>
                    {row.type === "DEBIT" ? "−" : "+"}
                    {formatINR(row.amountPaise)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
