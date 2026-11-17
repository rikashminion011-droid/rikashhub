import { describe, expect, it } from "vitest";
import { istDateOf, istInstant, istTimeOf } from "@/features/quick-pay/datetime";
import { MAX_POSTING_DAYS, matchScore, paiseOfText, parseHdfcStatement, recipientShare, reconcile, recipientSummary, utilization } from "@/features/credit-portal/model";

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

describe("a row with a note the bank prints after the amount", () => {
  const read = (...rows: string[]) => parseHdfcStatement([rows.join("\n")]);

  it("reads PAYTM RECHARGES 914.91 even though 'Offers on your card' is glued after the amount", () => {
    const out = read("14/11/2026| 17:47 PAYTM RECHARGESNOIDA C 914.91 lOffers on your card");
    expect(out.skipped).toEqual([]);
    expect(out.lines).toHaveLength(1);
    const line = out.lines[0]!;
    expect(line.details).toBe("PAYTM RECHARGESNOIDA");
    expect(line.debitPaise).toBe(91491);
    expect(line.creditPaise).toBe(0);
    expect(istDateOf(line.occurredAt)).toBe("2026-11-14");
    expect(istTimeOf(line.occurredAt)).toBe("17:47");
  });

  it("works for a credit and for other notes the bank prints, with or without the bullet", () => {
    const out = read(
      "27/09/2026| 19:15 CREDIT CARD PAYMENTNet Banking + C 20,000.00 lOffers on your card",
      "12/10/2026| 10:00 ELECTRONICS STORECHENNAI C 12,999.00 lConvert to EMI",
      "13/10/2026| 11:00 BOOKSHOPMUMBAI C 250.50 Offers on your card",
    );
    expect(out.skipped).toEqual([]);
    expect(out.lines.map((l) => [l.debitPaise, l.creditPaise])).toEqual([[0, 2000000], [1299900, 0], [25050, 0]]);
  });

  it("still takes the LAST amount on the line, so digits in the details are not mistaken for it", () => {
    const out = read("04/11/2026| 10:00 NAGAR C 12 STREETDELHI C 500.00 lOffers on your card");
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toMatchObject({ details: "NAGAR C 12 STREETDELHI", debitPaise: 50000 });
  });

  it("a note that contains numbers is not guessed at: the line is reported as unreadable, never saved with a wrong amount", () => {
    const out = read("14/11/2026| 17:47 PAYTM RECHARGESNOIDA C 914.91 l Cashback 5");
    expect(out.lines).toEqual([]);
    expect(out.skipped).toHaveLength(1);
  });

  it("an identical pair of lines is still told apart, and the same statement gives the same keys twice", () => {
    const rows = ["14/11/2026| 17:47 PAYTM RECHARGESNOIDA C 914.91 lOffers on your card", "14/11/2026| 17:47 PAYTM RECHARGESNOIDA C 914.91 lOffers on your card"];
    const a = read(...rows).lines.map((l) => l.key);
    expect(new Set(a).size).toBe(2);
    expect(read(...rows).lines.map((l) => l.key)).toEqual(a);
  });
});

describe("one person's share of a line that is for several people", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("Netflix ₹200 for two people is ₹100 each", () => {
    expect(recipientShare(20000, [A, B], A)).toBe(10000);
    expect(recipientShare(20000, [A, B], B)).toBe(10000);
  });

  it("₹200 for three people is 200/3: the odd paise go to the first people, and the parts add up to ₹200", () => {
    const parts = [A, B, C].map((id) => recipientShare(20000, [A, B, C], id));
    expect(parts).toEqual([6667, 6667, 6666]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(20000);
  });

  it("a line for one person is theirs in full, and a person who is not on the line gets nothing", () => {
    expect(recipientShare(20000, [A], A)).toBe(20000);
    expect(recipientShare(20000, [A, B], C)).toBe(0);
    expect(recipientShare(20000, [], A)).toBe(0);
  });

  it("the parts always add up to the whole, for any amount and any number of people", () => {
    const people = [A, B, C, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"];
    for (const amount of [1, 2, 7, 99, 100, 101, 12345, 91491, 6865698]) {
      for (let n = 1; n <= people.length; n++) {
        const ids = people.slice(0, n);
        const parts = ids.map((id) => recipientShare(amount, ids, id));
        expect(parts.reduce((s, p) => s + p, 0)).toBe(amount);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
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

describe("HDFC billing cycle", () => {
  it("runs from the 16th of last month to the 15th of this month", async () => {
    const { hdfcCycle, isHdfcPortal } = await import("@/features/credit-portal/model");
    expect(hdfcCycle("2026-11-16")).toEqual({ from: "2026-10-16", to: "2026-11-15" });
    expect(hdfcCycle("2026-01-03")).toEqual({ from: "2025-12-16", to: "2026-01-15" });
    expect(isHdfcPortal(" HDFC ")).toBe(true);
    expect(isHdfcPortal("Slice")).toBe(false);
  });
});
