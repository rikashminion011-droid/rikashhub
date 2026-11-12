"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { saveFoodBulkAction } from "../actions";
import { MAX_FOOD_BULK_ROWS, isBlankFoodBulkRow, validateFoodBulk, type FoodBulkRowErrors, type FoodBulkRowInput } from "../bulk";
import { MAX_NOTES_LENGTH, MEALS, MEAL_LABEL, foodKey, priceNotes } from "../pricing";
import type { FoodPricing } from "../types";

const newKey = () => crypto.randomUUID();

const blankRow = (date: string, time: string, meal = "LUNCH", key = newKey()): FoodBulkRowInput => ({ key, date, time, meal, notes: "" });

/** The five starting rows. Their keys are fixed (not random) so the server-rendered page and the browser agree. */
const startingRows = (date: string, time: string) => Array.from({ length: 5 }, (_, i) => blankRow(date, time, "LUNCH", `start-${i}`));

/**
 * Spreadsheet-style entry: one row per meal with its own date, time, meal and notes. The amount shown for each row
 * comes from your Customize prices. Nothing is saved until Save All, and then every row is saved together.
 */
export function FoodBulkEntry({
  pricing,
  today,
  nowTime,
  saveBulk,
}: {
  pricing: FoodPricing;
  /** Today's date (YYYY-MM-DD) and the current time (HH:mm) in IST, used to pre-fill rows. */
  today: string;
  nowTime: string;
  saveBulk: typeof saveFoodBulkAction;
}) {
  const [rows, setRows] = useState<FoodBulkRowInput[]>(() => startingRows(today, nowTime));
  const [errors, setErrors] = useState<Record<string, FoodBulkRowErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One id per sheet: sending the same sheet again (retry, double click) can never save it twice.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const priceMaps = useMemo(
    () =>
      Object.fromEntries(MEALS.map((m) => [m, new Map(pricing.meals[m].items.map((i) => [foodKey(i.name), i.pricePaise]))])) as Record<(typeof MEALS)[number], Map<string, number>>,
    [pricing],
  );
  const amountOf = (row: FoodBulkRowInput): number | null => {
    if (isBlankFoodBulkRow(row) || !(MEALS as readonly string[]).includes(row.meal)) return null;
    const meal = row.meal as (typeof MEALS)[number];
    return priceNotes(row.notes, priceMaps[meal], pricing.meals[meal].defaultPaise).totalPaise;
  };

  const totals = useMemo(() => {
    let filled = 0;
    let sum = 0;
    for (const r of rows) {
      if (isBlankFoodBulkRow(r)) continue;
      filled++;
      sum += amountOf(r) ?? 0;
    }
    return { filled, sum };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, priceMaps]);

  function update(key: string, changes: Partial<FoodBulkRowInput>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...changes } : r)));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: {} }));
  }

  function addRows(count: number) {
    setRows((all) => {
      const last = all.at(-1);
      // New rows start from the previous row's date, time and meal: handy when typing a day's meals.
      return [...all, ...Array.from({ length: count }, () => blankRow(last?.date ?? today, last?.time ?? nowTime, last?.meal ?? "LUNCH"))];
    });
  }

  function removeRow(key: string) {
    setRows((all) => (all.length > 1 ? all.filter((r) => r.key !== key) : [blankRow(today, nowTime)]));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
  }

  async function saveAll() {
    if (saving) return;
    setFormError(null);

    const checked = validateFoodBulk(rows, new Date());
    if (!checked.ok) {
      setErrors(checked.errors);
      setFormError(checked.message);
      const firstBad = rows.find((r) => checked.errors[r.key]);
      if (firstBad) document.getElementById(`food-row-${firstBad.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});

    setSaving(true);
    let result: Awaited<ReturnType<typeof saveFoodBulkAction>>;
    try {
      result = await saveBulk({ requestId, rows });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and press Save All again." };
    }
    setSaving(false);

    if (!result.ok) {
      setFormError(result.error);
      if ("rowErrors" in result) setErrors(result.rowErrors);
      toast.error(result.error);
      return;
    }
    toast.success(result.duplicate ? "That sheet was already saved." : `${result.count} meal${result.count === 1 ? "" : "s"} saved · ${formatINR(result.totalPaise)}`, {
      description: "They now appear in Monthly Food Tracking.",
    });
    setRows(startingRows(today, nowTime));
    setRequestId(crypto.randomUUID());
  }

  const cell = "px-1.5 py-1.5 align-top";
  const field = "h-9 text-base sm:text-sm";

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-2 py-2 text-center font-medium">#</th>
              <th scope="col" className="w-40 px-1.5 py-2 text-left font-medium">Date</th>
              <th scope="col" className="w-28 px-1.5 py-2 text-left font-medium">Time</th>
              <th scope="col" className="w-32 px-1.5 py-2 text-left font-medium">Meal</th>
              <th scope="col" className="min-w-56 px-1.5 py-2 text-left font-medium">Notes (food items)</th>
              <th scope="col" className="w-28 px-1.5 py-2 text-right font-medium">Amount</th>
              <th scope="col" className="w-10 px-1.5 py-2"><span className="sr-only">Remove row</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => {
              const e = errors[row.key] ?? {};
              const amount = amountOf(row);
              return (
                <tr key={row.key} id={`food-row-${row.key}`} className={cn(Object.keys(e).length > 0 && "bg-destructive/5")}>
                  <td className="px-2 py-3 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</td>
                  <td className={cell}>
                    <Input type="date" aria-label={`Row ${index + 1} date`} value={row.date} max={today} aria-invalid={!!e.date} onChange={(ev) => update(row.key, { date: ev.target.value })} className={field} />
                    {e.date ? <p className="mt-0.5 text-[11px] text-destructive">{e.date}</p> : null}
                  </td>
                  <td className={cell}>
                    <Input type="time" aria-label={`Row ${index + 1} time`} value={row.time} aria-invalid={!!e.time} onChange={(ev) => update(row.key, { time: ev.target.value })} className={field} />
                    {e.time ? <p className="mt-0.5 text-[11px] text-destructive">{e.time}</p> : null}
                  </td>
                  <td className={cell}>
                    <select
                      aria-label={`Row ${index + 1} meal`}
                      value={row.meal}
                      onChange={(ev) => update(row.key, { meal: ev.target.value })}
                      className="h-9 w-full rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
                    >
                      {MEALS.map((m) => (
                        <option key={m} value={m}>{MEAL_LABEL[m]}</option>
                      ))}
                    </select>
                    {e.meal ? <p className="mt-0.5 text-[11px] text-destructive">{e.meal}</p> : null}
                  </td>
                  <td className={cell}>
                    <Input aria-label={`Row ${index + 1} notes`} placeholder="e.g. Fish Gravy" value={row.notes} maxLength={MAX_NOTES_LENGTH} aria-invalid={!!e.notes} onChange={(ev) => update(row.key, { notes: ev.target.value })} className={field} />
                    {e.notes ? <p className="mt-0.5 text-[11px] text-destructive">{e.notes}</p> : null}
                  </td>
                  <td className="px-2 py-3 text-right font-medium tabular-nums text-muted-foreground">{amount === null ? "—" : formatINR(amount)}</td>
                  <td className="px-1.5 py-1.5 align-top">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${index + 1}`} className="text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.key)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => addRows(1)} disabled={rows.length >= MAX_FOOD_BULK_ROWS}>
          <Plus /> Add row
        </Button>
        <Button type="button" variant="outline" onClick={() => addRows(5)} disabled={rows.length + 5 > MAX_FOOD_BULK_ROWS}>
          <Plus /> Add 5 rows
        </Button>
        <p className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {totals.filled} meal{totals.filled === 1 ? "" : "s"} · Total {formatINR(totals.sum)}
        </p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={saveAll} disabled={saving || totals.filled === 0}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : `Save All${totals.filled ? ` (${totals.filled})` : ""}`}
        </Button>
        <Link href="/food" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Back to Monthly Food Tracking
        </Link>
      </div>
    </div>
  );
}
