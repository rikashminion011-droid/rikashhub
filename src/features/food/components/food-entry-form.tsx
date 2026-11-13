"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodNavigator } from "@/features/quick-pay/components/period-navigator";
import { periodFor, periodRange, type Period } from "@/features/quick-pay/period";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { FoodActions } from "../actions";
import { MAX_NOTES_LENGTH, MEALS, MEAL_LABEL, foodKey, mealForTime, priceNotes, validateFoodEntry, type Meal } from "../pricing";
import type { FoodPricing } from "../types";

const newRequestId = () => crypto.randomUUID();
const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/**
 * Food Rent (food entry): the total spent on food for a period (Today, Yesterday, a week, a month, a year or any dates), and
 * a meal, what you had and its amount on one line, plus Save. The meal is picked from the time of day (9 am to 12 pm Tiffin,
 * 12 pm to 5:30 pm Lunch, after that Dinner). The amount is worked out from your Customize list (else the meal's default
 * price) and can be changed by hand; the server works it out again when no amount is typed.
 */
export function FoodEntryForm({ actions }: { actions: FoodActions }) {
  const router = useRouter();
  const [pricing, setPricing] = useState<FoodPricing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()));
  const [notes, setNotes] = useState("");
  // The amount is calculated until you type your own.
  const [amount, setAmount] = useState("");
  const [amountTyped, setAmountTyped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One id per entry being typed: a retried or double-clicked Save can never record it twice.
  const [requestId, setRequestId] = useState(newRequestId);

  const today = istToday();
  const [period, setPeriod] = useState<Period>(() => periodFor("day", today));
  const [total, setTotal] = useState<{ totalPaise: number; count: number } | null>(null);
  const latest = useRef(0);

  const loadTotal = useCallback(
    (next: Period) => {
      const mine = ++latest.current;
      const { from, to } = periodRange(next);
      void actions.getTotal({ from, to }).then((result) => {
        if (mine === latest.current && result.ok) setTotal({ totalPaise: result.totalPaise, count: result.count });
      });
    },
    [actions],
  );
  useEffect(() => loadTotal(period), [period, loadTotal]);

  // Loaded when the form first appears; re-loaded each time you come back to this tab so prices changed elsewhere are used.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void actions.getPricing().then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setPricing(result.pricing);
          setLoadError(null);
        } else setLoadError(result.error);
      });
    };
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [actions]);

  const quote = useMemo(() => {
    if (!pricing || notes.trim() === "") return null;
    const chosen = pricing.meals[meal];
    const custom = new Map(chosen.items.map((i) => [foodKey(i.name), i.pricePaise]));
    return priceNotes(notes, custom, chosen.defaultPaise);
  }, [pricing, meal, notes]);

  const shownAmount = amountTyped ? amount : quote ? rupees(quote.totalPaise) : "";

  async function save() {
    if (saving) return;
    const checked = validateFoodEntry({ meal, notes });
    if (!checked.ok) {
      setError(checked.errors.notes ?? checked.errors.meal ?? "Check the entry.");
      return;
    }
    if (amountTyped && parseAmountInput(amount) === null) {
      setError("Enter the amount like 60 or 60.50.");
      return;
    }
    setError(null);
    setSaving(true);
    let result: Awaited<ReturnType<FoodActions["saveEntry"]>>;
    try {
      result = await actions.saveEntry({ requestId, meal: checked.meal, notes: checked.notes, ...(amountTyped ? { amount } : {}) });
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved. Check your connection and press Save again." };
    }
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(`Saved ${formatINR(result.entry.amountPaise)} · ${MEAL_LABEL[result.entry.meal]}`, {
      description: `${result.entry.notes} is now in Monthly Food Tracking.`,
      action: { label: "View", onClick: () => router.push("/food") },
    });
    setNotes("");
    setAmount("");
    setAmountTyped(false);
    setRequestId(newRequestId());
    loadTotal(period);
  }

  return (
    <div className="space-y-5">
      {/* Total food expenses for the chosen period */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Total food expenses</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums" aria-live="polite">
            {total ? formatINR(total.totalPaise) : "…"}
          </p>
          {total ? <p className="text-xs text-muted-foreground">{total.count} meal{total.count === 1 ? "" : "s"}</p> : null}
        </div>
        <PeriodNavigator value={period} onChange={setPeriod} today={today} />
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full space-y-1.5 sm:w-36">
            <label htmlFor="food-meal" className="text-sm font-semibold">Meal</label>
            <select
              id="food-meal"
              value={meal}
              onChange={(e) => {
                setMeal(e.target.value as Meal);
                setError(null);
              }}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
            >
              {MEALS.map((m) => (
                <option key={m} value={m}>{MEAL_LABEL[m]}</option>
              ))}
            </select>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5 basis-48">
            <label htmlFor="food-notes" className="text-sm font-semibold">Notes</label>
            <Input
              id="food-notes"
              value={notes}
              maxLength={MAX_NOTES_LENGTH}
              placeholder="e.g. Fish Gravy"
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby="food-hint"
              onChange={(e) => {
                setNotes(e.target.value);
                setError(null);
              }}
              className="h-10 text-base sm:text-sm"
            />
          </div>

          <div className="w-28 space-y-1.5">
            <label htmlFor="food-amount" className="text-sm font-semibold">Amount</label>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <Input
                id="food-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={shownAmount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAmountTyped(true);
                  setError(null);
                }}
                className="h-10 pl-6 text-right text-base tabular-nums sm:text-sm"
              />
            </div>
          </div>

          <Button type="submit" size="lg" disabled={saving} className="h-10 w-full bg-neutral-950 px-6 text-white hover:bg-neutral-800 sm:w-auto">
            {saving ? <Loader2 className="animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>

        <p id="food-hint" aria-live="polite" className={cn("min-h-5 text-sm", error || loadError ? "text-destructive" : "text-muted-foreground")}>
          {error ??
            loadError ??
            (quote && quote.items.length > 0
              ? `${quote.items.map((i) => `${i.name} ${formatINR(i.pricePaise)}${i.custom ? "" : " (default)"}`).join(" + ")} = ${formatINR(quote.totalPaise)}${amountTyped ? " · amount changed by you" : ""}`
              : pricing
                ? `${MEAL_LABEL[meal]} default price ${formatINR(pricing.meals[meal].defaultPaise)}. Type an item to see its price.`
                : "Loading prices…")}
        </p>
        <Link href="/food/settings" className="inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Customize food items and prices
        </Link>
      </form>
    </div>
  );
}
