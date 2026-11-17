import { describe, expect, it } from "vitest";
import { bulkRowTone, rowKindOf, rowTone } from "@/features/quick-pay/row-tone";

describe("row colours", () => {
  it("a debit row is light red, a credit row light green", () => {
    expect(rowTone({ type: "DEBIT" })).toContain("bg-red-50");
    expect(rowTone({ type: "CREDIT" })).toContain("bg-green-50");
  });

  it("a self transfer is light yellow whichever side of the money it shows", () => {
    expect(rowTone({ type: "DEBIT", transfer: { toId: "b2" } })).toContain("bg-yellow-50");
    expect(rowTone({ type: "CREDIT", transfer: { toId: "b2" } })).toContain("bg-yellow-50");
  });

  it("works out the kind of a saved row", () => {
    expect(rowKindOf({ type: "DEBIT" })).toBe("DEBIT");
    expect(rowKindOf({ type: "CREDIT", transfer: null })).toBe("CREDIT");
    expect(rowKindOf({ type: "DEBIT", transfer: { toId: "x" } })).toBe("TRANSFER");
  });

  it("the Add Bulk sheet uses the same three colours, and none for an empty row", () => {
    expect(bulkRowTone("DEBIT")).toBe(rowTone({ type: "DEBIT" }));
    expect(bulkRowTone("CREDIT")).toBe(rowTone({ type: "CREDIT" }));
    expect(bulkRowTone("TRANSFER")).toBe(rowTone({ type: "DEBIT", transfer: {} }));
    expect(bulkRowTone(null)).toBe("");
  });
});
