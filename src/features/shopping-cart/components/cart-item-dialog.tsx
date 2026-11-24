"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MonthPicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CartActions } from "../actions";
import type { CartCategory, CartItem } from "../server/service";

const NEW = "__new";

/**
 * Add or edit a Shopping Cart item: its name, the month and year it is planned for, a category (choose one or make a new one
 * right here) and the product link. The cart number is given automatically and never changes.
 */
export function CartItemDialog({
  open,
  onOpenChange,
  item,
  categories,
  defaultMonth,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item being edited, or null to add a new one. */
  item: CartItem | null;
  categories: CartCategory[];
  defaultMonth: string;
  actions: Pick<CartActions, "add" | "update">;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open ? <Body key={item?.id ?? "new"} item={item} categories={categories} defaultMonth={defaultMonth} actions={actions} onClose={() => onOpenChange(false)} /> : null}</DialogContent>
    </Dialog>
  );
}

function Body({ item, categories, defaultMonth, actions, onClose }: { item: CartItem | null; categories: CartCategory[]; defaultMonth: string; actions: Pick<CartActions, "add" | "update">; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(item?.name ?? "");
  const [month, setMonth] = useState(item?.plannedMonth ?? defaultMonth);
  const [category, setCategory] = useState<string>(item?.categoryId ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [link, setLink] = useState(item?.productLink ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const body = { name, plannedMonth: month, categoryId: category && category !== NEW ? category : null, newCategory: category === NEW ? newCategory : undefined, productLink: link };
    const r = item ? await actions.update({ id: item.id, ...body }) : await actions.add(body);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast.success(item ? "Item updated." : `${r.item.cartLabel} added.`);
    router.refresh();
    onClose();
  }

  const field = "h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm";
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-3"
    >
      <DialogHeader>
        <DialogTitle>{item ? `Edit ${item.cartLabel}` : "Add to Shopping Cart"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-1">
        <label htmlFor="cart-name" className="text-xs font-medium text-muted-foreground">
          Item name
        </label>
        <Input id="cart-name" value={name} maxLength={120} autoFocus={!item} onChange={(e) => setName(e.target.value)} placeholder="What to buy" className="h-10 text-base sm:text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Planned month and year</span>
          <MonthPicker value={month} ariaLabel="Planned month and year" className="w-full" onChange={(m) => m && setMonth(m)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="cart-category" className="text-xs font-medium text-muted-foreground">
            Category
          </label>
          <select id="cart-category" value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW}>+ New category…</option>
          </select>
        </div>
      </div>
      {category === NEW ? <Input aria-label="New category name" value={newCategory} maxLength={40} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" className="h-10 text-base sm:text-sm" /> : null}
      <div className="space-y-1">
        <label htmlFor="cart-link" className="text-xs font-medium text-muted-foreground">
          Product link (optional)
        </label>
        <Input id="cart-link" inputMode="url" value={link} maxLength={2000} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className="h-10 text-base sm:text-sm" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </DialogFooter>
    </form>
  );
}
