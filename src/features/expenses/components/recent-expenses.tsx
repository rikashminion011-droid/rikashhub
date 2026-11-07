import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR, parseISODate } from "@/lib/finance";
import type { RecentExpense } from "../types";

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** The latest expenses that were saved, so you can see the entry really went through. */
export function RecentExpenses({ items }: { items: readonly RecentExpense[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent expenses</CardTitle>
        <CardDescription>The last few you added.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
            <Receipt className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No expenses yet</p>
            <p className="max-w-[16rem] text-xs text-muted-foreground">Add your first one with the form and it will show up here.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">{item.notes || item.category || "Expense"}</p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(item.amountPaise)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {dayFormat.format(parseISODate(item.date))}
                  {item.paidWith ? ` · ${item.paidWith}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.category ? <Badge variant="secondary">{item.category}</Badge> : null}
                  {item.isSplit ? (
                    item.people.map((p) => (
                      <Badge key={p.name} variant="outline" className="tabular-nums">
                        {p.name} {formatINR(p.amountPaise)}
                      </Badge>
                    ))
                  ) : item.people[0] ? (
                    <Badge variant="outline">{item.people[0].name}</Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
