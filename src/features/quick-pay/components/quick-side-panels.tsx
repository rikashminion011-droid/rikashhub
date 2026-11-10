import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, History, Receipt } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/finance";
import { formatTransactionWhen } from "../datetime";
import type { TxRow, TxTotals } from "../types";

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** Today's debit and credit totals (IST), refreshed whenever an entry is saved. */
export function TodaySummary({ totals, now }: { totals: TxTotals; now: Date }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4 text-amber-600" aria-hidden /> Today&apos;s Summary
        </CardTitle>
        <span className="text-xs text-muted-foreground">{dayFormat.format(now)}</span>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-red-50 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-red-700">
            <ArrowDown className="size-3.5" aria-hidden /> Debit
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatINR(totals.debitPaise)}</p>
        </div>
        <div className="rounded-xl bg-green-50 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-green-700">
            <ArrowUp className="size-3.5" aria-hidden /> Credit
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatINR(totals.creditPaise)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** The latest saved entries, newest first, with a link to the full list. */
export function RecentEntries({ rows }: { rows: readonly TxRow[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden /> Recent Entries
        </CardTitle>
        <Link href="/quick-pay/transactions" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          View All <ArrowRight className="size-3" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
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
                    <p className="truncate text-sm font-medium">{row.reason || row.category || "Entry"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.bank ? `${row.bank.replace(/ → /g, " › ")} · ` : ""}
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
