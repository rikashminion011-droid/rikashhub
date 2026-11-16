"use client";

import { ArrowLeft, ArrowRight, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DatePicker, MonthPicker } from "@/components/shared/date-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLongDate } from "@/features/quick-pay/date-format";
import { monthBounds } from "@/features/quick-pay/datetime";
import { cn } from "@/lib/utils";
import type { saveFoodBulkAction } from "../actions";
import { datesBetween, formatRupeesPlain } from "../grid";
import { MAX_NOTES_LENGTH, MEALS, MEAL_LABEL, foodKey, priceNotes, type Meal } from "../pricing";
import type { FoodPricing } from "../types";

/** The time a meal is saved under, in India time, when only the day is known. */
const MEAL_TIME: Record<Meal, string> = { TIFFIN: "09:00", LUNCH: "13:00", DINNER: "19:00" };

interface SheetRow {
  key: string;
  date: string;
  /** True for a row added by hand (it has its own date picker); the month's own days are fixed. */
  extra: boolean;
  cells: Record<Meal, string>;
}

const blankCells = (): Record<Meal, string> => ({ TIFFIN: "", LUNCH: "", DINNER: "" });
const monthRows = (month: string): SheetRow[] => {
  const b = monthBounds(month);
  return b ? datesBetween(b.from, b.to).map((date) => ({ key: `${month}:${date}`, date, extra: false, cells: blankCells() })) : [];
};

/**
 * Add Bulk for food, a month at a time: every date of the chosen month is a row with Tiffin, Lunch, Dinner and a Total that is
 * worked out for you. Enter (or Space in an empty box) moves to the next box and then the next row, without adding rows.
 * The three meal columns can be reordered. Nothing is saved until Save.
 */
export function FoodMonthSheet({ pricing, today, nowTime, initialMonth, back, saveBulk }: { pricing: FoodPricing; today: string; nowTime: string; initialMonth: string; back: "food"; saveBulk: typeof saveFoodBulkAction }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  // Each month keeps what was typed in it, so switching months never loses work.
  const [sheets, setSheets] = useState<Record<string, SheetRow[]>>(() => ({ [initialMonth]: monthRows(initialMonth) }));
  const [order, setOrder] = useState<Meal[]>([...MEALS]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const table = useRef<HTMLTableElement>(null);

  const rows = sheets[month] ?? monthRows(month);
  const prices = useMemo(() => Object.fromEntries(MEALS.map((m) => [m, new Map(pricing.meals[m].items.map((i) => [foodKey(i.name), i.pricePaise]))])) as Record<Meal, Map<string, number>>, [pricing]);
  const cost = (meal: Meal, text: string) => (text.trim() ? priceNotes(text, prices[meal], pricing.meals[meal].defaultPaise).totalPaise : 0);
  const rowTotal = (r: SheetRow) => MEALS.reduce((s, m) => s + cost(m, r.cells[m]), 0);
  const monthTotal = rows.reduce((s, r) => s + rowTotal(r), 0);
  const filledCount = Object.values(sheets).flat().reduce((n, r) => n + MEALS.filter((m) => r.cells[m].trim()).length, 0);

  const setRows = (next: (rows: SheetRow[]) => SheetRow[]) => setSheets((all) => ({ ...all, [month]: next(all[month] ?? monthRows(month)) }));
  const edit = (key: string, meal: Meal, text: string) => {
    setError(null);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, cells: { ...r.cells, [meal]: text } } : r)));
  };

  /** Moves to the next box: the next meal in this row, then the first meal of the next row. */
  function focusNext(rowIndex: number, colIndex: number) {
    const nextCol = colIndex + 1 < order.length ? colIndex + 1 : 0;
    const nextRow = colIndex + 1 < order.length ? rowIndex : rowIndex + 1;
    const el = table.current?.querySelector<HTMLInputElement>(`[data-cell="${nextRow}-${nextCol}"]:not(:disabled)`);
    el?.focus();
    el?.select();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const empty = e.currentTarget.value === "";
    if (e.key === "Enter" || (e.key === " " && empty)) {
      e.preventDefault();
      focusNext(rowIndex, colIndex);
    }
  }

  const move = (meal: Meal, by: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(meal);
      const j = i + by;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  async function save() {
    if (saving) return;
    setError(null);
    const out = Object.values(sheets).flatMap((rs) =>
      rs.flatMap((r) =>
        MEALS.filter((m) => r.cells[m].trim()).map((m) => ({ key: `${r.key}:${m}`, date: r.date, time: r.date === today && MEAL_TIME[m] > nowTime ? nowTime : MEAL_TIME[m], meal: m, notes: r.cells[m].trim() })),
      ),
    );
    if (out.length === 0) return setError("Type at least one meal before saving.");
    if (out.some((r) => r.date > today)) return setError("A meal cannot be saved for a day that has not come yet. Clear those boxes first.");
    setSaving(true);
    let result: Awaited<ReturnType<typeof saveFoodBulkAction>>;
    try {
      result = await saveBulk({ requestId, rows: out });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and press Save again." };
    }
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return toast.error(result.error);
    }
    toast.success(result.duplicate ? "That sheet was already saved." : `${result.count} meal${result.count === 1 ? "" : "s"} saved · ${formatRupeesPlain(result.totalPaise)}`);
    router.push(`/${back}?month=${month}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Month</label>
          <MonthPicker value={month} ariaLabel="Month to fill in" className="w-52" onChange={(m) => m && setMonth(m)} />
        </div>
        <p className="pb-2 text-sm tabular-nums">
          <span className="text-muted-foreground">This month </span>
          <span className="font-semibold">{formatRupeesPlain(monthTotal)}</span>
          <span className="text-muted-foreground"> · {filledCount} meal{filledCount === 1 ? "" : "s"} typed</span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table ref={table} className="w-full min-w-[46rem] text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-44 px-3 py-2.5 text-left font-medium">Date</th>
              {order.map((m, i) => (
                <th key={m} scope="col" className="px-2 py-1.5 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <button type="button" aria-label={`Move ${MEAL_LABEL[m]} left`} disabled={i === 0} onClick={() => move(m, -1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                      <ArrowLeft className="size-3" />
                    </button>
                    {MEAL_LABEL[m]}
                    <button type="button" aria-label={`Move ${MEAL_LABEL[m]} right`} disabled={i === order.length - 1} onClick={() => move(m, 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                      <ArrowRight className="size-3" />
                    </button>
                  </span>
                </th>
              ))}
              <th scope="col" className="w-28 px-3 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, ri) => {
              const future = r.date > today;
              const total = rowTotal(r);
              return (
                <tr key={r.key} className={cn(future && "opacity-50")}>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {r.extra ? <DatePicker compact ariaLabel={`Date of row ${ri + 1}`} value={r.date} max={today} onChange={(d) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, date: d || x.date } : x)))} /> : <span className="font-medium">{formatLongDate(r.date)}</span>}
                  </td>
                  {order.map((m, ci) => {
                    const nil = foodKey(r.cells[m]) === "nil";
                    return (
                      <td key={m} className="px-2 py-1">
                        <Input
                          data-cell={`${ri}-${ci}`}
                          aria-label={`${MEAL_LABEL[m]} on ${formatLongDate(r.date)}`}
                          autoComplete="off"
                          disabled={future}
                          maxLength={MAX_NOTES_LENGTH}
                          value={r.cells[m]}
                          onChange={(e) => edit(r.key, m, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, ri, ci)}
                          className={cn("h-9 text-base sm:text-sm", nil && "font-extrabold")}
                        />
                        {r.cells[m].trim() && !nil ? <p className="px-1 pt-0.5 text-[11px] text-muted-foreground tabular-nums">{formatRupeesPlain(cost(m, r.cells[m]))}</p> : null}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{total > 0 ? formatRupeesPlain(total) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setRows((rs) => [...rs, { key: `${month}:extra:${crypto.randomUUID()}`, date: rs.at(-1)?.date && rs.at(-1)!.date <= today ? rs.at(-1)!.date : today, extra: true, cells: blankCells() }])}
        >
          <Plus /> Add row
        </Button>
        <p className="text-xs text-muted-foreground">Type Nil for a meal that was not eaten. Prices come from Customize.</p>
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={saving} className="h-11 px-6">
          {saving ? <Loader2 className="animate-spin" /> : null} {saving ? "Saving…" : "Save"}
        </Button>
        <Link href={`/${back}?month=${month}`} className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
          Cancel
        </Link>
      </div>
    </div>
  );
}
