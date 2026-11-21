import { describe, expect, it } from "vitest";
import { linesOfRuns, parseBankDate, parseBankLines, parseBankTable, parseCsv, parseMoney } from "@/features/bank-statement/parse";

describe("dates and money", () => {
  it("reads the usual date styles", () => {
    expect(parseBankDate("05/11/2026")).toBe("2026-11-05");
    expect(parseBankDate("05-11-26")).toBe("2026-11-05");
    expect(parseBankDate("5 Nov 2026")).toBe("2026-11-05");
    expect(parseBankDate("05-Nov-2026")).toBe("2026-11-05");
    expect(parseBankDate("2026-11-05 10:20:00")).toBe("2026-11-05");
    expect(parseBankDate("46331")).toBe("2026-11-05");
    expect(parseBankDate("31/02/2026")).toBeNull();
    expect(parseBankDate("hello")).toBeNull();
  });
  it("reads amounts with commas, brackets and Dr / Cr marks", () => {
    expect(parseMoney("1,234.50")).toEqual({ paise: 123450, marker: null });
    expect(parseMoney("₹ 500")).toEqual({ paise: 50000, marker: null });
    expect(parseMoney("(250.00)")).toEqual({ paise: -25000, marker: null });
    expect(parseMoney("1,000.00 Cr")).toEqual({ paise: 100000, marker: "CR" });
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});

describe("CSV / Excel tables", () => {
  it("finds the header below bank details and reads debit and credit columns", () => {
    const csv = [
      "Account Statement,,,,",
      "Account No,1234567890,,,",
      "Txn Date,Value Date,Description,Debit,Credit,Balance",
      '05/11/2026,05/11/2026,"UPI/Swiggy, Food",250.00,,9750.00',
      "06/11/2026,06/11/2026,SALARY NOV,,50000.00,59750.00",
      "Closing balance,,,,,59750.00",
    ].join("\n");
    const out = parseBankTable(parseCsv(csv));
    expect(out.rows).toEqual([
      { date: "2026-11-05", time: "00:00", details: "UPI/Swiggy, Food", debitPaise: 25000, creditPaise: 0, balancePaise: 975000 },
      { date: "2026-11-06", time: "00:00", details: "SALARY NOV", debitPaise: 0, creditPaise: 5000000, balancePaise: 5975000 },
    ]);
  });
  it("reads one Amount column with Dr / Cr", () => {
    const out = parseBankTable([["Date", "Narration", "Amount", "Dr/Cr", "Balance"], ["01-11-2026", "ATM", "2,000.00", "DR", "8,000.00"], ["02-11-2026", "Refund", "100.00", "CR", "8,100.00"]]);
    expect(out.rows.map((r) => [r.debitPaise, r.creditPaise])).toEqual([[200000, 0], [0, 10000]]);
  });
  it("says what is missing when there is no header", () => {
    const out = parseBankTable([["a", "b"], ["1", "2"]]);
    expect(out.rows).toHaveLength(0);
    expect(out.failures[0]!.error).toMatch(/header/);
  });
  it("splits on semicolons and tabs", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("PDF lines", () => {
  it("works debit and credit out from the balance", () => {
    const lines = ["Statement of account", "01/11/2026 UPI/Zomato 120.00 880.00", "02/11/2026 NEFT SALARY 5,000.00 5,880.00", "03/11/2026 ATM WDL 500.00 5,380.00", "continued narration"];
    const out = parseBankLines(lines);
    expect(out.rows.map((r) => [r.debitPaise, r.creditPaise, r.balancePaise])).toEqual([[12000, 0, 88000], [0, 500000, 588000], [50000, 0, 538000]]);
    expect(out.rows[2]!.details).toBe("ATM WDL continued narration");
  });
  it("reports a dated line with no amount", () => {
    expect(parseBankLines(["01/11/2026 something odd"]).failures).toHaveLength(1);
  });
  it("joins runs on one line from left to right", () => {
    const lines = linesOfRuns([[{ str: "100.00", x: 300, y: 700 }, { str: "01/11/2026", x: 20, y: 700.5 }, { str: "Next", x: 20, y: 680 }]]);
    expect(lines).toEqual(["01/11/2026 100.00", "Next"]);
  });
});

describe("the layouts of real bank statements", () => {
  it("IDFC FIRST: two dates, narration over two lines, and the footer left out", () => {
    const out = parseBankLines(["Opening Balance 181.80", "04-Nov-2026 04-Nov-2026 ATM/CASH 35,000.00 35,181.80", "DEPOSIT/3067/BRANCH", "04-Nov-2026 04-Nov-2026 UPI/DR/630842822136/SIVA 10,000.00 25,181.80", "ARB/sivabal/UPI", "REGISTERED OFFICE: IDFC FIRST BANK LIMITED, Chennai"]);
    expect(out.rows.map((r) => [r.debitPaise, r.creditPaise, r.details])).toEqual([[0, 3500000, "ATM/CASH DEPOSIT/3067/BRANCH"], [1000000, 0, "UPI/DR/630842822136/SIVA ARB/sivabal/UPI"]]);
  });
  it("HDFC: the first row is judged from the opening balance in the summary", () => {
    const out = parseBankLines(["04/11/26 UPI-RAHUL 0000630834604136 04/11/26 24,130.00 24,166.32", "B0040101-UPI", "04/11/26 IB BILLPAY DR 1793810816449393 04/11/26 24,130.00 36.32", "STATEMENT SUMMARY :-", "Opening Balance Dr Count Cr Count Debits Credits Closing Bal", "36.32 1 1 24,130.00 24,130.00 36.32", "Generated On: 22-Nov-2026"]);
    expect(out.rows.map((r) => [r.debitPaise, r.creditPaise])).toEqual([[0, 2413000], [2413000, 0]]);
    expect(out.rows[0]!.details).toBe("UPI-RAHUL 0000630834604136 B0040101-UPI");
  });
  it("Canara: a block that ends with Chq: holds the narration before and after the date line, and the time", () => {
    const out = parseBankLines(["Opening Balance 374.45", "UPI/DR/667131275864/SRI RAM", "A/YESB/UPI//", "01-11-2026 080AFCC84CA/01/11/2026 70.00 304.45", "16:23:10", "Chq: 667131275864", "UPI/CR/630627450236/RAHUL", "02-11-2026 1,000.00 1,304.45", "10:47:58", "Chq: 630627450236"]);
    expect(out.rows.map((r) => [r.date, r.time, r.debitPaise, r.creditPaise])).toEqual([["2026-11-01", "16:23", 7000, 0], ["2026-11-02", "10:47", 0, 100000]]);
    expect(out.rows[0]!.details).toContain("UPI/DR/667131275864/SRI RAM A/YESB/UPI//");
  });
});
