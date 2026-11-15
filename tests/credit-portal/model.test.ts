import { describe, expect, it } from "vitest";
import { istDateOf, istInstant, istTimeOf } from "@/features/quick-pay/datetime";
import { MAX_POSTING_DAYS, matchScore, paiseOfText, parseHdfcStatement, reconcile, recipientSummary, utilization } from "@/features/credit-portal/model";

// Lines as the HDFC statement prints them (the rupee sign comes out as "C"; credits have a "+" before it).
const PAGE1 = `
TOTAL AMOUNT DUE
C25,423.00
MINIMUM DUE
C8,143.00
Domestic Transactions
DATE & TIME TRANSACTION DESCRIPTION AMOUNT PI
RAHUL S A [CKYC ID : 30039950112441 ]
15/09/2026| 00:00 CGST-VPS2725952180897-RATE 9.0 -33 (Ref# 09999999980915011278199) C 8.01 l
17/09/2026| 20:18 AVENUE SUPERMARTS LIMITCHENNAI C 2,363.00 l
18/09/2026| 10:48 GOOGLEPLAYMUMBAI C 149.00 l
Page 1 of 3
TOTAL CREDIT LIMIT
(Including Cash) AVAILABLE CREDIT LIMIT AVAILABLE CASH LIMIT
C76,000 C46,139 C30,400Benefits on your card
Statement Date
Billing Period
15 Oct, 2026
16 Sep, 2026 - 15 Oct, 2026
`;
const PAGE2 = `
27/09/2026| 19:15 CREDIT CARD PAYMENTNet Banking (Ref# 00000000000927019097298) + C 20,000.00 l
11/10/2026| 23:04 NETFLIXMUMBAI C 649.00 l
11/10/2026| 23:04 NETFLIXMUMBAI C 649.00 l
International Transactions
03/10/2026 | 00:00 CGST-VPS2727719419903-RATE 9.0 -33 (Ref# ST262770084000015310222) C 3.20 l
`;

describe("reading an HDFC statement", () => {
  const out = parseHdfcStatement([PAGE1, PAGE2]);

  it("reads every transaction line with its date, time, details and amount", () => {
    expect(out.lines).toHaveLength(7);
    const avenue = out.lines.find((l) => l.details.startsWith("AVENUE SUPERMARTS"))!;
    expect(avenue).toMatchObject({ debitPaise: 236300, creditPaise: 0, details: "AVENUE SUPERMARTS LIMITCHENNAI" });
    expect([istDateOf(avenue.occurredAt), istTimeOf(avenue.occurredAt)]).toEqual(["2026-09-17", "20:18"]);
  });

  it("a plain amount is a debit and an amount with a + in front (green on the statement) is a credit", () => {
    const payment = out.lines.find((l) => l.details.startsWith("CREDIT CARD PAYMENT"))!;
    expect(payment).toMatchObject({ creditPaise: 2000000, debitPaise: 0 });
    expect(out.lines.filter((l) => l.creditPaise > 0)).toHaveLength(1);
  });

  it("keeps the charges, tells two identical lines apart, and ignores lines that are not transactions", () => {
    expect(out.lines.some((l) => l.details.startsWith("CGST-VPS2725952180897") && l.debitPaise === 801)).toBe(true);
    const netflix = out.lines.filter((l) => l.details.startsWith("NETFLIX"));
    expect(netflix).toHaveLength(2);
    expect(new Set(netflix.map((l) => l.key)).size).toBe(2);
    expect(out.skipped).toEqual([]);
  });

  it("reads the summary: limit, available credit, amount due, statement date and billing period", () => {
    expect(out.summary).toEqual({ totalCreditPaise: 7600000, availableCreditPaise: 4613900, totalDuePaise: 2542300, statementDate: "2026-10-15", period: { from: "2026-09-16", to: "2026-10-15" } });
  });

  it("reading the same statement twice gives the same keys, so a repeat import adds nothing new", () => {
    expect(parseHdfcStatement([PAGE1, PAGE2]).lines.map((l) => l.key)).toEqual(out.lines.map((l) => l.key));
  });

  it("amounts in text", () => {
    expect(paiseOfText("2,363.00")).toBe(236300);
    expect(paiseOfText("8.01")).toBe(801);
    expect(paiseOfText("76,000")).toBe(7600000);
    expect(paiseOfText("1,23,456.5")).toBe(12345650);
    expect(paiseOfText("abc")).toBeNull();
  });
});

describe("matching unbilled transactions to statement lines", () => {
  const u = (id: string, date: string, time: string, amount: number, recipients: string[] = ["dhanush"], kind: "DEBIT" | "CREDIT" = "DEBIT") => ({ id, occurredAt: istInstant(date, time), kind, amountPaise: amount, recipientIds: recipients });

  it("Dhanush's ₹200 Netflix on the 12th is matched by Dhanush's ₹200 line dated the 13th", () => {
    expect(matchScore(u("a", "2026-11-12", "20:00", 20000), u("s", "2026-11-13", "00:00", 20000))).not.toBeNull();
  });

  it("needs the same amount, the same kind and the same people", () => {
    const base = u("a", "2026-11-12", "20:00", 20000);
    expect(matchScore(base, u("s", "2026-11-12", "20:00", 20001))).toBeNull();
    expect(matchScore(base, u("s", "2026-11-12", "20:00", 20000, ["dhanush"], "CREDIT"))).toBeNull();
    expect(matchScore(base, u("s", "2026-11-12", "20:00", 20000, ["mukesh"]))).toBeNull();
    expect(matchScore(base, u("s", "2026-11-12", "20:00", 20000, ["dhanush", "mukesh"]))).toBeNull();
  });

  it("the statement is never dated before the purchase, and not more than a few days after", () => {
    const base = u("a", "2026-11-12", "20:00", 20000);
    expect(matchScore(base, u("s", "2026-11-11", "20:00", 20000))).toBeNull();
    expect(matchScore(base, u("s", `2026-11-${12 + MAX_POSTING_DAYS}`, "09:00", 20000))).not.toBeNull();
    expect(matchScore(base, u("s", `2026-11-${12 + MAX_POSTING_DAYS + 1}`, "09:00", 20000))).toBeNull();
  });

  it("a closer date and time scores higher", () => {
    const base = u("a", "2026-11-12", "20:00", 20000);
    expect(matchScore(base, u("s", "2026-11-12", "20:02", 20000))!).toBeGreaterThan(matchScore(base, u("s", "2026-11-14", "20:00", 20000))!);
  });

  it("each unbilled transaction and each statement line is used once: three of the same amount pair up one to one", () => {
    const unbilled = [u("a1", "2026-11-10", "10:00", 5000), u("a2", "2026-11-11", "10:00", 5000), u("a3", "2026-11-12", "10:00", 5000)];
    const statement = [u("s1", "2026-11-10", "10:05", 5000), u("s2", "2026-11-11", "10:05", 5000)];
    const pairs = reconcile(unbilled, statement);
    expect(pairs).toHaveLength(2);
    expect(new Set(pairs.map((p) => p.unbilledId)).size).toBe(2);
    expect(pairs).toContainEqual({ unbilledId: "a1", statementId: "s1" });
    expect(pairs).toContainEqual({ unbilledId: "a2", statementId: "s2" });
  });

  it("a statement line with no recipients yet matches by amount and date alone when the unbilled one has none either", () => {
    expect(matchScore(u("a", "2026-11-12", "20:00", 100, []), u("s", "2026-11-12", "20:00", 100, []))).not.toBeNull();
  });
});

describe("showing", () => {
  it("the credit bar: ₹45,000 of ₹76,000 used leaves ₹31,000", () => {
    expect(utilization(7600000, 4500000)).toEqual({ usedPercent: 59.2, balancePaise: 3100000 });
    expect(utilization(0, 100)).toEqual({ usedPercent: 0, balancePaise: 0 });
    expect(utilization(1000, 5000)).toEqual({ usedPercent: 100, balancePaise: 0 });
  });
  it("recipients: the first one and how many more", () => {
    expect(recipientSummary(["Mukesh", "Dhanush", "Bala", "Office"])).toEqual({ first: "Mukesh", more: 3 });
    expect(recipientSummary(["Mukesh"])).toEqual({ first: "Mukesh", more: 0 });
    expect(recipientSummary([])).toEqual({ first: "", more: 0 });
  });
});
