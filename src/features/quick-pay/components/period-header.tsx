"use client";

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

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      {food ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Total food expenses</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums" aria-live="polite">
            {meals ? formatINR(meals.totalPaise) : "…"}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Total Debit</p>
            <p className="text-2xl font-bold tracking-tight text-red-600 tabular-nums" aria-live="polite">
              {money ? formatINR(money.debitPaise) : "…"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Total Credit</p>
            <p className="text-2xl font-bold tracking-tight text-green-600 tabular-nums" aria-live="polite">
              {money ? formatINR(money.creditPaise) : "…"}
            </p>
          </div>
        </div>
      )}
      <PeriodNavigator value={period} onChange={onPeriod} today={today} />
    </div>
  );
}
