"use client";

import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MonthPicker } from "@/components/shared/date-picker";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { useTxParams } from "@/features/quick-pay/components/use-tx-params";
import { cn } from "@/lib/utils";
import type { CartActions } from "../actions";
import type { CartCategory, CartItem } from "../server/service";
import { CartItemDialog } from "./cart-item-dialog";

const monthName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
export const monthLabel = (month: string) => monthName.format(new Date(`${month}-01T00:00:00Z`));

/** "2026-11" moved by a number of months. */
export function shiftMonth(month: string, by: number): string {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * The Shopping Cart page: category chips (every category, new ones included, scrolling sideways on a phone), a month and year
 * filter with previous / next and All Months, and the table. The two filters live in the address, each changing on its own
 * without touching the other.
 */
export function CartView({ items, categories, month, categoryId, currentMonth, actions }: { items: CartItem[]; categories: CartCategory[]; /** "YYYY-MM", or null for every month. */ month: string | null; categoryId: string | null; currentMonth: string; actions: CartActions }) {
  const router = useRouter();
  const { go } = useTxParams();
  const [editing, setEditing] = useState<CartItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<CartItem | null>(null);

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={active} onClick={onClick} className={cn("h-9 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50", active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted")}>
      {label}
    </button>
  );
  const arrow = "flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-background outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="min-w-0 space-y-4">
      {/* Categories: one row that scrolls sideways inside its own box, so the page itself never grows wider */}
      <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <div className="flex w-max gap-2" role="group" aria-label="Categories">
          {chip("All", categoryId === null, () => go({ cat: "" }))}
          {categories.map((c) => chip(c.name, categoryId === c.id, () => go({ cat: c.id })))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="Month and year">
          <button type="button" aria-label="Previous month" disabled={month === null} onClick={() => month && go({ month: shiftMonth(month, -1) })} className={cn(arrow, "disabled:opacity-40")}>
            <ChevronLeft className="size-4" />
          </button>
          <MonthPicker value={month ?? ""} ariaLabel="Month and year" className="w-48" onChange={(m) => m && go({ month: m })} />
          <button type="button" aria-label="Next month" disabled={month === null} onClick={() => month && go({ month: shiftMonth(month, 1) })} className={cn(arrow, "disabled:opacity-40")}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        {chip("All Months", month === null, () => go({ month: month === null ? currentMonth : "all" }))}
        <Button type="button" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus /> Add item
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">Nothing in the cart for this month and category. Use Add item to plan a purchase.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Cart Number</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Item Name</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Planned Purchase Date</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Category</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Product Link</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{i.cartLabel}</td>
                    <td className="max-w-64 px-3 py-2.5 break-words">{i.name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{monthLabel(i.plannedMonth)}</td>
                    <td className="px-3 py-2.5">{i.category || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {i.productLink ? (
                        <a href={i.productLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                          Open <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${i.cartLabel}`} onClick={() => setEditing(i)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${i.cartLabel}`} onClick={() => setDeleting(i)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {items.map((i) => (
              <li key={i.id} className="space-y-1.5 rounded-xl border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-primary">{i.cartLabel}</p>
                    <p className="font-medium break-words">{i.name}</p>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${i.cartLabel}`} onClick={() => setEditing(i)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${i.cartLabel}`} onClick={() => setDeleting(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{monthLabel(i.plannedMonth)}</span>
                  {i.category ? <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">{i.category}</span> : null}
                  {i.productLink ? (
                    <a href={i.productLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary">
                      Open link <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <CartItemDialog open={adding} onOpenChange={setAdding} item={null} categories={categories} defaultMonth={month ?? currentMonth} actions={actions} />
      <CartItemDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} item={editing} categories={categories} defaultMonth={currentMonth} actions={actions} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Delete ${deleting.cartLabel}?` : "Delete"}
        description={deleting ? `${deleting.name} is removed from the cart. Its number ${deleting.cartLabel} is not used again.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return null;
          const r = await actions.remove({ id: deleting.id });
          if (!r.ok) return r.error;
          toast.success("Item deleted.");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
