"use client";

import { Loader2, Soup } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { FoodActions } from "../actions";
import { MAX_NOTES_LENGTH, MEALS, MEAL_LABEL, foodKey, priceNotes, validateFoodEntry, type Meal } from "../pricing";
import type { FoodPricing } from "../types";

const newRequestId = () => crypto.randomUUID();

/**
 * Food Entry: a meal and what you had, on one line, plus Save. The price is worked out from your
 * Customize list (else the meal's default price) and shown under the fields; the server works it out
 * again when saving, so the amount saved is always the right one.
 */
export function FoodEntryForm({ actions }: { actions: FoodActions }) {
  const router = useRouter();
  const [pricing, setPricing] = useState<FoodPricing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meal, setMeal] = useState<Meal>("LUNCH");
  const [notes, setNotes] = useState("");
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

  const quote = useMemo(() => {
    if (!pricing || notes.trim() === "") return null;
    const chosen = pricing.meals[meal];
    const custom = new Map(chosen.items.map((i) => [foodKey(i.name), i.pricePaise]));
    return priceNotes(notes, custom, chosen.defaultPaise);
  }, [pricing, meal, notes]);

  async function save() {
    if (saving) return;
    const checked = validateFoodEntry({ meal, notes });
    if (!checked.ok) {
      setError(checked.errors.notes ?? checked.errors.meal ?? "Check the entry.");
      return;
    }
    setError(null);
    setSaving(true);
    let result: Awaited<ReturnType<FoodActions["saveEntry"]>>;
    try {
      result = await actions.saveEntry({ requestId, meal: checked.meal, notes: checked.notes });
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
    setRequestId(newRequestId());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Soup className="size-5" aria-hidden />
          </span>
          <div className="space-y-0.5">
            <CardTitle className="text-xl">Food Entry</CardTitle>
            <CardDescription>Saved with today&apos;s date and the time you press Save.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1.5 sm:w-40">
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

            <div className="min-w-0 flex-1 space-y-1.5 basis-56">
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

            <Button type="submit" size="lg" disabled={saving} className="h-10 w-full bg-neutral-950 px-6 text-white hover:bg-neutral-800 sm:w-auto">
              {saving ? <Loader2 className="animate-spin" /> : null}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>

          <p id="food-hint" aria-live="polite" className={cn("min-h-5 text-sm", error || loadError ? "text-destructive" : "text-muted-foreground")}>
            {error ??
              loadError ??
              (quote && quote.items.length > 0
                ? `${quote.items.map((i) => `${i.name} ${formatINR(i.pricePaise)}${i.custom ? "" : " (default)"}`).join(" + ")} = ${formatINR(quote.totalPaise)}`
                : pricing
                  ? `${MEAL_LABEL[meal]} default price ${formatINR(pricing.meals[meal].defaultPaise)}. Type an item to see its price.`
                  : "Loading prices…")}
          </p>
          <Link href="/food/settings" className="inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Customize food items and prices
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
