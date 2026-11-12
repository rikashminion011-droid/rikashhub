import type { Metadata } from "next";
import Link from "next/link";
import { Settings2, Soup } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { deleteFoodEntryAction } from "@/features/food/actions";
import { FoodFilters } from "@/features/food/components/food-filters";
import { FoodRowActions } from "@/features/food/components/food-row-actions";
import { addMonths, formatDateTime, formatMonth, formatWeekday, monthOf } from "@/features/food/format";
import { MEAL_LABEL, monthsBetween } from "@/features/food/pricing";
import { listFoodEntries } from "@/features/food/server/service";
import type { FoodEntriesData } from "@/features/food/types";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Monthly Food Tracking" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const pick = (value: string | string[] | undefined) => (typeof value === "string" && MONTH.test(value) ? value : null);

export default async function FoodPage({ searchParams }: PageProps<"/food">) {
  const user = await requireUser();
  const params = await searchParams;
  const thisMonth = monthOf(new Date());
  let from = pick(params.from) ?? pick(params.to) ?? thisMonth;
  let to = pick(params.to) ?? from;
  if (from > to) [from, to] = [to, from];
  // A very long range is clipped so the page stays quick.
  if (monthsBetween(from, to).length > 36) from = addMonths(to, -35);

  let data: FoodEntriesData;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    data = await listFoodEntries(db, user.id, from, to);
  } catch (error) {
    console.error("[food] could not load entries", error);
    return (
      <>
        <PageHeader title="Monthly Food Tracking" />
        <DatabaseUnavailable />
      </>
    );
  }

  // Running total, oldest first, so each row shows what the period has cost up to and including it.
  const rows = data.rows.map((row, i) => {
    const when = new Date(row.occurredAt);
    const running = data.rows.slice(0, i + 1).reduce((sum, r) => sum + r.amountPaise, 0);
    return { ...row, when, running, month: monthOf(when) };
  });
  const perMonth = data.months.map((m) => ({
    month: m,
    count: rows.filter((r) => r.month === m).length,
    total: rows.filter((r) => r.month === m).reduce((s, r) => s + r.amountPaise, 0),
  }));
  const multi = data.months.length > 1;
  const periodLabel = multi ? `${formatMonth(data.months[0]!)} to ${formatMonth(data.months.at(-1)!)}` : formatMonth(data.months[0] ?? from);

  return (
    <>
      <PageHeader
        title="Monthly Food Tracking"
        description="Every meal saved from Quick Entry, with its price, month by month."
        actions={
          <Link href="/food/settings" aria-label="Customize food items and prices" title="Customize" className={cn(buttonVariants({ variant: "outline" }))}>
            <Settings2 /> <span className="hidden sm:inline">Customize</span>
          </Link>
        }
      />

      <div className="space-y-5">
        <FoodFilters from={from} to={to} thisMonth={thisMonth} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Amount · {periodLabel}</p>
              <p className="text-2xl font-semibold tabular-nums">{formatINR(data.totalPaise)}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Meals recorded</p>
              <p className="text-2xl font-semibold tabular-nums">{data.count}</p>
            </CardContent>
          </Card>
        </div>

        {multi ? (
          <ul className="flex flex-wrap gap-2" aria-label="Total for each month">
            {perMonth.map((m) => (
              <li key={m.month} className="rounded-full border bg-card px-3 py-1 text-xs">
                <span className="text-muted-foreground">{formatMonth(m.month)}</span> <span className="font-semibold tabular-nums">{formatINR(m.total)}</span>
                <span className="text-muted-foreground"> · {m.count}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-amber-50">
                <Soup className="size-6" aria-hidden />
              </span>
              <p className="font-semibold">No meals recorded for {periodLabel}</p>
              <p className="text-sm text-muted-foreground">Open Quick Entry, switch to Food Entry and save a meal. It will show up here.</p>
              <Link href="/quick-pay" className={cn(buttonVariants(), "mt-2")}>Go to Quick Entry</Link>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Date and Time</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Day</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Food Item</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Total Amount</th>
                  <th scope="col" className="w-12 px-2 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatDateTime(row.when)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatWeekday(row.when)}</td>
                    <td className="px-3 py-2.5">
                      <span className="mr-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">{MEAL_LABEL[row.meal]}</span>
                      {row.notes}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatINR(row.amountPaise)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatINR(row.running)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <FoodRowActions id={row.id} summary={`${MEAL_LABEL[row.meal]} · ${row.notes}`} deleteEntry={deleteFoodEntryAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-3 py-2.5" colSpan={3}>Total for {periodLabel}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(data.totalPaise)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(data.totalPaise)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
