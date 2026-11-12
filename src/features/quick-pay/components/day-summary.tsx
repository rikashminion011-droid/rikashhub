"use client";

import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, formatINR, parseISODate, toISODate } from "@/lib/finance";
import type { getDayTotalsAction } from "../actions";
import type { TxTotals } from "../types";

const longDay = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const shiftDay = (date: string, by: number) => toISODate(addDays(parseISODate(date), by));

/**
 * Today's debit and credit totals (India time) with a calendar: pick any day to see that day's totals,
 * or step a day back or forward. "Today" always shows the latest numbers, refreshed after each saved entry.
 */
export function DaySummary({
  today,
  todayTotals,
  getDayTotals,
}: {
  /** Today's date, YYYY-MM-DD in India time. */
  today: string;
  todayTotals: TxTotals;
  getDayTotals: typeof getDayTotalsAction;
}) {
  const [date, setDate] = useState(today);
  const [fetched, setFetched] = useState<{ date: string; totals: TxTotals } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const picker = useRef<HTMLInputElement>(null);

  const isToday = date === today;
  // Today's numbers come from the page (always fresh); another day's from the request below.
  const totals = isToday ? todayTotals : fetched?.date === date ? fetched.totals : null;

  function choose(next: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next > today) return;
    setDate(next);
    setError(null);
    if (next === today) return;
    const mine = ++latest.current;
    setLoading(true);
    void getDayTotals({ date: next })
      .then((result) => {
        if (mine !== latest.current) return; // a newer pick is already on its way
        if (result.ok) setFetched({ date: next, totals: result.totals });
        else setError(result.error);
      })
      .catch(() => {
        if (mine === latest.current) setError("Could not load that day. Try again.");
      })
      .finally(() => {
        if (mine === latest.current) setLoading(false);
      });
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4 text-amber-600" aria-hidden /> {isToday ? "Today\u2019s Summary" : "Day Summary"}
        </CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {longDay.format(parseISODate(date))}
            {isToday ? null : (
              <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => choose(today)}>
                Back to today
              </button>
            )}
          </p>
          {/* The calendar: pick any day, or step a day at a time */}
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => choose(shiftDay(date, -1))}>
              <ChevronLeft />
            </Button>
            <label className="relative">
              <span className="sr-only">Choose a date</span>
              <input
                ref={picker}
                type="date"
                value={date}
                max={today}
                onChange={(e) => choose(e.target.value)}
                className="h-9 w-40 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Next day" disabled={isToday} onClick={() => choose(shiftDay(date, 1))}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3" aria-busy={loading} aria-live="polite">
            <div className="rounded-xl bg-red-50 p-3">
              <p className="flex items-center gap-1 text-xs font-medium text-red-700">
                <ArrowDown className="size-3.5" aria-hidden /> Debit
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{totals ? formatINR(totals.debitPaise) : <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}</p>
            </div>
            <div className="rounded-xl bg-green-50 p-3">
              <p className="flex items-center gap-1 text-xs font-medium text-green-700">
                <ArrowUp className="size-3.5" aria-hidden /> Credit
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{totals ? formatINR(totals.creditPaise) : <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
