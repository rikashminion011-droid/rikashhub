import type { PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { minutesBetween, sleepStatus, weekDates, weekStartOf, type SleepStatus } from "../model";

/**
 * Sleep Tracker. A sleep starts when Good Night is double-tapped and ends when I Woke Up is double-tapped; both times are the
 * exact moments, kept in the database (so a sleep in progress survives a refresh, a closed browser, a logout or a restart),
 * and the duration comes from the two full timestamps. Reads and writes are scoped to `userId`.
 */

export interface SleepRecord {
  id: string;
  /** ISO instants */
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  status: SleepStatus;
  /** India time, for showing: "2026-11-23" and "22:35". */
  sleepDate: string;
  bedtime: string;
  wakeDate: string;
  wakeTime: string;
}

export interface SleepNow {
  /** The sleep in progress, or null when awake. */
  active: { id: string; startedAt: string } | null;
  /** The last finished sleep. */
  last: { durationMinutes: number; endedAt: string } | null;
}

const toRecord = (r: { id: string; startedAt: Date; endedAt: Date | null; durationMinutes: number | null }): SleepRecord => {
  const end = r.endedAt!;
  const minutes = r.durationMinutes ?? minutesBetween(r.startedAt, end);
  return {
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    endedAt: end.toISOString(),
    durationMinutes: minutes,
    status: sleepStatus(minutes),
    sleepDate: istDateOf(r.startedAt),
    bedtime: istTimeOf(r.startedAt),
    wakeDate: istDateOf(end),
    wakeTime: istTimeOf(end),
  };
};

export async function getSleepNow(db: PrismaClient, userId: string): Promise<SleepNow> {
  const [active, last] = await Promise.all([
    db.sleepSession.findFirst({ where: { userId, deletedAt: null, endedAt: null }, select: { id: true, startedAt: true } }),
    db.sleepSession.findFirst({ where: { userId, deletedAt: null, endedAt: { not: null } }, orderBy: [{ endedAt: "desc" }], select: { durationMinutes: true, endedAt: true, startedAt: true } }),
  ]);
  return {
    active: active ? { id: active.id, startedAt: active.startedAt.toISOString() } : null,
    last: last?.endedAt ? { durationMinutes: last.durationMinutes ?? minutesBetween(last.startedAt, last.endedAt), endedAt: last.endedAt.toISOString() } : null,
  };
}

/**
 * Good Night: records the exact start. If a sleep is already in progress nothing new is made (a second tap, a retry or another
 * device cannot start a second sleep) and that sleep is returned.
 */
export async function startSleep(db: PrismaClient, userId: string, now: Date = new Date()): Promise<{ id: string; startedAt: string; alreadySleeping: boolean }> {
  const existing = await db.sleepSession.findFirst({ where: { userId, deletedAt: null, endedAt: null } });
  if (existing) return { id: existing.id, startedAt: existing.startedAt.toISOString(), alreadySleeping: true };
  try {
    const created = await db.sleepSession.create({ data: { userId, startedAt: now } });
    return { id: created.id, startedAt: created.startedAt.toISOString(), alreadySleeping: false };
  } catch (error) {
    // Two taps at the same instant: the database allows one sleep in progress, so the other is the one already made.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      const again = await db.sleepSession.findFirst({ where: { userId, deletedAt: null, endedAt: null } });
      if (again) return { id: again.id, startedAt: again.startedAt.toISOString(), alreadySleeping: true };
    }
    throw error;
  }
}

/** I Woke Up: records the exact end and the duration, once. */
export async function wakeUp(db: PrismaClient, userId: string, now: Date = new Date()): Promise<SleepRecord> {
  const active = await db.sleepSession.findFirst({ where: { userId, deletedAt: null, endedAt: null } });
  if (!active) throw new ExpenseError("You are not sleeping right now.", "NOT_FOUND");
  const end = now.getTime() < active.startedAt.getTime() ? active.startedAt : now;
  const minutes = minutesBetween(active.startedAt, end);
  // Only the row still in progress is closed, so a double submission closes it once.
  const closed = await db.sleepSession.updateMany({ where: { id: active.id, userId, endedAt: null }, data: { endedAt: end, durationMinutes: minutes } });
  if (closed.count !== 1) throw new ExpenseError("That sleep was already finished.", "NOT_FOUND");
  return toRecord({ id: active.id, startedAt: active.startedAt, endedAt: end, durationMinutes: minutes });
}

export async function deleteSleep(db: PrismaClient, userId: string, id: string): Promise<void> {
  const updated = await db.sleepSession.updateMany({ where: { id, userId, deletedAt: null, endedAt: { not: null } }, data: { deletedAt: new Date() } });
  if (updated.count !== 1) throw new ExpenseError("That sleep record no longer exists.", "NOT_FOUND");
}

/** Finished sleeps, newest wake-up first. */
export async function listSleep(db: PrismaClient, userId: string, limit = 30): Promise<{ records: SleepRecord[]; total: number }> {
  const where = { userId, deletedAt: null, endedAt: { not: null } } as const;
  const [rows, total] = await Promise.all([db.sleepSession.findMany({ where, orderBy: [{ endedAt: "desc" }], take: limit }), db.sleepSession.count({ where })]);
  return { records: rows.map(toRecord), total };
}

export interface SleepDay {
  date: string;
  /** Total minutes of the sessions that finished on this day; null when there are none ("No Record"). */
  minutes: number | null;
  status: SleepStatus | null;
  sessions: number;
}

export interface SleepWeek {
  /** Monday, YYYY-MM-DD */
  monday: string;
  days: SleepDay[];
  /** Sessions finished in the week. */
  count: number;
  totalMinutes: number;
  /** Total divided by the days that have a record. */
  averageMinutes: number | null;
  longestMinutes: number | null;
  shortestMinutes: number | null;
}

/**
 * One Monday to Sunday week. A finished sleep belongs to the day it ended (its wake-up date), and sleeps ending on the same day
 * are added together. The average is over the days that have a record.
 */
export async function getSleepWeek(db: PrismaClient, userId: string, anyDate: string): Promise<SleepWeek> {
  const monday = weekStartOf(anyDate);
  const dates = weekDates(monday);
  // A day a little either side, so a wake-up near midnight is placed by India time rather than by the database's clock.
  const from = new Date(`${dates[0]}T00:00:00+05:30`);
  const to = new Date(new Date(`${dates[6]}T00:00:00+05:30`).getTime() + 24 * 3_600_000);
  const rows = await db.sleepSession.findMany({ where: { userId, deletedAt: null, endedAt: { gte: from, lt: to } }, orderBy: [{ endedAt: "asc" }] });
  const records = rows.map(toRecord);
  const days: SleepDay[] = dates.map((date) => {
    const mine = records.filter((r) => r.wakeDate === date);
    const minutes = mine.length > 0 ? mine.reduce((s, r) => s + r.durationMinutes, 0) : null;
    return { date, minutes, status: minutes === null ? null : sleepStatus(minutes), sessions: mine.length };
  });
  const inWeek = records.filter((r) => dates.includes(r.wakeDate));
  const withData = days.filter((d) => d.minutes !== null);
  const total = inWeek.reduce((s, r) => s + r.durationMinutes, 0);
  return {
    monday,
    days,
    count: inWeek.length,
    totalMinutes: total,
    averageMinutes: withData.length > 0 ? Math.round(total / withData.length) : null,
    longestMinutes: inWeek.length > 0 ? Math.max(...inWeek.map((r) => r.durationMinutes)) : null,
    shortestMinutes: inWeek.length > 0 ? Math.min(...inWeek.map((r) => r.durationMinutes)) : null,
  };
}
