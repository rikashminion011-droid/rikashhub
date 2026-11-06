import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + error/hint, wired for accessibility (the control should set aria-describedby={`${id}-message`}). */
export function Field({
  id,
  label,
  error,
  hint,
  hideLabel = false,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Keep the label for screen readers but do not show it (placeholder-style forms). */
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", hideLabel && "space-y-1")}>
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-message`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-message`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
