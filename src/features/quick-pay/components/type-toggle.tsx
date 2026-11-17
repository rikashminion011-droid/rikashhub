"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, type Ref } from "react";
import { SwapArrowsIcon } from "@/components/shared/swap-icon";
import { cn } from "@/lib/utils";
import type { EntryType } from "../validation";

const HOLD_MS = 500;

/**
 * Debit (−) and Credit (+) as two icon buttons: red for money out, green for money in.
 *
 * Gestures on the Debit button open the recent credits to attach to a debit (`onDebitHistory`): a double-click with a
 * mouse, or pressing and holding on a touch screen. A small dot on the button shows when a credit is attached.
 */
export function TypeToggle({
  value,
  onChange,
  onDebitHistory,
  historyOn = false,
  debitRef,
  size = "md",
  className,
}: {
  value: EntryType;
  onChange: (type: EntryType) => void;
  onDebitHistory?: () => void;
  /** A credit is attached to this debit. */
  historyOn?: boolean;
  /** So a pop-up can open beside the Debit button. */
  debitRef?: Ref<HTMLButtonElement>;
  size?: "md" | "sm";
  className?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const box = size === "sm" ? "size-8 rounded-lg" : "size-10 rounded-xl";
  const base = cn("relative flex shrink-0 items-center justify-center border transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [-webkit-touch-callout:none]", box);

  return (
    <div role="radiogroup" aria-label="Debit or Credit" className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <button
        ref={debitRef}
        type="button"
        role="radio"
        aria-checked={value === "DEBIT"}
        aria-label="Debit (money out)"
        title={onDebitHistory ? "Debit. Double-click, or press and hold, to attach a recent credit." : "Debit"}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          onChange("DEBIT");
        }}
        onDoubleClick={onDebitHistory}
        onPointerDown={(e) => {
          // A press and hold is for touch screens; a mouse uses the double-click.
          if (!onDebitHistory || e.pointerType === "mouse") return;
          held.current = false;
          stop();
          timer.current = setTimeout(() => {
            held.current = true;
            onDebitHistory();
          }, HOLD_MS);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => {
          if (onDebitHistory) e.preventDefault();
        }}
        className={cn(base, value === "DEBIT" ? "border-red-500 bg-red-500 text-white shadow-sm" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100")}
      >
        <Minus className={size === "sm" ? "size-4" : "size-5"} strokeWidth={2.6} aria-hidden />
        {historyOn ? <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-white bg-amber-400" /> : null}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "CREDIT"}
        aria-label="Credit (money in)"
        title="Credit"
        onClick={() => onChange("CREDIT")}
        className={cn(base, value === "CREDIT" ? "border-green-500 bg-green-500 text-white shadow-sm" : "border-green-200 bg-green-50 text-green-600 hover:bg-green-100")}
      >
        <Plus className={size === "sm" ? "size-4" : "size-5"} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  );
}

/** Self Transfer: the curved-arrows icon on a light yellow button (self transfers are yellow everywhere). */
export function SelfTransferButton({ onClick, size = "md", className }: { onClick: () => void; size?: "md" | "sm"; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Self Transfer"
      title="Self Transfer: move money between your own banks"
      className={cn(
        "flex shrink-0 items-center justify-center border border-yellow-300 bg-yellow-50 text-yellow-700 transition-colors outline-none hover:bg-yellow-100 focus-visible:ring-3 focus-visible:ring-ring/50",
        size === "sm" ? "size-8 rounded-lg" : "size-10 rounded-xl",
        className,
      )}
    >
      <SwapArrowsIcon className={size === "sm" ? "size-4" : "size-5"} />
    </button>
  );
}
