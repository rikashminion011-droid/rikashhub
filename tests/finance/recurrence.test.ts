import { describe, expect, it } from "vitest";
import {
  dueStatus,
  generateDueDates,
  parseISODate as d,
  reminderDateFor,
  toISODate,
  type RecurrenceRule,
} from "@/lib/finance";

const dates = (rule: RecurrenceRule, from: string, to: string) =>
  generateDueDates(rule, d(from), d(to)).map(toISODate);

describe("generateDueDates", () => {
  it("MONTHLY clamps month ends and recovers the day afterwards", () => {
    expect(
      dates({ recurrence: "MONTHLY", startDate: d("2026-01-31") }, "2026-01-01", "2026-04-30"),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("QUARTERLY steps three months", () => {
    expect(
      dates({ recurrence: "QUARTERLY", startDate: d("2026-01-15") }, "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
  });

  it("HALF_YEARLY steps six months", () => {
    expect(
      dates({ recurrence: "HALF_YEARLY", startDate: d("2026-03-01") }, "2026-01-01", "2027-12-31"),
    ).toEqual(["2026-03-01", "2026-09-01", "2027-03-01", "2027-09-01"]);
  });

  it("YEARLY handles 29 February", () => {
    expect(
      dates({ recurrence: "YEARLY", startDate: d("2024-02-29") }, "2024-01-01", "2028-12-31"),
    ).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("WEEKLY steps seven days", () => {
    expect(
      dates({ recurrence: "WEEKLY", startDate: d("2026-11-02") }, "2026-11-01", "2026-11-30"),
    ).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  });

  it("ONCE appears only if inside the window", () => {
    const rule: RecurrenceRule = { recurrence: "ONCE", startDate: d("2026-05-10") };
    expect(dates(rule, "2026-05-01", "2026-05-31")).toEqual(["2026-05-10"]);
    expect(dates(rule, "2026-06-01", "2026-06-30")).toEqual([]);
  });

  it("respects the end date", () => {
    expect(
      dates({ recurrence: "MONTHLY", startDate: d("2026-01-15"), endDate: d("2026-03-15") }, "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("never returns dates before the start, even with a pinned day-of-month", () => {
    expect(
      dates({ recurrence: "MONTHLY", startDate: d("2026-01-20"), dayOfMonth: 5 }, "2026-01-01", "2026-03-31"),
    ).toEqual(["2026-02-05", "2026-03-05"]);
  });

  it("returns only dates inside the requested window", () => {
    expect(
      dates({ recurrence: "MONTHLY", startDate: d("2026-01-10") }, "2026-03-01", "2026-04-30"),
    ).toEqual(["2026-03-10", "2026-04-10"]);
  });

  it("is deterministic, so generating twice gives identical dates (idempotent)", () => {
    const rule: RecurrenceRule = { recurrence: "MONTHLY", startDate: d("2026-01-31") };
    expect(dates(rule, "2026-01-01", "2026-12-31")).toEqual(dates(rule, "2026-01-01", "2026-12-31"));
  });

  it("a window before the start date is empty", () => {
    expect(dates({ recurrence: "MONTHLY", startDate: d("2027-01-01") }, "2026-01-01", "2026-12-31")).toEqual([]);
  });
});

describe("reminderDateFor", () => {
  it("is some days before the due date", () => {
    expect(toISODate(reminderDateFor(d("2026-11-10"), 3))).toBe("2026-11-07");
    expect(toISODate(reminderDateFor(d("2026-03-02"), 3))).toBe("2026-02-27");
  });

  it("never goes after the due date", () => {
    expect(toISODate(reminderDateFor(d("2026-11-10"), -4))).toBe("2026-11-10");
  });
});

describe("dueStatus", () => {
  const today = d("2026-11-06");

  it("UPCOMING / DUE_TODAY / OVERDUE by date", () => {
    expect(dueStatus({ amountPaise: 10_000, paidPaise: 0, dueDate: d("2026-11-10"), today }).status).toBe("UPCOMING");
    expect(dueStatus({ amountPaise: 10_000, paidPaise: 0, dueDate: d("2026-11-06"), today }).status).toBe("DUE_TODAY");
    expect(dueStatus({ amountPaise: 10_000, paidPaise: 0, dueDate: d("2026-11-05"), today })).toEqual({
      status: "OVERDUE",
      remainingPaise: 10_000,
      isOverdue: true,
    });
  });

  it("partial payments update the remaining amount", () => {
    expect(dueStatus({ amountPaise: 10_000, paidPaise: 4_000, dueDate: d("2026-11-10"), today })).toEqual({
      status: "PARTIALLY_PAID",
      remainingPaise: 6_000,
      isOverdue: false,
    });
  });

  it("a partly paid due keeps PARTIALLY_PAID but is flagged overdue after its date", () => {
    expect(dueStatus({ amountPaise: 10_000, paidPaise: 4_000, dueDate: d("2026-11-01"), today })).toEqual({
      status: "PARTIALLY_PAID",
      remainingPaise: 6_000,
      isOverdue: true,
    });
  });

  it("PAID once fully covered, including overpayment", () => {
    expect(dueStatus({ amountPaise: 10_000, paidPaise: 10_000, dueDate: d("2026-11-01"), today })).toEqual({
      status: "PAID",
      remainingPaise: 0,
      isOverdue: false,
    });
    expect(dueStatus({ amountPaise: 10_000, paidPaise: 12_000, dueDate: d("2026-11-10"), today }).remainingPaise).toBe(0);
  });
});
