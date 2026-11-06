import { describe, expect, it } from "vitest";
import {
  availableCredit,
  parseISODate as d,
  statementState,
  utilizationBand,
  utilizationPercent,
} from "@/lib/finance";

describe("availableCredit", () => {
  it("is limit minus outstanding", () => {
    expect(availableCredit(10_000_000, 3_000_000)).toBe(7_000_000);
  });

  it("goes negative when over the limit", () => {
    expect(availableCredit(10_000_000, 11_000_000)).toBe(-1_000_000);
  });
});

describe("utilizationPercent", () => {
  it("is outstanding / limit x 100", () => {
    expect(utilizationPercent(10_000_000, 3_000_000)).toBe(30);
    expect(utilizationPercent(30_000, 10_000)).toBe(33.33);
  });

  it("can exceed 100 and never goes below 0", () => {
    expect(utilizationPercent(10_000, 15_000)).toBe(150);
    expect(utilizationPercent(10_000, -500)).toBe(0);
  });

  it("is 0 for a zero limit instead of dividing by zero", () => {
    expect(utilizationPercent(0, 5_000)).toBe(0);
  });
});

describe("utilizationBand", () => {
  it("bands at 30% and 50%", () => {
    expect(utilizationBand(29.99)).toBe("LOW");
    expect(utilizationBand(30)).toBe("MODERATE");
    expect(utilizationBand(49.99)).toBe("MODERATE");
    expect(utilizationBand(50)).toBe("HIGH");
  });
});

describe("statementState", () => {
  const base = { totalDuePaise: 1_000_000, minimumDuePaise: 50_000, dueDate: d("2026-11-10") };

  it("is OPEN before the due date with nothing paid", () => {
    expect(statementState({ ...base, paidPaise: 0, today: d("2026-11-06") })).toEqual({
      state: "OPEN",
      remainingPaise: 1_000_000,
    });
  });

  it("is PARTIALLY_PAID after a part payment", () => {
    expect(statementState({ ...base, paidPaise: 60_000, today: d("2026-11-06") })).toEqual({
      state: "PARTIALLY_PAID",
      remainingPaise: 940_000,
    });
  });

  it("is PAID once the total is covered", () => {
    expect(statementState({ ...base, paidPaise: 1_000_000, today: d("2026-11-20") }).state).toBe("PAID");
    expect(statementState({ ...base, paidPaise: 1_200_000, today: d("2026-11-20") }).remainingPaise).toBe(0);
  });

  it("is OVERDUE only when the minimum was missed after the due date", () => {
    expect(statementState({ ...base, paidPaise: 0, today: d("2026-11-11") }).state).toBe("OVERDUE");
    expect(statementState({ ...base, paidPaise: 49_999, today: d("2026-11-11") }).state).toBe("OVERDUE");
    expect(statementState({ ...base, paidPaise: 50_000, today: d("2026-11-11") }).state).toBe("PARTIALLY_PAID");
  });

  it("is not overdue on the due date itself", () => {
    expect(statementState({ ...base, paidPaise: 0, today: d("2026-11-10") }).state).toBe("OPEN");
  });

  it("treats a zero statement as paid", () => {
    expect(
      statementState({ totalDuePaise: 0, minimumDuePaise: 0, paidPaise: 0, dueDate: d("2026-11-10"), today: d("2026-12-01") }),
    ).toEqual({ state: "PAID", remainingPaise: 0 });
  });
});
