import { describe, expect, it } from "vitest";
import { buildDebtPdf, buildDebtXlsx } from "@/features/debt/export";
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
const meta = { period: "2026-11-01 to 2026-11-30", hdfcPeriod: "2026-10-15 to 2026-11-15", generatedAt: new Date("2026-11-21T00:00:00Z") };

describe("debt export", () => {
  it("builds an Excel file and a PDF", async () => {
    const xlsx = await buildDebtXlsx(history, meta);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    const pdf = buildDebtPdf(history, meta);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
  });
});
