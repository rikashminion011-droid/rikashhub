import { describe, expect, it } from "vitest";
import { cloneRows, deleteRows, insertRow, nextCell } from "@/features/quick-pay/bulk-rows";
import type { BulkRowInput } from "@/features/quick-pay/validation";

const row = (key: string, over: Partial<BulkRowInput> = {}): BulkRowInput => ({ key, date: "2026-06-01", time: "10:00", debit: "", credit: "", reason: "", accountId: null, categoryId: null, partyId: null, ...over });
let n = 0;
const fresh = () => `new-${++n}`;
const blank = (date = "2026-06-01", time = "10:00") => row(fresh(), { date, time });

describe("cloneRows", () => {
  const rows = [row("a", { debit: "100", reason: "Tea", accountId: "b1", categoryId: "c1", partyId: "p1", date: "2026-06-02", time: "08:30" }), row("b"), row("c", { credit: "50" })];

  it("puts a copy directly under the row it was copied from, with every field and a new key", () => {
    const out = cloneRows(rows, ["a"], fresh, 1000);
    if ("error" in out) throw new Error(out.error);
    expect(out.rows.map((r) => r.key)).toEqual(["a", out.added[0], "b", "c"]);
    expect(out.rows[1]).toEqual({ ...rows[0], key: out.added[0] });
    expect(out.rows[1]!.key).not.toBe("a");
  });
  it("copies several rows in sheet order, each under its own original", () => {
    const out = cloneRows(rows, new Set(["c", "a"]), fresh, 1000);
    if ("error" in out) throw new Error(out.error);
    expect(out.rows.map((r) => r.key.startsWith("new-") ? "copy" : r.key)).toEqual(["a", "copy", "b", "c", "copy"]);
    expect(out.added).toHaveLength(2);
    expect(out.rows[4]!.credit).toBe("50");
  });
  it("changes nothing when no row is chosen, and refuses to go past the limit", () => {
    expect(cloneRows(rows, [], fresh, 1000)).toEqual({ rows, added: [] });
    expect(cloneRows(rows, ["a", "b"], fresh, 4)).toEqual({ error: "A sheet can hold at most 4 rows." });
    expect(cloneRows(rows, ["a"], fresh, 4)).toMatchObject({ added: [expect.any(String)] });
  });
  it("does not change the original rows", () => {
    const before = JSON.stringify(rows);
    cloneRows(rows, ["a"], fresh, 1000);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("insertRow", () => {
  const rows = [row("a", { date: "2026-06-02", time: "08:30" }), row("b", { date: "2026-06-03", time: "09:00" })];
  it("adds an empty row above or below, starting from that row's date and time", () => {
    const above = insertRow(rows, "b", "above", blank, 1000);
    if ("error" in above) throw new Error(above.error);
    expect(above.rows.map((r) => r.key)).toEqual(["a", above.added[0], "b"]);
    expect(above.rows[1]).toMatchObject({ date: "2026-06-03", time: "09:00", debit: "", credit: "", reason: "" });

    const below = insertRow(rows, "a", "below", blank, 1000);
    if ("error" in below) throw new Error(below.error);
    expect(below.rows.map((r) => r.key)).toEqual(["a", below.added[0], "b"]);
    expect(below.rows[1]).toMatchObject({ date: "2026-06-02", time: "08:30" });
  });
  it("works at the top and bottom, ignores an unknown row, and respects the limit", () => {
    const top = insertRow(rows, "a", "above", blank, 1000);
    if ("error" in top) throw new Error(top.error);
    expect(top.rows[0]!.key).toBe(top.added[0]);
    const bottom = insertRow(rows, "b", "below", blank, 1000);
    if ("error" in bottom) throw new Error(bottom.error);
    expect(bottom.rows.at(-1)!.key).toBe(bottom.added[0]);
    expect(insertRow(rows, "zzz", "below", blank, 1000)).toEqual({ rows, added: [] });
    expect(insertRow(rows, "a", "below", blank, 2)).toEqual({ error: "A sheet can hold at most 2 rows." });
  });
});

describe("deleteRows", () => {
  const rows = [row("a"), row("b"), row("c")];
  it("removes the chosen rows and keeps the rest in order", () => {
    expect(deleteRows(rows, ["b"], blank).map((r) => r.key)).toEqual(["a", "c"]);
    expect(deleteRows(rows, new Set(["a", "c"]), blank).map((r) => r.key)).toEqual(["b"]);
  });
  it("keeps one empty row when everything is deleted", () => {
    const out = deleteRows(rows, ["a", "b", "c"], blank);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ debit: "", credit: "", reason: "" });
  });
  it("ignores keys that are not there", () => {
    expect(deleteRows(rows, ["zzz"], blank)).toEqual(rows);
  });
});

describe("nextCell (arrow keys)", () => {
  // 4 rows x 5 columns; row 1 has its column 2 switched off, and row 2 has columns 2 and 3 switched off.
  const off = new Set(["1:2", "2:2", "2:3"]);
  const usable = (r: number, c: number) => !off.has(`${r}:${c}`);
  const size = { rows: 4, cols: 5 };

  it("moves one cell in the arrow's direction", () => {
    expect(nextCell(size, { row: 1, col: 1 }, "right", usable)).toEqual({ row: 1, col: 3 }); // column 2 is switched off in row 1
    expect(nextCell(size, { row: 1, col: 1 }, "left", usable)).toEqual({ row: 1, col: 0 });
    expect(nextCell(size, { row: 1, col: 1 }, "up", usable)).toEqual({ row: 0, col: 1 });
    expect(nextCell(size, { row: 1, col: 1 }, "down", usable)).toEqual({ row: 2, col: 1 });
  });
  it("skips cells that cannot be used", () => {
    expect(nextCell(size, { row: 0, col: 2 }, "down", usable)).toEqual({ row: 3, col: 2 });
    expect(nextCell(size, { row: 2, col: 1 }, "right", usable)).toEqual({ row: 2, col: 4 });
    expect(nextCell(size, { row: 3, col: 2 }, "up", usable)).toEqual({ row: 0, col: 2 });
  });
  it("stops at the edges, and when nothing further is usable", () => {
    expect(nextCell(size, { row: 0, col: 0 }, "up", usable)).toBeNull();
    expect(nextCell(size, { row: 0, col: 0 }, "left", usable)).toBeNull();
    expect(nextCell(size, { row: 3, col: 4 }, "down", usable)).toBeNull();
    expect(nextCell(size, { row: 3, col: 4 }, "right", usable)).toBeNull();
    expect(nextCell(size, { row: 2, col: 1 }, "right", (r, c) => c <= 1)).toBeNull();
  });
});
