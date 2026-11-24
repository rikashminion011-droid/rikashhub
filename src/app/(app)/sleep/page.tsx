import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istDateOf } from "@/features/quick-pay/datetime";
import { deleteSleepAction } from "@/features/sleep/actions";
import { SleepView } from "@/features/sleep/components/sleep-view";
import { getSleepNow, getSleepWeek, listSleep, type SleepNow, type SleepRecord, type SleepWeek } from "@/features/sleep/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Sleep Tracker" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SleepPage({ searchParams }: PageProps<"/sleep">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = istDateOf(new Date());
  const anyDate = /^\d{4}-\d{2}-\d{2}$/.test(one(params.week)) ? one(params.week) : today;
  const n = Math.min(500, Math.max(30, Number.parseInt(one(params.n), 10) || 30));

  let week: SleepWeek;
  let list: { records: SleepRecord[]; total: number };
  let now: SleepNow;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [week, list, now] = await Promise.all([getSleepWeek(db, user.id, anyDate), listSleep(db, user.id, n), getSleepNow(db, user.id)]);
  } catch (error) {
    console.error("[sleep] could not load", error);
    return (
      <>
        <PageHeader title="Sleep Tracker" />
        <DatabaseUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Sleep Tracker" />
      {now.active ? <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium">You are sleeping right now. Double-tap I Woke Up in Quick Entry when you wake.</p> : null}
      <SleepView week={week} records={list.records} total={list.total} lastMinutes={now.last?.durationMinutes ?? null} today={today} remove={deleteSleepAction} />
    </>
  );
}
