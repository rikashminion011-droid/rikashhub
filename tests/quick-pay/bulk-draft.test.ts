import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DRAFT_KEY, cleanDraftRows, clearLocalDraft, localDraftCount, readLocalDraft, writeLocalDraft } from "@/features/quick-pay/bulk-draft";
import { countFilledRows, type BulkRow } from "@/features/quick-pay/bulk-rows";

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

describe("this browser's copy of the Add Bulk draft", () => {
  it("keeps what was typed, with when it was saved, and brings it back as it was left", () => {
    writeLocalDraft([row("a", { debit: "40", reason: "Tea" }), row("b", { transfer: { fromId: "x", toId: "y" }, debit: "100" })]);
    const back = readLocalDraft()!;
    expect(back.rows.map((r) => r.key)).toEqual(["a", "b"]);
    expect(back.rows[0]).toMatchObject({ debit: "40", reason: "Tea" });
    expect(back.rows[1]!.transfer).toEqual({ fromId: "x", toId: "y" });
    expect(back.savedAt).toBeGreaterThan(0);
    expect(localDraftCount()).toBe(2);
  });

  it("a sheet with nothing typed is not a draft, and clearing throws the draft away", () => {
    writeLocalDraft([row("a"), row("b")]);
    expect(store.has(DRAFT_KEY)).toBe(false);
    writeLocalDraft([row("a", { debit: "5" })]);
    expect(localDraftCount()).toBe(1);
    clearLocalDraft();
    expect(readLocalDraft()).toBeNull();
  });

  it("ignores damaged data instead of failing, and fills in what an older draft did not have", () => {
    store.set(DRAFT_KEY, "{not json");
    expect(readLocalDraft()).toBeNull();
    expect(cleanDraftRows([{ nonsense: true }, 5])).toBeNull();
    expect(cleanDraftRows("nope")).toBeNull();
    expect(cleanDraftRows([{ key: "old", date: "2026-10-01", time: "09:00", debit: "9" }])![0]).toMatchObject({ key: "old", debit: "9", shares: [], credit: "" });
  });

  it("counts rows with something typed in them, reading loosely", () => {
    expect(countFilledRows([row("a"), row("b", { reason: "x" }), row("c", { shares: [{ partyId: "p", method: "PERCENT", value: "50" }] }), null, 5, { debit: 1 }])).toBe(2);
    expect(countFilledRows([{ debit: "  " }, { transfer: { fromId: "a", toId: "b" } }])).toBe(1);
  });
});
