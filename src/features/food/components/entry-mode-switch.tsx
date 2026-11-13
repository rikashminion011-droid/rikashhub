"use client";

import { Soup, Wallet } from "lucide-react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FoodActions } from "../actions";
import { FoodEntryForm } from "./food-entry-form";

const DESKTOP = "(min-width: 1024px)";
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
/** True on a wide screen. The server (and the first paint) assume a phone. */
const useIsDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);

type Panel = "summary" | "payment" | "food";

/** Left to right, as you swipe: Today's Summary, Payment Entry, Food Entry. */
const ORDER: readonly { id: Panel; label: string }[] = [
  { id: "summary", label: "Today’s Summary" },
  { id: "payment", label: "Payment Entry" },
  { id: "food", label: "Food Entry" },
];

/**
 * Quick Entry's screens.
 *
 * Phone: one row of three pages, Today's Summary, Payment Entry and Food Entry, with a single tab bar above. Payment Entry
 * is showing when the page opens; swipe right for Today's Summary, left for Food Entry (or tap a tab).
 *
 * Wide screen: Payment Entry with Today's Summary beside it, and a Payment Entry / Food Entry switch above.
 *
 * Payment Entry is always the one showing when the page opens. Pages are hidden, not removed, so a half-typed payment is
 * still there when you come back. The swipe is handled here (not with a scrolling box) so dropdowns can open freely.
 */
export function EntryModeSwitch({ payment, sidePanels, foodActions }: { payment: ReactNode; sidePanels: ReactNode; foodActions: FoodActions }) {
  const desktop = useIsDesktop();
  const [active, setActive] = useState<Panel>("payment");
  // The food form is only created the first time it is opened (so Payment Entry's page load does no extra work).
  const [foodOpened, setFoodOpened] = useState(false);
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
    if (next === "food") setFoodOpened(true);
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

  // On a wide screen "summary" counts as Payment Entry (the summary sits beside it).
  const deskMode: "payment" | "food" = active === "food" ? "food" : "payment";
  const offset = desktop ? undefined : `translateX(calc(${-index * 100}% + ${dragX}px))`;

  const tab = (selected: boolean, onClick: () => void, label: string, icon?: ReactNode, className?: string, id?: string) => (
    <button
      data-tab={id}
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex h-10 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
        selected ? "bg-neutral-950 text-white shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Phone: one tab bar for all three pages */}
      <div ref={bar} role="tablist" aria-label="Quick Entry pages" className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] before:w-[28%] before:shrink-0 after:w-[28%] after:shrink-0 lg:hidden [&::-webkit-scrollbar]:hidden">
        {ORDER.map((p) => (
          <Fragment key={p.id}>
            {tab(active === p.id, () => show(p.id), p.label, p.id === "payment" ? <Wallet className="size-4" aria-hidden /> : p.id === "food" ? <Soup className="size-4" aria-hidden /> : null, "sm:flex-none sm:px-6", p.id)}
          </Fragment>
        ))}
      </div>

      {/* Wide screen: Payment Entry or Food Entry */}
      <div role="tablist" aria-label="Entry type" className="hidden w-fit gap-1 rounded-xl bg-muted p-1 lg:flex">
        {tab(deskMode === "payment", () => show("payment"), "Payment Entry", <Wallet className="size-4" aria-hidden />, "lg:flex-none lg:px-6")}
        {tab(deskMode === "food", () => show("food"), "Food Entry", <Soup className="size-4" aria-hidden />, "lg:flex-none lg:px-6")}
      </div>

      <div
        ref={frame}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        className="overflow-x-clip [touch-action:pan-y] lg:overflow-visible"
      >
        <div
          style={{ transform: offset, transition: dragging ? "none" : "transform 250ms ease-out" }}
          className="flex w-full lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6 lg:!transform-none"
        >
          {/* 1. Today's Summary (beside Payment Entry on a wide screen) */}
          <section
            id="entry-panel-summary"
            aria-label="Today's Summary"
            inert={!desktop && active !== "summary"}
            className={cn("w-full shrink-0 space-y-6 lg:order-2 lg:w-auto", deskMode === "food" && "lg:hidden")}
          >
            {sidePanels}
          </section>

          {/* 2. Payment Entry */}
          <section id="entry-panel-payment" aria-label="Payment Entry" inert={!desktop && active !== "payment"} className={cn("w-full shrink-0 lg:order-1 lg:w-auto", deskMode === "food" && "lg:hidden")}>
            {payment}
          </section>

          {/* 3. Food Entry */}
          <section id="entry-panel-food" aria-label="Food Entry" inert={!desktop && active !== "food"} className={cn("w-full shrink-0 lg:order-3 lg:col-span-2 lg:max-w-3xl", deskMode !== "food" && "lg:hidden")}>
            {foodOpened ? <FoodEntryForm actions={foodActions} /> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
