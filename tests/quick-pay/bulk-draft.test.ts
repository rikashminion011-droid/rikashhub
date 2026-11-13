import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DRAFT_KEY, clearDraft, draftRowCount, readDraft, writeDraft } from "@/features/quick-pay/bulk-draft";
import type { BulkRow } from "@/features/quick-pay/bulk-rows";

const store = new Map<string, string>();
const row = (key: string, over: Partial<BulkRow> = {}): BulkRow => ({ key, date: "2026-11-01", time: "10:00", debit: "", credit: "", reason: "", accountId: null, categoryId: null, shares: [], ...over });

beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("the Add Bulk draft", () => {
  it("keeps what was typed, and brings it back as it was left", () => {
    writeDraft([row("a", { debit: "40", reason: "Tea" }), row("b", { transfer: { fromId: "x", toId: "y" }, debit: "100" })]);
    const back = readDraft()!;
    expect(back.map((r) => r.key)).toEqual(["a", "b"]);
    expect(back[0]).toMatchObject({ debit: "40", reason: "Tea" });
    expect(back[1]!.transfer).toEqual({ fromId: "x", toId: "y" });
    expect(draftRowCount()).toBe(2);
  });

  it("a sheet with nothing typed is not a draft, and cancelling throws the draft away", () => {
    writeDraft([row("a"), row("b")]);
    expect(store.has(DRAFT_KEY)).toBe(false);
    expect(readDraft()).toBeNull();
    writeDraft([row("a", { debit: "5" })]);
    expect(draftRowCount()).toBe(1);
    clearDraft();
    expect(readDraft()).toBeNull();
    expect(draftRowCount()).toBe(0);
  });

  it("ignores a damaged draft instead of failing", () => {
    store.set(DRAFT_KEY, "{not json");
    expect(readDraft()).toBeNull();
    store.set(DRAFT_KEY, JSON.stringify([{ nonsense: true }, 5]));
    expect(readDraft()).toBeNull();
  });

  it("fills in what an older draft did not have", () => {
    store.set(DRAFT_KEY, JSON.stringify([{ key: "old", date: "2026-10-01", time: "09:00", debit: "9" }]));
    expect(readDraft()![0]).toMatchObject({ key: "old", debit: "9", shares: [], credit: "" });
  });
});
