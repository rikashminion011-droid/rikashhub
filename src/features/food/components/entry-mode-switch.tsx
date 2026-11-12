"use client";

import { Soup, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FoodActions } from "../actions";
import { FoodEntryForm } from "./food-entry-form";

type Mode = "payment" | "food";

/**
 * Quick Entry's two modes. Payment Entry is always the one showing when the page opens. Switching to Food Entry
 * hides the payment form without unmounting it, so a half-typed payment is still there when you switch back.
 */
export function EntryModeSwitch({ payment, sidePanels, foodActions }: { payment: ReactNode; sidePanels: ReactNode; foodActions: FoodActions }) {
  const [mode, setMode] = useState<Mode>("payment");
  // The food form is only created the first time it is opened (so Payment Entry's page load does no extra work).
  const [foodOpened, setFoodOpened] = useState(false);

  const choose = (next: Mode) => {
    setMode(next);
    if (next === "food") setFoodOpened(true);
  };

  const tab = (value: Mode, label: string, Icon: typeof Wallet) => (
    <button
      type="button"
      role="tab"
      id={`entry-tab-${value}`}
      aria-selected={mode === value}
      aria-controls={`entry-panel-${value}`}
      onClick={() => choose(value)}
      className={cn(
        "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold whitespace-nowrap transition-colors sm:flex-none sm:gap-2 sm:px-6",
        mode === value ? "bg-neutral-950 text-white shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Entry type" className="flex w-full gap-1 rounded-xl bg-muted p-1 sm:w-fit">
        {tab("payment", "Payment Entry", Wallet)}
        {tab("food", "Food Entry", Soup)}
      </div>

      <div id="entry-panel-payment" role="tabpanel" aria-labelledby="entry-tab-payment" hidden={mode !== "payment"}>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {payment}
          <div className="space-y-6">{sidePanels}</div>
        </div>
      </div>

      <div id="entry-panel-food" role="tabpanel" aria-labelledby="entry-tab-food" hidden={mode !== "food"}>
        {foodOpened ? (
          <div className="max-w-3xl">
            <FoodEntryForm actions={foodActions} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
