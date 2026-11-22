"use client";

import { ArrowLeft, ArrowRight, Loader2, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DatePicker, DateRangePicker, MonthPicker } from "@/components/shared/date-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColumnFilter } from "@/features/quick-pay/components/column-filter";
import { formatLongDate } from "@/features/quick-pay/date-format";
import { istDateOf, monthBounds } from "@/features/quick-pay/datetime";
import { cn } from "@/lib/utils";
import type { getFoodMonthAction, saveFoodBulkAction } from "../actions";
import { datesBetween, formatRupeesPlain } from "../grid";
import { MAX_NOTES_LENGTH, MEALS, MEAL_LABEL, foodKey, priceNotes, type Meal } from "../pricing";
import type { FoodEntryRow, FoodPricing } from "../types";

/** The time a meal is saved under, in India time, when only the day is known. */
const MEAL_TIME: Record<Meal, string> = { TIFFIN: "09:00", LUNCH: "13:00", DINNER: "19:00" };

interface SheetRow {
  key: string;
  date: string;
  /** True for a row added by hand (it has its own date picker); the month's own days are fixed. */
  extra: boolean;
  cells: Record<Meal, string>;
  /** The saved meals this box was filled from (none for a box that is new), and the text they gave. */
  ids: Record<Meal, string[]>;
  orig: Record<Meal, string>;
}

const NO_ROWS: SheetRow[] = [];
const blank = <T,>(v: T): Record<Meal, T> => ({ TIFFIN: v, LUNCH: v, DINNER: v });

/** A month's rows. What is already saved fills its boxes, so nothing is typed twice. */
const monthRows = (month: string, entries: readonly FoodEntryRow[]): SheetRow[] => {
  const b = monthBounds(month);
  if (!b) return [];
  const byCell = new Map<string, FoodEntryRow[]>();
  for (const e of entries) {
    const key = `${istDateOf(new Date(e.occurredAt))}:${e.meal}`;
    byCell.set(key, [...(byCell.get(key) ?? []), e]);
  }
  return datesBetween(b.from, b.to).map((date) => {
    const row: SheetRow = { key: `${month}:${date}`, date, extra: false, cells: blank(""), ids: blank<string[]>([]), orig: blank("") };
    for (const m of MEALS) {
      const found = (byCell.get(`${date}:${m}`) ?? []).sort((x, y) => x.occurredAt.localeCompare(y.occurredAt));
      if (found.length === 0) continue;
      const text = found.map((e) => e.notes).join(", ");
      row.cells[m] = text;
      row.orig[m] = text;
      row.ids[m] = found.map((e) => e.id);
    }
    return row;
  });
};

/**
 * Add Bulk for food, a month at a time: every date of the chosen month is a row with Tiffin, Lunch, Dinner and a Total that is
 * worked out for you. What is already saved is shown in its boxes: change it, clear it to remove it, or fill an empty box. A
 * search over everything and a filter on each column narrow the rows shown. Enter (or Space in an empty box) moves to the next
 * box and then the next row. The three meal columns can be reordered. Nothing is saved until Save.
 */
export function FoodMonthSheet({
  pricing,
  today,
  nowTime,
  initialMonth,
  initialEntries,
  back,
  saveBulk,
  loadMonth,
}: {
  pricing: FoodPricing;
  today: string;
  nowTime: string;
  initialMonth: string;
  initialEntries: FoodEntryRow[];
  back: "food";
  saveBulk: typeof saveFoodBulkAction;
  loadMonth: typeof getFoodMonthAction;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  // Each month keeps what was typed in it, so switching months never loses work.
  const [sheets, setSheets] = useState<Record<string, SheetRow[]>>(() => ({ [initialMonth]: monthRows(initialMonth, initialEntries) }));
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Meal[]>([...MEALS]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const table = useRef<HTMLTableElement>(null);
  // Search and column filters only change which rows are shown.
  const [q, setQ] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [picked, setPicked] = useState<Record<Meal, string[]>>(blank<string[]>([]));

  const rows = sheets[month] ?? NO_ROWS;
  const prices = useMemo(() => Object.fromEntries(MEALS.map((m) => [m, new Map(pricing.meals[m].items.map((i) => [foodKey(i.name), i.pricePaise]))])) as Record<Meal, Map<string, number>>, [pricing]);
  const cost = (meal: Meal, text: string) => (text.trim() ? priceNotes(text, prices[meal], pricing.meals[meal].defaultPaise).totalPaise : 0);
  const rowTotal = (r: SheetRow) => MEALS.reduce((s, m) => s + (foodKey(r.cells[m]) === "nil" ? 0 : cost(m, r.cells[m])), 0);
  const monthTotal = rows.reduce((s, r) => s + rowTotal(r), 0);
  const filledCount = Object.values(sheets).flat().reduce((n, r) => n + MEALS.filter((m) => r.cells[m].trim()).length, 0);

  const options = useMemo(
    () => Object.fromEntries(MEALS.map((m) => [m, [...new Set(rows.map((r) => r.cells[m].trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }))])) as Record<Meal, { value: string; label: string }[]>,
    [rows],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (range.from && r.date < range.from) return false;
      if (range.to && r.date > range.to) return false;
      for (const m of MEALS) if (picked[m].length > 0 && !picked[m].includes(r.cells[m].trim())) return false;
      return !needle || [formatLongDate(r.date), r.date, ...MEALS.map((m) => r.cells[m])].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, q, range, picked]);
  const narrowed = q.trim() !== "" || range.from !== "" || range.to !== "" || MEALS.some((m) => picked[m].length > 0);

  const setRows = (next: (rows: SheetRow[]) => SheetRow[]) => setSheets((all) => ({ ...all, [month]: next(all[month] ?? []) }));
  const edit = (key: string, meal: Meal, text: string) => {
    setError(null);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, cells: { ...r.cells, [meal]: text } } : r)));
  };

  async function chooseMonth(next: string) {
    if (!next || next === month) return;
    setMonth(next);
    if (sheets[next]) return;
    setLoading(true);
    const r = await loadMonth({ month: next });
    setSheets((all) => ({ ...all, [next]: monthRows(next, r.ok ? r.entries : []) }));
    if (!r.ok) toast.error(r.error);
    setLoading(false);
  }

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
    const creates: { key: string; date: string; time: string; meal: Meal; notes: string }[] = [];
    const updates: { id: string; meal: Meal; notes: string }[] = [];
    const deletes: string[] = [];
    for (const r of Object.values(sheets).flat()) {
      for (const m of MEALS) {
        const text = r.cells[m].trim();
        const ids = r.ids[m];
        if (ids.length === 0) {
          if (text) creates.push({ key: `${r.key}:${m}`, date: r.date, time: r.date === today && MEAL_TIME[m] > nowTime ? nowTime : MEAL_TIME[m], meal: m, notes: text });
        } else if (text !== r.orig[m].trim()) {
          if (text === "") deletes.push(...ids);
          else {
            updates.push({ id: ids[0]!, meal: m, notes: text });
            deletes.push(...ids.slice(1));
          }
        }
      }
    }
    if (creates.length + updates.length + deletes.length === 0) return setError("Nothing was changed.");
    if (creates.some((r) => r.date > today)) return setError("A meal cannot be saved for a day that has not come yet. Clear those boxes first.");
    setSaving(true);
    let result: Awaited<ReturnType<typeof saveFoodBulkAction>>;
    try {
      result = await saveBulk({ requestId, rows: creates, updates, deletes });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and press Save again." };
    }
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return toast.error(result.error);
    }
    toast.success(result.duplicate ? "That sheet was already saved." : `${result.count} meal${result.count === 1 ? "" : "s"} saved${result.totalPaise ? ` · ${formatRupeesPlain(result.totalPaise)} added` : ""}`);
    router.push(`/${back}?month=${month}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Month</label>
          <MonthPicker value={month} ariaLabel="Month to fill in" className="w-52" onChange={(m) => void chooseMonth(m)} />
        </div>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meals" aria-label="Search all meals" className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm" />
        </div>
        {narrowed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setQ("");
              setRange({ from: "", to: "" });
              setPicked(blank<string[]>([]));
            }}
          >
            <X /> Clear filters
          </Button>
        ) : null}
        <p className="pb-2 text-sm tabular-nums">
          <span className="text-muted-foreground">This month </span>
          <span className="font-semibold">{formatRupeesPlain(monthTotal)}</span>
          <span className="text-muted-foreground">
            {" "}
            · {filledCount} meal{filledCount === 1 ? "" : "s"}
            {narrowed ? ` · showing ${shown.length} of ${rows.length} days` : ""}
          </span>
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto size-4 animate-spin" aria-hidden /> Loading the saved meals…
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table ref={table} className="w-full min-w-[46rem] text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-44 px-3 py-2.5 text-left font-medium">
                  <span className="inline-flex items-center gap-1">
                    Date <DateRangePicker iconOnly from={range.from} to={range.to} max={today} ariaLabel="Filter dates" className="size-6 rounded border-0 bg-transparent [&_svg]:size-3.5" onChange={(r) => setRange({ from: r.from, to: r.to })} />
                  </span>
                </th>
                {order.map((m, i) => (
                  <th key={m} scope="col" className="px-2 py-1.5 text-left font-medium">
                    <span className="flex items-center gap-1">
                      <button type="button" aria-label={`Move ${MEAL_LABEL[m]} left`} disabled={i === 0} onClick={() => move(m, -1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                        <ArrowLeft className="size-3" />
                      </button>
                      {MEAL_LABEL[m]}
                      <ColumnFilter label={MEAL_LABEL[m]} options={options[m]} selected={picked[m]} onApply={(v) => setPicked((p) => ({ ...p, [m]: v }))} />
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
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    Nothing matches the search and filters.
                  </td>
                </tr>
              ) : null}
              {shown.map((r, ri) => {
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
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setRows((rs) => [...rs, { key: `${month}:extra:${crypto.randomUUID()}`, date: rs.at(-1)?.date && rs.at(-1)!.date <= today ? rs.at(-1)!.date : today, extra: true, cells: blank(""), ids: blank<string[]>([]), orig: blank("") }])}
        >
          <Plus /> Add row
        </Button>
        <p className="text-xs text-muted-foreground">What is already saved is shown: change it, or clear a box to remove that meal. Type Nil for a meal that was not eaten. Prices come from Customize.</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={saving || loading} className="h-11 px-6">
          {saving ? <Loader2 className="animate-spin" /> : null} {saving ? "Saving…" : "Save"}
        </Button>
        <Link href={`/${back}?month=${month}`} className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
          Cancel
        </Link>
      </div>
    </div>
  );
}
