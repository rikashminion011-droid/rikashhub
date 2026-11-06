import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  diffDays,
  nextDayOfMonth,
  parseISODate,
  resolveDateRange,
  toISODate,
  todayIn,
} from "@/lib/finance";

const d = parseISODate;
const iso = toISODate;

describe("parseISODate", () => {
  it("round-trips valid dates", () => {
    expect(iso(d("2026-11-06"))).toBe("2026-11-06");
  });

  it("rejects impossible dates", () => {
    expect(() => d("2026-02-30")).toThrow(RangeError);
    expect(() => d("06-11-2026")).toThrow(RangeError);
  });
});

describe("todayIn", () => {
  it("uses the user's timezone, not the server's", () => {
    const instant = new Date("2026-11-05T20:00:00Z"); // 01:30 on 6 Nov in India
    expect(iso(todayIn("Asia/Kolkata", instant))).toBe("2026-11-06");
    expect(iso(todayIn("UTC", instant))).toBe("2026-11-05");
  });
});

describe("diffDays", () => {
  it("counts whole days", () => {
    expect(diffDays(d("2026-01-31"), d("2026-03-02"))).toBe(30);
    expect(diffDays(d("2026-03-02"), d("2026-01-31"))).toBe(-30);
  });
});

describe("addMonthsClamped", () => {
  it("clamps to the end of shorter months", () => {
    expect(iso(addMonthsClamped(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(iso(addMonthsClamped(d("2028-01-31"), 1))).toBe("2028-02-29");
  });

  it("recovers the original day when the month is long enough", () => {
    expect(iso(addMonthsClamped(d("2026-01-31"), 2))).toBe("2026-03-31");
  });

  it("handles negative months and year boundaries", () => {
    expect(iso(addMonthsClamped(d("2026-03-31"), -1))).toBe("2026-02-28");
    expect(iso(addMonthsClamped(d("2026-11-15"), 3))).toBe("2027-02-15");
    expect(iso(addMonthsClamped(d("2026-01-15"), -2))).toBe("2025-11-15");
  });
});

describe("nextDayOfMonth", () => {
  it("returns the same day when it matches", () => {
    expect(iso(nextDayOfMonth(d("2026-11-06"), 6))).toBe("2026-11-06");
  });

  it("looks later this month or rolls to next month", () => {
    expect(iso(nextDayOfMonth(d("2026-11-06"), 10))).toBe("2026-11-10");
    expect(iso(nextDayOfMonth(d("2026-11-06"), 5))).toBe("2026-12-05");
  });

  it("clamps day 31 in short months", () => {
    expect(iso(nextDayOfMonth(d("2026-02-10"), 31))).toBe("2026-02-28");
  });

  it("rejects an invalid day", () => {
    expect(() => nextDayOfMonth(d("2026-11-06"), 0)).toThrow(RangeError);
    expect(() => nextDayOfMonth(d("2026-11-06"), 32)).toThrow(RangeError);
  });
});

describe("resolveDateRange (today = Friday 6 Nov 2026)", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  const range = (preset: Parameters<typeof resolveDateRange>[0]) => {
    const r = resolveDateRange(preset, { now, timeZone: "UTC" });
    return [r.from && iso(r.from), r.to && iso(r.to)];
  };

  it("TODAY", () => expect(range("TODAY")).toEqual(["2026-11-06", "2026-11-06"]));
  it("THIS_WEEK runs Monday to Sunday", () =>
    expect(range("THIS_WEEK")).toEqual(["2026-11-02", "2026-11-08"]));
  it("THIS_MONTH", () => expect(range("THIS_MONTH")).toEqual(["2026-11-01", "2026-11-30"]));
  it("PREVIOUS_MONTH", () => expect(range("PREVIOUS_MONTH")).toEqual(["2026-10-01", "2026-10-31"]));
  it("LAST_3_MONTHS", () => expect(range("LAST_3_MONTHS")).toEqual(["2026-09-01", "2026-11-06"]));
  it("LAST_6_MONTHS", () => expect(range("LAST_6_MONTHS")).toEqual(["2026-06-01", "2026-11-06"]));
  it("THIS_YEAR", () => expect(range("THIS_YEAR")).toEqual(["2026-01-01", "2026-12-31"]));
  it("ALL_TIME has no bounds", () => expect(range("ALL_TIME")).toEqual([null, null]));

  it("crosses the year boundary", () => {
    const january = new Date("2026-01-15T10:00:00Z");
    const previous = resolveDateRange("PREVIOUS_MONTH", { now: january, timeZone: "UTC" });
    expect([iso(previous.from!), iso(previous.to!)]).toEqual(["2025-12-01", "2025-12-31"]);
    const last3 = resolveDateRange("LAST_3_MONTHS", { now: january, timeZone: "UTC" });
    expect(iso(last3.from!)).toBe("2025-11-01");
  });

  it("THIS_WEEK on a Sunday still starts the previous Monday", () => {
    const sunday = new Date("2026-11-08T10:00:00Z");
    const r = resolveDateRange("THIS_WEEK", { now: sunday, timeZone: "UTC" });
    expect(iso(r.from!)).toBe("2026-11-02");
  });

  it("CUSTOM passes the range through and validates it", () => {
    const custom = { from: d("2026-01-01"), to: d("2026-03-31") };
    expect(resolveDateRange("CUSTOM", { now, custom })).toEqual(custom);
    expect(() => resolveDateRange("CUSTOM", { now })).toThrow(RangeError);
    expect(() =>
      resolveDateRange("CUSTOM", { now, custom: { from: d("2026-05-01"), to: d("2026-04-01") } }),
    ).toThrow(RangeError);
  });
});
