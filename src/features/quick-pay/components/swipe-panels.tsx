"use client";

import { useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const DESKTOP = "(min-width: 1024px)";
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
/** True on a wide screen. The server (and the first paint) assume a phone, which is where the panels matter. */
const useIsDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);

type Which = "side" | "main";

/**
 * Quick Entry's two panels. On a wide screen they sit side by side (entry on the left, summary on the right).
 * On a phone they are two full-width pages: Quick Entry is showing when the page opens, swipe right for Today's Summary,
 * and swipe back left to return to Quick Entry. The two tabs above also switch.
 *
 * The swipe is handled here (not with a scrolling container) so dropdowns inside the form can open freely.
 */
export function SwipePanels({ main, side, sideLabel = "Summary" }: { main: ReactNode; side: ReactNode; sideLabel?: string }) {
  const desktop = useIsDesktop();
  const [active, setActive] = useState<Which>("main");
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; horizontal: boolean | null } | null>(null);

  const width = () => frame.current?.clientWidth ?? 360;

  function onDown(e: ReactPointerEvent) {
    if (desktop || e.pointerType === "mouse" || !e.isPrimary) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, horizontal: null };
  }

  function onMove(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // A mostly-sideways movement is a swipe; a mostly-vertical one is the page scrolling.
      g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!g.horizontal) {
        gesture.current = null;
        return;
      }
      frame.current?.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    // Quick Entry can only be pulled right (towards the summary), and the summary only left.
    setDragX(active === "main" ? Math.max(0, Math.min(dx, width())) : Math.min(0, Math.max(dx, -width())));
  }

  function end(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.horizontal) {
      const far = Math.abs(dragX) > width() * 0.2;
      if (far) setActive(active === "main" ? "side" : "main");
    }
    setDragX(0);
    setDragging(false);
  }

  const offset = desktop ? undefined : `translateX(calc(${active === "main" ? -100 : 0}% + ${dragX}px))`;

  return (
    <div>
      {/* Phone only: where you are, and a way to jump */}
      <div role="tablist" aria-label="Quick Entry panels" className="mb-3 flex gap-1 rounded-xl bg-muted p-1 lg:hidden">
        {(
          [
            ["side", sideLabel],
            ["main", "Quick Entry"],
          ] as const
        ).map(([which, label]) => (
          <button
            key={which}
            type="button"
            role="tab"
            aria-selected={active === which}
            onClick={() => setActive(which)}
            className={cn("h-9 flex-1 rounded-lg text-sm font-semibold transition-colors", active === which ? "bg-neutral-950 text-white shadow-sm" : "text-muted-foreground")}
          >
            {label}
          </button>
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
        <div
          style={{ transform: offset, transition: dragging ? "none" : "transform 250ms ease-out" }}
          className="flex w-full lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6 lg:!transform-none"
        >
          <div inert={!desktop && active !== "side"} aria-label={sideLabel} className="w-full shrink-0 space-y-6 lg:order-2 lg:w-auto">
            {side}
          </div>
          <div inert={!desktop && active !== "main"} className="w-full shrink-0 lg:order-1 lg:w-auto">
            {main}
          </div>
        </div>
      </div>
    </div>
  );
}
