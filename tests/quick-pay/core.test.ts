import { describe, expect, it } from "vitest";
import { buildBalanceGroups, currentBalance } from "@/features/quick-pay/balances";
import {
  formatTransactionWhen,
  istDateOf,
  istInstant,
  istTimeOf,
  monthBounds,
  rangeToInstants,
} from "@/features/quick-pay/datetime";
import { effectiveRange, filtersToQuery, hasActiveFilters, parseTxFilters } from "@/features/quick-pay/filters";
import {
  isBlankBulkRow,
  validateBulk,
  validateBulkRow,
  validateQuickPayInput,
  validateTransfer,
  type BulkRowInput,
  type QuickPayInput,
} from "@/features/quick-pay/validation";

describe("date and time (IST)", () => {
  it("shows two lines: the date, then the time and the weekday worked out from the date", () => {
    // 25 June 2026, 9:21 AM IST. That day is a Thursday.
    expect(formatTransactionWhen(new Date("2026-06-25T03:51:00Z"))).toEqual({ date: "June 25, 2026", timeAndDay: "9:21 AM – Thursday" });
    expect(formatTransactionWhen(new Date("2026-11-08T08:30:00Z")).timeAndDay).toBe("2:00 PM – Sunday");
  });

  it("formats midnight and noon correctly", () => {
    expect(formatTransactionWhen(new Date("2026-06-24T18:30:00Z")).timeAndDay).toBe("12:00 AM – Thursday");
    expect(formatTransactionWhen(new Date("2026-06-25T06:30:00Z")).timeAndDay).toBe("12:00 PM – Thursday");
  });

  it("turns a date and time entered in IST into the right instant and back", () => {
    const instant = istInstant("2026-06-25", "09:21");
    expect(instant.toISOString()).toBe("2026-06-25T03:51:00.000Z");
    expect(istDateOf(instant)).toBe("2026-06-25");
    expect(istTimeOf(instant)).toBe("09:21");
  });

  it("puts a late-evening UTC moment on the next IST day", () => {
    const instant = new Date("2026-06-24T18:30:00Z");
    expect(istDateOf(instant)).toBe("2026-06-25");
    expect(istTimeOf(instant)).toBe("00:00");
  });

  it("rejects an invalid date or time", () => {
    expect(() => istInstant("2026-02-30", "09:00")).toThrow(RangeError);
    expect(() => istInstant("2026-02-10", "24:00")).toThrow(RangeError);
    expect(() => istInstant("2026-02-10", "9:00")).toThrow(RangeError);
  });

  it("finds the first and last day of a month, including a leap February", () => {
    expect(monthBounds("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(monthBounds("2026-13")).toBeNull();
    expect(monthBounds("nope")).toBeNull();
  });

  it("turns an inclusive date range into database bounds that include the whole last day", () => {
    const { gte, lt } = rangeToInstants("2026-06-01", "2026-06-30");
    expect(gte!.toISOString()).toBe("2026-05-31T18:30:00.000Z");
    expect(lt!.toISOString()).toBe("2026-06-30T18:30:00.000Z"); // 1 July 00:00 IST
    expect(rangeToInstants(null, null)).toEqual({});
    expect(rangeToInstants("2026-06-01", null).lt).toBeUndefined();
  });
});

describe("balances", () => {
  it("follows the worked example: 2000 - 500 - 200 + 200 = 1500", () => {
    expect(currentBalance({ openingPaise: 200000, creditsPaise: 0, debitsPaise: 50000 })).toBe(150000);
    expect(currentBalance({ openingPaise: 200000, creditsPaise: 0, debitsPaise: 70000 })).toBe(130000);
    expect(currentBalance({ openingPaise: 200000, creditsPaise: 20000, debitsPaise: 70000 })).toBe(150000);
  });

  it("can go negative", () => {
    expect(currentBalance({ openingPaise: 1000, creditsPaise: 0, debitsPaise: 5000 })).toBe(-4000);
  });

  it("treats a credit line as an amount owed: debits raise it, credits lower it", () => {
    expect(currentBalance({ openingPaise: 0, creditsPaise: 3000, debitsPaise: 10000, kind: "CREDIT_LINE" })).toBe(7000);
  });

  const acc = (id: string, name: string, parentId: string | null, opening: number, credits = 0, debits = 0) => ({
    id, name, parentId, kind: "ASSET" as const, openingPaise: opening, creditsPaise: credits, debitsPaise: debits,
  });

  it("groups accounts under their main file and adds the group up", () => {
    const groups = buildBalanceGroups([
      acc("g", "GPay", null, 0),
      acc("h", "HDFC", "g", 200000, 20000, 70000),
      acc("s", "SBI", "g", 50000),
      acc("c", "Cash", null, 10000, 0, 2500),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["GPay", "Cash"]);
    const gpay = groups[0]!;
    expect(gpay.accounts.map((a) => [a.name, a.currentPaise])).toEqual([["HDFC", 150000], ["SBI", 50000]]);
    expect(gpay.direct).toBeNull();
    expect(gpay.total).toMatchObject({ openingPaise: 250000, creditsPaise: 20000, debitsPaise: 70000, currentPaise: 200000 });
  });

  it("gives a main file with no accounts its own editable line", () => {
    const cash = buildBalanceGroups([acc("c", "Cash", null, 10000, 0, 2500)])[0]!;
    expect(cash.accounts).toEqual([]);
    expect(cash.direct).toMatchObject({ name: "Cash", currentPaise: 7500 });
    expect(cash.total.currentPaise).toBe(7500);
  });

  it("keeps a main file's direct money alongside its accounts", () => {
    const gpay = buildBalanceGroups([acc("g", "GPay", null, 1000, 0, 400), acc("h", "HDFC", "g", 5000)])[0]!;
    expect(gpay.direct).toMatchObject({ currentPaise: 600 });
    expect(gpay.total.currentPaise).toBe(5600);
  });
});

describe("filters", () => {
  it("reads a month, a search and a page", () => {
    expect(parseTxFilters({ month: "2026-06", q: "  petrol ", page: "3" })).toMatchObject({ month: "2026-06", from: null, to: null, q: "petrol", page: 3, banks: [], types: [] });
  });

  it("a custom range replaces the month", () => {
    const f = parseTxFilters({ month: "2026-06", from: "2026-01-05", to: "2026-03-10" });
    expect(f).toMatchObject({ month: null, from: "2026-01-05", to: "2026-03-10" });
    expect(effectiveRange(f)).toEqual({ from: "2026-01-05", to: "2026-03-10" });
  });

  it("swaps a range given the wrong way round", () => {
    expect(parseTxFilters({ from: "2026-03-10", to: "2026-01-05" })).toMatchObject({ from: "2026-01-05", to: "2026-03-10" });
  });

  it("accepts a range with only one end", () => {
    expect(effectiveRange(parseTxFilters({ from: "2026-02-01" }))).toEqual({ from: "2026-02-01", to: null });
  });

  it("drops invalid values instead of failing", () => {
    expect(parseTxFilters({ month: "June", from: "2026-02-30", to: "x", page: "-4" })).toMatchObject({ month: null, from: null, to: null, q: "", page: 1 });
  });

  it("turns a month into the first and last day", () => {
    expect(effectiveRange(parseTxFilters({ month: "2026-02" }))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(effectiveRange(parseTxFilters({}))).toEqual({ from: null, to: null });
  });

  it("knows when filters are active and builds the query string", () => {
    expect(hasActiveFilters(parseTxFilters({}))).toBe(false);
    const f = parseTxFilters({ month: "2026-06", q: "food", page: "2" });
    expect(hasActiveFilters(f)).toBe(true);
    expect(filtersToQuery(f)).toBe("month=2026-06&q=food");
    expect(filtersToQuery(f, { page: true })).toBe("month=2026-06&q=food&page=2");
  });
});

describe("validateQuickPayInput", () => {
  const base: QuickPayInput = { amount: "250.50", type: "DEBIT", reason: " Lunch ", accountId: "a1", categoryId: "c1", split: { enabled: false } };

  it("accepts a debit and a credit, trimming the reason", () => {
    expect(validateQuickPayInput(base)).toEqual({
      ok: true,
      value: { type: "DEBIT", amountPaise: 25050, reason: "Lunch", accountId: "a1", categoryId: "c1", splitKind: null, shares: [], creditIds: [] },
    });
    const credit = validateQuickPayInput({ ...base, type: "CREDIT" });
    expect(credit.ok && credit.value.type).toBe("CREDIT");
  });

  it("only keeps the people when Split is on", () => {
    const shares = [{ partyId: "p1", method: "PERCENT" as const, value: "50" }];
    const off = validateQuickPayInput({ ...base, split: { enabled: false, shares } });
    expect(off.ok && [off.value.splitKind, off.value.shares]).toEqual([null, []]);
    const on = validateQuickPayInput({ ...base, split: { enabled: true, shares } });
    expect(on.ok && [on.value.splitKind, on.value.shares.map((s) => s.partyId)]).toEqual(["SPLIT", ["p1"]]);
  });

  it("needs a bank, a valid amount, and a person when splitting; category and reason are optional", () => {
    const empty = validateQuickPayInput({ ...base, amount: "", accountId: null, split: { enabled: true, shares: [] } });
    expect(empty).toEqual({ ok: false, errors: { amount: "Enter the amount.", bank: "Choose the bank this went through.", split: "Choose the people this is shared with." } });
    expect(validateQuickPayInput({ ...base, categoryId: null, reason: "" }).ok).toBe(true);
  });

  it.each([["0"], ["-5"], ["1.234"], ["abc"]])("rejects the amount %j", (amount) => {
    expect(validateQuickPayInput({ ...base, amount }).ok).toBe(false);
  });
});

describe("bulk rows", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  const row = (over: Partial<BulkRowInput> = {}): BulkRowInput => ({
    key: "r1", date: "2026-11-09", time: "14:30", debit: "100", credit: "", reason: "Tea", accountId: "a1", categoryId: null, shares: [], ...over,
  });

  it("accepts a debit row and a credit row, each under its own date and time", () => {
    const debit = validateBulkRow(row(), now);
    expect(debit.ok && debit.value).toMatchObject({ type: "DEBIT", amountPaise: 10000 });
    expect(debit.ok && debit.value.occurredAt.toISOString()).toBe("2026-11-09T09:00:00.000Z");
    const credit = validateBulkRow(row({ debit: "", credit: "2,000" }), now);
    expect(credit.ok && credit.value).toMatchObject({ type: "CREDIT", amountPaise: 200000 });
  });

  it("makes Debit and Credit mutually exclusive, and needs one of them", () => {
    expect(validateBulkRow(row({ credit: "5" }), now)).toMatchObject({ ok: false, errors: { amount: "Enter either a Debit or a Credit, not both." } });
    expect(validateBulkRow(row({ debit: "" }), now)).toMatchObject({ ok: false, errors: { amount: "Enter a Debit or a Credit amount." } });
  });

  it("checks date, time, bank and the future", () => {
    expect(validateBulkRow(row({ date: "2026-02-30" }), now)).toMatchObject({ ok: false, errors: { date: "Choose a valid date." } });
    expect(validateBulkRow(row({ time: "" }), now)).toMatchObject({ ok: false, errors: { time: "Choose a time." } });
    expect(validateBulkRow(row({ accountId: null }), now)).toMatchObject({ ok: false, errors: { bank: "Choose a bank." } });
    expect(validateBulkRow(row({ date: "2026-11-11" }), now)).toMatchObject({ ok: false, errors: { date: "The date and time cannot be in the future." } });
  });

  it("skips untouched rows but needs at least one real row", () => {
    const blank = row({ debit: "", reason: "", accountId: null });
    expect(isBlankBulkRow(blank)).toBe(true);
    expect(isBlankBulkRow(row())).toBe(false);
    expect(validateBulk([blank], now)).toMatchObject({ ok: false, message: "Add at least one row with an amount." });
    const result = validateBulk([blank, row({ key: "a" }), row({ key: "b", debit: "", credit: "50" })], now);
    expect(result.ok && result.rows.map((r) => r.key)).toEqual(["a", "b"]);
  });

  it("saves nothing if any row is wrong, and says which", () => {
    const result = validateBulk([row({ key: "good" }), row({ key: "bad", debit: "" })], now);
    expect(result).toMatchObject({ ok: false, message: "1 row needs fixing before anything is saved." });
    expect(!result.ok && Object.keys(result.errors)).toEqual(["bad"]);
  });
});

describe("validateTransfer", () => {
  const ok = { fromId: "a", toId: "b", amount: "250.50", reason: " Top up " };
  it("accepts two different banks and an amount, tidying the reason", () => {
    expect(validateTransfer(ok)).toEqual({ ok: true, value: { fromId: "a", toId: "b", amountPaise: 25050, reason: "Top up" } });
  });
  it("needs both banks, two different ones, and a valid amount", () => {
    expect(validateTransfer({ ...ok, fromId: null, toId: null, amount: "" })).toEqual({
      ok: false,
      errors: { from: "Choose the bank the money comes from.", to: "Choose the bank the money goes to.", amount: "Enter the amount." },
    });
    expect(validateTransfer({ ...ok, toId: "a" })).toMatchObject({ ok: false, errors: { to: "Choose two different banks." } });
    expect(validateTransfer({ ...ok, amount: "0" })).toMatchObject({ ok: false });
    expect(validateTransfer({ ...ok, reason: "x".repeat(201) })).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
  });
});

describe("GPay Transactions filters: current month by default and several choices at once", () => {
  const ID1 = "11111111-1111-4111-8111-111111111111";
  const ID2 = "22222222-2222-4222-8222-222222222222";

  it("opens on the current month when no period is chosen, and not when one is", () => {
    const opts = { defaultMonth: "2026-11" };
    expect(parseTxFilters({}, opts).month).toBe("2026-11");
    expect(effectiveRange(parseTxFilters({}, opts))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(parseTxFilters({ month: "2026-10" }, opts).month).toBe("2026-10");
    expect(parseTxFilters({ from: "2026-10-01", to: "2026-10-05" }, opts)).toMatchObject({ month: null, from: "2026-10-01" });
    expect(parseTxFilters({ all: "1" }, opts)).toMatchObject({ month: null, all: true });
    expect(parseTxFilters({})).toMatchObject({ month: null }); // no default asked for: nothing is assumed
  });

  it("reads banks, categories, people and kinds, dropping anything invalid", () => {
    const f = parseTxFilters({ banks: `${ID1},${ID2},${ID1},nonsense`, cats: ID2, people: ID1, types: "DEBIT,TRANSFER,bogus" });
    expect(f).toMatchObject({ banks: [ID1, ID2], categories: [ID2], people: [ID1], types: ["DEBIT", "TRANSFER"] });
    expect(hasActiveFilters(f)).toBe(true);
  });

  it("writes the choices back into the address", () => {
    const f = parseTxFilters({ banks: `${ID1},${ID2}`, types: "CREDIT", all: "1" });
    const q = new URLSearchParams(filtersToQuery(f));
    expect([q.get("banks"), q.get("types"), q.get("all")]).toEqual([`${ID1},${ID2}`, "CREDIT", "1"]);
  });
});

describe("bulk rows with a split", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  const base: BulkRowInput = { key: "r1", date: "2026-11-09", time: "14:30", debit: "50", credit: "", reason: "Lunch", accountId: "a1", categoryId: "c1", shares: [] };
  const shares = [{ partyId: "p1", method: "PERCENT" as const, value: "50" }, { partyId: "p2", method: "PERCENT" as const, value: "50" }];

  it("divides the amount between the chosen people: ₹50 between two is ₹25 each", () => {
    const out = validateBulkRow({ ...base, shares }, now);
    expect(out.ok && out.value.shares.map((s) => [s.partyId, s.sharePaise])).toEqual([["p1", 2500], ["p2", 2500]]);
  });
  it("refuses shares above the amount, and keeps a credit's own category", () => {
    expect(validateBulkRow({ ...base, shares: [{ partyId: "p1", method: "PERCENT", value: "70" }, { partyId: "p2", method: "PERCENT", value: "60" }] }, now)).toMatchObject({ ok: false, errors: { split: expect.any(String) } });
    const credit = validateBulkRow({ ...base, debit: "", credit: "50", categoryId: "income-c" }, now);
    expect(credit.ok && credit.value.categoryId).toBe("income-c");
  });
  it("a row with only people chosen is not blank", () => {
    expect(isBlankBulkRow({ ...base, debit: "", reason: "", accountId: null, categoryId: null, shares })).toBe(false);
  });
});

describe("bulk rows that are self transfers", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  const base: BulkRowInput = { key: "t1", date: "2026-11-09", time: "14:30", debit: "500", credit: "", reason: "Top up", accountId: null, categoryId: null, shares: [], transfer: { fromId: "a1", toId: "a2" } };

  it("needs no Bank Through, and becomes a transfer from the first bank to the second", () => {
    const out = validateBulkRow(base, now);
    expect(out.ok && [out.value.accountId, out.value.transfer, out.value.amountPaise, out.value.categoryId, out.value.shares]).toEqual(["a1", { toId: "a2" }, 50000, null, []]);
  });
  it("refuses the same bank twice, and still needs an amount", () => {
    expect(validateBulkRow({ ...base, transfer: { fromId: "a1", toId: "a1" } }, now)).toMatchObject({ ok: false, errors: { bank: "Choose two different banks." } });
    expect(validateBulkRow({ ...base, debit: "" }, now)).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
  });
  it("a row with only a transfer on it is not blank", () => {
    expect(isBlankBulkRow({ ...base, debit: "", reason: "" })).toBe(false);
  });
});
