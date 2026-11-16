"use client";

import { Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/finance";
import type { getFoodTotalAction } from "@/features/food/actions";
import type { getPeriodTotalsAction } from "../actions";
import { periodRange, type Period } from "../period";
import type { TxTotals } from "../types";
import { DATA_CHANGED_EVENT } from "./period-context";
import { PeriodNavigator } from "./period-navigator";

/**
 * Sits above the tabs on every page of Quick Entry: Total Debit and Total Credit for the chosen period (Total food expenses
 * while Food Rent is open) and the "‹ Today ›" control that changes the period for all of them.
 */
export function PeriodHeader({
  period,
  onPeriod,
  today,
  food,
  getTotals,
  getFoodTotal,
}: {
  period: Period;
  onPeriod: (next: Period) => void;
  today: string;
  /** True while the Food Rent tab is open: show what was spent on food instead of debit and credit. */
  food: boolean;
  getTotals: typeof getPeriodTotalsAction;
  getFoodTotal: typeof getFoodTotalAction;
}) {
  const [money, setMoney] = useState<TxTotals | null>(null);
  const [meals, setMeals] = useState<{ totalPaise: number; count: number } | null>(null);
  const latest = useRef(0);

  const load = useCallback(() => {
    const mine = ++latest.current;
    const { from, to } = periodRange(period);
    if (food) {
      void getFoodTotal({ from, to }).then((r) => mine === latest.current && r.ok && setMeals({ totalPaise: r.totalPaise, count: r.count }));
    } else {
      void getTotals({ from, to }).then((r) => mine === latest.current && r.ok && setMoney(r.totals));
    }
  }, [period, food, getTotals, getFoodTotal]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, load);
  }, [load]);

  const stat = "min-w-0 px-2 first:pl-0 sm:px-0 [&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-l-0";

  return (
    // A card holding the totals; on a wide screen the period control sits inside it, on a phone it sits centred just below.
    <div className="space-y-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0 sm:rounded-2xl sm:border sm:bg-muted/30 sm:p-4">
      <div className="flex items-center gap-4 rounded-2xl border bg-muted/30 px-3 py-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
        <span className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-muted sm:flex" aria-hidden>
          <Wallet className="size-5" />
        </span>
        {food ? (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Total food expenses</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums" aria-live="polite">
              {meals ? formatINR(meals.totalPaise) : "…"}
            </p>
          </div>
        ) : (
          <dl className="grid flex-1 grid-cols-2 text-center sm:flex sm:flex-none sm:gap-8 sm:text-left">
            <div className={stat}>
              <dt className="text-xs font-semibold text-muted-foreground">Total Debit</dt>
              <dd className="text-lg font-bold tracking-tight text-red-600 tabular-nums sm:text-2xl" aria-live="polite">
                {money ? formatINR(money.debitPaise) : "…"}
              </dd>
            </div>
            <div className={stat}>
              <dt className="text-xs font-semibold text-muted-foreground">Total Credit</dt>
              <dd className="text-lg font-bold tracking-tight text-green-600 tabular-nums sm:text-2xl" aria-live="polite">
                {money ? formatINR(money.creditPaise) : "…"}
              </dd>
            </div>
          </dl>
        )}
      </div>
      <div className="flex justify-center sm:justify-end">
        <PeriodNavigator value={period} onChange={onPeriod} today={today} />
      </div>
    </div>
  );
}
