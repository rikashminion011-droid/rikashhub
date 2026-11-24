"use client";

import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/features/quick-pay/date-format";
import { cn } from "@/lib/utils";
import type { deleteSleepAction } from "../actions";
import { STATUS, addDaysTo, formatDuration, shortDuration, sleepStatus } from "../model";
import type { SleepRecord, SleepWeek } from "../server/service";

const dayName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" });
const dayDate = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const dayAndDate = (date: string) => `${dayDate.format(new Date(`${date}T00:00:00Z`))}, ${dayName.format(new Date(`${date}T00:00:00Z`))}`;

/** The seven bars use the same scale: 12 hours is a full-height bar. */
const CHART_MAX_MINUTES = 12 * 60;

/**
 * The Sleep Tracker page. On a phone the latest sleep comes first, then the weekly figures and chart, then the history. On a
 * wide screen the history is on the left and the weekly statistics on the right.
 */
export function SleepView({ week, records, total, lastMinutes, today, remove }: { week: SleepWeek; records: SleepRecord[]; total: number; lastMinutes: number | null; today: string; remove: typeof deleteSleepAction }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<SleepRecord | null>(null);
  const prev = addDaysTo(week.monday, -7);
  const next = addDaysTo(week.monday, 7);
  const thisWeek = week.monday <= today && today < next;
  const lastStatus = lastMinutes === null ? null : sleepStatus(lastMinutes);

  const stat = (label: string, minutes: number | null) => (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums", minutes !== null && STATUS[sleepStatus(minutes)].text)}>{minutes === null ? "No Record" : formatDuration(minutes)}</p>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      {/* Last sleep: first on a phone */}
      <section className="rounded-xl border bg-card px-4 py-3 lg:col-start-2 lg:row-start-1" aria-label="Last sleep duration">
        <p className="text-xs text-muted-foreground">Last Sleep Duration</p>
        <p className={cn("text-2xl font-semibold tabular-nums", lastStatus && STATUS[lastStatus].text)}>{lastMinutes === null ? "No Record" : formatDuration(lastMinutes)}</p>
        {lastStatus ? <p className={cn("mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-medium", STATUS[lastStatus].soft)}>{STATUS[lastStatus].label}</p> : null}
      </section>

      {/* Weekly statistics and chart */}
      <section className="min-w-0 space-y-3 lg:col-start-2 lg:row-start-2" aria-label="Weekly statistics">
        <div className="grid grid-cols-2 gap-2">
          {stat("Weekly Average Sleep", week.averageMinutes)}
          {stat("Total Weekly Sleep", week.count > 0 ? week.totalMinutes : null)}
          {stat("Longest Sleep Duration", week.longestMinutes)}
          {stat("Shortest Sleep Duration", week.shortestMinutes)}
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/sleep?week=${prev}`} aria-label="Previous week" scroll={false} className="flex size-9 items-center justify-center rounded-lg border border-input hover:bg-muted">
              <ChevronLeft className="size-4" />
            </Link>
            <p className="text-sm font-semibold tabular-nums">
              {dayDate.format(new Date(`${week.monday}T00:00:00Z`))} – {dayDate.format(new Date(`${addDaysTo(week.monday, 6)}T00:00:00Z`))}
            </p>
            <Link href={`/sleep?week=${next}`} aria-label="Next week" scroll={false} className={cn("flex size-9 items-center justify-center rounded-lg border border-input hover:bg-muted", thisWeek && "pointer-events-none opacity-40")} aria-disabled={thisWeek}>
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <ul className="grid grid-cols-7 items-end gap-1.5" aria-label="Sleep each day, Monday to Sunday">
            {week.days.map((d) => (
              <li key={d.date} className="flex min-w-0 flex-col items-center gap-1" title={d.minutes === null ? "No Record" : `${formatDuration(d.minutes)} · ${STATUS[d.status!].label}`}>
                <span className={cn("text-[10px] leading-tight font-semibold tabular-nums", d.status ? STATUS[d.status].text : "text-muted-foreground")}>{d.minutes === null ? "" : shortDuration(d.minutes)}</span>
                <div className="flex h-28 w-full items-end rounded-md bg-muted/60">
                  {d.minutes === null ? null : <div className={cn("w-full rounded-md", STATUS[d.status!].bar)} style={{ height: `${Math.max(6, Math.min(100, (d.minutes / CHART_MAX_MINUTES) * 100))}%` }} />}
                </div>
                {d.minutes === null ? <span className="text-[9px] leading-tight text-muted-foreground">No Record</span> : null}
                <span className="text-[11px] font-medium">{dayName.format(new Date(`${d.date}T00:00:00Z`))}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" aria-label="Colours">
            {(["INSUFFICIENT", "NORMAL", "OVERTIME"] as const).map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-sm", STATUS[s].bar)} aria-hidden />
                {s === "INSUFFICIENT" ? "Below 7 hours" : s === "NORMAL" ? "7–8 hours" : "Above 8 hours"}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">Application targets for reporting, not medical advice. A sleep counts on the day you woke up.</p>
        </div>
      </section>

      {/* History */}
      <section className="min-w-0 space-y-2 lg:col-start-1 lg:row-span-2 lg:row-start-1" aria-label="Sleep history">
        <h2 className="text-sm font-semibold">Sleep history</h2>
        {records.length === 0 ? (
          <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No sleep recorded yet. Double-tap Good Night in Quick Entry before you sleep.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="border-b bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">Sleep Date</th>
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">Bedtime</th>
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">Wake-Up Date</th>
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">Wake-Up Time</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Total Sleep</th>
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th scope="col" className="w-10 px-2 py-2.5">
                      <span className="sr-only">Delete</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2.5 whitespace-nowrap">{dayAndDate(r.sleepDate)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatClock(r.bedtime)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{dayAndDate(r.wakeDate)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatClock(r.wakeTime)}</td>
                      <td className={cn("px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums", STATUS[r.status].text)}>{formatDuration(r.durationMinutes)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS[r.status].soft)}>{STATUS[r.status].label}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button variant="ghost" size="icon-sm" aria-label="Delete this record" onClick={() => setDeleting(r)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 md:hidden">
              {records.map((r) => (
                <li key={r.id} className="space-y-1 rounded-xl border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-base font-semibold tabular-nums", STATUS[r.status].text)}>{formatDuration(r.durationMinutes)}</p>
                    <div className="flex items-center gap-1">
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", STATUS[r.status].soft)}>{STATUS[r.status].label}</span>
                      <Button variant="ghost" size="icon-sm" aria-label="Delete this record" onClick={() => setDeleting(r)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Slept {dayAndDate(r.sleepDate)}, {formatClock(r.bedtime)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Woke {dayAndDate(r.wakeDate)}, {formatClock(r.wakeTime)}
                  </p>
                </li>
              ))}
            </ul>
            {total > records.length ? (
              <Link href={`/sleep?n=${records.length + 30}`} scroll={false} className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
                Show more ({total - records.length} older)
              </Link>
            ) : null}
          </>
        )}
      </section>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this sleep record?"
        description={deleting ? `${formatDuration(deleting.durationMinutes)}, woke ${dayAndDate(deleting.wakeDate)}. The weekly figures are worked out again.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return null;
          const r = await remove({ id: deleting.id });
          if (!r.ok) return r.error;
          toast.success("Record deleted.");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
