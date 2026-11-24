import { describe, expect, it } from "vitest";
import { buildDebtPdf, buildDebtXlsx } from "@/features/debt/export";
import { COLUMN_IDS, DEFAULT_COLUMNS, filterItems, normalizeColumns, totalsOf, visibleColumns, DEFAULT_FILTERS } from "@/features/debt/recipient-view";
import type { DebtHistory } from "@/features/debt/types";

const history: DebtHistory = {
  row: { partyId: "p", name: "OFFICE", totalSplitPaise: 0, splitPercent: null, paidPaise: 500, remainingPaise: 1500, splitCount: 0, directPaise: 0, shoppingPaise: 0, portalPaise: 0, manualPaise: 2000, totalDebtPaise: 2000 },
  splits: [],
  payments: [],
  items: [
    { id: "manual:1", source: "MANUAL", occurredAt: "2026-11-19T15:28:00.000Z", reason: "Salary", category: "", related: "Added debt", amountPaise: 2000, href: null },
    { id: "pay:1", source: "PAYMENT", occurredAt: "2026-11-20T10:00:00.000Z", reason: "Paid", category: "", related: "Paid", amountPaise: 500, href: null },
  ],
};
const meta = { name: "OFFICE", period: "2026-11-01 to 2026-11-30", hdfcPeriod: "2026-10-15 to 2026-11-15", filters: ["Search: salary"], generatedAt: new Date("2026-11-21T00:00:00Z") };

describe("debt export", () => {
  it("builds an Excel file and a PDF with the chosen columns", async () => {
    const columns = visibleColumns({ order: ["reason", "date", "debt", "paid", "type", "category", "related"], hidden: ["category", "related"] });
    expect(columns).toEqual(["reason", "date", "debt", "paid", "type"]);
    const xlsx = await buildDebtXlsx(history.items, columns, meta);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    const pdf = buildDebtPdf(history.items, columns, meta);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("the recipient view", () => {
  it("filters by search, credit or debit and dates, and sorts", () => {
    expect(filterItems(history.items, { ...DEFAULT_FILTERS, kind: "DEBIT" }).map((i) => i.id)).toEqual(["manual:1"]);
    expect(filterItems(history.items, { ...DEFAULT_FILTERS, kind: "CREDIT" }).map((i) => i.id)).toEqual(["pay:1"]);
    expect(filterItems(history.items, { ...DEFAULT_FILTERS, q: "salary" }).map((i) => i.id)).toEqual(["manual:1"]);
    expect(filterItems(history.items, { ...DEFAULT_FILTERS, from: "2026-11-20" }).map((i) => i.id)).toEqual(["pay:1"]);
    expect(filterItems(history.items, { ...DEFAULT_FILTERS, order: "asc" }).map((i) => i.id)).toEqual(["manual:1", "pay:1"]);
    expect(totalsOf(history.items)).toEqual({ debitPaise: 2000, creditPaise: 500, remainingPaise: 1500, count: 2 });
  });
  it("keeps column preferences safe", () => {
    expect(normalizeColumns(null)).toEqual(DEFAULT_COLUMNS);
    const n = normalizeColumns({ order: ["paid", "nope", "date"], hidden: ["date", "bogus"] });
    expect(n.order.slice(0, 2)).toEqual(["paid", "date"]);
    expect(n.order).toHaveLength(COLUMN_IDS.length);
    expect(n.hidden).toEqual(["date"]);
    // Everything hidden leaves one column visible.
    expect(visibleColumns(normalizeColumns({ order: COLUMN_IDS, hidden: COLUMN_IDS })).length).toBe(1);
  });
});
