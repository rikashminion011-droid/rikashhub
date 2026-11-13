"use client";

import { ArrowLeftRight, Receipt, Soup, Wallet } from "lucide-react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FoodActions } from "../actions";
import { PeriodContext } from "@/features/quick-pay/components/period-context";
import { PeriodHeader } from "@/features/quick-pay/components/period-header";
import { SHOW_TRANSACTIONS_EVENT } from "@/features/quick-pay/components/transactions-panel";
import { periodFor, type Period } from "@/features/quick-pay/period";
import type { getPeriodTotalsAction } from "@/features/quick-pay/actions";
import { FoodEntryForm } from "./food-entry-form";

const DESKTOP = "(min-width: 1024px)";
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
/** True on a wide screen. The server (and the first paint) assume a phone. */
const useIsDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);

type Panel = "transactions" | "payment" | "food" | "transfer";

/** Left to right, as you swipe: Transactions, Payment Entry, Food Rent, Self Transfer. */
const ORDER: readonly { id: Panel; label: string; icon: ReactNode }[] = [
  { id: "transactions", label: "Transactions", icon: <Receipt className="size-4" aria-hidden /> },
  { id: "payment", label: "Payment Entry", icon: <Wallet className="size-4" aria-hidden /> },
  { id: "food", label: "Food Rent", icon: <Soup className="size-4" aria-hidden /> },
  { id: "transfer", label: "Self Transfer", icon: <ArrowLeftRight className="size-4" aria-hidden /> },
];

/**
 * Quick Entry's screens: Transactions, Payment Entry, Food Rent and Self Transfer, in that order, with one tab bar above.
 *
 * Payment Entry is showing when the page opens. On a phone you can also swipe left or right to move between the pages (or tap
 * a tab). Pages are hidden, not removed, so a half-typed payment is still there when you come back. The swipe is handled here
 * (not with a scrolling box) so dropdowns can open freely.
 */
export function EntryModeSwitch({
  transactions,
  payment,
  transfer,
  foodActions,
  today,
  getTotals,
}: {
  transactions: ReactNode;
  payment: ReactNode;
  transfer: ReactNode;
  foodActions: FoodActions;
  /** Today's date, YYYY-MM-DD in India time. */
  today: string;
  getTotals: typeof getPeriodTotalsAction;
}) {
  // One period for the whole page: the totals above the tabs and the Transactions list both follow it.
  const [period, setPeriod] = useState<Period>(() => periodFor("day", today));
  const desktop = useIsDesktop();
  const [active, setActive] = useState<Panel>("payment");
  // These pages are only created the first time they are opened (so Payment Entry's page load does no extra work).
  const [opened, setOpened] = useState<ReadonlySet<Panel>>(new Set(["payment"]));
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; horizontal: boolean | null } | null>(null);
  // The latest drag distance, kept in a ref as well so a quick flick (events arriving before a re-render) is not missed.
  const drag = useRef(0);

  const index = ORDER.findIndex((p) => p.id === active);

  // On a phone the three tabs can be wider than the screen. The bar scrolls (with some room at both ends so even the first and
  // last tab can reach the middle), and whichever page you are on, by tapping or swiping, is brought to the middle of it.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (desktop) return;
    bar.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active, desktop]);
  const show = (next: Panel) => {
    setActive(next);
    setOpened((o) => (o.has(next) ? o : new Set([...o, next])));
    // Read the list again, so what was just saved in Payment Entry or Self Transfer is in it.
    if (next === "transactions") window.dispatchEvent(new Event(SHOW_TRANSACTIONS_EVENT));
  };
  const width = () => frame.current?.clientWidth ?? 360;

  function onDown(event: ReactPointerEvent) {
    if (desktop || event.pointerType === "mouse" || !event.isPrimary) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: null };
  }

  function onMove(event: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // A mostly-sideways movement is a swipe; a mostly-vertical one is the page scrolling.
      g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!g.horizontal) {
        gesture.current = null;
        return;
      }
      try {
        frame.current?.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone; the swipe still works without capture.
      }
      setDragging(true);
    }
    // Pulling right goes to the page on the left, pulling left to the one on the right; nothing beyond the ends.
    const limit = width();
    const min = index < ORDER.length - 1 ? -limit : 0;
    const max = index > 0 ? limit : 0;
    drag.current = Math.max(min, Math.min(max, dx));
    setDragX(drag.current);
  }

  function end(event: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (g.horizontal && Math.abs(drag.current) > width() * 0.2) {
      const target = ORDER[drag.current > 0 ? index - 1 : index + 1];
      if (target) show(target.id);
    }
    drag.current = 0;
    setDragX(0);
    setDragging(false);
  }

  const offset = desktop ? undefined : `translateX(calc(${-index * 100}% + ${dragX}px))`;

  const tab = (selected: boolean, onClick: () => void, label: string, icon: ReactNode, id: string) => (
    <button
      data-tab={id}
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex h-10 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-colors sm:flex-none sm:px-5",
        selected ? "bg-neutral-950 text-white shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );

  const pages: Record<Panel, ReactNode> = {
    transactions: opened.has("transactions") ? transactions : null,
    payment,
    food: opened.has("food") ? <FoodEntryForm actions={foodActions} /> : null,
    transfer: opened.has("transfer") ? transfer : null,
  };

  return (
    <PeriodContext.Provider value={{ period, today }}>
    <div className="space-y-5">
      {/* Totals and the period control, above every tab */}
      <PeriodHeader period={period} onPeriod={setPeriod} today={today} food={active === "food"} getTotals={getTotals} getFoodTotal={foodActions.getTotal} />

      {/* One tab bar for all the pages; on a phone it scrolls, with room at both ends so even the first and last tab can reach the middle */}
      <div
        ref={bar}
        role="tablist"
        aria-label="Quick Entry pages"
        className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] before:w-[20%] before:shrink-0 after:w-[20%] after:shrink-0 sm:w-fit sm:overflow-visible sm:before:hidden sm:after:hidden [&::-webkit-scrollbar]:hidden"
      >
        {ORDER.map((p) => (
          <Fragment key={p.id}>{tab(active === p.id, () => show(p.id), p.label, p.icon, p.id)}</Fragment>
        ))}
      </div>

      <div
        ref={frame}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        className="overflow-x-clip [touch-action:pan-y] lg:overflow-visible"
      >
        <div style={{ transform: offset, transition: dragging ? "none" : "transform 250ms ease-out" }} className="flex w-full lg:!transform-none">
          {ORDER.map((p) => (
            <section
              key={p.id}
              id={`entry-panel-${p.id}`}
              aria-label={p.label}
              inert={!desktop && active !== p.id}
              data-active={active === p.id}
              className="w-full shrink-0 lg:max-w-3xl lg:data-[active=false]:hidden"
            >
              {pages[p.id]}
            </section>
          ))}
        </div>
      </div>
    </div>
    </PeriodContext.Provider>
  );
}
