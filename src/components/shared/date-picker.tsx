"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { useRef, useState } from "react";
import { MONTH_NAMES, calendarWeeks, formatClock, formatLongDate, formatMonthYear, fromClock12, toClock12, type Clock12 } from "@/features/quick-pay/date-format";
import { cn } from "@/lib/utils";

const triggerClass =
  "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30";
const popupClass = "z-50 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none";

function PopupShell({ children, width = "w-72" }: { children: React.ReactNode; width?: string }) {
  return (
    <Popover.Portal>
      <Popover.Positioner sideOffset={6} className="isolate z-[60]">
        <Popover.Popup data-popup="" className={cn(popupClass, width, "max-w-[calc(100vw-1rem)]")}>
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

// ───────────────────────── Date ─────────────────────────

/**
 * A date shown as "04th October, 2026". Press it to open a calendar and pick a day. `min` and `max` (YYYY-MM-DD) grey out
 * days outside the range. The value is always YYYY-MM-DD.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  ariaLabel,
  placeholder = "Choose a date",
  clearable = false,
  invalid = false,
  disabled = false,
  className,
  compact = false,
  bare = false,
  hideIcon = false,
}: {
  /** No box around it: it looks like plain text until hovered or focused (for spreadsheet-style rows). */
  bare?: boolean;
  /** Leave out the little calendar icon: the date alone is the button. */
  hideIcon?: boolean;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  ariaLabel: string;
  placeholder?: string;
  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : (max ?? new Date().toISOString().slice(0, 10));
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });

  const step = (by: number) => setView((v) => ({ y: v.y + Math.floor((v.m + by) / 12), m: (((v.m + by) % 12) + 12) % 12 }));
  const weeks = calendarWeeks(view.y, view.m);
  const out = (d: string) => (min !== undefined && d < min) || (max !== undefined && d > max);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Open on the month of the chosen date.
          const shown = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : base;
          setView({ y: Number(shown.slice(0, 4)), m: Number(shown.slice(5, 7)) - 1 });
        }
      }}
    >
      <Popover.Trigger
        type="button"
        aria-label={`${ariaLabel}${value ? `: ${formatLongDate(value)}` : ""}`}
        data-grid-control=""
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={cn(triggerClass, compact && "h-8", bare && "border-transparent bg-transparent shadow-none hover:bg-muted/60 focus-visible:bg-background dark:bg-transparent", className)}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? formatLongDate(value) : placeholder}</span>
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          {clearable && value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Clear ${ariaLabel}`}
              className="rounded p-0.5 hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            >
              <X className="size-3.5" />
            </span>
          ) : null}
          {hideIcon ? null : <CalendarDays className="size-3.5" aria-hidden />}
        </span>
      </Popover.Trigger>
      <PopupShell>
        <div className="mb-2 flex items-center justify-between gap-1">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="flex size-8 items-center justify-center rounded-lg hover:bg-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="text-sm font-semibold" aria-live="polite">
            {MONTH_NAMES[view.m]} {view.y}
          </p>
          <button type="button" aria-label="Next month" onClick={() => step(1)} className="flex size-8 items-center justify-center rounded-lg hover:bg-muted">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {weeks.flat().map((day, i) =>
            day === null ? (
              <span key={i} />
            ) : (
              <button
                key={day}
                type="button"
                disabled={out(day)}
                aria-label={formatLongDate(day)}
                aria-pressed={day === value}
                onClick={() => {
                  onChange(day);
                  setOpen(false);
                }}
                className={cn(
                  "mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30",
                  day === value ? "bg-primary font-semibold text-white" : "hover:bg-muted",
                )}
              >
                {Number(day.slice(8))}
              </button>
            ),
          )}
        </div>
        {max ? (
          <div className="mt-2 flex justify-between border-t pt-2 text-xs">
            <button type="button" onClick={() => { onChange(max); setOpen(false); }} className="font-medium text-muted-foreground hover:text-foreground">
              Today
            </button>
            {clearable ? (
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="font-medium text-muted-foreground hover:text-foreground">
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </PopupShell>
    </Popover.Root>
  );
}

// ───────────────────────── Month ─────────────────────────

/** A month shown as "November 2026", chosen from a year and a grid of months. The value is YYYY-MM. */
export function MonthPicker({ value, onChange, max, ariaLabel, className, clearable = false }: { value: string; onChange: (value: string) => void; max?: string; ariaLabel: string; className?: string; clearable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number((value || max || new Date().toISOString()).slice(0, 4)));

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setYear(Number((value || max || new Date().toISOString()).slice(0, 4)));
      }}
    >
      <Popover.Trigger type="button" aria-label={`${ariaLabel}${value ? `: ${formatMonthYear(value)}` : ""}`} className={cn(triggerClass, className)}>
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? formatMonthYear(value) : "Choose a month"}</span>
        <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Popover.Trigger>
      <PopupShell width="w-64">
        <div className="mb-2 flex items-center justify-between gap-1">
          <button type="button" aria-label="Previous year" onClick={() => setYear((y) => y - 1)} className="flex size-8 items-center justify-center rounded-lg hover:bg-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="text-sm font-semibold">{year}</p>
          <button type="button" aria-label="Next year" onClick={() => setYear((y) => y + 1)} className="flex size-8 items-center justify-center rounded-lg hover:bg-muted">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_NAMES.map((name, i) => {
            const month = `${year}-${String(i + 1).padStart(2, "0")}`;
            return (
              <button
                key={month}
                type="button"
                disabled={max !== undefined && month > max}
                aria-pressed={month === value}
                onClick={() => {
                  onChange(month);
                  setOpen(false);
                }}
                className={cn("h-9 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30", month === value ? "bg-primary font-semibold text-white" : "hover:bg-muted")}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
        {clearable && value ? (
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="mt-2 w-full border-t pt-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            Clear
          </button>
        ) : null}
      </PopupShell>
    </Popover.Root>
  );
}

// ───────────────────────── Time ─────────────────────────

const DIAL = 200;
const RADIUS = 78;

/**
 * A time shown as "06:00 PM". Press it to open a clock: pick the hour on the dial, then the minute, then AM or PM, and press
 * OK (Cancel keeps what was there; Clear empties it). The value is HH:mm, 24 hour.
 */
export function TimePicker({
  value,
  onChange,
  ariaLabel,
  placeholder = "Choose a time",
  invalid = false,
  disabled = false,
  className,
  compact = false,
  bare = false,
}: {
  bare?: boolean;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Clock12>({ hour: 12, minute: 0, pm: false });
  const [stage, setStage] = useState<"hour" | "minute">("hour");
  // What is being typed in the hour or minute box. Null means the box shows the clock's own value.
  const [typed, setTyped] = useState<{ field: "hour" | "minute"; text: string } | null>(null);
  const minuteBox = useRef<HTMLInputElement>(null);
  const hourBox = useRef<HTMLInputElement>(null);
  const meridiemBox = useRef<HTMLButtonElement>(null);

  function onOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setDraft(toClock12(value) ?? { hour: 12, minute: 0, pm: false });
      setStage("hour");
      setTyped(null);
    }
  }

  const choices = stage === "hour" ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i * 5);
  const selected = stage === "hour" ? draft.hour : draft.minute;
  const spot = (index: number) => {
    const angle = (index / 12) * 2 * Math.PI - Math.PI / 2; // 12 o'clock is straight up
    return { x: DIAL / 2 + RADIUS * Math.cos(angle), y: DIAL / 2 + RADIUS * Math.sin(angle) };
  };
  // The hand points to the chosen number; a minute between the fives still lands on the nearest mark.
  const handIndex = stage === "hour" ? draft.hour % 12 : Math.round(draft.minute / 5) % 12;
  const hand = spot(handIndex);

  function pick(n: number) {
    if (stage === "hour") {
      setDraft((d) => ({ ...d, hour: n }));
      setStage("minute");
    } else setDraft((d) => ({ ...d, minute: n }));
  }

  /**
   * Typing an hour: 1 to 12 as it is; 13 to 23 are taken as the 24-hour clock (so 23 means 11 PM); 0 means 12. Anything above 23
   * is not a time and is left out. Typing a minute: 0 to 59, any minute, not only the fives on the dial.
   */
  function type(field: "hour" | "minute", text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 2);
    setTyped({ field, text: digits });
    if (digits === "") return;
    const n = Number(digits);
    if (field === "minute") {
      if (n <= 59) setDraft((d) => ({ ...d, minute: n }));
      return;
    }
    if (n === 0) setDraft((d) => ({ ...d, hour: 12 }));
    else if (n <= 12) setDraft((d) => ({ ...d, hour: n }));
    else if (n <= 23) setDraft((d) => ({ ...d, hour: n - 12, pm: true }));
    // Two digits typed in the hour box: on to the minutes.
    if (field === "hour" && digits.length === 2 && n <= 23) {
      setStage("minute");
      minuteBox.current?.focus();
    }
  }
  const badTime = (field: "hour" | "minute") => typed?.field === field && typed.text !== "" && Number(typed.text) > (field === "hour" ? 23 : 59);
  const shown = (field: "hour" | "minute") => (typed?.field === field ? typed.text : String(field === "hour" ? draft.hour : draft.minute).padStart(2, "0"));

  const seg = (active: boolean) => cn("rounded-lg px-2 py-1 text-5xl font-light tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-blue-100 text-blue-600" : "text-foreground/80 hover:bg-muted");

  return (
    <Popover.Root open={open} onOpenChange={onOpen}>
      <Popover.Trigger type="button" aria-label={`${ariaLabel}${value ? `: ${formatClock(value)}` : ""}`} data-grid-control="" aria-invalid={invalid || undefined} disabled={disabled} className={cn(triggerClass, compact && "h-8", bare && "border-transparent bg-transparent shadow-none hover:bg-muted/60 focus-visible:bg-background dark:bg-transparent", className)}>
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? formatClock(value) : placeholder}</span>
        <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Popover.Trigger>
      <PopupShell width="w-[22rem]">
        <div className="flex items-center justify-center gap-1">
          <input
            ref={hourBox}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Hour"
            aria-invalid={badTime("hour") || undefined}
            value={shown("hour")}
            onFocus={(e) => {
              setStage("hour");
              setTyped({ field: "hour", text: "" });
              e.currentTarget.select();
            }}
            onBlur={() => setTyped(null)}
            onChange={(e) => type("hour", e.target.value)}
            onKeyDown={(e) => {
              // Enter or Space: on to the minutes.
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                minuteBox.current?.focus();
              }
            }}
            className={cn(seg(stage === "hour"), "w-[4.5rem] text-center", badTime("hour") && "bg-red-100 text-red-600")}
          />
          <span className="text-5xl font-light text-muted-foreground">:</span>
          <input
            ref={minuteBox}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Minute"
            aria-invalid={badTime("minute") || undefined}
            value={shown("minute")}
            onFocus={(e) => {
              setStage("minute");
              setTyped({ field: "minute", text: "" });
              e.currentTarget.select();
            }}
            onBlur={() => setTyped(null)}
            onChange={(e) => type("minute", e.target.value)}
            onKeyDown={(e) => {
              // Space: on to AM / PM.
              if (e.key === " ") {
                e.preventDefault();
                meridiemBox.current?.focus();
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (badTime("minute")) return;
                onChange(fromClock12(draft));
                setOpen(false);
              }
            }}
            className={cn(seg(stage === "minute"), "w-[4.5rem] text-center", badTime("minute") && "bg-red-100 text-red-600")}
          />
          <button
            ref={meridiemBox}
            type="button"
            aria-label={`${draft.pm ? "PM" : "AM"}: press Space to switch`}
            onClick={() => setDraft((d) => ({ ...d, pm: !d.pm }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (badTime("hour") || badTime("minute")) return;
                onChange(fromClock12(draft));
                setOpen(false);
              }
            }}
            className="ml-2 rounded-lg px-2 py-1 text-lg font-medium text-muted-foreground outline-none hover:bg-muted focus-visible:bg-blue-100 focus-visible:text-blue-600 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {draft.pm ? "PM" : "AM"}
          </button>
        </div>
        <p className="mb-2 text-center text-xs text-muted-foreground">{badTime("hour") ? "Hours go up to 23" : badTime("minute") ? "Minutes go up to 59" : stage === "hour" ? "Pick or type the hour" : "Pick or type the minute"}</p>

        <div className="flex items-center gap-3">
          <div className="relative shrink-0 rounded-full bg-muted/70" style={{ width: DIAL, height: DIAL }}>
            <svg className="pointer-events-none absolute inset-0" width={DIAL} height={DIAL} aria-hidden>
              <line x1={DIAL / 2} y1={DIAL / 2} x2={hand.x} y2={hand.y} stroke="#3b5bdb" strokeWidth="2" />
              <circle cx={DIAL / 2} cy={DIAL / 2} r="4" fill="#3b5bdb" />
            </svg>
            {choices.map((n, i) => {
              const p = spot(stage === "hour" ? n % 12 : i);
              const on = n === selected;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n}${stage === "minute" ? " minutes" : " o'clock"}`}
                  aria-pressed={on}
                  onClick={() => pick(n)}
                  style={{ left: p.x - 18, top: p.y - 18 }}
                  className={cn("absolute flex size-9 items-center justify-center rounded-full text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-[#3b5bdb] font-semibold text-white" : "hover:bg-background")}
                >
                  {stage === "minute" ? String(n).padStart(2, "0") : n}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            {(["AM", "PM"] as const).map((half) => (
              <button
                key={half}
                type="button"
                aria-pressed={draft.pm === (half === "PM")}
                onClick={() => setDraft((d) => ({ ...d, pm: half === "PM" }))}
                className={cn("h-11 w-14 rounded-lg border text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", draft.pm === (half === "PM") ? "border-[#3b5bdb] bg-[#3b5bdb] text-white" : "hover:bg-muted")}
              >
                {half}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border px-4 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              type="button"
              disabled={badTime("hour") || badTime("minute")}
              onClick={() => {
                onChange(fromClock12(draft));
                setOpen(false);
              }}
              className="h-9 rounded-lg bg-[#3b5bdb] disabled:opacity-50 px-5 text-sm font-semibold text-white hover:bg-[#3451c7]"
            >
              OK
            </button>
          </div>
        </div>
      </PopupShell>
    </Popover.Root>
  );
}

// ───────────────────────── Date range ─────────────────────────

const short = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]} ${MONTH_NAMES[Number(m[2]) - 1]!.slice(0, 3)} ${m[1]}` : "";
};

/**
 * One calendar icon for a From and To period. Press it, pick the first day, then the last day (earlier days are swapped into
 * order); the period is applied when the second day is chosen. The month arrows can be used between the two choices. Values are
 * YYYY-MM-DD, or empty for no limit.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  max,
  ariaLabel,
  className,
  placeholder = "Choose dates",
  iconOnly = false,
}: {
  /** Just a calendar icon button (the period is in its tooltip), for a toolbar. */
  iconOnly?: boolean;
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  max?: string;
  ariaLabel: string;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  // The first day chosen while the second one is still to come.
  const [first, setFirst] = useState<string | null>(null);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : (max ?? new Date().toISOString().slice(0, 10));
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const step = (by: number) => setView((v) => ({ y: v.y + Math.floor((v.m + by) / 12), m: (((v.m + by) % 12) + 12) % 12 }));
  const weeks = calendarWeeks(view.y, view.m);
  const out = (d: string) => max !== undefined && d > max;
  const lo = first ?? from;
  const hi = first ? "" : to;
  const label = from && to ? (from === to ? short(from) : `${short(from)} – ${short(to)}`) : placeholder;

  function pick(day: string) {
    if (!first) return setFirst(day);
    const [a, b] = first <= day ? [first, day] : [day, first];
    setFirst(null);
    setOpen(false);
    onChange({ from: a, to: b });
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setFirst(null);
        if (next) setView({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
      }}
    >
      <Popover.Trigger
        type="button"
        title={iconOnly ? (from && to ? label : "Dates") : undefined}
        aria-label={`${ariaLabel}${from && to ? `: ${label}` : ""}`}
        className={iconOnly ? cn("relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", className) : cn(triggerClass, "h-10 sm:h-9", className)}
      >
        {iconOnly ? null : <span className={cn("truncate", !(from && to) && "text-muted-foreground")}>{label}</span>}
        <CalendarDays className={iconOnly ? "size-5" : "size-4 shrink-0 text-muted-foreground"} aria-hidden />
      </Popover.Trigger>
      <PopupShell>
        <div className="mb-2 flex items-center justify-between gap-1">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="flex size-9 items-center justify-center rounded-lg hover:bg-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="text-sm font-semibold" aria-live="polite">
            {MONTH_NAMES[view.m]} {view.y}
          </p>
          <button type="button" aria-label="Next month" onClick={() => step(1)} className="flex size-9 items-center justify-center rounded-lg hover:bg-muted">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {weeks.flat().map((day, i) => {
            if (day === null) return <span key={i} />;
            const end = day === lo || (hi !== "" && day === hi);
            const inside = !first && lo !== "" && hi !== "" && day > lo && day < hi;
            return (
              <button
                key={day}
                type="button"
                disabled={out(day)}
                aria-label={formatLongDate(day)}
                aria-pressed={end}
                onClick={() => pick(day)}
                className={cn(
                  "mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30",
                  end ? "bg-primary font-semibold text-white" : inside ? "bg-muted" : "hover:bg-muted",
                )}
              >
                {Number(day.slice(8))}
              </button>
            );
          })}
        </div>
        <p className="mt-2 border-t pt-2 text-xs text-muted-foreground" aria-live="polite">
          {first ? `From ${short(first)}. Now pick the last day.` : "Pick the first day, then the last day."}
        </p>
      </PopupShell>
    </Popover.Root>
  );
}
