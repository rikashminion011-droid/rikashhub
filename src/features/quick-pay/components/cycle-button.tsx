"use client";

import { SwapArrowsIcon } from "@/components/shared/swap-icon";
import { cn } from "@/lib/utils";

/**
 * The small switch icon beside a dropdown. Each press moves the choice to the next one in the list (GPay Canara, then
 * GPay IDFC, and so on, and back to the first after the last), so a value can be changed without opening the list.
 */
export function CycleButton({ label, onClick, disabled = false, className }: { label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-primary transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      <SwapArrowsIcon className="size-5" />
    </button>
  );
}
