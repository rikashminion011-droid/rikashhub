import { describe, expect, it } from "vitest";
import { bulkRowTone, rowKindOf, rowTone } from "@/features/quick-pay/row-tone";

describe("row colours", () => {
  it("no kind of row has a coloured background: the kind shows in the colour of the amount alone", () => {
    for (const row of [{ type: "DEBIT" as const }, { type: "CREDIT" as const }, { type: "DEBIT" as const, transfer: { toId: "b2" } }, { type: "CREDIT" as const, transfer: { toId: "b2" } }]) {
      const tone = rowTone(row);
      expect(tone).not.toMatch(/bg-(red|green|yellow|blue|orange)-/);
      expect(tone).toBe("hover:bg-muted/40");
    }
  });

  it("works out the kind of a saved row", () => {
    expect(rowKindOf({ type: "DEBIT" })).toBe("DEBIT");
    expect(rowKindOf({ type: "CREDIT", transfer: null })).toBe("CREDIT");
    expect(rowKindOf({ type: "DEBIT", transfer: { toId: "x" } })).toBe("TRANSFER");
  });

  it("the Add Bulk sheet uses the same neutral row, and none for an empty row", () => {
    expect(bulkRowTone("DEBIT")).toBe(rowTone({ type: "DEBIT" }));
    expect(bulkRowTone("CREDIT")).toBe(rowTone({ type: "CREDIT" }));
    expect(bulkRowTone("TRANSFER")).toBe(rowTone({ type: "DEBIT", transfer: {} }));
    expect(bulkRowTone(null)).toBe("");
  });
});
