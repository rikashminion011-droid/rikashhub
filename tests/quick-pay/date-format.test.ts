import { describe, expect, it } from "vitest";
import { calendarWeeks, formatClock, formatLongDate, formatMonthYear, fromClock12, shiftDate, toClock12 } from "@/features/quick-pay/date-format";

describe("dates", () => {
  it("writes 04th October, 2026 with the right ending", () => {
    expect(formatLongDate("2026-10-04")).toBe("04th October, 2026");
    expect(formatLongDate("2026-11-01")).toBe("01st November, 2026");
    expect(formatLongDate("2026-11-02")).toBe("02nd November, 2026");
    expect(formatLongDate("2026-11-03")).toBe("03rd November, 2026");
    expect(formatLongDate("2026-11-11")).toBe("11th November, 2026");
    expect(formatLongDate("2026-11-12")).toBe("12th November, 2026");
    expect(formatLongDate("2026-11-13")).toBe("13th November, 2026");
    expect(formatLongDate("2026-11-21")).toBe("21st November, 2026");
    expect(formatLongDate("2026-11-22")).toBe("22nd November, 2026");
    expect(formatLongDate("")).toBe("");
    expect(formatLongDate("2026-02-30")).toBe("");
    expect(formatMonthYear("2026-10")).toBe("October 2026");
  });
  it("gives the next day, across a month end", () => {
    expect(shiftDate("2026-10-02", 1)).toBe("2026-10-03");
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("lays a month out Monday first", () => {
    const weeks = calendarWeeks(2026, 10); // November 2026 starts on a Sunday
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});

describe("times", () => {
  it("converts between 24 hour and 12 hour clocks", () => {
    expect(toClock12("18:00")).toEqual({ hour: 6, minute: 0, pm: true });
    expect(toClock12("00:05")).toEqual({ hour: 12, minute: 5, pm: false });
    expect(toClock12("12:30")).toEqual({ hour: 12, minute: 30, pm: true });
    expect(toClock12("25:00")).toBeNull();
    expect(fromClock12({ hour: 12, minute: 0, pm: false })).toBe("00:00");
    expect(fromClock12({ hour: 12, minute: 15, pm: true })).toBe("12:15");
    expect(fromClock12({ hour: 6, minute: 5, pm: true })).toBe("18:05");
    expect(formatClock("18:00")).toBe("06:00 PM");
    expect(formatClock("09:07")).toBe("09:07 AM");
    expect(formatClock("")).toBe("");
  });
});
