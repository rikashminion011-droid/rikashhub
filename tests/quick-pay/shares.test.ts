import { describe, expect, it } from "vitest";
import { evenPercents, resolveShares } from "@/features/quick-pay/shares";

const line = (partyId: string, value: string, method: "PERCENT" | "FIXED" = "PERCENT") => ({ partyId, method, value });

describe("evenPercents", () => {
  it("gives a lone person the single default and divides the rest equally", () => {
    expect(evenPercents(1, 50)).toEqual([50]);
    expect(evenPercents(2, 50)).toEqual([50, 50]);
    expect(evenPercents(3, 50)).toEqual([33.33, 33.33, 33.34]);
    expect(evenPercents(4, 50)).toEqual([25, 25, 25, 25]);
    expect(evenPercents(0, 50)).toEqual([]);
  });
});

describe("resolveShares", () => {
  it("₹50 shared between two people at 50% each is ₹25 each", () => {
    const out = resolveShares(5000, [line("a", "50"), line("b", "50")]);
    expect(out).toMatchObject({ ok: true, restPaise: 0 });
    expect(out.ok && out.shares.map((s) => s.sharePaise)).toEqual([2500, 2500]);
  });
  it("one person at 50% leaves the other half with you", () => {
    const out = resolveShares(5000, [line("a", "50")]);
    expect(out).toMatchObject({ ok: true, sharedPaise: 2500, restPaise: 2500 });
  });
  it("three equal shares add up to the whole amount, the last person taking the odd paisa", () => {
    const out = resolveShares(10000, [line("a", "33.33"), line("b", "33.33"), line("c", "33.34")]);
    expect(out.ok && out.shares.map((s) => s.sharePaise)).toEqual([3333, 3333, 3334]);
    expect(out).toMatchObject({ restPaise: 0 });
    const odd = resolveShares(100, [line("a", "33.33"), line("b", "33.33"), line("c", "33.34")]);
    expect(odd.ok && odd.shares.reduce((s, x) => s + x.sharePaise, 0)).toBe(100);
  });
  it("accepts amounts typed by hand", () => {
    const out = resolveShares(10000, [line("a", "30", "FIXED"), line("b", "20", "FIXED")]);
    expect(out.ok && out.shares.map((s) => [s.sharePaise, s.percent])).toEqual([[3000, 30], [2000, 20]]);
    expect(out).toMatchObject({ restPaise: 5000 });
  });
  it("refuses shares above the amount, a repeated person, nobody, and a bad line", () => {
    expect(resolveShares(10000, [line("a", "70"), line("b", "40")])).toMatchObject({ ok: false, error: "The shares add up to more than the amount." });
    expect(resolveShares(10000, [line("a", "50"), line("a", "20")])).toMatchObject({ ok: false });
    expect(resolveShares(10000, [])).toMatchObject({ ok: false });
    expect(resolveShares(10000, [line("a", "50"), line("b", "0")])).toMatchObject({ ok: false, line: 1 });
    expect(resolveShares(0, [line("a", "50")])).toMatchObject({ ok: false });
  });
});
