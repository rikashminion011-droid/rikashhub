"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notifyDataChanged } from "@/features/quick-pay/components/period-context";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { FoodActions } from "../actions";
import { formatDateTime } from "../format";
import { MAX_NOTES_LENGTH, MEALS, MEAL_LABEL, NIL_NOTES, foodKey, mealForTime, priceNotes, validateFoodEntry, type Meal } from "../pricing";
import { Checkbox } from "@/components/ui/checkbox";
import type { FoodEntryRow, FoodPricing } from "../types";
import { CycleButton } from "@/features/quick-pay/components/cycle-button";
import { nextSwitch } from "@/features/quick-pay/switching";
import type { SwitchSettings } from "@/features/quick-pay/settings-model";

const newRequestId = () => crypto.randomUUID();
/** The same separators the server uses to split notes into items, kept so the chosen name replaces only that item. */
const SEPARATORS = /([,+/;\n]+)/;
const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/**
 * Food Rent (food entry): a meal, what you had and its amount on one line, plus Save (the total spent on food for the chosen
 * period is in the header above the tabs). The meal is picked from the time of day (9 am to 12 pm Tiffin,
 * 12 pm to 5:30 pm Lunch, after that Dinner). The amount is worked out from your Customize list (else the meal's default
 * price) and can be changed by hand; the server works it out again when no amount is typed.
 */
export function FoodEntryForm({ actions, notesSwitch }: { actions: FoodActions; notesSwitch: SwitchSettings }) {
  const router = useRouter();
  const [pricing, setPricing] = useState<FoodPricing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The latest entries of the chosen meal, so a usual item can be picked again.
  const [recent, setRecent] = useState<FoodEntryRow[]>([]);
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()));
  const [notes, setNotes] = useState("");
  // Nil: no meal was eaten. The notes become Nil and the amount zero.
  const [nil, setNil] = useState(false);
  // The amount is calculated until you type your own.
  const [amount, setAmount] = useState("");
  const [amountTyped, setAmountTyped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One id per entry being typed: a retried or double-clicked Save can never record it twice.
  const [requestId, setRequestId] = useState(newRequestId);

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

  // The latest entries of the chosen meal. They follow the meal, which starts from the time of day.
  useEffect(() => {
    let cancelled = false;
    void actions.getRecent({ meal }).then((r) => {
      if (!cancelled && r.ok) setRecent(r.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [actions, meal]);

  const quote = useMemo(() => {
    if (!pricing || notes.trim() === "") return null;
    const chosen = pricing.meals[meal];
    const custom = new Map(chosen.items.map((i) => [foodKey(i.name), i.pricePaise]));
    return priceNotes(notes, custom, chosen.defaultPaise);
  }, [pricing, meal, notes]);

  const shownAmount = nil ? "0" : amountTyped ? amount : quote ? rupees(quote.totalPaise) : "";
  // Several priced items fit a typed word: the person picks the right one.
  const nameByKey = useMemo(() => new Map((pricing?.meals[meal].items ?? []).map((i) => [foodKey(i.name), i.name])), [pricing, meal]);
  const unsure = quote?.items.filter((i) => i.choices && i.choices.length > 1) ?? [];

  async function save() {
    if (saving) return;
    const checked = validateFoodEntry({ meal, notes: nil ? NIL_NOTES : notes });
    if (!checked.ok) {
      setError(checked.errors.notes ?? checked.errors.meal ?? "Check the entry.");
      return;
    }
    if (!nil && amountTyped && parseAmountInput(amount) === null) {
      setError("Enter the amount like 60 or 60.50.");
      return;
    }
    setError(null);
    setSaving(true);
    let result: Awaited<ReturnType<FoodActions["saveEntry"]>>;
    try {
      result = await actions.saveEntry({ requestId, meal: checked.meal, notes: checked.notes, ...(amountTyped && !nil ? { amount } : {}) });
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
    setNil(false);
    setAmount("");
    setAmountTyped(false);
    setRequestId(newRequestId());
    notifyDataChanged();
    void actions.getRecent({ meal }).then((r) => r.ok && setRecent(r.entries));
  }

  return (
    <div className="space-y-5">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full space-y-1.5 sm:w-44">
            <div className="flex items-center gap-3">
              <label htmlFor="food-meal" className="text-sm font-semibold">Meal</label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold" title="No meal was eaten">
                <Checkbox
                  checked={nil}
                  onCheckedChange={(next) => {
                    setNil(next === true);
                    setError(null);
                  }}
                  aria-label="Nil: no meal was eaten"
                />
                Nil
              </label>
            </div>
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
            <div className="flex items-center gap-2">
            <Input
              id="food-notes"
              value={nil ? NIL_NOTES : notes}
              disabled={nil}
              maxLength={MAX_NOTES_LENGTH}
              placeholder="e.g. Fish Gravy"
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby="food-hint"
              list="food-items"
              onChange={(e) => {
                setNotes(e.target.value);
                setError(null);
              }}
              className="h-10 min-w-0 flex-1 text-base sm:text-sm"
            />
            {notesSwitch.enabled ? (
              <CycleButton
                label="Switch to the next food item"
                disabled={nil || (pricing?.meals[meal].items.length ?? 0) < 1}
                onClick={() => {
                  const items = pricing?.meals[meal].items ?? [];
                  const current = items.find((i) => foodKey(i.name) === foodKey(notes))?.id ?? null;
                  const next = nextSwitch(notesSwitch, items.map((i) => i.id), current);
                  const chosen = items.find((i) => i.id === next);
                  if (chosen) {
                    setNotes(chosen.name);
                    setAmountTyped(false);
                    setError(null);
                  }
                }}
              />
            ) : null}
            </div>
            {/* The items you priced for this meal are offered as you type; picking one fills in its price */}
            <datalist id="food-items">
              {(pricing?.meals[meal].items ?? []).map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
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
                disabled={nil}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAmountTyped(true);
                  setError(null);
                }}
                className="h-10 pl-6 text-right text-base tabular-nums sm:text-sm"
              />
            </div>
          </div>

          <Button type="submit" size="lg" disabled={saving} className="h-10 w-full bg-primary px-6 text-white hover:bg-primary/90 sm:w-auto">
            {saving ? <Loader2 className="animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>

        {unsure.map((item) => (
          <div key={item.name} className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={`Which ${item.name}?`}>
            <span className="text-muted-foreground">“{item.name}” fits more than one item. Which one?</span>
            {item.choices!.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const chosen = nameByKey.get(key) ?? key;
                  setNotes((n) => n.split(SEPARATORS).map((part) => (foodKey(part) === foodKey(item.name) ? chosen : part)).join(""));
                  setAmountTyped(false);
                }}
                className="min-h-9 rounded-full border bg-card px-3 py-1 text-sm font-medium hover:bg-muted"
              >
                {nameByKey.get(key) ?? key}
              </button>
            ))}
          </div>
        ))}
        <p id="food-hint" aria-live="polite" className={cn("min-h-5 text-sm", error || loadError ? "text-destructive" : "text-muted-foreground")}>
          {error ??
            loadError ??
            (quote && quote.items.length > 0
              ? `${quote.items.map((i) => `${i.name} ${formatINR(i.pricePaise)}${i.custom ? "" : " (default)"}`).join(" + ")} = ${formatINR(quote.totalPaise)}${amountTyped ? " · amount changed by you" : ""}`
              : pricing
                ? `${MEAL_LABEL[meal]} default price ${formatINR(pricing.meals[meal].defaultPaise)}. Type an item to see its price.`
                : "Loading prices…")}
        </p>
        {recent.length > 0 ? (
          <div className="space-y-1.5" aria-label={`Recent ${MEAL_LABEL[meal]} entries`}>
            <p className="text-xs font-semibold text-muted-foreground">Recent {MEAL_LABEL[meal]} entries</p>
            <ul className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const isNil = foodKey(r.notes) === "nil";
                      setNil(isNil);
                      setNotes(isNil ? "" : r.notes);
                      setAmountTyped(false);
                      setError(null);
                    }}
                    className="min-h-10 rounded-xl border bg-card px-3 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className={cn("font-medium", foodKey(r.notes) === "nil" && "font-extrabold")}>{r.notes}</span>
                    {foodKey(r.notes) === "nil" ? null : <span className="text-muted-foreground"> · {formatINR(r.amountPaise)}</span>}
                    <span className="block text-[11px] text-muted-foreground">{formatDateTime(new Date(r.occurredAt))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link href="/food/settings" className="inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Customize food items and prices
        </Link>
      </form>
    </div>
  );
}
