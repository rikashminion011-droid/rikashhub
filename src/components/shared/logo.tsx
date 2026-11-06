import { cn } from "@/lib/utils";

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "flex size-8 items-center justify-center rounded-lg text-sm font-semibold tracking-tight",
          inverted ? "bg-white text-zinc-950" : "bg-foreground text-background",
        )}
      >
        R
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Rikash Finance</span>
    </div>
  );
}
