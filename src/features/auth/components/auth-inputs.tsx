"use client";

import { Check, Eye, EyeOff, Lock, type LucideIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Brand yellow from the design. */
export const HUB_YELLOW = "#FFC200";

const inputClass =
  "h-11 w-full rounded-full border border-neutral-300 bg-white pl-11 pr-4 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-500 focus-visible:border-[#FFC200] focus-visible:ring-4 focus-visible:ring-[#FFC200]/30 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 disabled:opacity-60";

const iconClass =
  "pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-600";

/** Pill-shaped input with a leading icon. */
export function AuthInput({ icon: Icon, className, ...props }: ComponentProps<"input"> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon aria-hidden className={iconClass} />
      <input {...props} className={cn(inputClass, className)} />
    </div>
  );
}

/** Pill-shaped password input with a lock icon and a show/hide toggle. */
export function AuthPasswordInput({
  icon: Icon = Lock,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { icon?: LucideIcon }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Icon aria-hidden className={iconClass} />
      <input {...props} type={visible ? "text" : "password"} className={cn(inputClass, "pr-14", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 outline-none transition hover:bg-neutral-100 focus-visible:ring-4 focus-visible:ring-[#FFC200]/30"
      >
        {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </div>
  );
}

/** Square checkbox that turns brand yellow when ticked. Use with react-hook-form's register(). */
export function AuthCheckbox({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-neutral-900 select-none",
        className,
      )}
    >
      <span className="relative inline-flex size-4 shrink-0">
        <input
          type="checkbox"
          {...props}
          className="peer size-4 cursor-pointer appearance-none rounded-[0.4rem] border-2 border-neutral-500 bg-white outline-none transition checked:border-[#FFC200] checked:bg-[#FFC200] focus-visible:ring-4 focus-visible:ring-[#FFC200]/30"
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto size-3 text-neutral-950 opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label}
    </label>
  );
}

const buttonClass =
  "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#FFC200] text-base font-bold text-neutral-950 outline-none transition hover:bg-[#f2b800] focus-visible:ring-4 focus-visible:ring-[#FFC200]/40 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 font-[family-name:var(--font-jakarta)]";

/** Full-width yellow pill submit button. */
export function AuthSubmit({ className, ...props }: ComponentProps<"button">) {
  return <button type="submit" {...props} className={cn(buttonClass, className)} />;
}

export const authErrorClass = "rounded-2xl bg-red-50 px-4 py-2 text-xs text-red-700";
