import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { formatDuration, shortDuration, sleepStatus, weekDates, weekStartOf } from "@/features/sleep/model";
import { deleteSleep, getSleepNow, getSleepWeek, listSleep, startSleep, wakeUp } from "@/features/sleep/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

const U = { id: "44444444-4444-4444-8444-444444444441", email: "sleep@example.com", name: "S" };
const V = { id: "44444444-4444-4444-8444-444444444442", email: "sleep2@example.com", name: "T" };
let database: TestDatabase;
let db: TestDatabase["prisma"];

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, U);
  await ensureUserSetup(db, V);
}, 180_000);
afterAll(async () => database?.close());

describe("sleep rules", () => {
  it("classifies 7 and 8 hours as normal, below as insufficient and above as overtime", () => {
    expect(sleepStatus(6 * 60 + 59)).toBe("INSUFFICIENT");
    expect(sleepStatus(7 * 60)).toBe("NORMAL");
    expect(sleepStatus(8 * 60)).toBe("NORMAL");
    expect(sleepStatus(8 * 60 + 1)).toBe("OVERTIME");
  });
  it("writes durations", () => {
    expect(formatDuration(445)).toBe("7 hours 25 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(1)).toBe("1 minute");
    expect(formatDuration(0)).toBe("0 minutes");
    expect(shortDuration(445)).toBe("7h 25m");
  });
  it("finds Monday of a week", () => {
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16"); // a Sunday
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
    expect(weekDates("2026-11-16")[6]).toBe("2026-11-22");
  });
});

describe("sleep tracking", () => {
  it("starts once, however many times it is asked, and survives being read again", async () => {
    const t0 = istInstant("2026-11-17", "23:10");
    const first = await startSleep(db, U.id, t0);
    const again = await startSleep(db, U.id, istInstant("2026-11-17", "23:11"));
    expect(first.alreadySleeping).toBe(false);
    expect(again.alreadySleeping).toBe(true);
    expect(again.id).toBe(first.id);
    // Asking again for the same person never adds a second sleep in progress (the database also refuses it with a partial unique index).
    await startSleep(db, V.id, t0);
    await startSleep(db, V.id, t0);
    expect(await db.sleepSession.count({ where: { userId: V.id, endedAt: null } })).toBe(1);
    expect((await getSleepNow(db, U.id)).active?.id).toBe(first.id);
  });

  it("works the duration out from the full timestamps across midnight", async () => {
    const record = await wakeUp(db, U.id, istInstant("2026-11-18", "06:35"));
    expect(record.durationMinutes).toBe(7 * 60 + 25);
    expect(record.status).toBe("NORMAL");
    expect([record.sleepDate, record.bedtime, record.wakeDate, record.wakeTime]).toEqual(["2026-11-17", "23:10", "2026-11-18", "06:35"]);
    const now = await getSleepNow(db, U.id);
    expect(now.active).toBeNull();
    expect(now.last?.durationMinutes).toBe(445);
    await expect(wakeUp(db, U.id)).rejects.toThrow(/not sleeping/);
  });

  it("counts a sleep over several days exactly", async () => {
    await startSleep(db, U.id, istInstant("2026-11-19", "22:00"));
    const r = await wakeUp(db, U.id, istInstant("2026-11-21", "09:30"));
    expect(r.durationMinutes).toBe(35 * 60 + 30);
    expect(r.status).toBe("OVERTIME");
  });

  it("builds the Monday to Sunday week from wake-up dates, adds the same day and says No Record otherwise", async () => {
    // Two short sleeps that end on 22 November add up to one day.
    await startSleep(db, U.id, istInstant("2026-11-22", "01:00"));
    await wakeUp(db, U.id, istInstant("2026-11-22", "04:00"));
    await startSleep(db, U.id, istInstant("2026-11-22", "14:00"));
    await wakeUp(db, U.id, istInstant("2026-11-22", "16:30"));
    const week = await getSleepWeek(db, U.id, "2026-11-20");
    expect(week.monday).toBe("2026-11-16");
    expect(week.days.map((d) => d.date)).toEqual(weekDates("2026-11-16"));
    const byDate = Object.fromEntries(week.days.map((d) => [d.date, d]));
    expect(byDate["2026-11-18"]!.minutes).toBe(445);
    expect(byDate["2026-11-21"]!.status).toBe("OVERTIME");
    expect(byDate["2026-11-22"]!.minutes).toBe(180 + 150);
    expect(byDate["2026-11-22"]!.sessions).toBe(2);
    expect(byDate["2026-11-16"]!.minutes).toBeNull();
    expect(week.count).toBe(4);
    expect(week.totalMinutes).toBe(445 + 2130 + 330);
    expect(week.averageMinutes).toBe(Math.round((445 + 2130 + 330) / 3));
    expect(week.longestMinutes).toBe(2130);
    expect(week.shortestMinutes).toBe(150);
  });

  it("lists newest first, keeps users apart and deletes one record", async () => {
    const list = await listSleep(db, U.id, 2);
    expect(list.total).toBe(4);
    expect(list.records).toHaveLength(2);
    expect(list.records[0]!.wakeDate >= list.records[1]!.wakeDate).toBe(true);
    expect((await listSleep(db, V.id)).total).toBe(0);
    await expect(deleteSleep(db, V.id, list.records[0]!.id)).rejects.toThrow(/no longer/);
    await deleteSleep(db, U.id, list.records[0]!.id);
    expect((await listSleep(db, U.id)).total).toBe(3);
  });
});
