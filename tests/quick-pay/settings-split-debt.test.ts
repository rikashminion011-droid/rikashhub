import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addSplitPayment, deleteSplitPayment, getDebtHistory, getDebtSummary } from "@/features/debt/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { parseTxFilters } from "@/features/quick-pay/filters";
import { containsWord, keywordKey, matchCategory, parseKeywords } from "@/features/quick-pay/keywords";
import {
  createEntry,
  deleteEntry,
  getDayTotals,
  getEntry,
  listCreditChoices,
  listTransactions,
  patchEntry,
  updateEntry,
} from "@/features/quick-pay/server/entries";
import { getKeywordEntries, getSettings, resetSettingsSection, saveSettingsSection, setCategoryKeywords } from "@/features/quick-pay/server/prefs";
import { addMainCategory, addSubBank, addSubCategory, addBank, getQuickPayOptions } from "@/features/quick-pay/server/settings";
import { DEFAULT_SETTINGS, parseSettings } from "@/features/quick-pay/settings-model";
import { formatPercent, parsePercent, percentOfShare, resolveSplit, shareOf } from "@/features/quick-pay/split";
import { validateQuickPayInput, type ValidQuickPay } from "@/features/quick-pay/validation";
import { parseAmountInput } from "@/lib/finance";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

// ───────────────────────── Split maths ─────────────────────────

describe("split maths", () => {
  it("gives 200 for 50% of 400 and 72 for 18% of 400", () => {
    expect(shareOf(40000, 50)).toBe(20000);
    expect(shareOf(40000, 18)).toBe(7200);
    expect(shareOf(33333, 33.33)).toBe(11110);
    expect(percentOfShare(40000, 20000)).toBe(50);
    expect(formatPercent(18)).toBe("18%");
    expect(formatPercent(33.333)).toBe("33.33%");
  });
  it("reads percentages typed by hand", () => {
    expect(parsePercent("50")).toBe(50);
    expect(parsePercent(" 18.5% ")).toBe(18.5);
    expect(parsePercent("0")).toBeNull();
    expect(parsePercent("100.01")).toBeNull();
    expect(parsePercent("101")).toBeNull();
    expect(parsePercent("12.345")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
  });
  it("works out a share by percentage or by fixed amount, and refuses impossible ones", () => {
    expect(resolveSplit(40000, { method: "PERCENT", value: "50" }, parseAmountInput)).toEqual({ ok: true, sharePaise: 20000, percent: 50 });
    expect(resolveSplit(40000, { method: "PERCENT", value: "18" }, parseAmountInput)).toEqual({ ok: true, sharePaise: 7200, percent: 18 });
    expect(resolveSplit(40000, { method: "FIXED", value: "150" }, parseAmountInput)).toEqual({ ok: true, sharePaise: 15000, percent: 37.5 });
    expect(resolveSplit(40000, { method: "FIXED", value: "500" }, parseAmountInput)).toMatchObject({ ok: false });
    expect(resolveSplit(40000, { method: "FIXED", value: "0" }, parseAmountInput)).toMatchObject({ ok: false });
    expect(resolveSplit(40000, { method: "PERCENT", value: "0" }, parseAmountInput)).toMatchObject({ ok: false });
    expect(resolveSplit(0, { method: "PERCENT", value: "50" }, parseAmountInput)).toMatchObject({ ok: false });
    // 0.01% of ₹1 is less than a paisa
    expect(resolveSplit(100, { method: "PERCENT", value: "0.01" }, parseAmountInput)).toMatchObject({ ok: false });
  });
  it("validateQuickPayInput carries the calculated share", () => {
    const input = { amount: "400", type: "DEBIT" as const, reason: "Lunch", accountId: "a", categoryId: null };
    const line = (value: string, method: "PERCENT" | "FIXED" = "PERCENT") => ({ partyId: "p", method, value });
    const out = validateQuickPayInput({ ...input, split: { enabled: true, shares: [line("18")] } });
    expect(out.ok && out.value.shares.map((s) => [s.sharePaise, s.percent])).toEqual([[7200, 18]]);
    const whole = validateQuickPayInput({ ...input, split: { enabled: true, shares: [line("100")] } });
    expect(whole.ok && whole.value.shares.map((s) => [s.sharePaise, s.percent])).toEqual([[40000, 100]]);
    const bad = validateQuickPayInput({ ...input, split: { enabled: true, shares: [line("150")] } });
    expect(bad).toMatchObject({ ok: false, errors: { splitValue: expect.any(String) } });
    const off = validateQuickPayInput({ ...input, split: { enabled: false, shares: [line("150")] } });
    expect(off.ok && off.value.shares).toEqual([]);
    const credit = validateQuickPayInput({ ...input, type: "CREDIT", split: { enabled: false }, creditIds: ["x"] });
    expect(credit).toMatchObject({ ok: false });
  });
});

// ───────────────────────── Keywords ─────────────────────────

describe("keywords", () => {
  const entries = [
    { keyword: "dosa", categoryId: "food" },
    { keyword: "masala dosa", categoryId: "food-dosa" },
    { keyword: "petrol", categoryId: "travel" },
    { keyword: "tea", categoryId: "drinks" },
  ];
  it("parses a typed list into clean, unique keywords", () => {
    expect(parseKeywords("Dosa,  Idli; TIFFIN\nidli")).toEqual(["dosa", "idli", "tiffin"]);
    expect(keywordKey("  Fish   Gravy ")).toBe("fish gravy");
  });
  it("matches whole words only, ignoring case", () => {
    expect(containsWord("Had a Dosa today", "dosa")).toBe(true);
    expect(containsWord("steam", "tea")).toBe(false);
    expect(containsWord("tea-time", "tea")).toBe(true);
    expect(containsWord("dosas", "dosa")).toBe(false);
  });
  it("picks the longest matching keyword, and nothing when none matches", () => {
    expect(matchCategory("Masala Dosa at hotel", entries)).toBe("food-dosa");
    expect(matchCategory("Plain dosa", entries)).toBe("food");
    expect(matchCategory("petrol for bike", entries)).toBe("travel");
    expect(matchCategory("Groceries", entries)).toBeNull();
    expect(matchCategory("   ", entries)).toBeNull();
  });
});

// ───────────────────────── Database-backed ─────────────────────────

const ME = { id: "99999999-9999-4999-8999-999999999991", email: "v2-me@example.com", name: "Me" };
const OTHER = { id: "99999999-9999-4999-8999-999999999992", email: "v2-other@example.com", name: "Other" };

let database: TestDatabase;
let db: TestDatabase["prisma"];
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n + 5000).padStart(12, "0")}`;

let canara = "";
let userA = "";
let userB = "";
let selfId = "";
let food = "";
let dosa = "";
let travel = "";

const entry = ({ partyId, sharePaise, percent, ...over }: Partial<ValidQuickPay> & { partyId?: string; sharePaise?: number; percent?: number } = {}): ValidQuickPay => ({
  type: "DEBIT", amountPaise: 40000, reason: "", accountId: canara, categoryId: null,
  splitKind: partyId ? "SPLIT" : null, shares: partyId ? [{ partyId, sharePaise: sharePaise ?? 0, percent: percent ?? 0 }] : [], creditIds: [], ...over,
});
const split = (partyId: string, percent: number, amountPaise = 40000): { partyId: string; percent: number; sharePaise: number; amountPaise?: number } => ({ partyId, percent, sharePaise: shareOf(amountPaise, percent), amountPaise });

const rowsOf = (id: string) => db.transactionSplit.findMany({ where: { transactionId: id }, include: { party: true }, orderBy: { amount: "asc" } });

beforeAll(async () => {
  database = await startTestDatabase();
  db = database.prisma;
  await ensureUserSetup(db, ME);
  await ensureUserSetup(db, OTHER);
  const gpay = await addBank(db, ME.id, { name: "GPay2", kind: "WALLET" });
  canara = await addSubBank(db, ME.id, { mainId: gpay, name: "Canara" });
  await addSubBank(db, ME.id, { mainId: gpay, name: "HDFC" });
  food = await addMainCategory(db, ME.id, { name: "Meals" });
  dosa = await addSubCategory(db, ME.id, { mainId: food, name: "Dosa" });
  travel = await addMainCategory(db, ME.id, { name: "Travel2" });
  const options = await getQuickPayOptions(db, ME.id);
  userA = options.persons.find((p) => p.name === "Mukesh")!.id;
  userB = options.persons.find((p) => p.name === "Balan")!.id;
  selfId = options.persons.find((p) => p.name === "Personal")!.id;
});
afterAll(async () => {
  await database.close();
});

describe("sharing one transaction between several people", () => {
  const shares = (...parts: [string, number, number][]) => parts.map(([partyId, percent, sharePaise]) => ({ partyId, percent, sharePaise }));

  it("₹50 between two people is ₹25 each, with nothing left for you", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry({ amountPaise: 5000, splitKind: "SPLIT", shares: shares([userA, 50, 2500], [userB, 50, 2500]) }));
    const rows = await rowsOf(saved.id);
    expect(rows.map((r) => [r.party.name, Number(r.amount), Number(r.percentage)]).sort()).toEqual([["Balan", 25, 50], ["Mukesh", 25, 50]]);
    expect(await getEntry(db, ME.id, saved.id)).toMatchObject({ splitKind: "SPLIT", shares: [expect.objectContaining({ name: "Mukesh", sharePaise: 2500 }), expect.objectContaining({ name: "Balan", sharePaise: 2500 })] });
  });

  it("keeps what is left as your own share, and remembers a Debt", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry({ amountPaise: 10000, splitKind: "DEBT", shares: shares([userA, 30, 3000], [userB, 20, 2000]) }));
    expect((await rowsOf(saved.id)).map((r) => [r.party.name, Number(r.amount)]).sort()).toEqual([["Balan", 20], ["Mukesh", 30], ["Personal", 50]]);
    expect(await getEntry(db, ME.id, saved.id)).toMatchObject({ splitKind: "DEBT" });
    expect((await db.transaction.findUniqueOrThrow({ where: { id: saved.id } })).splitKind).toBe("DEBT");
  });

  it("refuses shares that add up to more than the amount", async () => {
    await expect(createEntry(db, ME.id, rid(), entry({ amountPaise: 5000, splitKind: "SPLIT", shares: shares([userA, 70, 3500], [userB, 60, 3000]) }))).rejects.toThrow();
  });

  it("changing the people from the table replaces the rows and turns Debt back into a Split", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry({ amountPaise: 4000, splitKind: "DEBT", shares: shares([userA, 100, 4000]) }));
    const row = await patchEntry(db, ME.id, saved.id, { split: { kind: "SPLIT", shares: [{ partyId: userA, method: "PERCENT", value: "50" }, { partyId: userB, method: "PERCENT", value: "50" }] } });
    expect(row.splitKind).toBe("SPLIT");
    expect(row.shares.map((s) => [s.name, s.sharePaise])).toEqual([["Mukesh", 2000], ["Balan", 2000]]);
    expect(await patchEntry(db, ME.id, saved.id, { split: null })).toMatchObject({ splitKind: null, shares: [] });
  });
});

describe("saving a split with a percentage", () => {
  it("₹400 at 50% gives the person ₹200 and keeps ₹200 as Personal, adding up to ₹400", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry({ reason: "Dinner", ...split(userA, 50) }));
    const rows = await rowsOf(saved.id);
    expect(rows.map((r) => [r.party.name, r.amount.toString(), r.percentage?.toString()]).sort()).toEqual([["Mukesh", "200", "50"], ["Personal", "200", "50"]]);
    expect(await getEntry(db, ME.id, saved.id)).toMatchObject({ splitKind: "SPLIT", shares: [{ partyId: userA, percent: 50 }] });
  });

  it("₹400 at 18% gives ₹72 and keeps ₹328", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry(split(userA, 18)));
    const rows = await rowsOf(saved.id);
    expect(rows.map((r) => [r.party.name, Number(r.amount)])).toEqual([["Mukesh", 72], ["Personal", 328]]);
  });

  it("100% is a single row, and a fixed amount works out its percentage", async () => {
    const whole = await createEntry(db, ME.id, rid(), entry(split(userB, 100)));
    expect((await rowsOf(whole.id)).map((r) => [r.party.name, Number(r.amount), Number(r.percentage)])).toEqual([["Balan", 400, 100]]);
    const fixed = await createEntry(db, ME.id, rid(), entry({ partyId: userB, sharePaise: 15000, percent: 37.5 }));
    expect((await getEntry(db, ME.id, fixed.id))!.shares[0]?.percent).toBe(37.5);
  });

  it("editing changes the percentage and the rows still add up; removing the split removes the rows", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry(split(userA, 50)));
    await updateEntry(db, ME.id, saved.id, entry({ amountPaise: 60000, ...split(userA, 25, 60000) }));
    expect((await rowsOf(saved.id)).map((r) => [r.party.name, Number(r.amount)])).toEqual([["Mukesh", 150], ["Personal", 450]]);
    await updateEntry(db, ME.id, saved.id, entry({ amountPaise: 60000 }));
    expect(await rowsOf(saved.id)).toEqual([]);
    expect((await getEntry(db, ME.id, saved.id))!.shares).toEqual([]);
  });

  it("the table row shows the person (not Personal), their share and percentage", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry({ reason: "Row check", ...split(userA, 30) }));
    const row = (await listTransactions(db, ME.id, parseTxFilters({ q: "Row check" }))).rows.find((r) => r.id === saved.id)!;
    expect(row).toMatchObject({ shares: [{ partyId: userA, name: "Mukesh", sharePaise: 12000, percent: 30 }], splitKind: "SPLIT", bankName: "Canara", bankId: canara });
    expect(row.bank).toBe("GPay2 → Canara");
  });
});

describe("editing in place", () => {
  it("changes only the reason, and clears it when empty", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry({ reason: "Old" }));
    const row = await patchEntry(db, ME.id, saved.id, { reason: "  New   reason " });
    expect(row.reason).toBe("New reason");
    expect(row.bankId).toBe(canara);
    expect((await patchEntry(db, ME.id, saved.id, { reason: "" })).reason).toBe("");
    await expect(patchEntry(db, ME.id, saved.id, { reason: "x".repeat(201) })).rejects.toThrow();
  });
  it("sets and clears the category", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry());
    expect((await patchEntry(db, ME.id, saved.id, { categoryId: dosa })).categoryId).toBe(dosa);
    expect((await patchEntry(db, ME.id, saved.id, { categoryId: null })).categoryId).toBeNull();
    const theirs = (await getQuickPayOptions(db, OTHER.id)).categories[0]!.id;
    await expect(patchEntry(db, ME.id, saved.id, { categoryId: theirs })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("turns a split on with a percentage, changes it, and turns it off", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry({ amountPaise: 20000 }));
    const one = (r: Awaited<ReturnType<typeof patchEntry>>) => [r.shares[0]?.name ?? null, r.shares[0]?.sharePaise ?? null, r.shares[0]?.percent ?? null];
    let row = await patchEntry(db, ME.id, saved.id, { split: { kind: "SPLIT", shares: [{ partyId: userA, method: "PERCENT", value: "40" }] } });
    expect(one(row)).toEqual(["Mukesh", 8000, 40]);
    row = await patchEntry(db, ME.id, saved.id, { split: { kind: "SPLIT", shares: [{ partyId: userB, method: "FIXED", value: "50" }] } });
    expect(one(row)).toEqual(["Balan", 5000, 25]);
    row = await patchEntry(db, ME.id, saved.id, { split: null });
    expect(row.shares).toEqual([]);
    await expect(patchEntry(db, ME.id, saved.id, { split: { kind: "SPLIT", shares: [{ partyId: userA, method: "PERCENT", value: "0" }] } })).rejects.toThrow();
  });
  it("never touches another user's entry", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry());
    await expect(patchEntry(db, OTHER.id, saved.id, { reason: "hack" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("lets the date and time be edited, and moves the day totals with it", async () => {
    const saved = await createEntry(db, ME.id, rid(), entry({ amountPaise: 12300 }), istInstant("2026-03-03", "10:00"));
    const before = await getDayTotals(db, ME.id, "2026-03-03");
    await updateEntry(db, ME.id, saved.id, entry({ amountPaise: 12300 }), istInstant("2026-03-04", "23:30"));
    expect((await getDayTotals(db, ME.id, "2026-03-03")).debitPaise).toBe(before.debitPaise - 12300);
    expect((await getDayTotals(db, ME.id, "2026-03-04")).debitPaise).toBe(12300);
    expect((await getEntry(db, ME.id, saved.id))!.occurredAt).toBe(istInstant("2026-03-04", "23:30").toISOString());
  });
});

describe("credits added", () => {
  it("links credits to a debit, replaces them on edit, and refuses credits that are not yours", async () => {
    const c1 = await createEntry(db, ME.id, rid(), entry({ type: "CREDIT", amountPaise: 20000, reason: "Refund" }));
    const c2 = await createEntry(db, ME.id, rid(), entry({ type: "CREDIT", amountPaise: 30000, reason: "Gift" }));
    const debit = await createEntry(db, ME.id, rid(), entry({ amountPaise: 90000, creditIds: [c1.id, c2.id] }));
    expect((await getEntry(db, ME.id, debit.id))!.creditIds.sort()).toEqual([c1.id, c2.id].sort());
    const row = (await listTransactions(db, ME.id, parseTxFilters({}), { pageSize: 200 })).rows.find((r) => r.id === debit.id)!;
    expect(row.linkedCreditsPaise).toBe(50000);

    await updateEntry(db, ME.id, debit.id, entry({ amountPaise: 90000, creditIds: [c2.id] }));
    expect((await getEntry(db, ME.id, debit.id))!.creditIds).toEqual([c2.id]);

    const theirCredit = await createEntry(db, OTHER.id, rid(), { ...entry({ type: "CREDIT" }), accountId: (await getQuickPayOptions(db, OTHER.id)).banks[0]!.id });
    await expect(createEntry(db, ME.id, rid(), entry({ creditIds: [theirCredit.id] }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    // a debit cannot be linked as a credit
    await expect(createEntry(db, ME.id, rid(), entry({ creditIds: [debit.id] }))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("offers choices as Customized Settings say", async () => {
    const credits = await listCreditChoices(db, ME.id, "recent_credits", 5);
    expect(credits.every((c) => c.type === "CREDIT")).toBe(true);
    const all = await listCreditChoices(db, ME.id, "recent_transactions", 5);
    expect(all).toHaveLength(5);
    expect(all.some((c) => c.type === "DEBIT")).toBe(true);
    const last = await listCreditChoices(db, ME.id, "last_transaction", 5);
    expect(last).toHaveLength(1);
    expect(last[0]!.id).toBe(all[0]!.id);
    const values = await listCreditChoices(db, ME.id, "credit_values", 10);
    expect(new Set(values.map((v) => v.amountPaise)).size).toBe(values.length);
  });
});

describe("Customized Settings", () => {
  it("starts with the defaults and keeps what is saved, section by section", async () => {
    expect(await getSettings(db, ME.id)).toEqual(DEFAULT_SETTINGS);
    const labels = { ...DEFAULT_SETTINGS.fields.labels, bank: "Paid From" };
    const saved = await saveSettingsSection(db, ME.id, "fields", { labels, defaults: { type: "CREDIT", bankId: canara, categoryId: food } });
    expect(saved.fields.labels.bank).toBe("Paid From");
    expect(saved.split).toEqual(DEFAULT_SETTINGS.split); // other sections untouched
    expect((await getQuickPayOptions(db, ME.id)).settings.fields.defaults).toEqual({ type: "CREDIT", bankId: canara, categoryId: food });
    expect((await getSettings(db, OTHER.id)).fields.labels.bank).toBe("Bank Through"); // private to each user
  });
  it("saves split settings, always keeping the default percentage among the choices, sorted", async () => {
    const saved = await saveSettingsSection(db, ME.id, "split", { enabledByDefault: true, method: "FIXED", defaultPercent: 12.5, percentOptions: [75, 25, 50, 25], defaultPartyId: userA, defaultFixedPaise: 10000 });
    expect(saved.split.percentOptions).toEqual([12.5, 25, 50, 75]);
    expect(saved.split).toMatchObject({ enabledByDefault: true, method: "FIXED", defaultPartyId: userA, defaultFixedPaise: 10000 });
  });
  it("saves credits settings and keeps the custom count within the list size", async () => {
    const saved = await saveSettingsSection(db, ME.id, "credits", { source: "last_transaction", listSize: 3, defaultSelection: "custom", customCount: 9 });
    expect(saved.credits).toEqual({ source: "last_transaction", listSize: 3, defaultSelection: "custom", customCount: 3 });
  });
  it("refuses bad values and references to things that are not yours", async () => {
    await expect(saveSettingsSection(db, ME.id, "split", { ...DEFAULT_SETTINGS.split, defaultPercent: 150 })).rejects.toThrow();
    await expect(saveSettingsSection(db, ME.id, "split", { ...DEFAULT_SETTINGS.split, percentOptions: [] })).rejects.toThrow();
    await expect(saveSettingsSection(db, ME.id, "fields", { ...DEFAULT_SETTINGS.fields, labels: { ...DEFAULT_SETTINGS.fields.labels, amount: "  " } })).rejects.toThrow();
    const theirsBank = (await getQuickPayOptions(db, OTHER.id)).banks[0]!.id;
    await expect(saveSettingsSection(db, ME.id, "fields", { ...DEFAULT_SETTINGS.fields, defaults: { type: "DEBIT", bankId: theirsBank, categoryId: null } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveSettingsSection(db, ME.id, "split", { ...DEFAULT_SETTINGS.split, defaultPartyId: "99999999-9999-4999-8999-999999999993" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("reset puts a section back, and unreadable stored data falls back to defaults", async () => {
    await resetSettingsSection(db, ME.id, "split");
    expect((await getSettings(db, ME.id)).split).toEqual(DEFAULT_SETTINGS.split);
    expect(parseSettings({ fields: { labels: "nonsense" }, split: 5, credits: { source: "bogus" } })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("category keywords", () => {
  it("saves keywords per category and lists them for matching", async () => {
    await setCategoryKeywords(db, ME.id, { categoryId: dosa, keywords: ["Masala  Dosa", "idli", "idli"] });
    await setCategoryKeywords(db, ME.id, { categoryId: travel, keywords: ["petrol", "Rapido"] });
    const entries = await getKeywordEntries(db, ME.id);
    expect(entries).toEqual(expect.arrayContaining([{ keyword: "masala dosa", categoryId: dosa }, { keyword: "idli", categoryId: dosa }, { keyword: "rapido", categoryId: travel }]));
    expect(matchCategory("Rapido ride", entries)).toBe(travel);
    expect((await getQuickPayOptions(db, ME.id)).keywords).toHaveLength(entries.length);
  });
  it("refuses a word that already picks another category, and edits and deletes keywords", async () => {
    await expect(setCategoryKeywords(db, ME.id, { categoryId: food, keywords: ["petrol"] })).rejects.toMatchObject({ code: "CONFLICT" });
    await setCategoryKeywords(db, ME.id, { categoryId: travel, keywords: ["petrol"] }); // edit: rapido removed
    expect((await getKeywordEntries(db, ME.id)).some((k) => k.keyword === "rapido")).toBe(false);
    await setCategoryKeywords(db, ME.id, { categoryId: food, keywords: ["rapido"] }); // now free to use elsewhere
    await setCategoryKeywords(db, ME.id, { categoryId: food, keywords: [] });
    expect((await getKeywordEntries(db, ME.id)).filter((k) => k.categoryId === food)).toEqual([]);
  });
  it("is private to each user and checks length and ownership", async () => {
    await expect(setCategoryKeywords(db, OTHER.id, { categoryId: travel, keywords: ["x"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setCategoryKeywords(db, ME.id, { categoryId: travel, keywords: ["x".repeat(41)] })).rejects.toThrow();
  });
});

describe("Debt Management", () => {
  // Fresh user so the totals are easy to read.
  const DEBT_USER = { id: "99999999-9999-4999-8999-999999999995", email: "debt@example.com", name: "Debt" };
  let bank = "";
  let a = "";
  let b = "";
  let c = "";

  beforeAll(async () => {
    await ensureUserSetup(db, DEBT_USER);
    const main = await addBank(db, DEBT_USER.id, { name: "DebtBank", kind: "BANK" });
    bank = await addSubBank(db, DEBT_USER.id, { mainId: main, name: "One" });
    const people = (await getQuickPayOptions(db, DEBT_USER.id)).persons;
    a = people.find((p) => p.name === "Mukesh")!.id;
    b = people.find((p) => p.name === "Balan")!.id;
    c = people.find((p) => p.name === "Office")!.id;
  });

  const make = (over: Parameters<typeof entry>[0]) => entry({ accountId: bank, ...over });

  it("adds each person's share automatically: ₹200 of ₹400, and 18% = ₹72", async () => {
    await createEntry(db, DEBT_USER.id, rid(), make({ reason: "Dinner", ...split(a, 50) }), istInstant("2026-06-01", "20:00"));
    await createEntry(db, DEBT_USER.id, rid(), make({ reason: "Trip", ...split(a, 18) }), istInstant("2026-06-02", "09:00"));
    await createEntry(db, DEBT_USER.id, rid(), make({ reason: "Cab", amountPaise: 10000, ...split(b, 100, 10000) }), istInstant("2026-06-03", "09:00"));

    const summary = await getDebtSummary(db, DEBT_USER.id);
    const row = (id: string) => summary.rows.find((r) => r.partyId === id)!;
    expect(row(a)).toMatchObject({ totalSplitPaise: 20000 + 7200, paidPaise: 0, remainingPaise: 27200, splitCount: 2 });
    expect(row(a).splitPercent).toBe(34); // 272 of 800
    expect(row(b)).toMatchObject({ totalSplitPaise: 10000, remainingPaise: 10000, splitPercent: 100 });
    expect(row(c)).toMatchObject({ totalSplitPaise: 0, splitPercent: null, remainingPaise: 0 });
    expect(summary.rows.some((r) => r.name === "Personal")).toBe(false); // your own share is not a debt
    expect(summary.totalSplitPaise).toBe(37200);
  });

  it("records payments and works out what remains", async () => {
    await addSplitPayment(db, DEBT_USER.id, { partyId: a, amountPaise: 10000, paidAt: istInstant("2026-06-05", "10:00"), note: "cash" });
    await addSplitPayment(db, DEBT_USER.id, { partyId: a, amountPaise: 5000, paidAt: istInstant("2026-06-06", "10:00"), note: "" });
    const summary = await getDebtSummary(db, DEBT_USER.id);
    expect(summary.rows.find((r) => r.partyId === a)).toMatchObject({ paidPaise: 15000, remainingPaise: 12200 });
    expect(summary.totalPaidPaise).toBe(15000);
    expect(summary.totalRemainingPaise).toBe(37200 - 15000);

    const history = await getDebtHistory(db, DEBT_USER.id, a);
    expect(history.splits.map((s) => [s.description, s.percent, s.sharePaise])).toEqual([["Trip", 18, 7200], ["Dinner", 50, 20000]]);
    expect(history.payments.map((p) => [p.amountPaise, p.note])).toEqual([[5000, ""], [10000, "cash"]]);
  });

  it("updates when a transaction is deleted or its split changes, and when a payment is deleted", async () => {
    const extra = await createEntry(db, DEBT_USER.id, rid(), make({ amountPaise: 20000, ...split(c, 50, 20000) }), istInstant("2026-06-07", "09:00"));
    expect((await getDebtSummary(db, DEBT_USER.id)).rows.find((r) => r.partyId === c)!.totalSplitPaise).toBe(10000);
    await updateEntry(db, DEBT_USER.id, extra.id, make({ amountPaise: 20000, ...split(c, 25, 20000) }));
    expect((await getDebtSummary(db, DEBT_USER.id)).rows.find((r) => r.partyId === c)!.totalSplitPaise).toBe(5000);
    await deleteEntry(db, DEBT_USER.id, extra.id);
    expect((await getDebtSummary(db, DEBT_USER.id)).rows.find((r) => r.partyId === c)!.totalSplitPaise).toBe(0);

    const history = await getDebtHistory(db, DEBT_USER.id, a);
    await deleteSplitPayment(db, DEBT_USER.id, history.payments[0]!.id);
    expect((await getDebtSummary(db, DEBT_USER.id)).rows.find((r) => r.partyId === a)!.paidPaise).toBe(10000);
    await expect(deleteSplitPayment(db, DEBT_USER.id, history.payments[0]!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows an overpayment as a negative remaining, and ignores splits on credits", async () => {
    await addSplitPayment(db, DEBT_USER.id, { partyId: b, amountPaise: 15000, paidAt: istInstant("2026-06-08", "10:00"), note: "advance" });
    expect((await getDebtSummary(db, DEBT_USER.id)).rows.find((r) => r.partyId === b)!.remainingPaise).toBe(-5000);
    await createEntry(db, DEBT_USER.id, rid(), make({ type: "CREDIT", ...split(b, 50) }));
    expect((await getDebtSummary(db, DEBT_USER.id)).rows.find((r) => r.partyId === b)!.totalSplitPaise).toBe(10000);
  });

  it("keeps a removed person who still owes in the list, marked as removed", async () => {
    const people = (await getQuickPayOptions(db, DEBT_USER.id)).persons;
    const save = people.find((p) => p.name === "Save")!.id;
    await createEntry(db, DEBT_USER.id, rid(), make({ amountPaise: 10000, ...split(save, 50, 10000) }), istInstant("2026-06-09", "09:00"));
    await db.expenseParty.update({ where: { id: save }, data: { deletedAt: new Date() } });
    const summary = await getDebtSummary(db, DEBT_USER.id);
    expect(summary.rows.find((r) => r.partyId === save)).toMatchObject({ name: "Save (removed)", totalSplitPaise: 5000, remainingPaise: 5000 });
    // a removed person with nothing on record is not listed
    const office = people.find((p) => p.name === "Office")!.id;
    await db.expenseParty.update({ where: { id: office }, data: { deletedAt: new Date() } });
    expect((await getDebtSummary(db, DEBT_USER.id)).rows.some((r) => r.partyId === office)).toBe(false);
    // and they can still pay what they owe
    await addSplitPayment(db, DEBT_USER.id, { partyId: save, amountPaise: 5000, paidAt: istInstant("2026-06-10", "09:00"), note: "settled" });
    expect((await getDebtSummary(db, DEBT_USER.id)).rows.find((r) => r.partyId === save)!.remainingPaise).toBe(0);
  });

  it("validates payments and keeps each user's records private", async () => {
    const now = istInstant("2026-06-09", "10:00");
    await expect(addSplitPayment(db, DEBT_USER.id, { partyId: a, amountPaise: 0, paidAt: now, note: "" })).rejects.toThrow();
    await expect(addSplitPayment(db, DEBT_USER.id, { partyId: a, amountPaise: 1.5, paidAt: now, note: "" })).rejects.toThrow();
    await expect(addSplitPayment(db, DEBT_USER.id, { partyId: a, amountPaise: 100, paidAt: new Date(Date.now() + 86_400_000), note: "" })).rejects.toThrow(/future/);
    await expect(addSplitPayment(db, DEBT_USER.id, { partyId: a, amountPaise: 100, paidAt: now, note: "x".repeat(201) })).rejects.toThrow();
    await expect(addSplitPayment(db, ME.id, { partyId: a, amountPaise: 100, paidAt: now, note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDebtHistory(db, ME.id, a)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const selfParty = (await getQuickPayOptions(db, DEBT_USER.id)).persons.find((p) => p.name === "Personal")!.id;
    await expect(addSplitPayment(db, DEBT_USER.id, { partyId: selfParty, amountPaise: 100, paidAt: now, note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(selfId).not.toBe("");
  });
});
