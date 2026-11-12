"use client";

import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/finance";
import type { addFoodItemAction, deleteFoodItemAction, setMealPriceAction, updateFoodItemAction } from "../actions";
import { MAX_ITEM_NAME_LENGTH, MEALS, MEAL_LABEL, type Meal } from "../pricing";
import type { FoodItemRow, FoodPricing } from "../types";

export interface FoodSettingsActions {
  addItem: typeof addFoodItemAction;
  updateItem: typeof updateFoodItemAction;
  deleteItem: typeof deleteFoodItemAction;
  setMealPrice: typeof setMealPriceAction;
}

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/** Three sections (Tiffin, Lunch, Dinner), each with its default price and any number of priced food items. */
export function FoodSettings({ initial, actions }: { initial: FoodPricing; actions: FoodSettingsActions }) {
  const [pricing, setPricing] = useState(initial);
  return (
    <div className="space-y-6">
      {MEALS.map((meal) => (
        <MealSection key={meal} meal={meal} data={pricing.meals[meal]} actions={actions} onChange={setPricing} />
      ))}
    </div>
  );
}

function MealSection({
  meal,
  data,
  actions,
  onChange,
}: {
  meal: Meal;
  data: FoodPricing["meals"][Meal];
  actions: FoodSettingsActions;
  onChange: (next: FoodPricing) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{MEAL_LABEL[meal]}</CardTitle>
        <CardDescription>
          An item below uses its own price. Anything else you enter in Notes uses the {MEAL_LABEL[meal]} default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DefaultPrice meal={meal} paise={data.defaultPaise} actions={actions} onChange={onChange} />

        {data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No items yet. Add one below.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.items.map((item) => (
              <ItemRow key={item.id} item={item} actions={actions} onChange={onChange} />
            ))}
          </ul>
        )}

        <AddItem meal={meal} actions={actions} onChange={onChange} />
      </CardContent>
    </Card>
  );
}

function DefaultPrice({ meal, paise, actions, onChange }: { meal: Meal; paise: number; actions: FoodSettingsActions; onChange: (n: FoodPricing) => void }) {
  const saved = rupees(paise);
  const [text, setText] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = text.trim() !== saved;

  async function save() {
    setSaving(true);
    setError(null);
    const result = await actions.setMealPrice({ meal, price: text });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onChange(result.pricing);
    toast.success(`${MEAL_LABEL[meal]} default price updated.`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`default-${meal}`} className="text-sm font-medium">Default price</label>
        <div className="relative w-28">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
          <Input
            id={`default-${meal}`}
            inputMode="decimal"
            value={text}
            aria-invalid={!!error}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) {
                e.preventDefault();
                void save();
              }
            }}
            className="h-9 pl-6 text-right text-base tabular-nums sm:text-sm"
          />
        </div>
        <Button type="button" size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </div>
      {error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ItemRow({ item, actions, onChange }: { item: FoodItemRow; actions: FoodSettingsActions; onChange: (n: FoodPricing) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(rupees(item.pricePaise));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await actions.updateItem({ id: item.id, name, price });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onChange(result.pricing);
    setEditing(false);
    toast.success("Item updated.");
  }

  async function remove(): Promise<string | null> {
    const result = await actions.deleteItem({ id: item.id });
    if (!result.ok) return result.error;
    onChange(result.pricing);
    toast.success(`${item.name} removed. Saved entries keep their amounts.`);
    return null;
  }

  if (editing) {
    return (
      <li className="space-y-2 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Item name" value={name} maxLength={MAX_ITEM_NAME_LENGTH} onChange={(e) => setName(e.target.value)} className="h-9 min-w-40 flex-1 text-base sm:text-sm" />
          <div className="relative w-28">
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
            <Input aria-label="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9 pl-6 text-right text-base tabular-nums sm:text-sm" />
          </div>
          <Button type="button" size="icon-sm" aria-label="Save item" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Cancel"
            onClick={() => {
              setEditing(false);
              setName(item.name);
              setPrice(rupees(item.pricePaise));
              setError(null);
            }}
          >
            <X />
          </Button>
        </div>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2.5">
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <span className="font-medium tabular-nums">{formatINR(item.pricePaise)}</span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`} onClick={() => setEditing(true)}>
        <Pencil />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${item.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming(true)}>
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${item.name}?`}
        description="New entries with this item will use the meal's default price. Entries already saved keep the amount they were saved with."
        confirmLabel="Delete item"
        onConfirm={remove}
      />
    </li>
  );
}

function AddItem({ meal, actions, onChange }: { meal: Meal; actions: FoodSettingsActions; onChange: (n: FoodPricing) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setSaving(true);
    setError(null);
    const result = await actions.addItem({ meal, name, price });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onChange(result.pricing);
    setName("");
    setPrice("");
    toast.success("Item added.");
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={`${MEAL_LABEL[meal]} item name`} placeholder="Food item, e.g. Fish Gravy" value={name} maxLength={MAX_ITEM_NAME_LENGTH} onChange={(e) => setName(e.target.value)} className="h-9 min-w-44 flex-1 text-base sm:text-sm" />
        <div className="relative w-28">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
          <Input aria-label={`${MEAL_LABEL[meal]} item price`} inputMode="decimal" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9 pl-6 text-right text-base tabular-nums sm:text-sm" />
        </div>
        <Button type="submit" disabled={saving || name.trim() === "" || price.trim() === ""}>
          {saving ? <Loader2 className="animate-spin" /> : <Plus />} Add item
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
