"use client";

import { Loader2, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { formatClock } from "@/features/quick-pay/date-format";
import { istTimeOf } from "@/features/quick-pay/datetime";
import { cn } from "@/lib/utils";
import type { SleepActions } from "../actions";
import { formatDuration } from "../model";
import type { SleepNow } from "../server/service";

/** Two taps this close together (in milliseconds) are a double-tap. */
const DOUBLE_TAP_MS = 450;

/**
 * Sleep Tracker in Quick Entry, in two small sections: the action (Good Night, or I Woke Up while sleeping) and the last sleep.
 * The action works only on a double-tap (or double-click): one tap does nothing but remind how to use it. The sleep in progress
 * is read from the database, so it is still there after a refresh, a closed browser or a restart.
 */
export function SleepWidget({ initial, actions }: { initial: SleepNow; actions: SleepActions }) {
  const router = useRouter();
  const [now, setNow] = useState<SleepNow>(initial);
  const [pending, setPending] = useState(false);
  const [reminder, setReminder] = useState(false);
  const lastTap = useRef(0);
  const sleeping = now.active !== null;

  async function run() {
    if (pending) return;
    setPending(true);
    const r = await (sleeping ? actions.wake() : actions.start());
    setPending(false);
    if (!r.ok) return void toast.error(r.error);
    setNow(r.now);
    if (sleeping && r.now.last) toast.success(`Good morning. You slept for ${formatDuration(r.now.last.durationMinutes)}.`);
    router.refresh();
  }

  function tap() {
    if (pending) return;
    const t = Date.now();
    if (t - lastTap.current <= DOUBLE_TAP_MS) {
      lastTap.current = 0;
      setReminder(false);
      void run();
      return;
    }
    lastTap.current = t;
    setReminder(true);
    window.setTimeout(() => setReminder(false), 1800);
  }

  return (
    <section className="grid grid-cols-2 gap-2" aria-label="Sleep Tracker">
      <button
        type="button"
        onClick={tap}
        disabled={pending}
        aria-label={sleeping ? "I Woke Up. Double-tap to wake up." : "Good Night. Double-tap to start sleeping."}
        className={cn("flex min-h-24 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50", sleeping ? "border-amber-300 bg-amber-50" : "border-primary/30 bg-primary/10")}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : sleeping ? <Sun className="size-4 text-amber-600" aria-hidden /> : <Moon className="size-4 text-primary" aria-hidden />}
          {sleeping ? "I Woke Up" : "Good Night"}
        </span>
        {sleeping ? <span className="text-xs font-medium">I&apos;m sleeping right now.</span> : null}
        <span className={cn("text-xs text-muted-foreground", reminder && "font-semibold text-foreground")}>{sleeping ? "Double-tap to wake up." : "Double-tap to start sleeping."}</span>
        {sleeping && now.active ? <span className="text-[11px] text-muted-foreground">Since {formatClock(istTimeOf(new Date(now.active.startedAt)))}</span> : null}
      </button>
      <div className="flex min-h-24 flex-col justify-center gap-0.5 rounded-xl border bg-card px-3 py-2" aria-live="polite">
        <span className="text-xs font-semibold text-muted-foreground">Last sleep</span>
        {now.last ? (
          <span className="text-sm font-medium">
            Last time you slept for <span className="font-semibold">{formatDuration(now.last.durationMinutes)}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">No sleep recorded yet.</span>
        )}
      </div>
    </section>
  );
}
