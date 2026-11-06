"use client";

import { Check, Eye, EyeOff, Lock, type LucideIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Brand yellow from the design. */
export const HUB_YELLOW = "#FFC200";

const inputClass =
  "h-14 w-full rounded-full border border-neutral-300 bg-white pl-14 pr-5 text-base text-neutral-900 outline-none transition placeholder:text-neutral-500 focus-visible:border-[#FFC200] focus-visible:ring-4 focus-visible:ring-[#FFC200]/30 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 disabled:opacity-60 xl:h-[clamp(3.5rem,4.2vw,4.8rem)] xl:pl-[clamp(3.5rem,4.4vw,4.9rem)] xl:text-[clamp(1rem,1.3vw,1.5rem)]";

const iconClass =
  "pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-neutral-600 xl:left-[clamp(1.25rem,1.6vw,1.8rem)] xl:size-[clamp(1.25rem,1.5vw,1.7rem)]";

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
        className="absolute top-1/2 right-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 outline-none transition hover:bg-neutral-100 focus-visible:ring-4 focus-visible:ring-[#FFC200]/30"
      >
        {visible ? <Eye className="size-5 xl:size-[clamp(1.25rem,1.5vw,1.7rem)]" /> : <EyeOff className="size-5 xl:size-[clamp(1.25rem,1.5vw,1.7rem)]" />}
      </button>
    </div>
  );
}

/** Square checkbox that turns brand yellow when ticked. Use with react-hook-form's register(). */
export function AuthCheckbox({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 text-sm whitespace-nowrap text-neutral-900 select-none sm:gap-3 sm:text-[0.95rem] xl:text-[clamp(0.9rem,1.2vw,1.3rem)]",
        className,
      )}
    >
      <span className="relative inline-flex size-5 shrink-0 xl:size-6">
        <input
          type="checkbox"
          {...props}
          className="peer size-5 cursor-pointer xl:size-6 appearance-none rounded-[0.4rem] border-2 border-neutral-500 bg-white outline-none transition checked:border-[#FFC200] checked:bg-[#FFC200] focus-visible:ring-4 focus-visible:ring-[#FFC200]/30"
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto size-3.5 text-neutral-950 opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label}
    </label>
  );
}

const buttonClass =
  "flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#FFC200] text-lg font-bold text-neutral-950 outline-none transition hover:bg-[#f2b800] focus-visible:ring-4 focus-visible:ring-[#FFC200]/40 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 xl:h-[clamp(3.8rem,4.5vw,5rem)] xl:text-[clamp(1.25rem,1.65vw,1.9rem)] font-[family-name:var(--font-jakarta)]";

/** Full-width yellow pill submit button. */
export function AuthSubmit({ className, ...props }: ComponentProps<"button">) {
  return <button type="submit" {...props} className={cn(buttonClass, className)} />;
}

export const authErrorClass = "rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700";
