"use client";

import { ExternalLink, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CartActions } from "../actions";
import type { CartCategory, CartItem } from "../server/service";
import { CartItemDialog } from "./cart-item-dialog";
import { monthLabel } from "./cart-view";

/** Shopping Cart inside Quick Entry: this month's planned purchases, a quick Add, and a link to the whole cart. */
export function CartPanel({ items, categories, currentMonth, actions }: { items: CartItem[]; categories: CartCategory[]; currentMonth: string; actions: Pick<CartActions, "add" | "update"> }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="min-w-0 space-y-2 rounded-xl border bg-card p-3" aria-label="Shopping Cart">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <ShoppingCart className="size-4 text-primary" aria-hidden /> Shopping Cart
          <span className="text-xs font-normal text-muted-foreground">{monthLabel(currentMonth)}</span>
        </h2>
        <Button type="button" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">Nothing planned for this month.</p>
      ) : (
        <ul className="max-h-60 divide-y overflow-y-auto text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="mr-1.5 text-xs font-semibold text-primary">{i.cartLabel}</span>
                <span className="break-words">{i.name}</span>
                {i.category ? <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px]">{i.category}</span> : null}
              </span>
              {i.productLink ? (
                <a href={i.productLink} target="_blank" rel="noopener noreferrer" aria-label={`Open the link for ${i.cartLabel}`} className="shrink-0 text-primary">
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Link href="/shopping-cart" className="inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
        Open the whole Shopping Cart
      </Link>
      <CartItemDialog open={adding} onOpenChange={setAdding} item={null} categories={categories} defaultMonth={currentMonth} actions={actions} />
    </section>
  );
}
